<template>
	<div>{{ device }}</div>
</template>

<script lang="ts">
	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { DeviceJson } from '@/services';

	import Vue from 'vue';
	export default Vue.extend({
		computed: {
			...rootDataComputeds(),
		},
		data() {
			return {
				device: {
					state: 'pending', // Technically a lie, but mounted() will take care of it
				} as PromiseResult<DeviceJson>,
			};
		},
		mounted() {
			this.device = unwrapPromise(this.app.service('devices').get(this.$route.params.device));
		},
	});
</script>
