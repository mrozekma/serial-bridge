<template>
	<a-tooltip placement="bottomRight" @visibleChange="setVisible">
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
	import { relativeDate } from '../device-functions';

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
				// The user is active if their web connection is active, or they have any direct connections to nodes
				return this.nodes.length !== 1 || this.nodes[0] !== 'Web' || this.webState!.active;
			},
		},
		data() {
			return {
				lastActive: undefined as string | undefined,
			};
		},
		methods: {
			async setVisible(vis: boolean) {
				if(vis) {
					this.lastActive = !this.active ? relativeDate(this.webState!.asOf) : undefined;
				}
			},
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
