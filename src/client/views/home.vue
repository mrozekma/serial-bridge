<template>
	<div>
		<sb-navbar/>
		<main>
			<h1>Devices</h1>
			<a-alert v-if="devices.state == 'rejected'" type="error" message="Failed to load devices" :description="devices.error.message" showIcon/>
			<div v-else class="devices">
				<template v-if="devices.state == 'pending'">
					<a-card v-for="i in 3" :key="i" :loading="true">.</a-card>
				</template>
				<template v-else>
					<a-card v-for="{ device, connections } in annotatedDevices" :key="device.name" :title="device.name" hoverable @mousedown.left="loadDevice(device)" @mousedown.middle.prevent="loadDevice(device, true)">
						<template v-slot:extra>
							<a-button size="small" @mousedown.left.stop="manageDevice(device)" @mousedown.middle.stop.prevent="manageDevice(device, true)">
								<i class="fas fa-cogs"></i>
							</a-button>
						</template>
						<template v-if="connections.length > 0">
							<h4>Connections</h4>
							<a-timeline>
								<a-timeline-item v-for="connection in connections" :key="connection.host">
									<template slot="dot">
										<a-avatar v-if="connection.avatar" shape="square" size="small" :src="connection.avatar"/>
										<a-avatar v-else shape="square" size="small" icon="user"/>
									</template>
									{{ connection.name }} <a-tag v-for="node in connection.nodes" :key="node">{{ node }}</a-tag>
								</a-timeline-item>
							</a-timeline>
						</template>
						<template>
							<h4>Ports</h4>
							<a-table :columns="nodesColumns" :dataSource="device.nodes" :rowKey="node => node.name" size="small" :pagination="false" :locale="{emptyText: 'None'}"/>
						</template>
						<template v-if="device.jenkinsLockOwner || device.build">
							<h4>Jenkins</h4>
							<div v-if="device.jenkinsLockOwner">
								<i class="fas fa-lock-alt"></i>
								<span>Reserved by {{ device.jenkinsLockOwner }}</span>
							</div>
							<div v-if="device.build">
								<i class="fab fa-jenkins"></i>
								<a v-if="device.build.link" :href="device.build.link" target="_blank">{{ device.build.name }}</a>
								<span v-else>{{ device.build.name }}</span>
							</div>
						</template>
					</a-card>
				</template>
			</div>

			<h1>You</h1>
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
					<a-form-item label="Name" v-bind="formFeedback">
						<a-input v-model="currentUser.value.displayName" @change="changeUserInfo = undefined"/>
					</a-form-item>
					<a-form-item v-if="usersConfig.value.avatarSupport" label="E-mail" v-bind="formFeedback">
						<a-input v-model="currentUser.value.email" @change="changeUserInfo = undefined"/>
					</a-form-item>
					<a-form-item>
						<a-button type="primary" html-type="submit" :disabled="changeUserInfo && changeUserInfo.state == 'pending'">Update</a-button>
					</a-form-item>
				</a-form>
			</template>

			<h1>Setup</h1>
			Some terminal windows have <i class="far fa-external-link-alt"></i> and/or <i class="far fa-terminal"></i> icons to open telnet, raw TCP, and SSH connections. You can enter your Putty path here to generate the necessary registry files and batch script (this assumes that you'll put the batch script in Putty's directory; if not, modify the generated files):
			<form method="get" action="/serial-bridge.zip">
				<a-input type="text" name="path" v-model="puttyPath" placeholder="PuTTY Path"/>
				<a-button type="primary" html-type="submit">Generate</a-button>
			</form>

			To set things up manually:
			<ul>
				<li>For telnet links, edit the <code>HKEY_LOCAL_MACHINE\SOFTWARE\Classes\telnet\shell\open\command</code> registry key and set the default value to <code>"&lt;Application path&gt;" %l</code>. For example, <code>"C:\Program Files (x86)\PuTTY\putty.exe" %l</code>. Any telnet application can be used.</li>
				<li>For raw and SSH links (this requires Putty):
					<ul>
						<li>Create a batch file that will receive the URI and pass the arguments to Putty:
							<pre><code class="language-batch line-numbers">{{ puttyBatFile }}</code></pre>
						</li>
						<li>Create the following registry entries (the <code>HKEY_CLASSES_ROOT\putty</code> key will need to be created):
							<ul>
								<li><code>HKEY_CLASSES_ROOT\putty\URL Protocol</code> = <code>""</code></li>
								<li><code>HKEY_CLASSES_ROOT\putty\shell\open\command\(Default)</code> = <code>"&lt;Batch file&gt;" %1</code></li>
							</ul>
						</li>
					</ul>
				</li>
			</ul>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { Application } from '@feathersjs/feathers';

	import { Connection, getDeviceConnections } from '../connections';
	import { DeviceJson, ClientServices as Services } from '@/services';
	import { batFile, defaultPuttyPath } from '@/server/setup-zip'; // Pure laziness

	import Prism from 'prismjs';
	// Prism is getting confused by the parentheses in "Program Files (x86)" and styling "x86" as a keyword, so this hack works around it by adding an earlier token for that whole string
	Prism.languages.insertBefore('batch', 'command', { programFiles: /Program Files \(x86\)/ }, Prism.languages);

	interface AnnotatedDevice {
		device: DeviceJson;
		connections: Connection[];
	}

	const nodesColumns = [{
		title: 'Name',
		dataIndex: 'name',
		align: 'center',
	}, {
		title: 'Serial Port',
		dataIndex: 'path',
		align: 'center',
	}, {
		title: 'TCP Port',
		dataIndex: 'tcpPort',
		align: 'center',
	}];

	import SbNavbar from '../components/navbar.vue';
	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	export default Vue.extend({
		components: { SbNavbar },
		computed: {
			...rootDataComputeds(),
			annotatedDevices(): AnnotatedDevice[] {
				return (this.devices.state == 'resolved')
					? this.devices.value.map<AnnotatedDevice>(device => ({
						device,
						connections: [...getDeviceConnections(device)],
					}))
					: [];
			},
			formFeedback() {
				const rtn: any = {
					hasFeedback: false,
				};
				if(this.changeUserInfo) {
					rtn.hasFeedback = true;
					switch(this.changeUserInfo.state) {
						case 'pending':
							rtn.validateStatus = 'validating';
							break;
						case 'resolved':
							rtn.validateStatus = 'success';
							break;
						case 'rejected':
							console.error(this.changeUserInfo.error);
							rtn.validateStatus = 'error';
							rtn.help = this.changeUserInfo.error.message;
							break;
					}
				}
				return rtn;
			},
		},
		data() {
			const app = this.$root.$data.app as Application<Services>;
			return {
				nodesColumns,
				usersConfig: unwrapPromise(app.service('api/config').get('users')),
				currentUser: unwrapPromise(app.service('api/users').get('self')),
				changeUserInfo: undefined as PromiseResult<any> | undefined,
				puttyBatFile: batFile(),
				puttyPath: defaultPuttyPath,
			};
		},
		methods: {
			loadDevice(device: DeviceJson, newTab: boolean = false) {
				if(newTab) {
					window.open(`/devices/${device.id}`, '_blank');
				} else {
					window.location.assign(`/devices/${device.id}`);
				}
			},
			manageDevice(device: DeviceJson, newTab: boolean = false) {
				if(newTab) {
					window.open(`/devices/${device.id}/manage`, '_blank');
				} else {
					window.location.assign(`/devices/${device.id}/manage`);
				}
			},
			updateUser() {
				if(this.currentUser.state == 'resolved') {
					this.changeUserInfo = unwrapPromise(this.app.service('api/users').patch('self', this.currentUser.value));
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	h1:not(:first-child) {
		margin-top: 3rem;
	}

	h4 {
		font-weight: bold;
	}

	.devices {
		display: flex;
		flex-wrap: wrap;
		margin: -15px 0;
	}

	form {
		margin: 10px 0;

		> * {
			margin-left: 10px;
		}

		input[type=text] {
			width: 400px;
		}
	}
</style>
