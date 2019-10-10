<template>
	<div>
		<sb-navbar :brand="deviceName"/>
		<main>
			<template v-if="device.state == 'pending'">
				<!-- TODO -->
			</template>
			<a-alert v-else-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<sb-layout v-if="nodes.length > 0" :nodes="nodes"/>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { DeviceJson } from '@/services';

	type Node = DeviceJson['nodes'][number];
	interface GlLayout {
		left: Node | undefined;
		top: Node[];
		bottom: Node[];
	}

	import SbNavbar from '../components/navbar.vue';
	import SbLayout from '../components/golden-layout.vue';
	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	export default Vue.extend({
		components: { SbNavbar, SbLayout, SbTerminal },
		computed: {
			...rootDataComputeds(),
			deviceName(): string {
				return (this.device.state == 'resolved') ? this.device.value.name : this.$route.params.device;
			},
			nodes(): Node[] {
				return (this.device.state == 'resolved') ? this.device.value.nodes : [];
			},
			// nodesByColumn(): Node[][] {
			// 	const nodes = this.nodes;
			// 	return Array.from((function*() {
			// 		let i = 0;
			// 		if(nodes.length % 2) {
			// 			// If odd, put the first node in a column alone
			// 			yield [ nodes[i++] ];
			// 		}
			// 		const rowLen = Math.floor(nodes.length / 2);
			// 		for(; i * 2 < nodes.length; i++) {
			// 			yield [ nodes[i], nodes[i + rowLen] ];
			// 		}
			// 	})());
			// },
		},
		data() {
			return {
				device: {
					state: 'pending', // Technically a lie, nothing is loading yet, but watch.$route will take care of it
				} as PromiseResult<DeviceJson>,
				layout: null, //TODO Persist this
			};
		},
		// watch: {
		// 	layout() {
		// 		// When the layout changed, re-fit all terminals
		// 		const components = this.$refs.termComponents as SbTerminalVue[];
		// 		for(const c of components) {
		// 			c.fit();
		// 		}
		// 	},
		// },
		mounted() {
			this.device = unwrapPromise(this.app.service('api/devices').get(this.$route.params.device));
		},
	});
</script>

<style lang="less" scoped>
</style>
