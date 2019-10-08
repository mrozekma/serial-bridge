<template>
	<!-- The key forces vue-router to make a new device view when switching from one device to another instead of reusing the existing one -->
	<router-view :key="$route.fullPath"/>
</template>

<script lang="ts">
	import Vue from 'vue';

	import Antd from 'ant-design-vue';
	Vue.use(Antd);
	import 'ant-design-vue/dist/antd.css';

	import '@fortawesome/fontawesome-free';
	import '@fortawesome/fontawesome-free/css/all.css';

	import SbNavbar from './components/navbar.vue';
	export default Vue.extend({
		components: { SbNavbar },
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
