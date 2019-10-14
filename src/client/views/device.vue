<template>
	<div>
		<sb-navbar :brand="deviceName"/>
		<main>
			<template v-if="device.state == 'pending'">
				<!-- TODO -->
			</template>
			<a-alert v-else-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<sb-layout ref="layout" v-if="nodes.length > 0" :nodes="nodes"/>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { DeviceJson, ConnectionsJson } from '@/services';

	type Node = DeviceJson['nodes'][number];

	import SbNavbar from '../components/navbar.vue';
	import SbLayout, {SbLayoutVue } from '../components/golden-layout.vue';
	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	export default Vue.extend({
		components: { SbNavbar, SbLayout, SbTerminal },
		props: {
			id: {
				type: String,
				required: true,
			},
		},
		computed: {
			...rootDataComputeds(),
			deviceName(): string {
				return (this.device.state == 'resolved') ? this.device.value.name : this.id;
			},
			nodes(): Node[] {
				return (this.device.state == 'resolved') ? this.device.value.nodes : [];
			},
		},
		data() {
			return {
				device: {
					state: 'pending', // Technically a lie, nothing is loading yet, but mounted() will take care of it
				} as PromiseResult<DeviceJson>,
			};
		},
		mounted() {
			const devicesService = this.app.service('api/devices');
			this.device = unwrapPromise(devicesService.get(this.id));
			//TODO Automate this typing
			devicesService
				.on('updated', (data: { device: DeviceJson }) => {
					this.device = {
						state: 'resolved',
						value: data.device,
					}
				})
				.on('data', (data: { node: string; data: Buffer }) => {
					// console.debug(data);
					const terminal = this.getTerminal(data.node);
					if(terminal) {
						terminal.terminal.write(new Uint8Array(data.data));
					}
				});
		},
		methods: {
			getTerminal(node: string): SbTerminalVue | undefined {
				const layout = this.$refs.layout as SbLayoutVue | undefined;
				return (layout && layout.ready) ? layout.getNodeTerminal(node) : undefined;
			},
		},
	});
</script>
