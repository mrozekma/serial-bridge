<template>
	<div>
		<sb-navbar/>
		<main>
			<h1>Reload configuration</h1>
			<a-alert v-if="preview.state === 'rejected'" type="error" message="Failed to check configuration file for changes" show-icon>
				<template #description>
					<pre>{{ preview.error.message }}</pre>
					<a-button type="primary" @click="loadConfig">Retry</a-button>
				</template>
			</a-alert>
			<a-alert v-else-if="preview.state === 'resolved' && !preview.value.enabled" type="error" message="Tool disabled" show-icon>
				<template #description>
					The config reload tool is disabled in Serial Bridge's configuration. See the <samp>configReloadable</samp> key in the configuration file.
				</template>
			</a-alert>
			<template v-else>
				<p>
					The following devices have been changed in the configuration file since the last load. Select the devices to (re)create from the new configuration file.
				</p>
				<a-alert type="warning" message="Any existing devices that are reloaded will briefly go offline, and TCP connections will break. Devices that have been removed from the configuration will become permanently unavailable." show-icon/>
				<a-alert v-if="preview.state === 'resolved' && preview.value.git && pulled !== true" type="info" show-icon>
					<template #message>
						Serial Bridge appears to be running from a revision-controlled directory. You may want to <a-button size="small" :loading="pulled === 'pending'" @click="gitPull">git pull</a-button> to get the latest changes to the config file.
					</template>
				</a-alert>
				<a-table :columns="columns" :data-source="rows" :row-key="row => row.key" :loading="preview.state === 'pending'" :pagination="false" :locale="{ emptyText: 'No changes' }" :row-selection="{ selectedRowKeys: selections, onChange: keys => selections = keys }">
					<template #type="type">
						<a-tag v-if="type === 'add'" color="green">Add</a-tag>
						<a-tag v-else-if="type === 'update'" color="orange">Update</a-tag>
						<a-tag v-else-if="type === 'remove'" color="red">Remove</a-tag>
					</template>
					<template #connections="connections">
						<sb-connection v-for="connection in (connections || [])" :key="connection.host" v-bind="connection"/>
					</template>
				</a-table>
				<br>
				<a-button type="primary" :disabled="selections.length == 0" :loading="reloading" @click="doReload">Reload selected devices</a-button>
			</template>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { AntdComponent } from 'ant-design-vue/types/component';
	import { Column } from 'ant-design-vue/types/table/column';

	import { Connection, getDeviceConnections } from '@/client/connections';
	import { DevicesConfigReloadSpec } from '@/server/device';
	import { compareStrings } from '../device-functions';

	interface Preview extends DevicesConfigReloadSpec {
		enabled: boolean;
		git: boolean;
	}

	type AntTableColumn = Omit<Column, keyof AntdComponent>;

	interface AddRow {
		key: string;
		type: 'add';
		name: string;
	}

	interface UpdateRemoveRow {
		key: string;
		type: 'update' | 'remove';
		id: string;
		name: string;
		lock: string | undefined;
		build: string | undefined;
		connections: Connection[];
	}

	type Row = AddRow | UpdateRemoveRow;

	import { PromiseResult, rootDataComputeds, unwrapPromise } from '../root-data';
	import SbNavbar from '../components/navbar.vue';
	import SbConnection from '../components/connection.vue';
	export default Vue.extend({
		components: { SbNavbar, SbConnection },
		computed: {
			...rootDataComputeds(),
			columns(): AntTableColumn[] {
				return [{
					title: 'Type',
					dataIndex: 'type',
					scopedSlots: {
						customRender: 'type',
					},
				}, {
					title: 'Device',
					dataIndex: 'name',
					sorter: (a: Row, b: Row) => compareStrings(a.name, b.name),
					defaultSortOrder: 'ascend',
				}, {
					title: 'Lock',
					dataIndex: 'lock',
				}, {
					title: 'Build',
					dataIndex: 'build',
				}, {
					title: 'Connections',
					dataIndex: 'connections',
					scopedSlots: {
						customRender: 'connections',
					},
				}];
			},
			rows(): Row[] {
				const devices = this.devices;
				let idx = 0;
				return (this.preview.state === 'resolved' && devices.state === 'resolved') ? [
					...this.preview.value.add.map<Row>(name => ({
						key: `${idx++}`,
						type: 'add',
						name,
					})),
					...Object.entries(this.preview.value.change).map<Row>(([ id, type ]) => {
						const device = devices.value.find(device => device.id === id)!;
						return {
							key: `${idx++}`,
							type,
							id,
							name: device.name,
							lock: device.lock?.owner,
							build: device.build?.name,
							connections: [...getDeviceConnections(device)],
						};
					}),
				] : [];
			},
			defaultSelections(): string[] | undefined {
				const params = new URLSearchParams(window.location.search);
				const devices = params.get('devices');
				return devices ? devices.split(',') : undefined;
			},
		},
		data() {
			return {
				preview: { state: 'pending' } as PromiseResult<Preview>,
				pulled: false as boolean | 'pending',
				reloading: false,
				selections: [] as string[],
			};
		},
		mounted() {
			this.loadConfig();
		},
		methods: {
			loadConfig() {
				const promise = this.app.service('api/config').get('reload', {});
				this.preview = unwrapPromise(promise);
				promise.then(async (spec: DevicesConfigReloadSpec) => {
					await this.$nextTick();
					if(this.defaultSelections) {
						this.selections = this.rows.filter(row => row.type !== 'add' && row.id && this.defaultSelections!.indexOf(row.id) >= 0).map(row => row.key);
					} else {
						this.selections = this.rows.map(row => row.key);
					}
				});
			},
			async gitPull() {
				this.pulled = 'pending';
				try {
					await this.app.service('api/config').patch('reload/pull', {});
					this.pulled = true;
					this.loadConfig();
				} catch(e) {
					this.pulled = false;
					this.$notification.close('git-pull');
					this.$notification.error({
						key: 'git-pull',
						duration: 5,
						placement: 'bottomRight',
						message: "Git Pull",
						description: `Failed to git pull: ${e}`,
					});
				}
			},
			async doReload() {
				this.reloading = true;
				const selected = this.rows.filter(row => this.selections.indexOf(row.key) >= 0);
				const spec: DevicesConfigReloadSpec = {
					add: selected.filter(row => row.type === 'add').map(row => row.name),
					change: Object.fromEntries(selected.filter((row): row is UpdateRemoveRow => row.type !== 'add').map(row => [ row.id, row.type ])),
				};
				try {
					await this.app.service('api/config').patch('reload', spec);
					// Leave 'reloading' set so the button can't be clicked again
					this.$notification.close('config-reload');
					this.$notification.success({
						key: 'config-reload',
						duration: 0,
						placement: 'bottomRight',
						message: "Reload Config",
						description: "Configuration reloaded",
					});
					await new Promise(resolve => setTimeout(resolve, 1000));
					window.location.href = '/';
				} catch(e) {
					this.reloading = false;
					this.$notification.close('config-reload');
					this.$notification.error({
						key: 'config-reload',
						duration: 10,
						placement: 'bottomRight',
						message: "Reload Config",
						description: `Failed to reload configuration: ${e}`,
					});
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	.ant-alert {
		margin-bottom: 10px;
	}
</style>
