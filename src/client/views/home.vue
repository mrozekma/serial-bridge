<template>
	<div class="home">
		<sb-navbar/>
		<main>
			<a-alert v-if="version.state === 'resolved' && version.value.notice" type="info" :message="version.value.notice" show-icon/>
			<a-tabs :defaultActiveKey="defaultTab" @change="tabSwitched">
				<a-tab-pane key="devices" tab="Devices" force-render>
					<a-alert v-if="devices.state === 'rejected'" type="error" message="Failed to load devices" :description="devices.error.message" showIcon/>
					<div v-else>
						<div v-if="tableFiltered || savedFilters.length > 0" class="table-filter-controls">
							<a-tooltip placement="bottomRight" title="Table filter controls">
								<i class="fas fa-filter"></i>
							</a-tooltip>
							<template v-if="tableFiltered">
								<a-tooltip placement="bottomRight" title="Save current table filter">
									<a-tag color="blue" @click="saveFilter">Save</a-tag>
								</a-tooltip>
								<a-tooltip placement="bottomRight" title="Clear current table filter">
									<a-tag color="blue" @click="clearFilter">Clear</a-tag>
								</a-tooltip>
							</template>
							<template v-if="savedFilters.length > 0">
								<a-tag v-for="filter in savedFilters" :key="filter.name" closable @click="applyFilter(filter)" @close="removeFilter(filter)">
									{{ filter.name }}
								</a-tag>
							</template>
						</div>
						<a-table :columns="columns" :data-source="annotatedDevices" :row-key="device => device.id" :custom-row="customRow" :row-class-name="device => (device.lock !== undefined || device.build !== undefined) ? 'busy' : ''" :loading="devices.state == 'pending'" :pagination="false" :locale="{emptyText: 'No devices'}" class="devices" ref="table">
							<template #lock-icon="lockOwner">
								<a-tooltip v-if="lockOwner" placement="bottomRight" :title="`Reserved by ${lockOwner}`">
									<i class="fas fa-lock-alt"></i>
								</a-tooltip>
							</template>
							<template #build-icon="build">
								<a-tooltip v-if="build" placement="bottomRight" :title="build.name">
									<i class="fab fa-jenkins"></i>
								</a-tooltip>
							</template>
							<template #tags="tags">
								<a-tag v-for="{ name, description, color } in tags" :key="name" :title="description" :color="color" class="device-tag" @click.stop="toggleTagInFilter(name)">{{ name }}</a-tag>
							</template>
							<template #connections="connections">
								<div class="connections">
									<sb-connection v-for="connection in connections" :key="connection.host" v-bind="connection"/>
								</div>
							</template>
							<template #description="description">
								<div class="description">
									{{ description }}
								</div>
							</template>
							<template #remote="remote">
								<template v-if="remote">
									<a :href="remote.url" target="_blank" @click.stop>{{ remote.name }}</a>
								</template>
								<template v-else>
									Local
								</template>
							</template>
							<template #expandedRowRender="device">
								<div class="cards">
									<a-card title="Ports">
										<template #extra>
											<a-tooltip placement="bottomRight" title="Manage ports">
												<a-button size="small" @mousedown.left.stop="manageDevice(device)" @mousedown.middle.stop.prevent="manageDevice(device, true)">
													<i class="fas fa-cogs"></i>
												</a-button>
											</a-tooltip>
										</template>
										<a-table :columns="nodesColumns" :data-source="device.nodes" :row-key="node => node.name" size="small" :pagination="false" :locale="{emptyText: 'No ports'}"/>
									</a-card>
									<a-card v-if="device.metadata && Object.entries(device.metadata).length > 0" title="Metadata">
										<sb-metadata-tree :metadata="device.metadata"/>
									</a-card>
									<a-card title="Connections">
										<a-table :columns="connectionsColumns[device.name]" :data-source="device.connections" :row-key="conn => conn.host" size="small" :pagination="false" :locale="{emptyText: 'No connections'}" class="connections-table">
											<template #user="_, conn">
												<div class="user">
													<a-avatar shape="square" size="small" icon="user" :src="conn.avatar"/>
													<span>{{ conn.name }}</span>
												</div>
											</template>
											<template #nodes="nodes">
												<a-tag v-for="node in nodes" :key="node">{{ node }}</a-tag>
											</template>
										</a-table>
									</a-card>
									<a-card title="Jenkins" class="jenkins-card">
										<template #extra v-if="device.jenkinsLockName">
											<a-tooltip v-if="device.lock" placement="bottomRight" title="Release lock">
												<a-button size="small" @click="releaseLock(device)">
													<i class="fas fa-unlock-alt"></i>
												</a-button>
											</a-tooltip>
											<a-tooltip v-else placement="bottomRight" title="Acquire lock">
												<a-button size="small" @click="acquireLock(device)">
													<i class="fas fa-lock-alt"></i>
												</a-button>
											</a-tooltip>
										</template>
										<sb-lock v-if="(locking.indexOf(device.name) >= 0) || device.lock" :ref="`lock-${device.name}`" :device="device" :owner="device.lock ? device.lock.owner : undefined" :date="device.lock ? device.lock.date : undefined" inline-date/>
										<div v-else-if="device.jenkinsLockName" class="unlocked">
											<i class="fas fa-unlock-alt"></i>
											<span>
												Unreserved
											</span>
										</div>
										<div v-else class="nolock">
											<i class="fas fa-question-circle"></i>
											<span>
												Lock not configured
											</span>
										</div>
										<sb-jenkins v-if="device.build" :build="device.build"/>
									</a-card>
								</div>
							</template>
						</a-table>
						<a-alert v-for="{ title, description } in deviceErrors" :key="title" type="error" show-icon>
							<template #message>
								<b>{{ title }}</b>: {{ description }}
							</template>
						</a-alert>
					</div>
				</a-tab-pane>


				<a-tab-pane key="setup" tab="Setup">
					<h2>You</h2>
					<a-alert v-if="usersConfig.state == 'rejected'" type="error" message="Failed to load user directory config" :description="usersConfig.error.message" showIcon/>
					<a-alert v-else-if="currentUser.state == 'rejected'" type="error" message="Failed to load current user info" :description="currentUser.error.message" showIcon/>
					<a-spin v-else-if="usersConfig.state == 'pending' || currentUser.state == 'pending'"/>
					<template v-else>
						A list of who is connected to each device/port is displayed in several places in the UI.<br>
						<template v-if="usersConfig.value.identifySupport">
							Serial Bridge attempts to guess who you are based on your hostname: <code>{{ currentUser.value.host }}</code>.<br>
							If this isn't working, you can manually specify your name here.
						</template>
						<template v-else>
							Serial Bridge isn't configured with a user directory, so by default it just displays your hostname: <code>{{ currentUser.value.host }}</code>.<br>
							You can manually specify your name here.
						</template>
						<template v-if="usersConfig.value.avatarSupport">
							You can also specify an e-mail address to show an avatar.
						</template>

						<a-form layout="inline" @submit.prevent="updateUser">
							<a-form-item label="Name" v-bind="userFormFeedback">
								<a-input v-model="currentUser.value.displayName" @change="changeUserInfo = undefined"/>
							</a-form-item>
							<a-form-item v-if="usersConfig.value.avatarSupport" label="E-mail" v-bind="userFormFeedback">
								<a-input v-model="currentUser.value.email" @change="changeUserInfo = undefined"/>
							</a-form-item>
							<a-form-item>
								<a-button type="primary" html-type="submit" :disabled="changeUserInfo && changeUserInfo.state == 'pending'">Update</a-button>
							</a-form-item>
						</a-form>
					</template>

					<a-alert v-if="jenkinsConfig.state == 'rejected'" type="error" message="Failed to load Jenkins config" :description="jenkinsConfig.error.message" showIcon/>
					<a-spin v-else-if="jenkinsConfig.state == 'pending'"/>
					<template v-else-if="jenkinsConfig.value.jenkinsUrl">
						<h2>Jenkins</h2>
						It's possible to control Jenkins locks from within Serial Bridge, but this requires a Jenkins API key:
						<ul>
							<li>Go to <a target="_blank" :href="jenkinsConfig.value.jenkinsUrl">Jenkins</a>.</li>
							<li>Click your username at the top-right.</li>
							<li>Click <b>Configure</b> on the left menu.</li>
							<li>Under the <b>API Token</b> section, click <b>Add new Token</b>.</li>
							<li>Enter the name "Serial Bridge" and click <b>Generate</b>.</li>
							<li>Paste the generated token here.</li>
						</ul>
						<a-form layout="inline" @submit.prevent="updateJenkins">
							<a-form-item label="Username">
								<a-input v-model="jenkinsForm.username" @change="changeJenkinsKey = undefined"/>
							</a-form-item>
							<a-form-item v-if="usersConfig.value.avatarSupport" label="API Key" v-bind="jenkinsFormFeedback">
								<a-input-password v-model="jenkinsForm.key" @change="changeJenkinsKey = undefined"/>
							</a-form-item>
							<a-form-item>
								<a-button type="primary" html-type="submit" :disabled="changeJenkinsKey && changeJenkinsKey.state == 'pending'">Update</a-button>
							</a-form-item>
						</a-form>
					</template>

					<h2>Clients</h2>
					Some terminal windows have <i class="far fa-external-link-alt"></i> and/or <i class="far fa-terminal"></i> icons to open telnet, raw TCP, and SSH connections. How this works is special-cased by client. Choose the client you want Serial Bridge to use and click "Save" below:

					<a-form @submit.prevent="updateNodeLinkHandler">
						<a-radio-group v-model="nodeLinkHandler.app" class="node-link-handler">
							<a-radio value="none">None</a-radio>
							<div>
								Do not show raw or SSH links. Serial Bridge will still attempt to open Telnet links via the <code>telnet</code> URI scheme, which is usually supported natively by the OS. To customize this behavior on Windows, edit the <code>HKEY_LOCAL_MACHINE\SOFTWARE\Classes\telnet\shell\open\command</code> registry key and set the default value to the command-line you want to run. Use <code>%l</code> to refer to the URL. For example, <code>"C:\Program Files (x86)\PuTTY\putty.exe" %l</code>.
							</div><br>
							<a-radio value="mobaxterm">MobaXterm</a-radio>
							<div>
								<a target="_blank" href="https://mobaxterm.mobatek.net/">MobaXterm</a> is a Windows-based terminal emulator. As long as it's been installed (i.e. you're not using the portable version), it automatically supports connections being opened from a browser. However, there are some limitations:
								<ul>
									<li>
										There is no way to provide an SSH password via a browser link. You can either type in the password on each connection, type it once and tell MobaXterm to save it, or provide the path to your private key here and Serial Bridge will tell MobaXterm to use it.<br>
										<a-input type="text" v-model="nodeLinkHandler.keyPath" placeholder="Private key path"/>
									</li>
									<li>
										The free "Home Edition" only supports 12 saved connections. By default Serial Bridge will make a new connection for each node of each device, but this can quickly consume all 12 slots. Instead, Serial Bridge can keep reusing the same name, overwriting the old connection and always taking up just 1 slot. Note that the "Professional Edition" does not have this limitation.<br>
										<a-select v-model="nodeLinkHandler.nameFormat">
											<a-select-option value="device-node-name">Name connection after device and node</a-select-option>
											<a-select-option value="device-name">Name connection after device only</a-select-option>
											<a-select-option value="static">Name connection "Serial Bridge"</a-select-option>
										</a-select>
									</li>
									<li>Connections created via a browser link cannot be in a folder, they will always be in the "User sessions" root.</li>
									<li>MobaXterm does not support raw TCP connections. These will attempt to fallback to PuTTY instead.</li>
								</ul>
							</div>
							<a-radio value="putty">PuTTY</a-radio>
							<div>
								<a target="_blank" href="https://www.chiark.greenend.org.uk/~sgtatham/putty/">PuTTY</a> is a Windows and *nix terminal emulator. It does not natively include a way to open connections from a browser, so a new URL protocol will need to be setup. You can enter your Putty path here to generate the necessary registry files and batch script (this assumes that you'll put the batch script in Putty's directory; if not, modify the generated files):
								<form method="get" action="/serial-bridge.zip">
									<a-input type="text" name="path" v-model="nodeLinkHandler.puttyPath" placeholder="PuTTY Path"/>
									<a-button html-type="submit">Generate</a-button>
								</form>
								<a-collapse @change="puttyManualSetupToggle">
									<a-collapse-panel header="PuTTY manual setup" key="putty-manual-setup">
										To set things up manually instead of using the generated files:
										<ul>
											<li>Create a batch file that will receive the URI and pass the arguments to Putty:
												<pre><code ref="putty-batch-file" class="language-batch line-numbers">{{ puttyBatFile }}</code></pre>
											</li>
											<li>Create the following registry entries (the <code>HKEY_CLASSES_ROOT\putty</code> key will need to be created):
												<ul>
													<li><code>HKEY_CLASSES_ROOT\putty\URL Protocol</code> = <code>""</code></li>
													<li><code>HKEY_CLASSES_ROOT\putty\shell\open\command\(Default)</code> = <code>"&lt;Batch file&gt;" %1</code></li>
												</ul>
											</li>
										</ul>
									</a-collapse-panel>
								</a-collapse>
							</div>
						</a-radio-group>
						<a-button type="primary" html-type="submit" style="margin-left: 10px">Save</a-button>
					</a-form>

					<h2>Clipboard</h2>
					<template v-if="clipboardAvailable === true">
						Serial Bridge should be able to access your clipboard, so no additional setup is necessary.<br><br>
						<a-button type="primary" @click="testClipboard">Test clipboard</a-button>
					</template>
					<template v-else-if="clipboardAvailable === 'http'">
						Serial Bridge is not using SSL, so your browser will not allow clipboard access.
						<!-- This can't be a link. I hate Google -->
						If using Chrome, you can go to <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> and tell it to treat this host as secure.
						Firefox does not <a target="_blank" href="https://bugzilla.mozilla.org/show_bug.cgi?id=1410365">yet</a> support this.
					</template>
					<template v-else>
						Your browser does not appear to allow clipboard access.
					</template>
				</a-tab-pane>

				<a-tab-pane v-if="changelog.entries.length > 0" key="changelog">
					<template #tab>
						<a-badge :count="changelog.newCount">
							New features
						</a-badge>
					</template>
					<sb-changelog :entries="changelog.entries" />
				</a-tab-pane>
			</a-tabs>
		</main>
		<footer v-if="version.state === 'resolved'">
			<a target="_blank" :href="version.value.versionLink">{{ version.value.version }}</a>
			<template v-if="version.value.buildId">
				| <a target="_blank" :href="version.value.releaseLink">Build {{ version.value.buildId }}</a>
			</template>
			| Built {{ version.value.date }}
			<template v-if="version.value.licenses">
				| <a target="_blank" href="/licenses.txt">Licenses</a>
			</template>
		</footer>
		<sb-form-modal v-model="newFilter.visible" title="Add Filter" :ok="saveFilter">
			<a-form-item label="Filter name">
				<a-input v-model="newFilter.name" />
			</a-form-item>
		</sb-form-modal>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { Application } from '@feathersjs/feathers';
	import { AntdComponent } from 'ant-design-vue/types/component';
	import { Column, ColumnFilterItem } from 'ant-design-vue/types/table/column';

	import { Connection, getDeviceConnections } from '../connections';
	import commandPalette from '../command-palette';
	import { DeviceJson, ClientServices as Services } from '@/services';
	import { batFile, defaultPuttyPath } from '@/server/setup-zip'; // Pure laziness

	import Prism from 'prismjs';
	// Prism is getting confused by the parentheses in "Program Files (x86)" and styling "x86" as a keyword, so this hack works around it by adding an earlier token for that whole string
	Prism.languages.insertBefore('batch', 'command', { programFiles: /Program Files \(x86\)/ }, Prism.languages);

	interface AnnotatedDevice extends DeviceJson {
		connections: Connection[];
	}

	// This is a subset of the interface exposed by Ant's Table type, the only child of ATable
	interface AntTable extends Vue {
		columns: AntTableColumn[];
		sFilters: {
			[K: string]: string[]
		};
		sSortColumn: AntTableColumn | null;
		sSortOrder: 'ascend' | 'descend' | undefined;
	}
	type AntTableColumn = Omit<Column, keyof AntdComponent>;

	interface SavedFilter {
		name: string;
		sort: {
			column: string;
			order: 'ascend' | 'descend';
		} | undefined;
		filters: {
			column: string;
			values: string[];
		}[];
	}

	interface Changelog {
		entries: {
			key: string;
			seen: boolean;
		}[];
		newCount: number;
	}

	function makeFormFeedback(promise: PromiseResult<any> | undefined) {
		const rtn: any = {
			hasFeedback: false,
		};
		if(promise) {
			rtn.hasFeedback = true;
			switch(promise.state) {
				case 'pending':
					rtn.validateStatus = 'validating';
					break;
				case 'resolved':
					rtn.validateStatus = 'success';
					break;
				case 'rejected':
					console.error(promise.error);
					rtn.validateStatus = 'error';
					rtn.help = promise.error.message;
					break;
			}
		}
		return rtn;
	}

	function makeFilter(name: string, tbl: AntTable): SavedFilter {
		return {
			name,
			sort: tbl.sSortColumn ? {
				column: tbl.sSortColumn.dataIndex!,
				order: tbl.sSortOrder!,
			} : undefined,
			filters: Object.entries<string[]>(tbl.sFilters).map(([ column, values ]) => ({ column, values })),
		};
	}

	function serializeFilter(filter: SavedFilter) {
		if(filter.name === '' && (filter.sort === undefined || (filter.sort.column === 'name' && filter.sort.order === 'ascend')) && filter.filters.length === 1 && filter.filters[0].column === 'tags') {
			return '#tags=' + filter.filters[0].values.join(',');
		} else {
			return '#devices=' + Buffer.from(JSON.stringify(filter)).toString('base64');
		}
	}

	function deserializeFilter(filter: string): SavedFilter | undefined {
		let rtn: SavedFilter;
		let m = filter.match(/^#?(devices|tags)=(.+)$/);
		switch(m ? m[1] : undefined) {
			case 'devices':
				try {
					rtn = JSON.parse(Buffer.from(m![2], 'base64').toString('utf8'));
				} catch(e) {
					return undefined;
				}
				if(typeof rtn.name !== 'string') { return undefined; }
				if(typeof rtn.sort !== 'undefined') {
					if(typeof rtn.sort !== 'object') { return undefined; }
					if(typeof rtn.sort.column !== 'string') { return undefined; }
					if([ 'ascend', 'descend' ].indexOf(rtn.sort.order) < 0) { return undefined; }
				}
				if(!Array.isArray(rtn.filters)) { return undefined; }
				for(const e of rtn.filters) {
					if(typeof e.column !== 'string') { return undefined; }
					if(!Array.isArray(e.values)) { return undefined; }
					for(const v of e.values) {
						if(typeof v !== 'string') { return undefined; }
					}
				}
				break;
			case 'tags':
				rtn = {
					name: '',
					sort: {
						column: 'name',
						order: 'ascend',
					},
					filters: [{
						column: 'tags',
						values: m![2].split(','),
					}],
				};
				break;
			default:
				return undefined;
		}
		return rtn;
	}

	import SbNavbar from '../components/navbar.vue';
	import SbLock, { SbLockVue } from '../components/lock.vue';
	import SbJenkins from '../components/jenkins.vue';
	import SbFormModal from '../components/form-modal.vue';
	import SbChangelog from '../components/changelog.vue';
	import SbConnection from '../components/connection.vue';
	import SbMetadataTree from '../components/metadata-tree.vue';
	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { Node, compareStrings, getDeviceUrl, isErrorDevice, uniqifyAndSort, NodeLinkHandler } from '../device-functions';
	export default Vue.extend({
		components: { SbNavbar, SbLock, SbJenkins, SbFormModal, SbChangelog, SbConnection, SbMetadataTree },
		computed: {
			...rootDataComputeds(),
			defaultTab(): string {
				if(window.location.hash) {
					const tab = window.location.hash.substring(1);
					if(tab.startsWith('devices=')) {
						return 'devices';
					}
					return tab;
				}
				return 'devices'
			},
			columns(): AntTableColumn[] {
				const tags = uniqifyAndSort(this.annotatedDevices.flatMap(device => device.tags.map(tag => tag.name)));
				const servers = uniqifyAndSort(this.annotatedDevices.map(device => device.remoteInfo?.name ?? 'Local'));
				const connections = new Map(this.annotatedDevices.flatMap(device => device.connections.map(conn => [ conn.host, conn.name ])));
				const lockers = uniqifyAndSort(this.annotatedDevices.map(device => device.lock?.owner).filter((owner): owner is string => owner !== undefined));
				const rtn: AntTableColumn[] = [{
					dataIndex: 'lock.owner',
					width: 32,
					scopedSlots: {
						customRender: 'lock-icon',
					},
				}, {
					dataIndex: 'build',
					width: 32,
					scopedSlots: {
						customRender: 'build-icon',
					},
					filters: [
						{ value: 'free', text: "Free" },
						{ value: 'building', text: "Building" },
						{ value: 'locked', text: "Reserved" },
						...lockers.map<ColumnFilterItem>(name => ({
							value: `locked:${name}`,
							text: `Reserved by ${name}`,
						})),
					],
					onFilter: (name: string, device: AnnotatedDevice) => {
						switch(name) {
							case 'locked': return (device.lock !== undefined);
							case 'building': return (device.build !== undefined);
							case 'free': return (device.lock === undefined && device.build === undefined);
							default:
								const parts = name.split(':', 2);
								if(parts.length == 2 && parts[0] == 'locked') {
									return (device.lock?.owner === parts[1]);
								}
								throw new Error(`Bad filter: ${name}`);
						}
					},
				}, {
					title: 'Name',
					dataIndex: 'name',
					sorter: (a: AnnotatedDevice, b: AnnotatedDevice) => compareStrings(a.name, b.name),
					defaultSortOrder: 'ascend',
				}, {
					title: 'Tags',
					dataIndex: 'tags',
					filters: tags.map(name => ({
						text: name,
						value: name,
					})),
					onFilter: (name: string, device: AnnotatedDevice) => device.tags.some(tag => tag.name === name),
					scopedSlots: {
						customRender: 'tags',
					},
				}, {
					title: 'Connections',
					dataIndex: 'connections',
					filters: [...connections.entries()].map(([host, name]) => ({
						text: `${name} (${host})`,
						value: host,
					})).sort((a, b) => compareStrings(a.text, b.text)),
					onFilter: (host: string, device: AnnotatedDevice) => device.connections.some(conn => conn.host === host),
					//@ts-ignore The type info on this is super wrong
					customCell: _ => ({
						class: 'connections-cell',
					}),
					scopedSlots: {
						customRender: 'connections',
					},
				}, {
					title: 'Description',
					dataIndex: 'description',
					width: 400,
					// ellipsis: true,
					scopedSlots: {
						customRender: 'description',
					},
				}, {
					title: 'Server',
					dataIndex: 'remoteInfo',
					sorter: (a: AnnotatedDevice, b: AnnotatedDevice) => compareStrings(a.remoteInfo?.name, b.remoteInfo?.name, 'first'),
					filters: servers.map(server => ({
						text: server,
						value: server,
					})).sort(),
					onFilter: (name: string, device: AnnotatedDevice) => (device.remoteInfo?.name ?? 'Local') === name,
					scopedSlots: {
						customRender: 'remote',
					},
				}];
				if(!this.anyRemoteDevices) {
					rtn.splice(rtn.findIndex(col => col.title === 'Server'), 1);
				}
				return rtn;
			},
			nodesColumns(): AntTableColumn[] {
				return [{
					title: 'Node',
					dataIndex: 'name',
					sorter: (a: Node, b: Node) => compareStrings(a.name, b.name),
				}, {
					title: 'Serial Port',
					dataIndex: 'path',
					//@ts-ignore 'path' isn't in Node's interface
					sorter: (a: Node, b: Node) => compareStrings(a.path, b.path),
				}, {
					title: 'TCP Port',
					dataIndex: 'tcpPort',
					sorter: (a: Node, b: Node) => a.tcpPort - b.tcpPort,
				}];
			},
			connectionsColumns(): { [K: string]: AntTableColumn[] } {
				type Connection = AnnotatedDevice['connections'][number];
				const rtn: { [K: string]: AntTableColumn[] } = {};
				for(const device of this.annotatedDevices) {
					rtn[device.name] = [{
						title: 'User',
						dataIndex: 'name',
						width: 100,
						sorter: (a: Connection, b: Connection) => compareStrings(a.name, b.name),
						defaultSortOrder: 'ascend',
						scopedSlots: {
							customRender: 'user',
						},
					}, {
						title: 'Host',
						dataIndex: 'host',
						width: 100,
						sorter: (a: Connection, b: Connection) => compareStrings(a.host, b.host),
					}, {
						title: 'Nodes',
						dataIndex: 'nodes',
						width: 100,
						filters: [
							{ text: 'Web', value: 'Web' },
							...device.nodes.map(node => ({
								text: node.name,
								value: node.name,
							}))
						],
						onFilter: (name: string, conn: Connection) => conn.nodes.indexOf(name) >= 0,
						scopedSlots: {
							customRender: 'nodes',
						},
					}];
				}
				return rtn;
			},
			annotatedDevices(): AnnotatedDevice[] {
				return (this.devices.state === 'resolved') ? this.devices.value.filter(device => !isErrorDevice(device)).map(device => ({
					...device,
					connections: [...getDeviceConnections(device)],
				})) : [];
			},
			deviceErrors(): { title: string; description: string; }[] {
				if(this.devices.state !== 'resolved') {
					return [];
				}
				return this.devices.value.filter(isErrorDevice).map(device => ({
					title: device.name,
					description: device.description ?? 'Unknown error',
				 }));
			},
			anyRemoteDevices(): boolean {
				return (this.devices.state === 'resolved' && this.devices.value.some(device => device.remoteInfo));
			},
			userFormFeedback(): any {
				return makeFormFeedback(this.changeUserInfo);
			},
			jenkinsFormFeedback(): any {
				return makeFormFeedback(this.changeJenkinsKey);
			},
			clipboardAvailable(): true | 'http' | 'missing' {
				return navigator.clipboard ? true : (location.protocol !== 'https:') ? 'http' : 'missing';
			},
		},
		data() {
			const app = this.$root.$data.app as Application<Services>;
			const nodeLinkHandler = {
				app: '',
				nameFormat: 'device-node-name',
				keyPath: '',
				puttyPath: defaultPuttyPath,
			};
			{
				const nlhStr = localStorage.getItem('node-link-handler');
				const nlh: NodeLinkHandler = nlhStr ? JSON.parse(nlhStr) : { app: null };
				nodeLinkHandler.app = nlh.app ?? 'none';
				if(nlh.app == 'mobaxterm') {
					nodeLinkHandler.nameFormat = nlh.nameFormat;
					nodeLinkHandler.keyPath = nlh.keyPath ?? '';
				}
			}

			return {
				version: unwrapPromise(app.service('api/config').get('version')),
				locking: [] as string[], // Contains names of devices currently trying to acquire a Jenkins lock
				changelog: { // This is updated by a watch instead of being computed so we can manually zero newCount
					entries: [],
					newCount: 0,
				} as Changelog,

				usersConfig: unwrapPromise(app.service('api/config').get('users')),
				currentUser: unwrapPromise(app.service('api/users').get('self')),
				changeUserInfo: undefined as PromiseResult<any> | undefined,

				jenkinsConfig: unwrapPromise(app.service('api/config').get('jenkins')),
				jenkinsForm: {
					username: localStorage.getItem('jenkins-username') ?? '',
					key: localStorage.getItem('jenkins-key') ?? '',
				},
				changeJenkinsKey: undefined as PromiseResult<any> | undefined,

				nodeLinkHandler,
				puttyBatFile: batFile(),

				savedFilters: JSON.parse(localStorage.getItem('home-saved-filters') ?? '[]') as SavedFilter[],
				tableFiltered: false,
				newFilter: {
					visible: false,
					name: '',
				},
			};
		},
		async mounted() {
			await this.$nextTick();
			const tbl = this.tbl();
			const defaultSort = {
				column: tbl.sSortColumn?.dataIndex,
				order: tbl.sSortOrder,
			};
			const check = () => {
				this.tableFiltered = (Object.keys(tbl.sFilters).some(k => tbl.sFilters[k].length > 0)) || (tbl.sSortColumn?.dataIndex !== defaultSort.column) || (tbl.sSortOrder !== defaultSort.order);
				window.location.hash = this.tableFiltered ? this.makeFilterPermalinkHash() : '';
			};
			tbl.$watch('sFilters', check);
			tbl.$watch('sSortColumn', check);
			tbl.$watch('sSortOrder', check);

			if([ 'devices', 'tags' ].some(n => window.location.hash.startsWith(`#${n}=`))) {
				const filter = deserializeFilter(window.location.hash);
				if(filter) {
					this.applyFilter(filter);
					check();
				} else {
					this.$error({
						title: 'Loading filter failed',
						content: 'Unable to decode filter included in URL',
					});
				}
			}

			const self = this;
			commandPalette.addProvider('home', function*() {
				if(self.tableFiltered) {
					yield {
						value: 'home.current-filter.save',
						text: [ 'Home', 'Filters', 'Save current filter' ],
						handler: () => self.saveFilter(),
					};
					yield {
						value: 'home.current-filter.clear',
						text: [ 'Home', 'Filters', 'Clear current filter' ],
						handler: () => self.clearFilter(),
					};
				}
				for(const filter of self.savedFilters) {
					yield {
						value: `home.saved-filter.${filter.name}.apply`,
						text: [ 'Home', 'Filters', filter.name, 'Apply' ],
						handler: () => self.applyFilter(filter),
					};
					yield {
						value: `home.saved-filter.${filter.name}.remove`,
						text: [ 'Home', 'Filters', filter.name, 'Remove' ],
						handler: () => self.removeFilter(filter),
					};
				}
			});
		},
		watch: {
			version: {
				handler() {
					const seenKeys = new Set<string>(JSON.parse(localStorage.getItem('changelog.seen') ?? '[]'));
					if(this.version.state === 'resolved' && this.version.value.changelog) {
						for(const key of this.version.value.changelog) {
							const seen = seenKeys.has(key);
							this.changelog.entries.push({ key, seen });
							if(!seen) {
								this.changelog.newCount++;
							}
						}
					}
				},
				deep: true,
			},
		},
		methods: {
			tbl(): AntTable {
				// The 'table' ref is an ATable. Its only child is a Table.
				// Making this a computed prop doesn't work because $refs isn't reactive
				return (this.$refs.table as Vue).$children[0] as AntTable;
			},
			followLink(url: string, newTab: boolean = false) {
				if(newTab) {
					window.open(url, '_blank');
				} else {
					window.location.assign(url);
				}
			},
			loadDevice(device: DeviceJson, newTab: boolean = false) {
				this.followLink(getDeviceUrl(device, 'device'), newTab);
			},
			manageDevice(device: DeviceJson, newTab: boolean = false) {
				this.followLink(getDeviceUrl(device, 'manage'), newTab);
			},
			customRow(device: AnnotatedDevice) {
				return {
					on: {
						click: () => this.loadDevice(device),
						mousedown: (e: MouseEvent) => {
							if(e.button == 1) {
								this.loadDevice(device, true);
							}
						},
					},
				};
			},
			tabSwitched(key: string) {
				switch(key) {
					case 'changelog':
						if(this.changelog.newCount) {
							const seenKeys: string[] = JSON.parse(localStorage.getItem('changelog.seen') ?? '[]');
							for(const { key, seen } of this.changelog.entries) {
								if(!seen && !seenKeys.includes(key)) {
									seenKeys.push(key);
								}
							}
							localStorage.setItem('changelog.seen', JSON.stringify(seenKeys));
							this.changelog.newCount = 0;
						}
						break;
				}
			},
			async puttyManualSetupToggle(key: string[]) {
				if(key.indexOf('putty-manual-setup') >= 0) {
					await this.$nextTick();
					const code = this.$refs['putty-batch-file'] as HTMLElement;
					if(code) {
						Prism.highlightElement(code);
					}
				}
			},
			applyFilter(saved_filter: SavedFilter) {
				this.clearFilter();
				const tbl = this.tbl();
				const { sort, filters } = saved_filter;
				for(const filter of filters) {
					tbl.sFilters[filter.column] = [...filter.values];
				}
				if(sort) {
					tbl.sSortColumn = tbl.columns.find(col => col.dataIndex === sort.column) ?? null;
					tbl.sSortOrder = tbl.sSortColumn ? sort.order : undefined;
				}
			},
			toggleTagInFilter(tag: string) {
				const filter = makeFilter('', this.tbl());
				const tag_filter = filter.filters.find(f => f.column === 'tags');
				if(tag_filter) {
					const idx = tag_filter.values.indexOf(tag);
					if(idx >= 0) {
						tag_filter.values.splice(idx, 1);
					} else {
						tag_filter.values.push(tag);
					}
				} else {
					filter.filters.push({
						column: 'tags',
						values: [ tag ],
					});
				}
				this.applyFilter(filter);
			},
			clearFilter() {
				const tbl = this.tbl();
				for(const k of Object.keys(tbl.sFilters)) {
					tbl.$delete(tbl.sFilters, k);
				}
				tbl.sSortColumn = tbl.columns.find(col => col.defaultSortOrder !== undefined) ?? null;
				tbl.sSortOrder = tbl.sSortColumn?.defaultSortOrder;
			},
			saveFilter() {
				if(!this.newFilter.visible) {
					this.newFilter.name = '';
					this.newFilter.visible = true;
					return;
				}
				const name = this.newFilter.name.trim();
				if(name.length == 0) {
					throw new Error("Filter name can't be empty");
				}
				const filter = makeFilter(name, this.tbl());
				this.savedFilters.push(filter);
				localStorage.setItem('home-saved-filters', JSON.stringify(this.savedFilters));
			},
			removeFilter(filter: SavedFilter) {
				const idx = this.savedFilters.indexOf(filter);
				this.savedFilters.splice(idx, 1);
				localStorage.setItem('home-saved-filters', JSON.stringify(this.savedFilters));
			},
			makeFilterPermalinkHash() {
				return serializeFilter(makeFilter('', this.tbl()));
			},
			async acquireLock(device: AnnotatedDevice) {
				if(this.locking.indexOf(device.name) == -1) {
					this.locking.push(device.name);
					await this.$nextTick();
					const lockComp = this.$refs[`lock-${device.name}`] as SbLockVue | undefined;
					if(lockComp) {
						lockComp.$once('close', () => {
							const idx = this.locking.indexOf(device.name);
							if(idx >= 0) {
								this.locking.splice(idx, 1);
							}
						})
					}
				}
			},
			releaseLock(device: AnnotatedDevice) {
				const lockComp = this.$refs[`lock-${device.name}`] as SbLockVue | undefined;
				if(lockComp) {
					lockComp.release();
				}
			},
			updateUser() {
				if(this.currentUser.state == 'resolved') {
					this.changeUserInfo = unwrapPromise(this.app.service('api/users').patch('self', this.currentUser.value));
				}
			},
			updateJenkins() {
				const { username, key } = this.jenkinsForm;
				this.changeJenkinsKey = unwrapPromise(this.app.service('api/deviceLock').patch(null, {
					action: 'test',
					username,
					key,
				}).then(() => {
					localStorage.setItem('jenkins-username', username);
					localStorage.setItem('jenkins-key', key);
				}));
			},
			updateNodeLinkHandler() {
				const serialize = ((): NodeLinkHandler => {
					switch(this.nodeLinkHandler.app) {
						case 'none':
							return {
								app: null,
							};
						case 'putty':
							return {
								app: 'putty',
							};
						case 'mobaxterm':
							return {
								app: 'mobaxterm',
								nameFormat: this.nodeLinkHandler.nameFormat as any,
								keyPath: this.nodeLinkHandler.keyPath || undefined,
							};
					}
					throw new Error("Bad node link handler");
				})();
				localStorage.setItem('node-link-handler', JSON.stringify(serialize));
				this.$message.success({
					content: "Client preferences saved",
					duration: 3,
				});
			},
			async testClipboard() {
				try {
					await navigator.clipboard.readText();
					// Skip this because the user allowing the clipboard permission defocuses the document
					// await navigator.clipboard.writeText("Test text from Serial Bridge");
					this.$message.success({
						content: "Serial Bridge has access to your clipboard.",
						duration: 3,
					});
				} catch(e) {
					this.$message.error({
						content: "Failed to interact with your clipboard. Check the site permissions in your browser.",
						duration: 5,
					});
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	.home {
		height: 100%;
	}

	main {
		outline-width: 0;
		padding-bottom: 16px + 10px + 10px;
	}

	h1:not(:first-child) {
		margin-top: 3rem;
	}

	.ant-alert + h1 {
		margin-top: 0;
	}

	.ant-alert {
		margin: 5px 0;
	}

	h4 {
		font-weight: bold;
	}

	.table-filter-controls {
		margin-bottom: 10px;

		.fa-filter {
			margin-right: 8px;
		}

		.ant-tag {
			cursor: pointer;
		}
	}

	.devices {
		/deep/ tbody tr.ant-table-row {
			&:hover {
				cursor: pointer;
			}

			&.busy {
				background-color: #fff1f0;
			}
		}

		/deep/ .connections-cell {
			// padding: 0;
			position: relative;
		}

		.icons {
			> i:not(:first-child) {
				margin-left: 5px;
			}
		}

		.connections {
			position: absolute;
			top: 12px;
		}

		.description {
			margin-bottom: 5px;

			&:not(:hover) {
				// Support for these is iffy, but worst case we just show the whole description all the time
				display: -webkit-box;
				-webkit-box-orient: vertical;
				-webkit-line-clamp: 1;
				overflow: hidden;
			}
		}

		/deep/ .ant-table-expanded-row .cards {
			display: flex;
			flex-wrap: nowrap;
			margin: -15px 0;
			margin-bottom: 1rem;

			.ant-card {
				flex-grow: 1;
			}
		}

		.connections-table {
			/deep/ td {
				vertical-align: top;
			}
			.user {
				span {
					margin-left: 4px;
				}
				white-space: nowrap;
			}
			.ant-tag {
				margin-bottom: 2px;
			}
		}

		.jenkins-card {
			.jenkins {
				// padding: 0;
				overflow: visible;
				line-height: 1.25;
			}
			.unlocked, .nolock {
				color: #001529;
				margin: 5px 0;
				padding: 0 10px;
			}
			/deep/ .ant-card-body i:not(.ant-spin-dot-item) {
				// Align with the link from the Jenkins box below this one
				margin-right: 10px;
				width: 14px;
			}
		}
	}

	.node-link-handler {
		display: block;
		margin: 10px;

		/deep/ .ant-radio-wrapper {
			display: block;

			+ * {
				margin-left: 25px;

				ul {
					margin-top: 10px;
				}

				.ant-select, .ant-input {
					margin: 10px 0;
					width: 400px;
				}
			}
		}

		/deep/ .ant-radio + * {
			font-weight: bold;
		}
	}

	form {
		margin: 10px 0;

		> * {
			margin-left: 10px;
		}

		/deep/ input[type=text], /deep/ input[type=password] {
			width: 400px;
		}
	}

	.device-tag {
		cursor: pointer;
	}

	footer {
		position: absolute;
		bottom: 10px;
		height: 26px;
		right: 10px;
		padding-top: 10px;
		font-size: smaller;
		color: #d9d9d9;
		a {
			color: inherit;
		}
	}
</style>
