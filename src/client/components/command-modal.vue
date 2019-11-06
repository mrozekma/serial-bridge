<template>
	<div class="table">
		<div v-for="row in rows" :key="row.key">
			<span>{{ row.key }}</span>
			<a-switch v-if="typeof row.value === 'boolean'" :checked="row.value"/>
			<span v-else>{{ row.value }}</span>
		</div>
	</div>
</template>

<script lang="ts">
	//TODO Generalize. This is currently pretty hardcoded for the one use case I have for it.
	import Vue, { PropType } from 'vue';

	interface Row {
		key: string;
		value: string;
	}

	export default Vue.extend({
		props: {
			rows: Array as PropType<Row[]>,
		},
	});
</script>

<style lang="less" scoped>
	.table {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;

		> div {
			display: contents;
			> span {
				padding: 5px 10px;
				&:first-child {
					font-weight: bold;
					text-align: right;
				}
			}
		}

		.ant-switch {
			width: 16px;
			margin-left: 10px;
			margin-bottom: 2px;
		}
	}
</style>
