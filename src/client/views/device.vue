<template>
	<div>
		<sb-navbar :brand="deviceName"></sb-navbar>
		<main>
			<template v-if="device.state == 'pending'">
				<!-- TODO -->
			</template>
			<a-alert v-else-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<template v-else>
				{{ device }}
			</template>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { DeviceJson } from '@/services';

	import SbNavbar from '../components/navbar.vue';
	export default Vue.extend({
		components: { SbNavbar },
		computed: {
			...rootDataComputeds(),
			deviceName(): string {
				return (this.device.state == 'resolved') ? this.device.value.name : this.$route.params.device;
			},
		},
		data() {
			return {
				device: {
					state: 'pending', // Technically a lie, nothing is loading yet, but watch.$route will take care of it
				} as PromiseResult<DeviceJson>,
			};
		},
		mounted() {
			this.device = unwrapPromise(this.app.service('devices').get(this.$route.params.device));
		},
		// watch: {
		// 	$route: {
		// 		// vue-router will reuse the component if we switch from one device to another, so watch $route for changes
		// 		handler() {
		// 			this.device = unwrapPromise(this.app.service('devices').get(this.$route.params.device));
		// 		},
		// 		immediate: true,
		// 	},
		// },
	});
</script>
