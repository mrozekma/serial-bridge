<template>
	<div class="term-padding-wrapper">
		<div v-show="node.state.open || forceVisible" ref="term" class="term"/>
		<a-alert v-if="!node.state.open" message="Port closed" :description="node.state.reason" type="info" showIcon/>
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
			node: Object as PropType<Node>,
			layout: Promise as PropType<Promise<GoldenLayout>>,
		},
		data() {
			return {
				terminal: new Terminal({
					scrollback: 5000,

				}),
				fitAddon: new SbFit(),
				forceVisible: true,
			};
		},
		watch: {
			async 'node.state.open'(val) {
				if(val) {
					await this.$nextTick();
					this.fit();
				}
			},
		},
		async mounted() {
			// If the terminal isn't visible when it's first created, it doesn't layout correctly. This forces the terminal to be visible briefly even if the node is closed
			setTimeout(() => this.forceVisible = false, 1);
			this.terminal.loadAddon(this.fitAddon);
			const layout = await this.layout;
			this.terminal.open(this.$refs.term as HTMLElement);
			this.fit();
			layout.on('stateChanged', () => this.fit());
			//@ts-ignore Poking around in xterm internals
			this.terminal._core.onFocus(() => this.$emit('focus'));
			//@ts-ignore Poking around in xterm internals
			this.terminal._core.onBlur(() => this.$emit('blur'));
			this.terminal.onData((data: string) => this.$emit('stdin', data));
			if(this.node.type === 'remote_io') {
				// Echo keystrokes. Also Enter only sends a \r, so convert it to \r\n, and filter out Backspace
				this.terminal.onData((data: string) => {
					this.terminal.write(data.replace('\r', '\r\n').replace('\x7f', ''));
				});
				// When printing incoming data, convert \n to \r\n
				this.terminal.setOption('convertEol', true);
			}
		},
		methods: {
			fit() {
				this.fitAddon.fit();
			},
			write(buf: Buffer) {
				this.terminal.write(new Uint8Array(buf));
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

	.ant-alert {
		position: relative;
		top: 50%;
		transform: translateY(-50%);
		margin: 0 5px;
	}

	.term {
		height: 100%;
		/deep/ .xterm {
			padding: 5px;
		}
	}
</style>
