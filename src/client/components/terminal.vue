<template>
	<div class="term-padding-wrapper">
		<div ref="term" class="term">
		</div>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { Terminal } from 'xterm';
	import { FitAddon } from 'xterm-addon-fit';
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

		proposeDimensions() {
			// Terminal lines are 17px tall, so if the terminal height doesn't exactly divide that we're left with a gap on the bottom.
			// The alternative is to draw one line too many and hide the overflow. This works except that the bottom part of the scrolbar can get a little cut off.
			// I hate both, but I generally hate the latter less. Choose depending on how big the gap will be
			let { rows, cols } = this.getFloatDimensions();
			if(rows - Math.floor(rows) > .2) {
				rows = Math.ceil(rows);
			}
			return {
				rows: Math.floor(rows),
				cols: Math.floor(cols),
			};
		}
	}

	const component = Vue.extend({
		data() {
			return {
				terminal: new Terminal({
					scrollback: 5000,
					disableStdin: true, //TODO For now
				}),
				fitAddon: new SbFit(),
			};
		},
		mounted() {
			this.terminal.loadAddon(this.fitAddon);
			this.terminal.open(this.$refs.term as HTMLElement);
			this.fit();
			for(let i = 1; i <= 400; i++)
			this.terminal.writeln(`Test line ${i}`);
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
		// background-color: #000;
		overflow: hidden;
	}

	.term {
		height: 100%;
		// background-color: #000;
	}
</style>
