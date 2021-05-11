<template>
	<div>
		<sb-navbar :brand="deviceName" :title="`Manage ${deviceName}`">
			<a-sub-menu title="Manage">
				<a-menu-item v-if="anyClosed" @click="setNodeState(nodes, true)"><i class="fas fa-door-open"></i> Open all serial ports</a-menu-item>
				<a-menu-item v-if="anyOpen" @click="setNodeState(nodes, false)"><i class="fas fa-door-closed"></i>Close all serial ports</a-menu-item>
			</a-sub-menu>
		</sb-navbar>
		<main>
			<a-alert v-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<a-alert v-else-if="device.state == 'resolved' && !device.value.alive" type="error" message="Removed" description="Device has been removed" showIcon/>
			<template v-else>
				<div v-if="device.state == 'resolved'" class="buttons">
					<a-button :href="deviceUrl"><i class="fas fa-arrow-left"></i> Back to device</a-button>
					<a-button :disabled="!anyClosed" @click="setNodeState(nodes, true)"><i class="fas fa-door-open"></i> Open all serial ports</a-button>
					<a-button :disabled="!anyOpen" type="danger" @click="setNodeState(nodes, false)"><i class="fas fa-door-closed"></i> Close all serial ports</a-button>
				</div>
				<div class="nodes">
					<template v-if="device.state == 'pending'">
						<a-card v-for="i in 3" :key="i" :loading="true">.</a-card>
					</template>
					<template v-else>
						<a-card v-for="node in nodes" :key="node.name" :title="node.name">
							<template v-slot:extra>
								<a-switch size="small" :checked="node.state.open" @change="checked => setNodeState([ node ], checked)"/>
							</template>
							<a-alert v-if="!node.state.open" :message="node.state.reason" type="info" showIcon />
							<div class="nodeInfo">
								<div>
									<span>Name</span>
									<span>{{ node.name }}</span>
								</div>
								<div>
									<span>Path</span>
									<span>{{ node.path }}</span>
								</div>
								<div>
									<span>Baud Rate</span>
									<span>{{ node.baudRate }}</span>
								</div>
								<div>
									<span>Data Bits</span>
									<span>{{ node.byteSize }}</span>
								</div>
								<div>
									<span>Parity</span>
									<span>{{ node.parity }}</span>
								</div>
								<div>
									<span>Stop Bits</span>
									<span>{{ node.stopBits }}</span>
								</div>
								<div>
									<span>TCP Port</span>
									<span>{{ node.tcpPort }}</span>
								</div>
								<div v-if="node.webLinks.length > 0">
									<span>Protocols</span>
									<span>{{ node.webLinks.join(', ') }}</span>
								</div>
								<div v-if="node.ssh">
									<span>SSH</span>
									<span>{{ node.ssh.username }}@{{ node.ssh.host }}</span>
								</div>
							</div>
						</a-card>
					</template>
				</div>
			</template>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { DeviceJson } from '@/services';

	type Node = DeviceJson['nodes'][number];

	import SbNavbar from '../components/navbar.vue';
	export default Vue.extend({
		components: { SbNavbar },
		props: {
			id: {
				type: String,
				required: true,
			},
		},
		computed: {
			...rootDataComputeds(),
			deviceName(): string {
				return (this.device.state == 'resolved') ? this.device.value.name : this.id;
			},
			deviceUrl(): string {
				return `/devices/${this.id}`;
			},
			nodes(): Node[] {
				return (this.device.state == 'resolved') ? this.device.value.nodes : [];
			},
			anyOpen(): boolean {
				return this.nodes.some(node => node.state.open);
			},
			anyClosed(): boolean {
				return this.nodes.some(node => !node.state.open);
			},
		},
		data() {
			return {
				device: {
					state: 'pending',
				} as PromiseResult<DeviceJson>,
			};
		},
		mounted() {
			const devicesService = this.app.service('api/devices');
			this.device = unwrapPromise(devicesService.get(this.id));
			devicesService.on('updated', (data: { device: DeviceJson }) => {
				this.device = {
					state: 'resolved',
					value: data.device,
				}
			});
		},
		methods: {
			setNodeState(nodes: Node[], enabled: boolean) {
				if(this.device.state == 'resolved') {
					for(const node of nodes) {
						this.socket.emit('node-state', this.device.value.id, node.name, enabled);
					}
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	.buttons {
		margin: 10px 15px;
		.ant-btn {
			margin-right: 10px;
			i {
				margin-right: 5px;
			}
		}
	}

	.nodes {
		display: flex;
		flex-wrap: wrap;
	}

	.nodeInfo {
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
