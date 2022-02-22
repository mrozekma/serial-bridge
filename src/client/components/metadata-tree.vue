<template>
	<a-tree :tree-data="treeData" default-expand-all :selectable="false">
		<template #tag-title="{ title: [ title, value ] }">
			<a-tag>{{ title }}</a-tag>&nbsp;
			<a-checkbox v-if="typeof value === 'boolean'" :checked="value" />
			<template v-else>{{ value }}</template>
		</template>
		<template #flag-title="{ title: flag }">
			<a-checkbox :checked="flag" />
		</template>
	</a-tree>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	export interface AntTree {
		title: string | boolean | [ string, string | boolean ];
		key?: string;
		children?: AntTree[];
		slots?: {
			title?: string;
			icon?: string;
		};
		scopedSlots?: {
			title?: string;
			icon?: string;
		};
	}

	function makeTreeData(obj: any): AntTree[] {
		if(Array.isArray(obj)) {
			return obj.map((v, idx) => {
				if(typeof v === 'object') {
					return {
						title: ' ',
						children: makeTreeData(v),
					};
				} else if(typeof v === 'boolean') {
					return {
						title: v,
						scopedSlots: {
							title: 'flag-title',
						},
					};
				} else {
					return {
						title: `${v}`,
					};
				}
			});
		} else if(typeof obj === 'object') {
			return Object.entries(obj).map(([k, v]) => {
				if(typeof v === 'object') {
					return {
						title: k,
						children: makeTreeData(v),
					};
				} else {
					return {
						title: [ k, (typeof v === 'boolean') ? v : `${v}` ],
						scopedSlots: {
							title: 'tag-title',
						},
					};
				}
			});
		} else if(typeof obj === 'boolean') {
			return [{
				title: obj,
				scopedSlots: {
					title: 'flag-title',
				},
			}];
		} else {
			return [{
				title: `${obj}`,
				slots: {
					icon: 'icon',
				},
			}];
		}
	}

	export default Vue.extend({
		props: {
			metadata: {
				type: Object as PropType<object>,
				required: true,
			},
		},
		computed: {
			treeData(): AntTree[] {
				return makeTreeData(this.metadata);
			},
		},
	});
</script>
