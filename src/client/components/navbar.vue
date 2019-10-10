<template>
	<a-menu mode="horizontal" theme="dark" :selectable="false" openTransitionName="none" openAnimation="none">
		<a-menu-item v-if="brand" class="brand">{{ brand }}</a-menu-item>
		<!-- <a-menu-item class="brand">Test</a-menu-item> -->
		<a-sub-menu>
			<template v-slot:title>
				<a href="/">Devices</a>
			</template>
			<a-menu-item v-if="devices.state == 'pending'" disabled><a-spin size="small"/> Loading...</a-menu-item>
			<a-menu-item v-else-if="devices.state == 'rejected'"  disabled><i class="fas fa-exclamation-circle"></i> Failed to load</a-menu-item>
			<a-menu-item v-else v-for="device in devices.value" :key="device.name">
				<a :href="`/devices/${device.id}`">
					{{ device.name }}
				</a>
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
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	// Not a fan of the gaps between submenus
	//@ts-ignore
	import placements from 'ant-design-vue/es/vc-menu/placements';
	placements.bottomLeft.offset = [0, 0];
	placements.rightTop.offset = [0, 0];

	import { rootDataComputeds } from '../root-data';

	export default Vue.extend({
		props: {
			brand: String as PropType<String | undefined>,
		},
		computed: {
			...rootDataComputeds(),
		},
	});
</script>

<style lang="less" scoped>
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
		padding: 0 10px;
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
</style>
