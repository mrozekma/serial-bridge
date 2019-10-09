<template>
	<div>
		<sb-navbar :brand="deviceName"></sb-navbar>
		<main>
			<template v-if="device.state == 'pending'">
				<!-- TODO -->
			</template>
			<a-alert v-else-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<golden-layout v-else class="gl-root" v-model="layout">
				<gl-row>
					<!-- TODO These columns persist even if all components are dragged out of them -->
					<gl-col v-for="col in nodesByColumn" :key="col[0].name">
						<gl-component v-for="node in col" :key="node.name" :title="node.name">
							<div>Content</div>
						</gl-component>
					</gl-col>
				</gl-row>
				<!-- <sb-terminal v-for="i in 6"></sb-terminal> -->
			</golden-layout>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { DeviceJson } from '@/services';

	import 'jquery'; // Needed by golden layout
	import vgl from 'vue-golden-layout';
	Vue.use(vgl);
	import 'golden-layout/src/css/goldenlayout-dark-theme.css';

	type Node = DeviceJson['nodes'][number];
	interface GlLayout {
		left: Node | undefined;
		top: Node[];
		bottom: Node[];
	}

	import SbNavbar from '../components/navbar.vue';
	import SbTerminal from '../components/terminal.vue';
	export default Vue.extend({
		components: { SbNavbar, SbTerminal },
		computed: {
			...rootDataComputeds(),
			deviceName(): string {
				return (this.device.state == 'resolved') ? this.device.value.name : this.$route.params.device;
			},
			nodes(): Node[] {
				return (this.device.state == 'resolved') ? this.device.value.nodes : [];
			},
			nodesByColumn(): Node[][] {
				const nodes = this.nodes;
				return Array.from((function*() {
					let i = 0;
					if(nodes.length % 2) {
						// If odd, put the first node in a column alone
						yield [ nodes[i++] ];
					}
					const rowLen = Math.floor(nodes.length / 2);
					for(; i * 2 < nodes.length; i++) {
						yield [ nodes[i], nodes[i + rowLen] ];
					}
				})());
			},
		},
		data() {
			return {
				device: {
					state: 'pending', // Technically a lie, nothing is loading yet, but watch.$route will take care of it
				} as PromiseResult<DeviceJson>,
				layout: null, //TODO Persist this
			};
		},
		mounted() {
				this.device = unwrapPromise(this.app.service('api/devices').get(this.$route.params.device));
		},
	});
</script>

<style lang="less" scoped>
	.gl-root {
		//TODO:
		width: calc(100vw - 30px);
		height: calc(100vh - 60px);

		/deep/ .lm_tab {
			box-shadow: none;
		}
	}
</style>
