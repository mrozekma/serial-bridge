<template>
	<div>
		<sb-navbar>
			<template #brand>
				<span :title="(device.state == 'resolved') ? device.value.description : undefined">
					{{ deviceName }}
				</span>
				<template v-for="{ name, description, color, showOnDevicePage } in (device.state == 'resolved' ? device.value.tags : [])">
					<a-tag v-if="showOnDevicePage !== false" :key="name" :title="description" :color="color">{{ name }}</a-tag>
				</template>
			</template>
			<a-sub-menu v-if="commands && (commands.state != 'resolved' || commands.value.length > 0)" title="Commands">
				<a-menu-item v-if="commands.state == 'pending'" disabled><a-spin size="small"/> Loading...</a-menu-item>
				<a-menu-item v-else-if="commands.state == 'rejected'"  disabled><i class="fas fa-exclamation-circle"></i> Failed to load</a-menu-item>
				<sb-command-menu v-else v-for="entry in commands.value" :key="entry.name" v-bind="entry"/>
			</a-sub-menu>
			<a-sub-menu title="View">
				<a-menu-item @click="resetTerms">Clear</a-menu-item>
				<a-menu-item @click="paused = !paused">{{ !paused ? 'Pause' : 'Unpause' }}</a-menu-item>
			</a-sub-menu>
			<a-sub-menu title="Manage">
				<a-menu-item><a :href="`/devices/${id}/manage`">Ports</a></a-menu-item>
				<a-menu-item @click="copyState">Share</a-menu-item>
				<template v-if="device.state == 'resolved' && device.value.jenkinsLockName">
					<a-menu-item v-if="!device.value.jenkinsLockOwner" @click="acquireLock">Reserve in Jenkins</a-menu-item>
					<a-menu-item v-else @click="releaseLock">Unreserve in Jenkins</a-menu-item>
				</template>
			</a-sub-menu>
			<a-menu-item class="faux">
				<sb-lock v-if="showLock" ref="lock" :device-id="id" :owner="(device.state == 'resolved') ? device.value.jenkinsLockOwner : undefined" @close="locking = false"/>
			</a-menu-item>
			<a-menu-item class="faux" @click="finishedBuild = undefined">
				<sb-jenkins v-if="device.state == 'resolved' && (device.value.build || finishedBuild)" :build="device.value.build || finishedBuild"/>
			</a-menu-item>
			<template v-slot:right>
				<a-tooltip v-if="!connected" placement="bottomRight" title="Disconnected from server" class="disconnected-icon">
					<i class="fal fa-wifi-slash"></i>
				</a-tooltip>
				<a-tooltip v-if="paused" placement="bottomRight" title="Output paused" class="pause-icon" @click="paused = false">
					<i class="fal fa-pause-circle"></i>
				</a-tooltip>
				<a-tooltip v-if="focusedNode" placement="bottomRight" :title="`Sending keystrokes to ${focusedNode}`">
					<i class="fal fa-edit"></i>
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
			<template v-if="device.state == 'pending'"/>
			<a-alert v-else-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<a-alert v-else-if="!device.value.alive" type="error" message="Removed" description="Device has been removed" showIcon/>
			<sb-layout v-else-if="nodes.length > 0" ref="layout" :nodes="nodes" @stdin="termStdin" @focus="node => focusedNode = node" @blur="focusedNode = undefined"/>
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
	import { MetaInfo } from 'vue-meta';
	import { ITheme } from 'xterm';

	import { appName, rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { Connection, getDeviceConnections } from '../connections';
	import { DeviceJson, CommandJson, BuildJson, SavedTerminalJson } from '@/services';

	type Node = DeviceJson['nodes'][number];

	import SbNavbar from '../components/navbar.vue';
	import SbCommandMenu from '../components/command-menu.vue';
	import SbJenkins, { FinishedBuild } from '../components/jenkins.vue';
	import SbLock, { SbLockVue } from '../components/lock.vue';
	import SbLayout, {SbLayoutVue } from '../components/golden-layout.vue';
	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	import SbCommandModal from '../components/command-modal.vue';
	export default Vue.extend({
		components: { SbNavbar, SbCommandMenu, SbJenkins, SbLock, SbLayout, SbTerminal },
		props: {
			id: {
				type: String,
				required: true,
			},
		},
		metaInfo(): MetaInfo {
			return {
				title: `${this.deviceName} - ${appName}`,
			};
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
			termThemes() {
				const rtn: { [NodeName: string]: ITheme } = {};
				if(!this.connected) {
					for(const node of this.nodes) {
						rtn[node.name] = { background: '#5c0011' };
					}
				} else if(this.paused) {
					for(const node of this.nodes) {
						rtn[node.name] = { background: '#002766' };
					}
				}
				if(this.focusedNode) {
					rtn[this.focusedNode] = { background: '#262626' };
				}
				// Changing the theme on ephemeral disconnect takes annoyingly long; skipping this for now at least
				/*
				for(const node of this.nodes) {
					if(!node.state.open) {
						rtn[node.name] = { background: '#5c0011' };
					}
				}
				*/
				return rtn;
			},
			showLock(): boolean {
				return this.locking || (this.device.state == 'resolved' && this.device.value.jenkinsLockOwner !== undefined);
			},
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
			termThemes: {
				async handler() {
					for(const node of this.nodes) {
						const term = (await this.getTerminal(node.name)).terminal;
						term.setOption('theme', this.termThemes[node.name]);
					}
				},
				immediate: true,
				deep: true,
			},
			'device.value.build'(newBuild?: BuildJson, oldBuild?: BuildJson) {
				if(oldBuild && !newBuild && oldBuild.result !== undefined) {
					// Cache completed builds so the user can see the result and manually dismiss it
					this.finishedBuild = {
						...oldBuild,
						end: new Date(),
					};
					this.drawTermLine(oldBuild.name, 'end');
				} else if(newBuild) {
					if(this.finishedBuild) {
						this.finishedBuild = undefined;
					}
					if(oldBuild) {
						if(newBuild.stage && (!oldBuild.stage || newBuild.stage.name !== oldBuild.stage.name)) {
							this.drawTermLine(newBuild.stage.name, undefined);
						}
					} else {
						this.drawTermLine(newBuild.name, 'start');
					}
				}
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
				paused: false,
				focusedNode: undefined as string | undefined,
				finishedBuild: undefined as FinishedBuild | undefined,
				locking: false, // True if currently trying to acquire a lock
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
						terminal.write(data.data);
					}
				})
				.on('command', (data: any) => {
					if(this.runningCommand && data.command === this.runningCommand.name) {
						this.runningCommand.state = data.state;
						this.runningCommand.errorMessage = data.error;
					}
				})
				.on('termLine', (data: { label: string; caps: 'start' | 'end' | undefined }) => {
					if(!this.paused && data.label && (data.caps === 'start' || data.caps === 'end' || data.caps === undefined)) {
						this.drawTermLine(data.label, data.caps);
					}
				})
				.on('commandModal', (data: { title: string; rows: { key: string, value: string }[] }) => {
					const ctor = Vue.extend(SbCommandModal);
					const comp = new ctor({
						propsData: {
							rows: data.rows,
						},
					});
					comp.$mount();
					this.$info({
						title: data.title,
						//@ts-ignore Vue internals :-\
						content: comp._vnode,
						onOk() {
							comp.$destroy();
						},
					});
				});

			const commandsService = this.app.service('api/commands');
			commandsService.timeout = 30000;
			this.commands = unwrapPromise(commandsService.find());
			if(document.location.search) {
				const params = new URLSearchParams(document.location.search.substring(1));
				const state = params.get('state');
				if(state) {
					history.replaceState(null, '', document.location.origin + document.location.pathname);
					this.loadState(state);
				}
			}
		},
		beforeDestroy() {
			this.app.service('api/devices').removeAllListeners();
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
			termStdin(nodeName: string, data: string) {
				if(data == '\r') {
					data = '\r\n';
				}
				if(this.device.state == 'resolved') {
					const node = this.device.value.nodes.find(node => node.name === nodeName);
					if(node?.state?.open) {
						this.socket.emit('node-stdin', this.device.value.id, nodeName, data);
					}
				}
			},
			acquireLock() {
				// This will create the sb-lock component, which automatically tries to lock if there isn't an existing one
				this.locking = true;
			},
			releaseLock() {
				const lockComp = this.$refs.lock as SbLockVue | undefined;
				if(lockComp) {
					lockComp.release();
				}
			},
			async loadState(key: string) {
				this.paused = true;
				let state: SavedTerminalJson;
				try {
					state = await this.app.service('api/saveState').get(key);
				} catch(e) {
					this.$error({
						title: 'Loading state failed',
						content: `${e}`,
					});
					return;
				}
				let errors = false;
				for(const { nodeName, text } of state.scrollback) {
					try {
						const term = await this.getTerminal(nodeName);
						term.write(new Buffer(text));
					} catch(e) {
						console.error(e);
						errors = true;
					}
				}
				const msg = `Finished loading state from ${state.user.displayName}`;
				if(errors) {
					this.$notification.error({
						message: 'State Errors',
						description: `${msg}. There were errors deserializing some of the stored nodes`,
						placement: 'bottomRight',
						duration: 5,
					});
				} else {
					this.$notification.info({
						message: 'State Loaded',
						description: msg,
						placement: 'bottomRight',
						duration: 5,
					})
				}
			},
			async copyState() {
				const state: SavedTerminalJson['scrollback'] = [];
				for(const node of this.nodes) {
					const term = await this.getTerminal(node.name);
					state.push({
						nodeName: node.name,
						text: term.serialize(),
					});
				}
				try {
					const key = await this.app.service('api/saveState').create(state);
					const url = `${window.location.origin}${window.location.pathname}?state=${key}`
					let msg: string;
					if(navigator.clipboard) {
						await navigator.clipboard.writeText(url);
						msg = "Link to state copied to your clipboard";
					} else {
						msg = "Copy this link to share your state";
					}
					const el = this.$createElement('div', [
						`${msg}: `,
						this.$createElement('a', {
							domProps: {
								href: url,
							},
						}, [
							key,
						]),
					]);
					this.$notification.info({
						message: 'State Saved',
						description: el,
						placement: 'bottomRight',
						duration: 10,
					});
				} catch(e) {
					console.error(e);
					this.$error({
						title: 'Save State',
						content: `Failed to save state: ${e}`,
					});
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	.disconnected-icon {
		color: #f5222d;
	}

	.pause-icon {
		cursor: pointer;
	}

	.notifications {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 10px;
		display: flex;
		overflow-y: hidden;
		z-index: 50; // Maximized golden-layout windows have a z-index of 40

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

			.ant-spin {
				position: relative;
				top: 3px;
			}
		}
	}
</style>

<style lang="less" scoped>
	.ant-menu {
		/deep/ .brand {
			span {
				position: relative;
			}
			.ant-tag {
				position: relative;
				top: -2px;
				&:first-child {
					margin-left: 5px;
				}
			}
		}
	}

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
