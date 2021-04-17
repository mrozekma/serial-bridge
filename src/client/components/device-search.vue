<template>
	<a-modal centered destroy-on-close :visible="visible" :closable="false" :footer="null">
		<a-auto-complete v-if="visible" ref="input" v-model="search" :data-source="searchOptions" filter-option @select="select">
			<a-input auto-focus @blur="blur" @keydown.esc="blur"/>
		</a-auto-complete>
	</a-modal>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { rootDataComputeds } from '../root-data';
	export default Vue.extend({
		props: {
			visible: {
				type: Boolean,
				required: true,
			},
		},
		computed: {
			...rootDataComputeds(),
			searchOptions(): string[] {
				return (this.devices.state === 'resolved') ? this.devices.value.map(device => device.name) : [];
			},
		},
		data() {
			return {
				search: '',
			};
		},
		methods: {
			select(deviceName: string) {
				if(this.devices.state === 'resolved') {
					const device = this.devices.value.find(device => device.name === deviceName);
					if(device) {
						this.$emit('select', device);
						this.blur();
					}
				}
			},
			blur() {
				this.search = '';
				this.$emit('close');
			},
		},
	});
</script>

<style lang="less" scoped>
	.ant-modal-body > * {
		width: 100%;
	}
</style>
