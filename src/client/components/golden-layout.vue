<template>
	<div class="gl"/>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { Layout as SbLayout, LayoutItem as SbLayoutItem } from '../../layout';
	import { Node } from '../device-functions';

	import { ComponentContainer, ComponentItemConfig, ContentItem, GoldenLayout, LayoutConfig, ResolvedComponentItemConfig, ResolvedLayoutConfig, RowOrColumnItemConfig, Stack, StackItemConfig } from 'golden-layout';
	import 'golden-layout/dist/css/goldenlayout-base.css';
	import 'golden-layout/dist/css/themes/goldenlayout-light-theme.css';

	function sbLayoutToGl(layout: SbLayout, nodes: Node[]): LayoutConfig {
		const wildcardInfo = {
			allocatedNodes: new Set<Node>(),
			wildcardArray: undefined as ComponentItemConfig[] | undefined,
		};

		function getChildren(item: SbLayoutItem): (RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig)[] {
			if(item.type === 'node' || item.children === undefined) {
				return [];
			} else if(item.children === '*') {
				// Server should have already checked for this:
				if(wildcardInfo.wildcardArray !== undefined) {
					throw new Error("Layout cannot have multiple wildcard children");
				}
				wildcardInfo.wildcardArray = []
				return wildcardInfo.wildcardArray;
			} else {
				return item.children.flatMap(helper);
			}
		}

		function helper(item: SbLayoutItem): (RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig)[] {
			switch(item.type) {
				case 'row':
				case 'column':
					return [{
						type: item.type,
						height: item.height ?? 1,
						width: item.width ?? 1,
						content: getChildren(item),
					}];
				case 'stack':
					return [{
						type: item.type,
						height: item.height ?? 1,
						width: item.width ?? 1,
						content: getChildren(item) as ComponentItemConfig[],
					}];
				case 'node':
					const node = nodes.find(node => node.name === item.name);
					if(!node) {
						return [];
					}
					wildcardInfo.allocatedNodes.add(node);
					return [{
						type: 'component',
						height: item.height ?? 1,
						width: item.width ?? 1,
						componentType: 'terminal',
						title: node.name,
						componentState: {
							node,
						},
					}];
			}
		}

		const roots = helper(layout);
		if(wildcardInfo.wildcardArray !== undefined) {
			wildcardInfo.wildcardArray.push(...nodes.filter(node => !wildcardInfo.allocatedNodes.has(node)).map(node => ({
				type: 'component' as const,
				height: 1,
				width: 1,
				componentType: 'terminal',
				title: node.name,
				componentState: {
					node,
				},
			})));
		}
		return {
			root: (roots.length == 1) ? roots[0] : { type: 'row', content: roots },
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
	}

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
				ready: false,
				terminals: new Map<string, SbTerminalVue>(), // node name -> SbTerminal
				layoutPromiseResolve: (layout: GoldenLayout) => {},
			};
		},
		mounted() {
			const layoutPromise = new Promise<GoldenLayout>(resolve => this.layoutPromiseResolve = resolve);
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
			gl.resizeWithContainerAutomatically = true;

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
			loadLayout(layout: SbLayout | ResolvedLayoutConfig) {
				function isGlLayout(layout: SbLayout | ResolvedLayoutConfig): layout is ResolvedLayoutConfig {
					return (layout as any).resolved === true;
				}
				this.gl!.loadLayout(isGlLayout(layout) ? layout as any : sbLayoutToGl(layout, this.nodes));
				this.layoutPromiseResolve(this.gl!);
			},
			saveLayout(): ResolvedLayoutConfig {
				return this.gl!.saveLayout();
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
