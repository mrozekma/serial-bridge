<template>
	<div>
		<sb-navbar :global-manage="false">
			<template #brand>
				<span :title="(device.state == 'resolved') ? device.value.description : undefined">
					{{ deviceName }}
				</span>
				<template v-for="{ name, description, color, showOnDevicePage } in (device.state == 'resolved' ? device.value.tags : [])">
					<a :href="`/#tags=${name}`">
						<a-tag v-if="showOnDevicePage !== false" :key="name" :title="description" :color="color" class="device-tag">{{ name }}</a-tag>
					</a>
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
				<a-menu-item @click="resetLayout">Reset Layout</a-menu-item>
				<a-menu-item @click="screenshot()">Screenshot</a-menu-item>
				<a-menu-item @click="copyState">Share</a-menu-item>
			</a-sub-menu>
			<a-sub-menu title="State">
				<a-menu-item><a :href="manageUrl">Manage</a></a-menu-item>
				<template v-if="device.state == 'resolved' && device.value.jenkinsLockName">
					<a-menu-item v-if="!device.value.lock" @click="acquireLock">Reserve in Jenkins</a-menu-item>
					<a-menu-item v-else @click="releaseLock">Unreserve in Jenkins</a-menu-item>
				</template>
				<a-menu-item><a :href="`/config/reload?devices=${id}`">Reload configuration</a></a-menu-item>
			</a-sub-menu>
			<a-menu-item class="faux">
				<sb-lock v-if="showLock && device.state === 'resolved'" ref="lock" :device="device.value" :owner="device.value.lock ? device.value.lock.owner : undefined" :date="device.value.lock ? device.value.lock.date : undefined" :note="device.value.lock ? device.value.lock.note : undefined" compact @close="locking = false"/>
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
				<sb-connection v-for="connection in connections" :key="connection.host" v-bind="connection"/>
			</template>
		</sb-navbar>
		<main ref="main">
			<template v-if="device.state == 'pending'"/>
			<a-alert v-else-if="device.state == 'rejected'" type="error" message="Failed to load device" :description="device.error.message" showIcon/>
			<a-alert v-else-if="!device.value.alive" type="error" message="Removed" description="Device has been removed" showIcon/>
			<sb-layout v-else-if="nodes.length > 0" ref="layout" :device-name="deviceName" :nodes="nodes" @stdin="termStdin" @focus="node => focusedNode = node" @blur="focusedNode = undefined" @contextmenu="termMenu"/>
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
			<a-menu v-if="contextMenu" class="device-context-menu" :style="contextMenu.style">
				<a-menu-item-group class="node-name" :title="contextMenu.node"/>
				<!-- eslint-disable vue/valid-v-for -->
				<template v-for="item in contextMenu.items">
					<a-menu-divider v-if="item === '-'"/>
					<a-menu-item-group v-else-if="item.subitems !== undefined" :title="item.text">
						<a-menu-item v-for="subitem in item.subitems" @click="subitem.handler(); contextMenu = undefined;">
							<i :class="subitem.icon || 'fas fa-badge'"/>
							{{ subitem.text }}
						</a-menu-item>
					</a-menu-item-group>
					<a-sub-menu v-else-if="item.options !== undefined" class="device-context-menu" popup-class-name="device-context-menu">
						<template #title>
							<i :class="item.icon || 'fas fa-badge'"/>
							{{ item.text }}
						</template>
						<a-menu-item v-for="option in item.options">
							<a-radio :checked="option === item.selected" @click="item.handler(option); contextMenu = undefined;">
								{{ option }}
							</a-radio>
						</a-menu-item>
					</a-sub-menu>
					<a-menu-item v-else @click="item.handler(); contextMenu = undefined;">
						<i :class="item.icon || 'fas fa-badge'"/>
						{{ item.text }}
					</a-menu-item>
				</template>
				<!-- eslint-enable vue/valid-v-for -->
			</a-menu>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { MetaInfo } from 'vue-meta';
	import { ITheme } from 'xterm';
	import { saveAs } from 'file-saver';
	import html2canvas from 'html2canvas';

	import { appName, rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { getDeviceUrl, nodeLinks, Node } from '../device-functions';
	import { Connection, getDeviceConnections } from '../connections';
	import commandPalette, { Command as PaletteCommand } from '../command-palette';
	import { DeviceJson, CommandJson, BuildJson, SavedTerminalJson } from '@/services';
	import { User } from '@/server/connections'; // Another server type import in the client :|

	type ContextMenuItem<T = string> = {
		text: string;
		icon?: string;
		handler: () => void;
	} | {
		text: string;
		subitems: {
			text: string;
			icon?: string;
			handler: () => void;
		}[];
	} | {
		text: string;
		icon?: string;
		options: T[];
		selected: string;
		handler: (selection: T) => void;
	} | '-';

	import SbNavbar from '../components/navbar.vue';
	import SbCommandMenu from '../components/command-menu.vue';
	import SbJenkins, { FinishedBuild } from '../components/jenkins.vue';
	import SbLock, { SbLockVue } from '../components/lock.vue';
	import SbLayout, {SbLayoutVue } from '../components/golden-layout.vue';
	import SbTerminal, { SbTerminalVue } from '../components/terminal.vue';
	import SbConnection from '../components/connection.vue';
	import SbCommandModal from '../components/command-modal.vue';
	export default Vue.extend({
		components: { SbNavbar, SbCommandMenu, SbJenkins, SbLock, SbLayout, SbTerminal, SbConnection },
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
			manageUrl(): string | undefined {
				return (this.device.state == 'resolved') ? getDeviceUrl(this.device.value, 'manage') : undefined;
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
				return this.locking || (this.device.state == 'resolved' && this.device.value.lock !== undefined);
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
						term.options.theme = this.termThemes[node.name];
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
			nodes(nodes: Node[]) {
				this.nodeEols = Object.fromEntries(nodes.map(node => {
					const name = node.name;
					const eol: any = localStorage.getItem(`devices.${this.id}.${node.name}.eol`);
					return [ name, eol ?? node.eol ];
				}));
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
				contextMenu: undefined as {
					node: string;
					style: {
						top: string;
						left: string;
					};
					items: ContextMenuItem[];
				} | undefined,
				nodeEols: {} as { [K: string]: 'cr' | 'lf' | 'crlf' },
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
				})
				.on('writeCollision', async (data: { node: string; users: User[] }) => {
					const connections = data.users.map<Connection>(user => ({
						host: user.host,
						nodes: [],
						name: user.displayName,
						avatar: user.avatar,
						webState: undefined,
					}));
					const terminal = await this.getTerminal(data.node);
					terminal?.onWriteCollision(connections);
				});

			const self = this;
			function* addDeviceCommands(commands: CommandJson[], path: { text: string; icon?: string | undefined }[]): Iterable<PaletteCommand> {
				for(const command of commands) {
					if(command.submenu) {
						yield* addDeviceCommands(command.submenu, [ ...path, { text: command.label, icon: command.icon } ]);
					} else {
						yield {
							value: `device.command.${command.name}`,
							text: [ ...path, {
								text: command.label,
								icon: command.icon,
							 } ],
							handler: () => self.runCommand(command.name, command.label, command.icon),
						};
					}
				}
			}
			commandPalette.addProvider('device', function*() {
				if(self.commands.state === 'resolved') {
					yield* addDeviceCommands(self.commands.value, [{
						text: 'Device',
					}, {
						text: 'Commands',
					}]);
				}
				yield {
					value: 'device.view.clear',
					text: [ 'Device', 'View', 'Clear' ],
					handler: () => self.resetTerms(),
				};
				yield !self.paused ? {
					value: 'device.view.pause',
					text: [ 'Device', 'View', 'Pause' ],
					handler: () => self.paused = true,
				}: {
					value: 'device.view.unpause',
					text: [ 'Device', 'View', 'Unpause' ],
					handler: () => self.paused = false,
				};
				yield {
					value: 'device.view.resetLayout',
					text: [ 'Device', 'View', 'Reset Layout' ],
					handler: () => self.resetLayout(),
				};
				if(self.device.state === 'resolved') {
					const device = self.device.value;
					yield {
						value: 'device.manage.ports',
						text: [ 'Device', 'Manage', 'Ports' ],
						handler: () => window.location.assign(self.manageUrl!),
					};
					yield {
						value: 'device.manage.share',
						text: [ 'Device', 'Manage', 'Share' ],
						handler: () => self.copyState(),
					};
					if(device.jenkinsLockName) {
						yield !device.lock ? {
							value: 'device.manage.lock.acquire',
							text: [ 'Device', 'Manage', 'Reserve in Jenkins' ],
							handler: () => self.acquireLock(),
						} : {
							value: 'device.manage.lock.release',
							text: [ 'Device', 'Manage', 'Unreserve in Jenkins' ],
							handler: () => self.releaseLock(),
						};
					}
				}
				for(const node of self.nodes) {
					for(const linkName of node.webLinks) {
						const link = nodeLinks.find(link => link.name === linkName);
						if(link && link.url) {
							yield {
								value: `device.nodes.${node.name}.link.${link.name}`,
								text: [ 'Device', 'Nodes', node.name, { text: link.name, icon: link.icon } ],
								handler: () => window.location.assign(link.url!(self.deviceName, node)),
							};
						}
					}
				}
				const layout = self.$refs.layout as SbLayoutVue;
				if(layout && layout.ready) {
					for(const [ name, term ] of layout.terminals) {
						yield {
							value: `device.nodes.${name}.focus`,
							text: [ 'Device', 'Nodes', name, 'Focus' ],
							handler: () => term.focus(),
						};
					}
				}
			});

			const commandsService = this.app.service('api/commands');
			commandsService.timeout = 30000;
			this.commands = unwrapPromise(commandsService.find({
				query: {
					device: this.id,
				},
			}));
			if(document.location.search) {
				const params = new URLSearchParams(document.location.search.substring(1));
				const state = params.get('state');
				if(state) {
					history.replaceState(null, '', document.location.origin + document.location.pathname);
					this.loadState(state);
				}
			}

			document.addEventListener('visibilitychange', () => {
				if(this.device.state === 'resolved') {
					this.socket.emit('device-user-active', this.device.value.id, !document.hidden);
				}
			});
			this.socket.on('reconnect', () => {
				if(this.device.state === 'resolved') {
					this.socket.emit('device-user-active', this.device.value.id, !document.hidden);
				}
			});
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
			async runCommand(name: string, label: string, icon?: string, clearTerms?: boolean) {
				while(this.runningCommand) {
					// Sleep 1s
					await new Promise(resolve => setTimeout(resolve, 1000));
				}

				if(clearTerms) {
					await this.resetTerms();
				}
				this.runningCommand = {
					name, label, icon,
					state: 'pending',
					errorMessage: undefined,
				};
				try {
					await this.app.service('api/commands').patch(name, {});
					setTimeout(() => this.runningCommand = undefined, 2000);
				} catch(e: any) {
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
			resetLayout() {
				const layout = this.$refs.layout as SbLayoutVue;
				layout.resetLayout();
			},
			termStdin(nodeName: string, data: string) {
				const eol = {
					cr: '\r',
					lf: '\n',
					crlf: '\r\n',
				}[this.nodeEols[nodeName]];
				data = data.replace(/\r/g, eol);
				if(this.device.state == 'resolved') {
					const node = this.device.value.nodes.find(node => node.name === nodeName);
					if(node?.state?.open) {
						this.socket.emit('node-stdin', this.device.value.id, nodeName, data);
					}
				}
			},
			async termMenu(nodeName: string, e: MouseEvent) {
				const self = this;
				const node = this.nodes.find(node => node.name === nodeName);
				const term = (await this.getTerminal(nodeName)).terminal;
				const ctrlKey = (navigator.platform.toUpperCase().indexOf('MAC') >= 0) ? 'Cmd' : 'Ctrl';
				const clipboard = navigator.clipboard ?? {
					readText: () => Promise.reject(),
					writeText: (text: string) => Promise.reject(),
				};

				function getScrollback() {
					term.selectAll();
					const selection = term.getSelection().trim();
					term.clearSelection();
					return selection;
				}
				function saveFile(text: string) {
					const blob = new Blob([ text ], { type: "text/plain;charset=utf-8" });
					saveAs(blob, `${nodeName}.txt`);
				}
				function* makeMenu(): Iterable<ContextMenuItem> {
					const selection = term.getSelection().trim();

					if(node?.webLinks) {
						const linkItems = [];
						for(const linkName of node.webLinks) {
							const link = nodeLinks.find(link => link.name === linkName);
							if(link) {
								linkItems.push({
									text: link.description,
									icon: link.icon,
									handler() {
										if(link.url) {
											window.location.assign(link.url(self.deviceName, node));
										} else {
											self.$notification.warning({
												message: 'Missing setup',
												description: `No ${link.description} handler specified. Choose one from the Setup tab and reload this page.`,
												placement: 'bottomRight',
											});
										}
									},
								});
							}
						}
						yield {
							text: "Connection",
							subitems: linkItems,
						};
						yield '-';
					}

					if(selection) {
						yield {
							text: "Selection",
							subitems: [{
								text: "Copy",
								icon: 'fas fa-copy',
								handler() {
									clipboard.writeText(selection).catch(e => {
										self.$notification.error({
											duration: 10,
											placement: 'bottomRight',
											message: "No clipboard access",
											description: `Unable to write to the clipboard. Try pressing ${ctrlKey}+Insert to copy instead. See the Setup tab for more information on clipboard interactions.`,
										});
									});
								},
							}, {
								text: "Export",
								icon: 'fas fa-save',
								handler() {
									saveFile(selection);
								},
							}, {
								text: "Unselect",
								icon: 'fas fa-vote-nay',
								handler() {
									term.clearSelection();
								},
							}],
						};
						yield '-';
					}
					yield {
						text: "Scrollback",
						subitems: [{
							text: "Select All",
							icon: 'fas fa-object-group',
							handler() {
								term.selectAll();
							},
						}, {
							text: "Copy",
							icon: 'fas fa-copy',
							handler() {
								clipboard.writeText(getScrollback()).catch(e => {
									self.$notification.error({
										duration: 10,
										placement: 'bottomRight',
										message: "No clipboard access",
										description: `Unable to write to the clipboard. Try using Select All to select the entire scrollback and pressing ${ctrlKey}+Insert to copy. See the Setup tab for more information on clipboard interactions.`,
									});
								});
							},
						}, {
							text: "Export",
							icon: 'fas fa-save',
							handler() {
								saveFile(getScrollback());
							},
						}, {
							text: "Clear",
							icon: 'fas fa-eraser',
							handler() {
								term.reset();
							},
						}],
					};
					yield '-';
					yield {
						text: "Paste",
						icon: 'fas fa-paste',
						async handler() {
							try {
								term.write(await clipboard.readText());
							} catch(e) {
								self.$notification.error({
									duration: 10,
									placement: 'bottomRight',
									message: "No clipboard access",
									description: 'Unable to read from the clipboard. Try using Shift+Insert to paste instead. See the Setup tab for more information on clipboard interactions.',
								});
							}
						},
					};
					yield {
						text: "Upload",
						icon: 'far fa-file-upload',
						handler() {
							self.uploadToNode(nodeName);
						},
					};
					yield {
						text: "Screenshot",
						icon: 'fas fa-camera-retro',
						handler() {
							self.screenshot(nodeName);
						},
					};
					yield {
						text: "Newline",
						icon: 'fas fa-level-down',
						options: [ 'Carriage Return', 'Line Feed', 'Both' ],
						selected: {
							'cr': 'Carriage Return',
							'lf': 'Line Feed',
							'crlf': 'Both',
						}[self.nodeEols[nodeName]],
						handler(desc) {
							const eol = ({
								'Carriage Return': 'cr',
								'Line Feed': 'lf',
								'Both': 'crlf',
							} as const)[desc]!;
							localStorage.setItem(`devices.${self.id}.${nodeName}.eol`, eol);
							self.nodeEols[nodeName] = eol;
						},
					};
				}
				const items = Array.from(makeMenu());
				if(items[items.length - 1] === '-') {
					items.pop();
				}
				if(items.length == 0) {
					this.contextMenu = undefined;
					return;
				}
				const menu = {
					node: nodeName,
					style: {
						left: `${e.clientX}px`,
						top: `${e.clientY}px`,
					},
					items,
				};
				this.contextMenu = menu;
				const listener = (e: MouseEvent) => {
					if(this.contextMenu !== menu) {
						return;
					}
					for(const el of document.getElementsByClassName('device-context-menu')) {
						//@ts-ignore Type info on contains() seems to be wrong
						if(el?.contains(e.target)) {
							return;
						}
					}
					this.contextMenu = undefined;
					window.removeEventListener('mousedown', listener);
				};
				window.addEventListener('mousedown', listener);
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
			uploadToNode(nodeName: string) {
				// Can't believe this is still the best way to get a file
				const input = document.createElement('input');
				input.type = 'file';
				input.addEventListener('change', () => {
					if(!input.files?.length) {
						return;
					}
					const file = input.files[0];
					const done = (success: boolean, description: string) => {
						this.$notification[success ? 'success' : 'error']({
							message: 'File write',
							description,
							placement: 'bottomRight',
							duration: 3,
						});
					};
					const reader = new FileReader();
					reader.addEventListener('load', e => {
						this.termStdin(nodeName, reader.result as string);
						done(true, `Write to ${nodeName} complete`);
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
				}, false);
				input.click();
			},
			async screenshot(nodeName?: string) {
				let el: HTMLElement | null | undefined;
				if(nodeName) {
					el = (await this.getTerminal(nodeName)).terminal.element;
					while(el && !el.classList.contains('lm_item')) {
						el = el.parentElement;
					}
					if(!el) {
						this.$notification.error({
							message: 'Screenshot failed',
							description: `Unable to find pane housing node '${nodeName}'`,
							placement: 'bottomRight',
							duration: 5,
						});
						return;
					}
				} else {
					el = this.$refs.main as HTMLElement;
				}
				// Wait a moment for whatever UI the user is triggering this from to clear
				await new Promise(resolve => setTimeout(resolve, 500));
				const canvas = await html2canvas(el);
				saveAs(canvas.toDataURL('image/png'), this.deviceName + (nodeName ? '-' + nodeName.replaceAll(' ', '-') : '') + '.png');
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
		z-index: 60; // Maximized golden-layout windows have a z-index of 40

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

	.device-tag {
		cursor: pointer;
	}
</style>

<style lang="less">
	// This has to be non-scoped because Ant generates a root-level unscoped div for submenus
	.ant-menu.device-context-menu, .ant-menu-submenu.device-context-menu .ant-menu {
		background-color: #434343;
		color: #fff;
		z-index: 50;
		&:not(.ant-menu-submenu) {
			border: 1px solid #595959;
			position: absolute;
		}
		.node-name {
			background-color: #262626;
			.ant-menu-item-group-title {
				color: #fff;
				padding: 2px;
				text-align: center;
				font-size: 8pt;
			}
		}
		.ant-menu-item-group:not(.node-name) .ant-menu-item-group-title {
			padding: 4px 16px;
			color: rgba(255, 255, 255, 0.45);
		}
		.ant-menu-item, .ant-menu-submenu, .ant-menu-submenu-title {
			height: 32px;
			line-height: 32px;
			margin: 0;
			i {
				text-align: center;
				width: 17px;
				margin-right: 4px;
			}
			&.ant-menu-item-active, &.ant-menu-submenu-active {
				// There seems to be a bug with menu groups where every subitem gets .ant-menu-item-active set when any of them are hovered. Work around this by checking for :hover specifically
				color: inherit;
				background-color: inherit;
				&:hover {
					background-color: #595959;
				}
			}
			.ant-radio-wrapper {
				color: #fff;
			}
			.ant-upload {
				width: 100%;
				color: #fff;
			}
		}
		.ant-menu-submenu-title {
			color: #fff;
			.ant-menu-submenu-arrow::before, .ant-menu-submenu-arrow::after {
				background: linear-gradient(to right, #fff, #fff) !important;
			}
		}
		.ant-menu-item-divider {
			margin: 4px 0;
		}
	}
</style>
