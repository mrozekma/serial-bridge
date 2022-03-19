<template>
	<div class="gl"/>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { Node } from '../device-functions';

	import { ComponentContainer, ComponentItemConfig, ContentItem, GoldenLayout, LayoutConfig, ResolvedComponentItemConfig, RowOrColumnItemConfig, Stack } from 'golden-layout';
	import 'golden-layout/dist/css/goldenlayout-base.css';
	import 'golden-layout/dist/css/themes/goldenlayout-light-theme.css';

	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	import SbTabLinks, { SbTabLinksVue } from '../components/tab-links.vue';
	const component = Vue.extend({
		props: {
			deviceName: {
				type: String,
				required: true,
			},
			nodes: {
				type: Array as PropType<Node[]>,
				required: true,
			},
		},
		data() {
			return {
				gl: undefined as GoldenLayout | undefined,
				layoutConfig: undefined as LayoutConfig | undefined,
				ready: false,
				terminals: new Map<string, SbTerminalVue>(), // node name -> SbTerminal
			};
		},
		mounted() {
			let layoutResolve: (layout: GoldenLayout) => void;
			const layoutPromise = new Promise<GoldenLayout>(resolve => layoutResolve = resolve);
			layoutPromise.then(() => this.ready = true);

			// Make an SbTerminal for each node
			const termCtor = Vue.extend(SbTerminal);
			this.nodes.forEach((node, idx) => {
				// This feels pretty hacky, but props passed to a dynamically instantiated component aren't reactive, so we need to do some work
				// https://forum.vuejs.org/t/dynamically-add-vue-component-with-reactive-properties/17360/6
				const props = Vue.observable({
					node: node,
					layout: layoutPromise,
				});
				const comp = new termCtor({});
				//@ts-ignore Vue internals :-\
				comp._props = props;
				comp.$mount();
				for(const event of ['stdin', 'focus', 'blur', 'contextmenu']) {
					comp.$on(event, (data: any) => this.$emit(event, node.name, data));
				}
				this.$watch('nodes', (nodes: Node[]) => props.node = nodes[idx], { deep: true });
				this.terminals.set(node.name, comp as SbTerminalVue);
			});

			const nodeConfigs = this.nodes.map<ComponentItemConfig>(node => ({
				type: 'component',
				componentName: 'terminal',
				componentType: 'terminal',
				title: node.name,
				componentState: {
					node,
				},
			}));

			const row = [...function*(): IterableIterator<RowOrColumnItemConfig> {
				let i = 0;
				if(nodeConfigs.length % 2) {
					// If odd, put the first node in a column alone
					yield {
						type: 'column',
						content: [ nodeConfigs[i++]] ,
					};
				}
				const rowLen = Math.floor(nodeConfigs.length / 2);
				for(; i * 2 < nodeConfigs.length; i++) {
					yield {
						type: 'column',
						content: [ nodeConfigs[i], nodeConfigs[i + rowLen] ],
					};
				}
			}()];

			const gl = this.gl = new GoldenLayout(this.$el as HTMLDivElement, (container: ComponentContainer, itemConfig: ResolvedComponentItemConfig) => {
				const node: Node = (itemConfig.componentState as any).node;
				const term = this.getNodeTerminal(node.name);
				container.element.append(term.$el);
				return {
					component: term.$el,
					virtual: false,
				};
			});
			// The GL beforeunload handler gets triggered when following a tab-links link and destroys the layout, so this unregisters it.
			//@ts-ignore The listener isn't part of the public interface
			window.removeEventListener('beforeunload', gl._windowUnloadListener);
			this.gl.resizeWithContainerAutomatically = true;

			const tabLinksCtor = Vue.extend(SbTabLinks);
			gl.on('itemCreated', e => {
				if(!(e.target as any).isStack) {
					return;
				}
				const stack = e.target as Stack;
				const comp = new tabLinksCtor() as SbTabLinksVue;
				comp.$mount();
				comp.$on('stdin', (node: Node, data: string) => this.$emit('stdin', node.name, data));
				stack.header.controlsContainerElement.prepend(...comp.$el.children);
				stack.on('activeContentItemChanged', (contentItem: ContentItem) => {
					const config = contentItem.toConfig() as ComponentItemConfig;
					const node: Node = (config.componentState as any).node;
					comp.setNode(this.deviceName, this.nodes.find(seek => seek.name == node.name));
				});
			});
			this.layoutConfig = {
				root: {
					type: 'row',
					content: row,
				},
				header: {
					close: 'Close',
					maximise: 'Maximize',
					minimise: 'Minimize',
					// popout: 'Open in new window',
					popout: false,
					popin: 'Pop back in to main window',
					tabDropdown: 'Additional tabs',
				},
			};
			this.resetLayout();
			layoutResolve!(gl);
		},
		beforeDestroy() {
			this.gl?.destroy();
		},
		methods: {
			getNodeTerminal(node: string): SbTerminalVue {
				const rtn = this.terminals.get(node);
				if(rtn === undefined) {
					throw new Error(`No terminal for node '${node}'`);
				}
				return rtn;
			},
			resetLayout() {
				this.gl!.loadLayout(this.layoutConfig!);
			},
		},
	});
	export type SbLayoutVue = InstanceType<typeof component>;
	export default component;
</script>

<style lang="less" scoped>
	.gl {
		width: calc(100vw - 10px);
		height: calc(100vh - 60px);
	}
</style>
