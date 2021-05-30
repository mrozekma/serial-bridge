<!--
	This is not used as a standard component at all. Golden Layout instantiates it and then pulls the <li>s out and inserts them into the DOM elsewhere.
	This means that Vue can't be relied on to rerender things reactively -- changes have to be made by editing the existing <li>s directly.
-->
<template>
	<div v-once>
		<li title="Write file">
			<a-upload :custom-request="upload">
				<i ref="upload_icon" :class="uploadIcons.idle" />
			</a-upload>
		</li>
		<li v-for="link in links" :key="link.name" :ref="link.name" :title="link.description" @click="click">
			<i :class="link.icon"/>
		</li>
		<li class="spacer"/>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { DeviceJson } from '@/services';
	type Node = DeviceJson['nodes'][number];

	import { NodeLink, nodeLinks } from '../root-data';

	const uploadIcons = {
		idle: 'far fa-file-upload',
		uploading: 'fad fa-circle-notch',
	}

	const component = Vue.extend({
		computed: {
			uploadIcon(): HTMLElement {
				return this.$refs.upload_icon as HTMLElement;
			},
		},
		data() {
			return {
				links: nodeLinks,
				uploadIcons,
				uploading: false,
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
			setNode(node: Node | undefined) {
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
						window.location.href = link.url(this.node);
						break;
					}
				}
			},
			async upload(obj: any) {
				// There's no typing for obj; it's inlined in ant-design-vue/lib/vc-upload/src/AjaxUploader.js
				const file: File = obj.file;
				const node = this.node;
				if(node === undefined) {
					// Should never happen
					console.error("Got tab-links click without a node");
					return;
				}
				while(this.uploading) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
				this.uploading = true;
				this.uploadIcon.className = uploadIcons.uploading;
				const done = (success: boolean, description: string) => {
					this.uploading = false;
					this.uploadIcon.className = uploadIcons.idle;
					this.$notification[success ? 'success' : 'error']({
						message: 'File write',
						description,
						placement: 'bottomRight',
						duration: 3,
					});
				};
				const reader = new FileReader();
				reader.addEventListener('load', e => {
					this.$emit('stdin', node, reader.result);
					done(true, `Write to ${node.name} complete`);
				});
				reader.addEventListener('abort', e => {
					console.error(e);
					done(false, "Write aborted");
				});
				reader.addEventListener('error', e => {
					console.error(e);
					done(false, "Write failed");
				});
				reader.readAsText(file);
			},
		},
	});
	export type SbTabLinksVue = InstanceType<typeof component>;
	export default component;
</script>

<style lang="less" scoped>
	li i {
		position: relative;
		top: -2px;
		font-size: 8pt;
		color: #000;
	}

	li.spacer {
		width: 10px;
	}
</style>
