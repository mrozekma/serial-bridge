<!--
	This is not used as a standard component at all. Golden Layout instantiates it and then pulls the <li>s out and inserts them into the DOM elsewhere.
	This means that Vue can't be relied on to rerender things reactively -- changes have to be made by editing the existing <li>s directly.
-->
<template>
	<div v-once>
		<div v-for="link in links" :key="link.name" :ref="link.name" :title="link.description" class="link" @click="e => link.url ? click(e) : {}">
			<a-popconfirm v-if="!link.url" placement="bottomRight" arrow-point-at-center ok-text="Reload" @confirm="reload">
				<template #title>
					 No {{ link.description }} handler specified. Choose one from the <a target="_blank" href="/#setup">Setup tab</a> and reload this page.
				</template>
				<i :class="link.icon"/>
			</a-popconfirm>
			<i v-else :class="link.icon"/>
		</div>
		<div class="spacer"/>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { Node, NodeLink, nodeLinks } from '../device-functions';

	const component = Vue.extend({
		data() {
			return {
				links: nodeLinks,
				deviceName: undefined as string | undefined,
				node: undefined as Node | undefined,
			};
		},
		methods: {
			*iterListItems(): IterableIterator<{ link: NodeLink; li: HTMLLIElement }> {
				for(const link of this.links) {
					// Vue makes each ref an array because they're in a v-for, even though the ref names are unique so each array is only one element
					const li = (this.$refs[link.name] as HTMLLIElement[])[0];
					yield { link, li };
				}
			},
			setNode(deviceName: string, node: Node | undefined) {
				this.deviceName = deviceName;
				this.node = node;
				// Toggle link visibility based on the node's config
				for(const { link, li } of this.iterListItems()) {
					li.style.display = (node && node.webLinks.indexOf(link.name) >= 0) ? '' : 'none';
				}
			},
			click(e: MouseEvent) {
				if(this.node === undefined) {
					// Should never happen
					console.error("Got tab-links click without a node", e);
					return;
				}
				const icon = e.target as HTMLElement;
				const clicked = icon.parentElement as HTMLElement;
				for(const { link, li } of this.iterListItems()) {
					if(li === clicked) {
						window.location.href = link.url!(this.deviceName!, this.node);
						break;
					}
				}
			},
			reload() {
				window.location.reload();
			},
		},
	});
	export type SbTabLinksVue = InstanceType<typeof component>;
	export default component;
</script>

<style lang="less" scoped>
	.link {
		&:not(:hover) {
			opacity: .6; // Golden Layout sets the opacity to .4, but these icons end up looking dim compared to the stock ones, so brighten them a little
		}

		i {
			position: relative;
			top: -2px;
			font-size: 8pt;
			color: #000;
		}
	}

	.spacer {
		width: 10px;
	}
</style>
