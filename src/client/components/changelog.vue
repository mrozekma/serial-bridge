<template>
	<div class="changelog">
		<div v-for="{ key, seen } in entries" :class="seen ? 'seen' : 'new'">
			<template v-if="key === 'homeTable'">
				<h1>Device list</h1>
				The device list is now a table. The columns can be sorted by clicking them, and filtered by clicking the <a-icon type="filter" theme="filled" /> icon.<br>
				The current sort/filter settings can be saved and quickly reapplied later.
			</template>
			<template v-else-if="key === 'commandPalette'">
				<h1>Command palette</h1>
				A VSCode-inspired command palette is available by pressing <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>. This replaces the old device search menu.
			</template>
			<a-alert v-else type="error" message="Bad entry" show-icon>
				<template #description>
					Configuration file specifies unknown changelog entry <b>{{ key }}</b>
				</template>
			</a-alert>
		</div>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	export default Vue.extend({
		props: {
			entries: Array,
		},
	});
</script>

<style lang="less" scoped>
	.changelog {
		margin-left: 10px;

		h1 {
			margin-bottom: 5px;
		}

		> div {
			padding-left: 10px;
			border-left: 5px solid;
			&.new {
				border-left-color: #fadb14;
			}
			&.seen {
				border-left-color: #595959;
				opacity: .5;
			}
			&:not(:first-child) {
				margin-top: 10px;
			}
		}

		.ant-alert {
			margin-top: 10px;
		}

		kbd {
				display: inline-block;
				margin: 0 .1em;
				padding: .1em .6em;
				font-size: 11px;
				color: #242729;
				text-shadow: 0 1px 0 #fff;
				background-color: #e1e3e5;
				border: 1px solid #adb3b9;
				border-radius: 3px;
				white-space: nowrap;
		}
	}
</style>
