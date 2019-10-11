<template>
	<div class="term-padding-wrapper">
		<div ref="term" class="term"/>
	</div>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { DeviceJson } from '@/services';

	type Node = DeviceJson['nodes'][number];

	import GoldenLayout from 'golden-layout';
	import { Terminal } from 'xterm';
	import { FitAddon, ITerminalDimensions } from 'xterm-addon-fit';
	import 'xterm/css/xterm.css';
	//TODO xterm-addon-search

	class SbFit extends FitAddon {
		private getFloatDimensions() {
			// FitAddon.proposeDimensions rounds its result, but I need the unrounded values.
			// This might be the worst thing I've ever done
			const floor = Math.floor;
			Math.floor = x => x;
			try {
				return super.proposeDimensions();
			} finally {
				Math.floor = floor;
			}
		}

		//@ts-ignore The interface claims proposeDimensions() can't return undefined, but it can and does in FitAddon
		proposeDimensions(): ITerminalDimensions | undefined {
			// Terminal lines are 17px tall, so if the terminal height doesn't exactly divide that we're left with a gap on the bottom.
			// The alternative is to draw one line too many and hide the overflow. This works except that the bottom part of the scrolbar can get a little cut off.
			// I hate both, but I generally hate the latter less. Choose depending on how big the gap will be
			let { rows, cols } = this.getFloatDimensions();
			if(rows - Math.floor(rows) > .2) {
				rows = Math.ceil(rows);
			}
			return (isNaN(rows) || isNaN(cols)) ? undefined : {
				rows: Math.floor(rows),
				cols: Math.floor(cols),
			};
		}
	}

	const component = Vue.extend({
		props: {
			node: {
				type: Object as PropType<Node>,
				required: true,
			},
			layout: {
				type: Promise as PropType<Promise<GoldenLayout>>,
				required: true,
			},
		},
		data() {
			return {
				terminal: new Terminal({
					scrollback: 5000,
					disableStdin: true, //TODO For now
				}),
				fitAddon: new SbFit(),
			};
		},
		async mounted() {
			this.terminal.loadAddon(this.fitAddon);
			const layout = await this.layout;
			this.terminal.open(this.$refs.term as HTMLElement);
			this.fit();
			layout.on('stateChanged', () => this.fit());
		},
		methods: {
			fit() {
				this.fitAddon.fit();
			},
		},
	});
	export type SbTerminalVue = InstanceType<typeof component>;
	export default component;
</script>

<style lang="less" scoped>
	.term-padding-wrapper {
		height: 100%;
		overflow: hidden;
	}

	.term {
		height: 100%;
		/deep/ .xterm {
			padding: 5px;
		}
	}
</style>
