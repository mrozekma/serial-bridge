<template functional>
	<a-sub-menu v-if="props.submenu">
		<template v-slot:title>
			<i v-if="props.icon" :class="props.icon"></i>
			{{ props.label }}
		</template>
		<sb-command-menu v-for="entry in props.submenu" :key="entry.name" v-bind="entry"/>
	</a-sub-menu>
	<a-menu-item v-else @click="parent.runCommand(props.name, props.label, props.icon)">
		<i v-if="props.icon" :class="props.icon"></i>
		{{ props.label }}
	</a-menu-item>
</template>

<script>
	export default {
		props: {
			name: String,
			label: String,
			icon: String,
			submenu: Array,
		},
	};
</script>
