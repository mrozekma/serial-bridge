<template>
	<a-alert v-if="error" type="error" message="Bad route" :description="error" showIcon/>
	<component v-else :is="view" v-bind="props"/>
</template>

<script lang="ts">
	import Vue, { VueConstructor } from 'vue';

	import Antd from 'ant-design-vue';
	Vue.use(Antd);
	import 'ant-design-vue/dist/antd.css';

	import '@fortawesome/fontawesome-free';
	import '@fortawesome/fontawesome-free/css/all.css';

	// I'm avoiding a SPA here because it's convenient to start fresh when switching devices, so this is essentially a manual basic vue-router
	import HomeView from './views/home.vue';
	import DeviceView from './views/device.vue';
	export default Vue.extend({
		data() {
			let view: VueConstructor<Vue> | undefined = undefined;
			let props = {};
			let error: string | undefined = undefined;

			const path = window.location.pathname;
			const m = path.match(/^\/devices\/([^/]+)\/?$/);
			if(path == '/') {
				view = HomeView;
			} else if(m) {
				view = DeviceView;
				props = {
					id: m[1],
				};
			} else {
				error = `No view for route: ${path}`;
			}

			return { view, props, error };
		},
	});
</script>

<style lang="less">
	* {
		transition-duration: 0ms !important;
	}

	main {
		padding: 5px;
	}
</style>
