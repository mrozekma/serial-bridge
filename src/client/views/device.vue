<template>
	<div>
		<sb-navbar :brand="deviceName">
			<a-sub-menu v-if="commands && (commands.state != 'resolved' || commands.value.length > 0)" title="Commands">
				<a-menu-item v-if="commands.state == 'pending'" disabled><a-spin size="small"/> Loading...</a-menu-item>
				<a-menu-item v-else-if="commands.state == 'rejected'"  disabled><i class="fas fa-exclamation-circle"></i> Failed to load</a-menu-item>
				<sb-command-menu v-else v-for="entry in commands.value" :key="entry.name" v-bind="entry"/>
			</a-sub-menu>
			<a-sub-menu title="View">
				<a-menu-item @click="resetTerms">Clear</a-menu-item>
				<a-menu-item @click="paused = !paused">{{ !paused ? 'Pause' : 'Unpause' }}</a-menu-item>
			</a-sub-menu>
			<template v-slot:right>
				<a-tooltip v-if="!connected" placement="bottomRight" title="Disconnected from server" class="disconnected-icon">
					<i class="fal fa-wifi-slash"></i>
				</a-tooltip>
				<a-tooltip v-if="paused" placement="bottomRight" title="Output paused" class="pause-icon" @click="paused = false">
					<i class="fas fa-pause-circle"></i>
				</a-tooltip>
				<a-tooltip v-for="connection in connections" :key="connection.host" placement="bottomRight">
					<template slot="title">
						<div class="connection name">{{ connection.name }}</div>
						<div class="connection host" v-if="connection.host != connection.name">{{ connection.host }}</div>
						<div class="connection nodes">
							<a-tag v-for="node in connection.nodes" :key="node">{{ node }}</a-tag>
						</div>
					</template>
					<a-avatar v-if="connection.avatar" shape="square" :src="connection.avatar"/>
					<a-avatar v-else shape="square" icon="user"/>
				</a-tooltip>
			</template>
		</sb-navbar>
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
	import { ITheme } from 'xterm';

	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { Connection, getDeviceConnections } from '../connections';
	import { DeviceJson, CommandJson, ConnectionJson } from '@/services';

	type Node = DeviceJson['nodes'][number];

	import SbCommandMenu from '../components/command-menu.vue';
	import SbNavbar from '../components/navbar.vue';
	import SbLayout, {SbLayoutVue } from '../components/golden-layout.vue';
	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	export default Vue.extend({
		components: { SbCommandMenu, SbNavbar, SbLayout, SbTerminal },
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
			termTheme(): ITheme {
				const rtn: ITheme = {};
				if(!this.connected) {
					rtn.background = '#5c0011';
				} else if(this.paused) {
					rtn.background = '#002766';
				}
				return rtn;
			}
		},
		watch: {
			connected: {
				handler() {
					if(this.connected) {
						this.$notification.close('disconnected');
					} else {
						this.$notification.error({
							key: 'disconnected',
							duration: 0,
							placement: 'bottomRight',
							message: "Disconnected",
							description: "Disconnected from server. Serial traffic during this time will not be displayed. Automatically trying to reconnect.",
						});
					}
				},
				immediate: true,
			},
			termTheme: {
				async handler() {
					for(const node of this.nodes) {
						const term = (await this.getTerminal(node.name)).terminal;
						term.setOption('theme', this.termTheme);
					}
				},
				immediate: true,
				deep: true,
			}
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
				paused: false,
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
				.on('data', async (data: { node: string; data: Buffer }) => {
					const terminal = await this.getTerminal(data.node);
					if(!this.paused && terminal) {
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
					if(!this.paused && data.label && (data.caps === 'start' || data.caps === 'end' || data.caps === undefined)) {
						this.drawTermLine(data.label, data.caps);
					}
				})

			this.commands = unwrapPromise(this.app.service('api/commands').find());
		},
		methods: {
			async getTerminal(node: string): Promise<SbTerminalVue> {
				while(!this.$refs.layout) {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
				const layout = this.$refs.layout as SbLayoutVue;
				while(!layout.ready) {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
				return layout.getNodeTerminal(node);
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
					const term = (await this.getTerminal(node.name)).terminal;
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
			async resetTerms() {
				for(const node of this.nodes) {
					(await this.getTerminal(node.name)).terminal.reset();
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	.disconnected-icon {
		margin-right: 40px;
		color: #f5222d;
	}

	.pause-icon {
		margin-right: 40px;
		cursor: pointer;
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
