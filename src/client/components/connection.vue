<template>
	<a-tooltip placement="bottomRight">
		<template slot="title">
			<div class="name">{{ name }}</div>
			<div class="host" v-if="host != name">{{ host }}</div>
			<div class="nodes">
				<a-tag v-for="node in nodes" :key="node">{{ node }}</a-tag>
			</div>
		</template>
		<a-avatar shape="square" :size="avatarSize" icon="user" :src="avatar" />
	</a-tooltip>
</template>

<script lang="ts">
	import Vue from 'vue';
	export default Vue.extend({
		// These fields match up with the Connection interface from src/client/connection.ts
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
			avatarSize: {
				type: Number,
				default: 32,
			}
		},
	});
</script>

<style lang="less" scoped>
	.ant-avatar {
		margin-right: 8px;
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
