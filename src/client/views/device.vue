<template>
	<div>
		<sb-navbar :brand="deviceName" :commands="commands" @runCommand="runCommand" @resetTerms="resetTerms"/>
		<div class="menu-right">
			<a-tooltip v-for="connection in connections" :key="connection.host" placement="bottomRight">
				<template slot="title">
					<div class="connection name">{{ connection.name }}</div>
					<div class="connection host" v-if="connection.host != connection.name">{{ connection.host }}</div>
					<div class="connection nodes">
						<a-tag v-for="node in connection.nodes" :key="node">{{ node }}</a-tag>
					</div>
				</template>
				<a-avatar v-if="connection.gravatar" shape="square" :src="connection.gravatar"/>
				<a-avatar v-else shape="square" icon="user"/>
			</a-tooltip>
		</div>
		<main>
			<template v-if="device.state == 'pending'">
				<!-- TODO -->
			</template>
			<a-alert v-else-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<sb-layout ref="layout" v-if="nodes.length > 0" :nodes="nodes"/>
			<div class="notifications">
				<transition enter-active-class="animated slideInUp faster" leave-active-class="animated slideOutDown faster">
					<div v-if="runningCommand" class="command-state">
						<i v-if="runningCommand.icon" :class="runningCommand.icon"/>
						<span class="label">{{ runningCommand.label }}</span>
						<i v-if="runningCommand.state == 'done'" class="fas fa-check-circle" style="color: #52c41a"></i>
						<i v-else-if="runningCommand.state == 'failed'" class="fas fa-times-circle" style="color: #f5222d"></i>
						<a-spin v-else size="small"/>
					</div>
				</transition>
			</div>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { Connection, getDeviceConnections } from '../connections';
	import { DeviceJson, CommandJson, ConnectionJson } from '@/services';

	type Node = DeviceJson['nodes'][number];

	import SbNavbar from '../components/navbar.vue';
	import SbLayout, {SbLayoutVue } from '../components/golden-layout.vue';
	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	export default Vue.extend({
		components: { SbNavbar, SbLayout, SbTerminal },
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
			nodes(): Node[] {
				return (this.device.state == 'resolved') ? this.device.value.nodes : [];
			},
			connections(): Connection[] {
				return (this.device.state == 'resolved') ? [...getDeviceConnections(this.device.value)] : [];
			},
		},
		data() {
			return {
				device: {
					state: 'pending', // Technically a lie, nothing is loading yet, but mounted() will take care of it
				} as PromiseResult<DeviceJson>,
				commands: {
					state: 'pending',
				} as PromiseResult<CommandJson[]>,
				runningCommand: undefined as {
					name: string;
					label: string;
					icon?: string;
					state: 'pending' | 'running' | 'done' | 'failed';
					errorMessage?: string;
				} | undefined,
			};
		},
		mounted() {
			const devicesService = this.app.service('api/devices');
			this.device = unwrapPromise(devicesService.get(this.id));
			//TODO Automate this typing
			devicesService
				.on('updated', (data: { device: DeviceJson }) => {
					this.device = {
						state: 'resolved',
						value: data.device,
					}
				})
				.on('data', (data: { node: string; data: Buffer }) => {
					const terminal = this.getTerminal(data.node);
					if(terminal) {
						terminal.terminal.write(new Uint8Array(data.data));
					}
				})
				.on('command', (data: any) => {
					if(this.runningCommand && data.command === this.runningCommand.name) {
						this.runningCommand.state = data.state;
						this.runningCommand.errorMessage = data.error;
					}
				})
				.on('term-line', (data: { label: string; caps: 'start' | 'end' | undefined }) => {
					if(data.label && (data.caps === 'start' || data.caps === 'end' || data.caps === undefined)) {
						this.drawTermLine(data.label, data.caps);
					}
				})

			this.commands = unwrapPromise(this.app.service('api/commands').find());
		},
		methods: {
			getTerminal(node: string): SbTerminalVue | undefined {
				const layout = this.$refs.layout as SbLayoutVue | undefined;
				return (layout && layout.ready) ? layout.getNodeTerminal(node) : undefined;
			},
			async runCommand(name: string, label: string, icon?: string) {
				while(this.runningCommand) {
					// Sleep 1s
					await new Promise(resolve => setTimeout(resolve, 1000));
				}

				this.runningCommand = {
					name, label, icon,
					state: 'pending',
					errorMessage: undefined,
				};
				try {
					await this.app.service('api/commands').patch(name, {});
					setTimeout(() => this.runningCommand = undefined, 2000);
				} catch(e) {
					console.error(e);
					this.$error({
						title: "Command failed",
						content: `Failed to execute '${label}': ${e.message}`,
						onOk: () => {
							this.runningCommand = undefined;
						},
					});
				}
			},
			async drawTermLine(label: string, caps: 'start' | 'end' | undefined) {
				// https://www.tldp.org/HOWTO/Bash-Prompt-HOWTO/x622.html
				const leftCap = {start: 'l', end: 'm', none: 'q'}[caps || 'none'];
				const rightCap = {start: 'k', end: 'j', none: 'q'}[caps || 'none'];
				const line = 'q';
				for(const node of this.nodes) {
					const term = this.getTerminal(node.name)!.terminal;
					let thisLabel = label;
					let sideLen = (term.cols - thisLabel.length - 2) / 2;
					if(sideLen < 1) {
						// Reserve 2 characters for the end caps, 2 for the space around the label, and 3 for the ellipsis. The rest of the line is available for the label
						thisLabel = label.substr(0, term.cols - 2 - 2 - 3) + '...';
						sideLen = 1;
					}
					term.write("\r\n\r\n\x1b[1;36m\x1b(0" + leftCap + line.repeat(Math.floor(sideLen) - 1) + "\x1b(B " + thisLabel + " \x1b(0" + line.repeat(Math.ceil(sideLen) - 1) + rightCap + "\x1b(B\x1b[0m\r\n\r\n");
				}
			},
			resetTerms() {
				for(const node of this.nodes) {
					this.getTerminal(node.name)!.terminal.reset();
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	.menu-right {
		position: absolute;
		top: 6px;
		right: 16px;
		color: rgba(255, 255, 255, 0.65);
		font-size: 14pt;

		> * {
			margin-right: 8px;
			&:hover {
				color: #fff;
			}
		}
	}

	.notifications {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 10px;
		display: flex;
		overflow-y: hidden;

		> * {
			margin-left: auto;
			margin-right: auto;
		}

		.command-state {
			background-color: #fff;
			border: 1px solid rgba(0, 0, 0, 0.65);
			// width: 200px;
			// height: 50px;
			padding: 5px 10px;
			border-radius: 5px;

			display: grid;
			grid-template-areas: "icon label state";
			grid-template-columns: auto 1fr auto;
			align-items: center;
			gap: 4px;

			.label {
				font-weight: bold;
				padding-right: 10px;
			}
		}
	}
</style>

<style lang="less">
	.ant-tooltip {
		.connection.name {
			font-weight: bold;
		}

		.connection.host {
			margin-top: -4px;
			font-size: smaller;
		}

		.ant-tag:not(:first-child) {
			margin-left: 5px;
		}
	}
</style>
