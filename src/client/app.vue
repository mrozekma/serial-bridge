<template>
	<div id="app">
		<a-menu mode="horizontal" theme="dark" :selectable="false" openTransitionName="none" openAnimation="none">
			<a-menu-item class="brand">Test</a-menu-item>
			<a-sub-menu>
				<template v-slot:title>
					<router-link to="/">Devices</router-link>
				</template>
				<a-menu-item v-if="devices.state == 'pending'" disabled><a-spin size="small"/> Loading...</a-menu-item>
				<a-menu-item v-else-if="devices.state == 'rejected'"  disabled><i class="fas fa-exclamation-circle"></i> Failed to load</a-menu-item>
				<a-menu-item v-else v-for="device in devices.value" :key="device.name">
					<router-link :to="`/devices/${device.id}`">
						{{ device.name }}
					</router-link>
				</a-menu-item>
			</a-sub-menu>
			<a-sub-menu>
				<template v-slot:title>Menu 2</template>
				<a-menu-item>One</a-menu-item>
				<a-sub-menu>
					<template v-slot:title>Two</template>
					<a-menu-item>One</a-menu-item>
					<a-menu-item>Two</a-menu-item>
					<a-menu-item>Three</a-menu-item>
				</a-sub-menu>
				<a-sub-menu>
					<template v-slot:title>Three</template>
					<a-menu-item>One</a-menu-item>
					<a-menu-item>Two</a-menu-item>
					<a-menu-item>Three</a-menu-item>
				</a-sub-menu>
			</a-sub-menu>
			<a-sub-menu>
				<template v-slot:title>Menu 3</template>
				<a-menu-item>One</a-menu-item>
			</a-sub-menu>
			<!-- <portal-target name="navbar"></portal-target> -->
		</a-menu>
		<main>
			<router-view/>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import PortalVue from 'portal-vue';
	Vue.use(PortalVue);

	import Antd from 'ant-design-vue';
	Vue.use(Antd);
	import 'ant-design-vue/dist/antd.css';

	// Not a fan of the gaps between submenus
	//@ts-ignore
	import placements from 'ant-design-vue/es/vc-menu/placements';
	placements.bottomLeft.offset = [0, 0];
	placements.rightTop.offset = [0, 0];

	import '@fortawesome/fontawesome-free';
	import '@fortawesome/fontawesome-free/css/all.css';

	import { rootDataComputeds } from './root-data';

	export default Vue.extend({
		computed: {
			...rootDataComputeds(),
		},
	});
</script>

<style lang="less">
	* {
		transition-duration: 0ms !important;
	}

	.ant-menu-horizontal {
		> .ant-menu-item,
		> .ant-menu-submenu {
			border-bottom: 2px solid transparent !important;
		}

		> .ant-menu-item:hover,
		> .ant-menu-submenu:hover,
		> .ant-menu-item-active,
		> .ant-menu-submenu-active,
		> .ant-menu-item-open,
		> .ant-menu-submenu-open,
		> .ant-menu-item-selected,
		> .ant-menu-submenu-selected {
			border-bottom: 2px solid #1890ff !important;
		}
	}

	.ant-menu-item.brand {
		pointer-events: none;
		font-size: 16pt;
		color: #fff;
	}

	.ant-menu-submenu, .ant-menu-item {
		a:focus {
			text-decoration: none;
		}

		.ant-spin {
			margin-right: 5px;
		}
	}

	.ant-menu-submenu-popup > .ant-menu { //.ant-menu-submenu-placement-bottomLeft
		border-radius: 0 !important;
	}

	main {
		padding: 5px;
	}
</style>
