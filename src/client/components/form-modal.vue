<template>
	<a-modal
		:visible="value"
		:title="title"
		:okButtonProps="{ props: { loading: processing, type: okIsDelete ? 'danger' : 'primary' } }"
		:okText="okIsDelete ? 'Delete' : 'OK'"
		:cancelButtonProps="{ props: { disabled: processing } }"
		@ok="submit"
		@cancel="close"
		>
		<a-form ref="form" :class="{ bump: (title === undefined) }">
			<slot/>
			<!-- Support the user hitting Enter to submit.
			     There's probably a better way to do this, but I'm failing to find it -->
			<input type="submit" v-show="false" @click="submit">
		</a-form>
		<a-alert v-if="error" :message="`${error}`" type="error" show-icon closable :afterClose="() => error = undefined" />
	</a-modal>
</template>

<script lang="ts">
	import Vue from 'vue';
	export default Vue.extend({
		props: {
			value: {
				type: Boolean,
				required: true,
			},
			title: {
				type: String,
			},
			ok: {
				type: Function,
				required: true,
			},
			okIsDelete: {
				type: Boolean,
				default: false,
			},
		},
		computed: {
			htmlForm(): HTMLFormElement | undefined {
				const form = this.$refs.form as Vue | undefined;
				return form?.$el as HTMLFormElement | undefined;
			},
		},
		data() {
			return {
				processing: false,
				error: undefined as any,
			};
		},
		watch: {
			async value() {
				if(this.value) {
					await this.$nextTick();
					this.focus();
				}
			},
		},
		methods: {
			focus() {
				const inputs = this.htmlForm?.getElementsByTagName('input');
				if(inputs) {
					inputs[0].focus();
				}
			},
			async submit() {
				this.processing = true;
				try {
					await this.ok();
					this.close();
				} catch(e) {
					console.error(e);
					this.error = e;
				} finally {
					this.processing = false;
				}
			},
			close() {
				this.htmlForm!.reset();
				this.error = undefined;
				this.$emit('input', false);
			},
		},
	});
</script>

<style lang="less" scoped>
	.ant-modal-body .ant-form {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 5px;
		padding: 5px;

		/deep/ .ant-form-item {
			display: contents;

			// Someday I'll probably come to regret this, but not using these currently and they make large empty grid rows in Firefox
			&::before, &::after {
				display: none;
			}

			.ant-form-item-label {
				grid-column: 1;
				font-weight: bold;
				text-align: right;
			}

			.ant-form-item-control-wrapper {
				grid-column: 2;
			}
		}
	}

	.ant-modal-body .ant-form.bump {
		position: relative;
		top: 10px;
	}
</style>
