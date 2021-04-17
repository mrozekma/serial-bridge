<template>
	<a-menu mode="horizontal" theme="dark" :selectable="false" openTransitionName="none" openAnimation="none">
		<a-menu-item class="brand">
			<a href="/">
				<slot name="brand">
					{{ brand }}
				</slot>
			</a>
		</a-menu-item>
		<a-sub-menu>
			<template v-slot:title>
				<a href="/">Devices</a>
			</template>
			<a-menu-item v-if="devices.state == 'pending'" disabled><a-spin size="small"/> Loading...</a-menu-item>
			<a-menu-item v-else-if="devices.state == 'rejected'"  disabled><i class="fas fa-exclamation-circle"></i> Failed to load</a-menu-item>
			<a-menu-item v-else v-for="device in devices.value" :key="device.name">
				<a :href="getDeviceUrl(device)">
					{{ device.name }}
				</a>
			</a-menu-item>
		</a-sub-menu>
		<slot/>
		<a-menu-item class="right faux">
			<slot name="right"/>
		</a-menu-item>
	</a-menu>
</template>

<script lang="ts">
	import Vue from 'vue';

	// Not a fan of the gaps between submenus
	//@ts-ignore
	import placements from 'ant-design-vue/es/vc-menu/placements';
	placements.bottomLeft.offset = [0, 2];
	placements.rightTop.offset = [0, 0];

	import { rootDataComputeds } from '../root-data';
	import { DeviceJson } from '@/services';

	const appName = 'Serial Bridge';
	import SbCommandMenu from '../components/command-menu.vue';
	export default Vue.extend({
		components: { SbCommandMenu },
		props: {
			brand: {
				type: String,
				default: appName,
			},
			title: String,
			paused: Boolean,
		},
		computed: {
			...rootDataComputeds(),
		},
		watch: {
			brand(val) {
				if(!this.title) {
					document.title = !val ? appName : (val === appName) ? val : `${val} - ${appName}`;
				}
			},
			title(val) {
				document.title = `${val} - ${appName}`;
			},
		},
		methods: {
			getDeviceUrl(device: DeviceJson) {
				return `${device.remoteInfo?.url ?? ''}/devices/${device.id}`;
			},
		},
	});
</script>

<style lang="less">
	.ant-menu-horizontal {
		> .ant-menu-item,
		> .ant-menu-submenu {
			border-bottom: 2px solid transparent !important;

			// Not sure what these antd styles are supposed to be doing, but they're making stuff look bad, so override them
			.ant-avatar i {
				margin-right: auto;
				font-size: 18px;
			}
		}

		> .ant-menu-item:hover,
		> .ant-menu-submenu:hover,
		> .ant-menu-item-active,
		> .ant-menu-submenu-active,
		> .ant-menu-item-open,
		> .ant-menu-submenu-open,
		> .ant-menu-item-selected,
		> .ant-menu-submenu-selected {
			&:not(.brand):not(.faux) {
				border-bottom: 2px solid #1890ff !important;
			}
		}

		.right {
			float: right;

			> * {
				margin-right: 8px;
				&:hover {
					color: #fff;
				}
			}
			> i {
				position: relative;
				top: 6px;
				font-size: 28px;
			}
		}
	}

	.ant-menu-item.brand {
		font-size: 16pt;
		padding: 0 10px;
		a {
			color: #fff;
		}
	}

	.ant-menu-submenu, .ant-menu-item {
		a {
			color: rgba(255, 255, 255, 0.65);
			&:focus {
				text-decoration: none;
			}
		}

		.ant-spin {
			margin-right: 5px;
		}

		i.fas i.far i.fal i.fab {
			margin-right: 2px;
		}
	}

	.ant-menu-submenu-popup > .ant-menu { //.ant-menu-submenu-placement-bottomLeft
		border-radius: 0 !important;
	}
</style>
