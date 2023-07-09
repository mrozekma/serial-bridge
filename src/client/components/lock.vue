<template>
	<div :class="[ 'lock', `state-${state}`, compact ? 'compact' : 'wide' ]">
		<template v-if="state == 'locking' || state == 'releasing'">
			<a-spin size="small"/> Talking to Jenkins&hellip;
		</template>
		<template v-else-if="state == 'waiting'">
			<a-spin size="small"/> Waiting for reply&hellip;
		</template>
		<template v-else-if="state == 'locked'">
			<i class="fas fa-lock-alt"></i>
			<a-tooltip v-if="compact" placement="bottomRight">
				<template v-if="relativeDate" slot="title">
					Reserved since {{ dateAsDate }} ({{ relativeDate }})
				</template>
				Reserved by {{ owner }}<template v-if="note">: {{ note }}</template>
			</a-tooltip>
			<template v-else>
				Reserved by {{ owner }} since {{ dateAsDate }} ({{ relativeDate }})<template v-if="note">: {{ note }}</template>
			</template>
		</template>
		<template v-else-if="state == 'failed'">
			<i class="fas fa-exclamation-circle"></i>Failed
		</template>
	</div>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { rootDataComputeds, makeFeathersApp } from '../root-data';
	import { relativeDate } from '../device-functions';
	import { DeviceJson } from '@/services';

	const component = Vue.extend({
		props: {
			device: Object as PropType<DeviceJson>,
			owner: String,
			date: [ Object, String ] as PropType<Date | string>,
			note: String,
			compact: Boolean,
		},
		computed: {
			...rootDataComputeds(),
			dateAsDate(): Date | undefined { // Amazing name
				return (typeof this.date === 'string') ? new Date(this.date) : this.date;
			},
		},
		data() {
			// If the device view passes in a lock owner, we were created to display that info.
			// If not, we were created in order to acquire the lock for the current user.
			return {
				state: (this.owner ? 'locked' : 'locking') as 'locking' | 'waiting' | 'locked' | 'releasing' | 'failed' | 'destroyed',
				relativeDate: undefined as string | undefined,
				dateTimer: undefined as ReturnType<typeof setTimeout> | undefined,
			};
		},
		watch: {
			owner(val) {
				if(val) {
					this.state = 'locked';
				}
			},
		},
		mounted() {
			if(!this.owner) {
				this.lock();
			}
			this.updateRelativeDate();
			this.dateTimer = setTimeout(() => this.updateRelativeDate(), 1000 * 60);
		},
		beforeDestroy() {
			this.state = 'destroyed';
			if(this.dateTimer) {
				clearTimeout(this.dateTimer);
			}
		},
		methods: {
			updateRelativeDate() {
				this.relativeDate = this.dateAsDate ? relativeDate(this.dateAsDate) : undefined;
			},
			async lock() {
				this.state = 'locking';
				await this.send('reserve');
			},
			async release() {
				// Called by parent
				this.state = 'releasing';
				await this.send('unreserve');
			},
			async send(action: 'reserve' | 'unreserve') {
				const username = localStorage.getItem('jenkins-username');
				const key = localStorage.getItem('jenkins-key');
				if(!username || !key) {
					this.error("Jenkins connection not configured. Go to the homepage to setup your Jenkins API key.");
					return;
				}
				try {
					this.state = 'waiting';
					const app = this.device.remoteInfo ? makeFeathersApp(`${this.device.remoteInfo.url}?remote`).app : this.app;
					await app.service('api/deviceLock').patch(this.device.id, {
						action,
						username,
						key,
					});
					// When the lock changes, the Jenkins server should be configured to send the new lock data to /api/lock, which will cause an update to be sent to clients, which will set the 'owner' prop here.
					// Give that a few seconds to happen before reverting to previous state.
					setTimeout(() => {
						if(this.owner) {
							this.state = 'locked';
						} else {
							this.$emit('close');
						}
					}, 3000);
				} catch(e) {
					console.error(e);
					this.error(`${e}`);
					throw e;
				}
			},
			error(msg: string) {
				this.$error({
					title: 'Jenkins Request Failed',
					content: msg,
					onOk: () => {
						if(this.owner) {
							this.state = 'locked';
						} else {
							this.$emit('close');
						}
					},
				});
				this.state = 'failed';
			},
		},
	});
	export type SbLockVue = InstanceType<typeof component>;
	export default component;
</script>

<style lang="less" scoped>
	@height: 36px;

	.lock {
		display: flex;
		gap: 8px;
		align-items: baseline;
		color: #001529; // Navbar background color
		height: @height;
		margin: 5px 0;
		padding: 0 10px;
		border-radius: 5px;

		&.compact {
			line-height: @height;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		i {
			margin-right: 0 !important;
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
