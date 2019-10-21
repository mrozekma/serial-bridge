<template>
	<div class="table">
		<div v-for="row in rows" :key="row.key">
			<span>{{ row.key }}</span>
			<span>{{ row.value }}</span>
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
	}
</style>
