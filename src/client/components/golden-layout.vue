<template>
	<div class="gl"/>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { Node } from '../device-functions';

	import 'jquery'; // Needed by golden layout :(
	import GoldenLayout from 'golden-layout';
	import 'golden-layout/src/css/goldenlayout-base.css';
	import 'golden-layout/src/css/goldenlayout-light-theme.css';

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
				comp.$on('stdin', (data: string) => this.$emit('stdin', node.name, data));
				comp.$on('focus', () => this.$emit('focus', node.name));
				comp.$on('blur', () => this.$emit('blur', node.name));
				this.$watch('nodes', (nodes: Node[]) => props.node = nodes[idx], { deep: true });
				this.terminals.set(node.name, comp as SbTerminalVue);
			});

			//TODO Load config from local storage
			const nodeConfigs = this.nodes.map<GoldenLayout.ItemConfigType>(node => ({
				type: 'component',
				componentName: 'terminal',
				title: node.name,
				componentState: {
					nodeName: node.name,
				},
			}));

			const row = [...function*(): IterableIterator<GoldenLayout.ItemConfigType> {
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

			const gl = this.gl = new GoldenLayout({
				content: [{
					type: 'row',
					content: row,
				}],
				labels: {
					close: 'Close',
					maximise: 'Maximize',
					minimise: 'Minimize',
					popout: 'Open in new window',
					//@ts-ignore This isn't in the interface or the docs, but it exists
					popin: 'Pop back in to main window',
					tabDropdown: 'Additional tabs',
				},
			}, this.$el);
			gl.on('initialised', () => layoutResolve(gl));
			gl.registerComponent('terminal', (container: GoldenLayout.Container, state: { nodeName: string }) => {
				const term = this.getNodeTerminal(state.nodeName);
				container.getElement().append(term.$el);
			});
			const tabLinksCtor = Vue.extend(SbTabLinks);
			gl.on('stackCreated', (stack: GoldenLayout.ContentItem) => {
				const comp = new tabLinksCtor() as SbTabLinksVue;
				comp.$mount();
				comp.$on('stdin', (node: Node, data: string) => this.$emit('stdin', node.name, data));
				//@ts-ignore Typing isn't quite right here, it thinks stack.header doesn't exist
				stack.header.controlsContainer.prepend(...comp.$el.children);
				stack.on('activeContentItemChanged', (contentItem: GoldenLayout.ContentItem) => {
					const config = contentItem.config as GoldenLayout.ComponentConfig;
					comp.setNode(this.deviceName, this.nodes.find(node => node.name == config.componentState.nodeName));
				});
			});
			gl.init();

			window.addEventListener('resize', () => this.gl!.updateSize());
		},
		beforeDestroy() {
			if(this.gl) {
				this.gl.destroy();
			}
		},
		methods: {
			getNodeTerminal(node: string): SbTerminalVue {
				const rtn = this.terminals.get(node);
				if(rtn === undefined) {
					throw new Error(`No terminal for node '${node}'`);
				}
				return rtn;
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
