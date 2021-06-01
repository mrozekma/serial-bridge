<template>
	<div>
		<sb-navbar/>
		<main>
			<h1>Ports</h1>
			<a-alert v-if="devices.state === 'rejected'" type="error" message="Failed to load devices" :description="devices.error.message" show-icon/>
			<a-table v-else :columns="columns" :data-source="ports" :row-key="port => port.key" :loading="devices.state === 'pending'" :pagination="false" :locale="{emptyText: 'No ports'}">
				<template #state="state">
					<a-badge v-if="!state.mapped" status="default" text="Not assigned to any device"/>
					<a-badge v-else-if="!state.open" status="error" :text="state.reason"/>
					<a-badge v-else status="processing" text="Open"/>
				</template>
				<template #device="device">
					<a v-if="device" target="_blank" :href="getDeviceUrl(device)">{{ device.name }}</a>
				</template>
				<template #node="node">
					<div v-if="node">{{ node.name }}</div>
				</template>
			</a-table>
			<a-alert v-if="nativePorts.state === 'rejected'" type="error" show-icon>
				<template #message>
					<b>Unable to show unmapped ports</b>: {{ nativePorts.error }}
				</template>
			</a-alert>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { AntdComponent } from 'ant-design-vue/types/component';
	import { Column } from 'ant-design-vue/types/table/column';
	import { Application } from '@feathersjs/feathers';

	import { DeviceJson, ClientServices as Services } from '@/services';
	import { Node, getDeviceUrl } from '../device-functions';
	import { SerialNode } from '@/server/device'; // :(. This comes up on the home view too but it just abandons type safety. SerialNode probably needs to be in the shared interface

	type SerialNodeJson = ReturnType<SerialNode['toJSON']>;
	type AntTableColumn = Omit<Column, keyof AntdComponent>;

	interface Port {
		key: string;
		state: {
			mapped: false;
		} | {
			mapped: true;
			open: true;
		} | {
			mapped: true;
			open: false;
			reason: string;
		}
		path: string;
	}

	interface MappedPort extends Port {
		baudRate: number;
		byteSize: number;
		parity: string;
		stopBits: number;
		serialSettings: string;
		device: DeviceJson;
		node: Node;
	}

	function isMappedPort(port: Port): port is MappedPort {
		return port.state.mapped;
	}

	function isSerialNode(node: Node): node is SerialNodeJson {
		return (node.type === 'serial');
	}

	function uniqifyAndSort<T>(arr: T[]): T[] {
		return [...new Set(arr)].sort();
	}

	function sortUnmappedLast(a: Port, b: Port, cmp: (a: MappedPort, b: MappedPort) => number): number {
		return !isMappedPort(a) && !isMappedPort(b) ? 0 :
		       !isMappedPort(a) ? 1 :
		       !isMappedPort(b) ? -1 :
		       cmp(a, b);
	}

	import { rootDataComputeds, unwrapPromise } from '../root-data';
	import SbNavbar from '../components/navbar.vue';
	export default Vue.extend({
		components: { SbNavbar },
		computed: {
			...rootDataComputeds(),
			columns(): AntTableColumn[] {
				return [{
					title: 'Path',
					dataIndex: 'path',
					sorter: (a: Port, b: Port) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
					defaultSortOrder: 'ascend',
				}, {
					title: 'State',
					dataIndex: 'state',
					filters: [{
						value: 'open',
						text: 'Open',
					}, {
						value: 'closed',
						text: 'Closed',
					}, {
						value: 'unmapped',
						text: 'Unassigned',
					}],
					onFilter: (state: string, port: Port) => {
						switch(state) {
							case 'open': return port.state.mapped && port.state.open;
							case 'closed': return port.state.mapped && !port.state.open;
							case 'unmapped': return !port.state.mapped;
							default: return false;
						}
					},
					defaultFilteredValue: [ 'open', 'closed' ],
					sorter: (a: Port, b: Port) => {
						const getOrd = (port: Port) => !port.state.mapped ? 2 : !port.state.open ? 1 : 0;
						return (getOrd(a) - getOrd(b)) || a.path.toLowerCase().localeCompare(b.path.toLowerCase());
					},
					scopedSlots: {
						customRender: 'state',
					},
				}, {
					title: 'Device',
					dataIndex: 'device',
					sorter: (a: Port, b: Port) => sortUnmappedLast(a, b, (a, b) => a.device.name.toLowerCase().localeCompare(b.device.name.toLowerCase())),
					filters: [
						{
							value: '',
							text: '(None)',
						},
						...((this.devices.state === 'resolved') ? this.devices.value.map(device => ({
							value: device.id,
							text: device.name,
						})) : []),
					],
					onFilter: (device: string, port: Port) => (device === '') ? !port.state.mapped : (isMappedPort(port) && port.device.id === device),
					scopedSlots: {
						customRender: 'device',
					},
				}, {
					title: 'Node',
					dataIndex: 'node',
					sorter: (a: Port, b: Port) => sortUnmappedLast(a, b, (a, b) => a.node.name.toLowerCase().localeCompare(b.node.name.toLowerCase())),
					filters: [
						{
							value: '',
							text: '(None)',
						},
						...((this.devices.state === 'resolved') ? uniqifyAndSort(this.devices.value.flatMap(device => device.nodes.map(node => node.name))).map(node => ({
							value: node,
							text: node,
						})) : []),
					],
					onFilter: (node: string, port: Port) => (node === '') ? !port.state.mapped : (isMappedPort(port) && port.node.name === node),
					scopedSlots: {
						customRender: 'node',
					},
				}, {
					title: 'Baud Rate',
					dataIndex: 'baudRate',
					sorter: (a: Port, b: Port) => sortUnmappedLast(a, b, (a, b) => a.baudRate - b.baudRate),
				}, {
					title: 'Serial Settings',
					dataIndex: 'serialSettings',
				}];
			},
			ports(): Port[] {
				const rtn: Port[] = [];
				const nodePaths = new Set<string>();
				if(this.devices.state === 'resolved') {
					for(const device of this.devices.value) {
						if(device.remoteInfo) {
							continue;
						}
						for(const node of device.nodes) {
							if(isSerialNode(node)) {
								nodePaths.add(node.path);
								rtn.push({
									device, node,
									key: `${device.id}/${node.name}`,
									state: {
										mapped: true,
										...node.state
									},
									path: node.path,
									baudRate: node.baudRate,
									byteSize: node.byteSize,
									parity: node.parity,
									stopBits: node.stopBits,
									serialSettings: `${node.byteSize}/${node.parity[0].toUpperCase()}/${node.stopBits}`,
								} as MappedPort);
							}
						}
					}
				}
				if(this.nativePorts.state === 'resolved') {
					for(const port of this.nativePorts.value) {
						if(!nodePaths.has(port.comName)) {
							rtn.push({
								key: `<native-port>/${port.comName}`,
								path: port.comName,
								state: {
									mapped: false,
								},
							});
						}
					}
				}
				return rtn;
			},
		},
		data() {
			const app: Application<Services> = this.$root.$data.app;
			return {
				nativePorts: unwrapPromise(app.service('api/ports').find()),
			};
		},
		methods: {
			getDeviceUrl(device: DeviceJson) {
				return getDeviceUrl(device, 'device');
			},
		},
	});
</script>

<style lang="less" scoped>
	.ant-alert {
		margin-top: 5px;
	}
</style>
