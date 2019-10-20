<template>
	<a-alert v-if="error" type="error" message="Bad route" :description="error" showIcon/>
	<component v-else :is="view" v-bind="props"/>
</template>

<script lang="ts">
	import Vue, { VueConstructor } from 'vue';

	import Antd from 'ant-design-vue';
	Vue.use(Antd);
	import 'ant-design-vue/dist/antd.css';

	// I ended up using FontAwesome Pro, which I have a license for, but using the pro NPM registry would make it impossible for anyone else to build Serial Bridge from source.
	// Instead I downloaded the files and put them in public/fontawesome; the CSS is pulled into the page via public/index.html.
	// import '@fortawesome/fontawesome-free';
	// import '@fortawesome/fontawesome-free/css/all.css';

	import 'animate.css/animate.css';

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
