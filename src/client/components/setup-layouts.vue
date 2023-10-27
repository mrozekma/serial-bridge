<template>
	<div>
		Layouts are predefined arrangements of nodes on a device view. They can either be specified in Serial Bridge's configuration file, or saved per-user from the device view.<br>
		To preview a layout, click the layout row to expand it.<br>
		To change the layout priority, click and drag the layout row to the desired position. The first enabled layout on the list that's valid for a given device will be the default layout, although you can always switch to another via the View menu.<br>
		To disable a layout, click the Disable button on the right side of the layout row. Disabled layouts are ignored when choosing the default layout for a device, but they will still be available in the View menu to apply manually.<br>

		<a-alert v-if="layouts.state === 'rejected'" message="Failed to load layouts" :description="layouts.error.message" type="error" show-icon />
		<a-skeleton v-else-if="layouts.state === 'pending'" active />
		<a-collapse v-else v-model="previewKey" ref="layouts" class="layouts-list" accordion destroy-inactive-panel @change="showPreview">
			<a-collapse-panel v-for="layout in layouts.value" :key="layout.name" :header="layout.name" :class="layout.enabled ? 'enabled' : 'disabled'">
				<div ref="preview" class="preview"/>
				<template #extra>
					<div class="buttons">
						<a-button v-if="layout.source === 'user'" size="small" danger @click.stop="deleteLayout(layout)">Delete</a-button>
						<a-button size="small" @click.stop="toggleLayoutEnabled(layout)">{{ layout.enabled ? 'Disable' : 'Enable' }}</a-button>
					</div>
				</template>
			</a-collapse-panel>
		</a-collapse>

		<div class="buttons">
			<a-button type="primary" :disabled="!changed" @click="save">Save</a-button>
			<a-popconfirm title="Are you sure? This will erase all your layout customizations" ok-text="Erase" @confirm="clear">
				<a-button type="danger">Forget all layout changes</a-button>
			</a-popconfirm>
		</div>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { Application } from '@feathersjs/feathers';
	import { ComponentContainer, ComponentItemConfig, GoldenLayout, LayoutConfig, ResolvedComponentItemConfig, ResolvedLayoutConfig, RowOrColumnItemConfig, StackItemConfig } from 'golden-layout';
	import Sortable from 'sortablejs';

	import { Layout, LayoutItem } from '@/layout';
	import { ClientServices as Services } from '@/services';

	export interface SerializedLayout {
		name: string;
		source: 'config' | 'user' | 'auto';
		enabled: boolean;
		layout: Layout | ResolvedLayoutConfig;
	}

	const storageKey = 'layouts';

	export function deserialize(configLayouts: Layout[]): SerializedLayout[] {
		const rtn: SerializedLayout[] = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
		// Look for config-based entries in 'rtn' that no longer exist
		for(let i = 0; i < rtn.length; i++) {
			if(rtn[i].source === 'config' && !configLayouts.some(seek => seek.name === rtn[i].name)) {
				rtn.splice(i--, 1);
			}
		}
		// Look for config-based entries that are missing from 'rtn' and add them to the end
		for(const layout of configLayouts) {
			if(layout.name !== '<auto>' && !rtn.some(seek => seek.source === 'config' && seek.name === layout.name)) {
				rtn.push({
					name: layout.name,
					source: 'config',
					enabled: true,
					layout,
				});
			}
		}
		const auto = configLayouts.find(seek => seek.name === '<auto>');
		if(auto) {
			rtn.push({
				name: auto.name,
				source: 'auto',
				enabled: true,
				layout: auto,
			});
		}
		return rtn;
	}

	function serialize(layouts: SerializedLayout[]) {
		localStorage.setItem(storageKey, JSON.stringify(layouts));
	}

	export function saveNew(name: string, layout: ResolvedLayoutConfig): SerializedLayout {
		const saved: SerializedLayout[] = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
		const newLayout: SerializedLayout = {
			name, layout,
			source: 'user',
			enabled: true,
		}
		saved.push(newLayout);
		serialize(saved);
		return newLayout;
	}

	function clearStorage() {
		localStorage.removeItem(storageKey);
	}

	function sbLayoutToGl(layout: Layout): LayoutConfig {
		function helper(item: LayoutItem): RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig {
			switch(item.type) {
				case 'row':
				case 'column':
					return {
						type: item.type,
						height: item.height ?? 1,
						width: item.width ?? 1,
						content: item.children ? item.children.map(helper) : [],
					};
				case 'stack':
					return {
						type: item.type,
						height: item.height ?? 1,
						width: item.width ?? 1,
						content: item.children ? item.children.map(helper) as ComponentItemConfig[] : [],
					};
				case 'node':
					return {
						type: 'component',
						height: item.height ?? 1,
						width: item.width ?? 1,
						componentType: 'terminal',
						title: item.name,
					};
			}
		}

		return {
			root: helper(layout),
			header: {
				close: false,
				maximise: false,
				popout: false,
				tabDropdown: false,
			},
		};
	}

	import { rootDataComputeds, unwrapPromise } from '../root-data';
	export default Vue.extend({
		computed: {
			...rootDataComputeds(),
		},
		data() {
			const app = this.$root.$data.app as Application<Services>;
			return {
				layouts: unwrapPromise(app.service('api/layouts').find().then(deserialize)),
				previewKey: undefined as string | undefined,
				changed: false,
			};
		},
		watch: {
			async 'layouts.state'(newVal, oldVal) {
				if(oldVal !== 'resolved' && newVal === 'resolved') {
					await this.$nextTick();
					const self = this;
					const el = (this.$refs.layouts as Vue).$el as HTMLElement;
					new Sortable(el, {
						onStart() {
							self.previewKey = undefined;
						},
						onUpdate(e) {
							if(self.layouts.state === 'resolved') {
								const { oldIndex, newIndex } = e;
								const moved = self.layouts.value.splice(oldIndex!, 1);
								self.layouts.value.splice(newIndex!, 0, ...moved);
								self.changed = true;
							}
						},
					});
				}
			},
		},
		methods: {
			async showPreview(layoutName?: string) {
				if(layoutName === undefined) {
					return;
				} else if(this.layouts.state !== 'resolved') {
					throw new Error('Layouts unresolved');
				}
				await this.$nextTick();
				const layout = this.layouts.value.find(seek => seek.name === layoutName)!;
				const el = (this.$refs.preview as HTMLDivElement[])[0];
				const gl = new GoldenLayout(el, (container: ComponentContainer, itemConfig: ResolvedComponentItemConfig) => {
					return {
						component: document.createElement('div'),
						virtual: false,
					};
				});
				gl.resizeWithContainerAutomatically = true;
				gl.loadLayout((layout.source === 'config') ? sbLayoutToGl(layout.layout as Layout) : layout.layout as any);
			},
			toggleLayoutEnabled(layout: SerializedLayout) {
				layout.enabled = !layout.enabled;
				this.changed = true;
			},
			deleteLayout(layout: SerializedLayout) {
				if(this.layouts.state !== 'resolved') {
					throw new Error('Layouts unresolved');
				}
				const idx = this.layouts.value.indexOf(layout);
				this.layouts.value.splice(idx, 1);
				this.changed = true;
			},
			save() {
				if(this.layouts.state !== 'resolved') {
					throw new Error('Layouts unresolved');
				}
				serialize(this.layouts.value);
				this.$message.success({
					content: "Layouts saved",
					duration: 3,
				});
			},
			clear() {
				clearStorage();
				Object.assign(this.$data, (this.$options.data as ((this: any) => object)).call(this));
			},
		},
	});
</script>

<style lang="less" scoped>
	.layouts-list {
		margin: 10px 0;
		max-width: 1000px;

		/deep/ .sortable-ghost {
			cursor: grabbing;
			background-color: #91caff;
		}
	}

	.ant-collapse-item {
		&.disabled {
			/deep/ .ant-collapse-header {
				text-decoration: line-through;
				opacity: .3;
			}
		}

		/deep/ .ant-collapse-content-box {
			background-color: #f4f4f4;
		}
	}

	.preview {
		min-height: 600px;
	}

	.buttons {
		margin-bottom: 10px;

		.ant-btn {
			margin-right: 10px;
		}
	}
</style>
