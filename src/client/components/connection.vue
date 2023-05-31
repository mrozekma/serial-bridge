<template>
	<a-tooltip placement="bottomRight" @visibleChange="v => tooltipVisible = v">
		<template slot="title">
			<div class="name">{{ name }}</div>
			<div class="host" v-if="host != name">{{ host }}</div>
			<div class="last-active" v-if="!active">Last active {{ lastActive }}</div>
			<div class="nodes">
				<a-tag v-for="node in nodes" :key="node">{{ node }}</a-tag>
			</div>
		</template>
		<a-avatar shape="square" :size="avatarSize" icon="user" :src="avatar" :class="{ inactive: !active }" />
	</a-tooltip>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';
	import { Connection } from '../connections';

	export default Vue.extend({
		// These fields match up with the Connection interface
		props: {
			host: {
				type: String,
				required: true,
			},
			name: {
				type: String,
				required: true,
			},
			nodes: {
				type: Array,
				default: [],
			},
			avatar: {
				type: String,
			},
			webState: {
				type: Object as PropType<Connection['webState']>,
			},

			avatarSize: {
				type: Number,
				default: 32,
			}
		},
		computed: {
			active(): boolean {
				// Check if a web connection is inactive and no other connection exists
				return this.nodes.length !== 1 || this.nodes[0] !== 'Web' || this.webState!.active;
			},
			lastActive(): string | undefined {
				if(!this.tooltipVisible || this.active) {
					return undefined;
				}
				const seconds = (new Date().getTime() - this.webState!.asOf.getTime()) / 1000;
				if(seconds < 60) {
					return "just now";
				}
				const minutes = seconds / 60;
				if(minutes < 60) {
					return `${Math.floor(minutes)}m ago`;
				}
				const hours = minutes / 60;
				if(hours < 24) {
					return `${Math.floor(hours)}h ago`;
				}
				const days = hours / 24;
				return `${Math.floor(days)}d ago`;
			},
		},
		data() {
			return {
				tooltipVisible: false,
			};
		},
	});
</script>

<style lang="less" scoped>
	.ant-avatar {
		margin-right: 8px;

		&.inactive {
			filter: grayscale(1);
			opacity: .5;
		}
	}

	.name {
		font-weight: bold;
	}

	.host {
		margin-top: -4px;
		font-size: smaller;
	}

	.ant-tag:not(:first-child) {
		margin-left: 5px;
	}
</style>
