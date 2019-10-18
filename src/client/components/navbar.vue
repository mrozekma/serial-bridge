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
		<!-- TODO I would really like to figure out how to move this into a slot, but antd's menu class is very finicky -->
		<template v-if="commands && (commands.state != 'resolved' || commands.value.length > 0)">
			<a-sub-menu title="Commands">
				<a-menu-item v-if="commands.state == 'pending'" disabled><a-spin size="small"/> Loading...</a-menu-item>
				<a-menu-item v-else-if="commands.state == 'rejected'"  disabled><i class="fas fa-exclamation-circle"></i> Failed to load</a-menu-item>
				<sb-command-menu v-else v-for="entry in commands.value" :key="entry.name" v-bind="entry"/>
			</a-sub-menu>
		</template>
		<a-sub-menu title="View">
			<a-menu-item @click="$emit('resetTerms')">Clear</a-menu-item>
			<a-menu-item @click="$emit('pauseTerms')">{{ !paused ? 'Pause' : 'Unpause' }}</a-menu-item>
		</a-sub-menu>
	</a-menu>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	// Not a fan of the gaps between submenus
	//@ts-ignore
	import placements from 'ant-design-vue/es/vc-menu/placements';
	placements.bottomLeft.offset = [0, 0];
	placements.rightTop.offset = [0, 0];

	import { rootDataComputeds, PromiseResult } from '../root-data';
	import { CommandJson } from '@/services';

	import SbCommandMenu from '../components/command-menu.vue';
	export default Vue.extend({
		components: { SbCommandMenu },
		props: {
			brand: {
				type: String as PropType<String | undefined>,
				default: 'Serial Bridge',
			},
			commands: Object as PropType<PromiseResult<CommandJson[]>>,
			paused: Boolean,
		},
		computed: {
			...rootDataComputeds(),
		},
		methods: {
			runCommand(name: string, label: string, icon?: string) { // This is called by command-menu directly
				this.$emit('runCommand', name, label, icon);
			},
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
