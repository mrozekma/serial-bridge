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

	import SbNavbar from '../components/navbar.vue';
	import SbLayout from '../components/golden-layout.vue';
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
				layout: null, //TODO Persist this
			};
		},
		mounted() {
			this.device = unwrapPromise(this.app.service('api/devices').get(this.id));
		},
	});
</script>
