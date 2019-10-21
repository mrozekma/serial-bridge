<template>
	<a-menu mode="horizontal" theme="dark" :selectable="false" openTransitionName="none" openAnimation="none">
		<a-menu-item class="brand">{{ brand }}</a-menu-item>
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
		<slot/>
		<a-menu-item class="right faux">
			<slot name="right"/>
		</a-menu-item>
	</a-menu>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	// Not a fan of the gaps between submenus
	//@ts-ignore
	import placements from 'ant-design-vue/es/vc-menu/placements';
	placements.bottomLeft.offset = [0, 2];
	placements.rightTop.offset = [0, 0];

	import { rootDataComputeds, PromiseResult } from '../root-data';
	import { CommandJson } from '@/services';

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
			&:not(.faux) {
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
		pointer-events: none;
		font-size: 16pt;
		color: #fff;
		padding: 0 10px;
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

		i {
			margin-right: 2px;
		}
	}

	.ant-menu-submenu-popup > .ant-menu { //.ant-menu-submenu-placement-bottomLeft
		border-radius: 0 !important;
	}
</style>
