<template>
	<div class="gl"/>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { DeviceJson } from '@/services';

	type Node = DeviceJson['nodes'][number];

	import 'jquery'; // Needed by golden layout :(
	import GoldenLayout from 'golden-layout';
	import 'golden-layout/src/css/goldenlayout-base.css';
	import 'golden-layout/src/css/goldenlayout-light-theme.css';

	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	const component = Vue.extend({
		props: {
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
			for(const node of this.nodes) {
				const comp = new termCtor({
					propsData: {
						node,
						layout: layoutPromise,
					},
				});
				comp.$mount();
				this.terminals.set(node.name, comp as SbTerminalVue);
			}

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

			this.gl = new GoldenLayout({
				//TODO Other settings?
				content: [{
					type: 'row',
					content: row,
				}],
			}, this.$el);
			this.gl.on('initialised', () => layoutResolve(this.gl!));
			this.gl.registerComponent('terminal', (container: GoldenLayout.Container, state: { nodeName: string }) => {
				const term = this.getNodeTerminal(state.nodeName);
				container.getElement().append(term.$el);
			});
			this.gl.init();

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
		//TODO:
		width: calc(100vw - 30px);
		height: calc(100vh - 60px);

		/deep/ .lm_tab {
			// box-shadow: none;
		}
	}
</style>
