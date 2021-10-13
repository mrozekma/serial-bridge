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
			<template v-else-if="key === 'nodeLinkClients'">
				<h1>Node link client</h1>
				The <i class="far fa-external-link-alt"></i>&nbsp;&nbsp;<i class="far fa-terminal"></i> buttons in the titlebar of each node that open Telnet and SSH connections now support MobaXterm. See the "Setup" tab on the homepage to tell Serial Bridge to make MobaXterm links, or to specify that you want to keep using the previous PuTTY links. The new default is to not show those links until a client has been specified.
			</template>
			<template v-else-if="key === 'contextMenu'">
				<h1>Context menu</h1>
				A context menu is now available when you right-click a node. This menu includes connection links, copy/paste options, and import/export options.
			</template>
			<template v-else-if="key === 'screenshot'">
				<h1>Screenshots</h1>
				There is an option in each device's <b>Manage</b> menu to take a screenshot of all nodes and save it to disk. A similar option appears in each node's context menu to screenshot that particular node.
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
