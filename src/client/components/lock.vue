<template>
	<div :class="['lock', `state-${state}`]">
		<template v-if="state == 'locking'">
			<a-spin size="small"/> Talking to Jenkins&hellip;
			<iframe :src="jenkinsReserveUrl" @load="iframeLoaded"/>
		</template>
		<template v-else-if="state == 'releasing'">
			<a-spin size="small"/> Talking to Jenkins&hellip;
			<iframe :src="jenkinsUnreserveUrl" @load="iframeLoaded"/>
		</template>
		<template v-else-if="state == 'waiting'">
			<a-spin size="small"/> Waiting for reply&hellip;
		</template>
		<template v-else-if="state == 'locked'">
			<i class="fas fa-lock-alt"></i>Reserved by {{ owner }}
		</template>
		<template v-else-if="state == 'failed'">
			<i class="fas fa-exclamation-circle"></i>Failed
		</template>
	</div>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { BuildJson } from '@/services';

	const component = Vue.extend({
		props: {
			owner: String,
			jenkinsUrl: String,
			lockName: String,
		},
		computed: {
			jenkinsReserveUrl(): string | undefined {
				return this.jenkinsUrl && this.lockName ? `${this.jenkinsUrl}/lockable-resources/reserve?resource=${this.lockName}` : undefined;
			},
			jenkinsUnreserveUrl(): string | undefined {
				return this.jenkinsUrl && this.lockName ? `${this.jenkinsUrl}/lockable-resources/unreserve?resource=${this.lockName}` : undefined;
			},
		},
		data() {
			// If the device view passes in a lock owner, we were created to display that info.
			// If not, we were created in order to acquire the lock for the current user.
			return {
				state: (this.owner ? 'locked' : 'locking') as 'locking' | 'waiting' | 'locked' | 'releasing' | 'failed' | 'destroyed',
			};
		},
		watch: {
			owner(val) {
				if(val) {
					this.state = 'locked';
				}
			},
		},
		beforeDestroy() {
			this.state = 'destroyed';
		},
		methods: {
			iframeLoaded() {
				// When the lock changes, the Jenkins server should be configured to send the new lock data to /api/lock, which will cause an update to be sent to clients, which will set the 'owner' prop here.
				// If that doesn't happen in a few seconds, assume the lock wasn't changed.
				const locking = (this.state == 'locking');
				this.state = 'waiting';
				setTimeout(() => {
					if(this.state == 'waiting') {
						this.state = 'failed';
						this.$error({
							title: `${locking ? 'Lock' : 'Unlock'} Failed`,
							content: this.$createElement('div', {}, [
								this.$createElement('div', `Failed to ${locking ? 'acquire' : 'release'} lock.`),
								this.$createElement('div', "Are you logged in to Jenkins?"),
							]),
							onOk: () => {
								if(this.owner) {
									this.state = 'locked';
								} else {
									this.$emit('close');
								}
							}
						});
					} else {
						// Tell the parent not to force this component open anymore.
						// It will still stay open if there's a lock to display
						this.$emit('close');
					}
				}, 3000);
			},
			release() {
				// Called by parent
				this.state = 'releasing';
			}
		},
	});
	export type SbLockVue = InstanceType<typeof component>;
	export default component;
</script>

<style lang="less" scoped>
	.lock {
		color: #001529; // Navbar background color
		height: 36px;
		line-height: 36px;
		margin: 5px 0;
		padding: 0 10px;
		border-radius: 5px;
		overflow: hidden;
		text-overflow: ellipsis;

		> i {
			margin-right: 8px;
		}

		background-color: #fff;
		&.state-failed {
			background-color: #ff4d4f;
		}
	}

	iframe {
		display: none;
	}
</style>
