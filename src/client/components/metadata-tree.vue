<template>
	<a-tree :tree-data="treeData" default-expand-all :selectable="false" @click="click">
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
		copyText?: string;
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
						copyText: v ? 'true' : 'false',
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
						copyText: k,
						children: makeTreeData(v),
					};
				} else {
					return {
						title: [ k, (typeof v === 'boolean') ? v : `${v}` ],
						copyText: (typeof v === 'boolean') ? (v ? 'true' : 'false') : `${v}!`,
						scopedSlots: {
							title: 'tag-title',
						},
						foo: 'bar',
					};
				}
			});
		} else if(typeof obj === 'boolean') {
			return [{
				title: obj,
				copyText: obj ? 'true' : 'false',
				scopedSlots: {
					title: 'flag-title',
				},
			}];
		} else {
			return [{
				title: `${obj}`,
				copyText: `${obj}`,
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
		methods: {
			async click(e: PointerEvent, comp: Vue) {
				const text: string | undefined = (comp as any).dataRef.copyText;
				if(text && navigator.clipboard) {
					try {
						await navigator.clipboard.writeText(text);
						this.$notification.success({
							message: 'Copy metadata',
							description: 'Copied metadata value to clipboard',
							placement: 'bottomRight',
							duration: 3,
						});
					} catch(e) {
						this.$notification.error({
							message: 'Copy metadata',
							description: `Unable to copy metadata value to clipboard: ${e}`,
							placement: 'bottomRight',
							duration: 10,
						});
					}
				}
			},
		},
	});
</script>
