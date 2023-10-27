<template>
	<div class="term-padding-wrapper">
		<div ref="term" class="term" @contextmenu.prevent="showMenu"/>
		<a-alert v-if="!node.state.open" :message="node.state.reason" type="info" show-icon/>
		<div v-else-if="writeCollision" class="write-collision" @click="onWriteCollision()" @mouseenter="writeCollisionMouse(true)" @mouseleave="writeCollisionMouse(false)">
			<a-alert type="warning" show-icon>
				<template #message>
					Multiple users writing at once:&nbsp;
					<sb-connection v-for="connection in writeCollision.connections" :key="connection.host" v-bind="connection" :avatar-size="16"/>
				</template>
			</a-alert>
		</div>
	</div>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { Connection } from '../connections';
	import { Node } from '../device-functions';

	import GoldenLayout from 'golden-layout';
	import { Terminal } from 'xterm';
	import { FitAddon, ITerminalDimensions } from 'xterm-addon-fit';
	import { SerializeAddon } from 'xterm-addon-serialize';
	import 'xterm/css/xterm.css';

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
			const dims = this.getFloatDimensions();
			if(!dims) {
				return undefined;
			}
			let { rows, cols } = dims;
			if(rows - Math.floor(rows) > .2) {
				rows = Math.ceil(rows);
			}
			return (isNaN(rows) || isNaN(cols)) ? undefined : {
				rows: Math.floor(rows),
				cols: Math.floor(cols),
			};
		}
	}

	const numScrollbackLines = 5000;
	// ANSI escape sequences reserve "ESC _ ... ESC \" for app-specific commands; I'm using them here to let remote IO nodes control keystroke echoing
	const echoOnEscSeq = Buffer.from('\x1b_echo_on\x1b\\'), echoOffEscSeq = Buffer.from('\x1b_echo_off\x1b\\');

	import SbConnection from '../components/connection.vue';
	const component = Vue.extend({
		props: {
			node: Object as PropType<Node>,
			layout: Promise as PropType<Promise<GoldenLayout.GoldenLayout>>,
		},
		components: { SbConnection },
		data() {
			return {
				terminal: new Terminal({
					scrollback: numScrollbackLines,
				}),
				fitAddon: new SbFit(),
				serializeAddon: new SerializeAddon(),
				echoOn: false,
				writeCollision: undefined as {
					connections: Connection[];
					timer?: number;
				} | undefined,
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
			this.terminal.loadAddon(this.fitAddon);
			this.terminal.loadAddon(this.serializeAddon);
			const layout = await this.layout;
			// For some totally unknown reason, opening a tooltip by mousing over a connection in the write collision alert causes the terminal Vue instance to rerun this mounted() hook, only this.$refs.term is undefined. I can't figure out why
			if(!this.$refs.term) {
				return;
			}
			this.terminal.open(this.$refs.term as HTMLElement);
			this.fit();
			layout.on('stateChanged', () => this.fit());
			//@ts-ignore Poking around in xterm internals
			this.terminal._core.onFocus(() => this.$emit('focus'));
			//@ts-ignore Poking around in xterm internals
			this.terminal._core.onBlur(() => this.$emit('blur'));
			this.terminal.onData((data: string) => this.$emit('stdin', data));
			if(this.node.type === 'remote_io') {
				// Echo keystrokes if asked. Also Enter only sends a \r, so convert it to \r\n, and filter out Backspace
				this.terminal.onData((data: string) => {
					if(this.echoOn) {
						this.terminal.write(data.replace('\r', '\r\n').replace('\x7f', ''));
					}
				});
				// When printing incoming data, convert \n to \r\n
				this.terminal.options.convertEol = true
			}
		},
		methods: {
			fit() {
				this.fitAddon.fit();
			},
			serialize() {
				return this.serializeAddon.serialize({
					scrollback: numScrollbackLines,
				});
			},
			write(abuf: ArrayBuffer) {
				const arr = new Uint8Array(abuf);
				// I want to minimize work done here until I'm at least reasonably sure there's an actual escape sequence to parse
				if(arr.find((val, idx) => val === echoOnEscSeq[0] && arr[idx + 1] === echoOnEscSeq[1])) {
					const buf = new Buffer(arr);
					const onIdx = buf.lastIndexOf(echoOnEscSeq), offIdx = buf.lastIndexOf(echoOffEscSeq);
					if(onIdx >= 0 && offIdx >= 0) {
						this.echoOn = (onIdx > offIdx);
					} else if(onIdx >= 0) {
						this.echoOn = true;
					} else if(offIdx >= 0) {
						this.echoOn = false;
					}
				}
				this.terminal.write(arr);
			},
			focus() {
				this.terminal.focus();
			},
			showMenu(e: MouseEvent) {
				this.$emit('contextmenu', e);
				e.stopPropagation();
				e.preventDefault();
				return false;
			},
			onWriteCollision(connections?: Connection[]) {
				if(this.writeCollision?.timer) {
					clearTimeout(this.writeCollision.timer);
				}
				this.writeCollision = connections ? {
					connections,
					timer: window.setTimeout(() => this.onWriteCollision(), 5000),
				} : undefined;
			},
			writeCollisionMouse(inside: boolean) {
				if(inside) {
					if(this.writeCollision!.timer) {
						clearTimeout(this.writeCollision!.timer);
						this.writeCollision!.timer = undefined;
					}
				} else {
					this.writeCollision!.timer = window.setTimeout(() => this.onWriteCollision(), 2000);
				}
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
		position: absolute;
		top: 5px;
		margin-left: 5px;
		right: 22px; // Avoid the scrollbar
		z-index: 10;
	}

	.write-collision {
		cursor: pointer;
	}

	.term {
		height: 100%;
		/deep/ .xterm {
			padding: 5px;
		}
	}
</style>
