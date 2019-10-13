<template>
	<div>
		<sb-navbar></sb-navbar>
		<main>
			<h1>Devices</h1>
			<a-alert v-if="devices.state == 'rejected'" type="error" message="Failed to load devices" :description="devices.error.message" showIcon/>
			<div v-else class="devices">
				<template v-if="devices.state == 'pending'">
					<a-card v-for="i in 3" :key="i" :loading="true">.</a-card>
				</template>
				<template v-else>
					<a-card v-for="{ device, connections } in annotatedDevices" :key="device.name" :title="device.name" hoverable @click="loadDevice(device)" @click.middle="loadDevice(device, true)">
						<template v-if="connections.length > 0">
							<b>Connections</b>
							<a-timeline>
								<a-timeline-item v-for="connection in connections" :key="connection.key">
									<template slot="dot">
										<a-avatar v-if="connection.gravatar" shape="square" size="small" :src="connection.gravatar"/>
										<a-avatar v-else shape="square" size="small" icon="user"/>
									</template>
									{{ connection.name }} <a-tag v-for="node in connection.nodes" :key="node">{{ node }}</a-tag>
								</a-timeline-item>
							</a-timeline>
						</template>
						<template>
							<b>Ports</b>
							<a-table :columns="nodesColumns" :dataSource="device.nodes" size="small" :pagination="false"/>
						</template>
					</a-card>
				</template>
			</div>

			<h1>Setup</h1>
			Some terminal windows have <i class="fas fa-external-link-alt"></i> and/or <i class="fas fa-terminal"></i> icons to open telnet, raw TCP, and SSH connections. To customize which application handles the links:
			<ul>
				<li>For telnet links, edit the <code>HKEY_LOCAL_MACHINE\SOFTWARE\Classes\telnet\shell\open\command</code> registry key and set the default value to <code>"&lt;Application path&gt;" %l</code>. For example, <code>"C:\Program Files (x86)\PuTTY\putty.exe" %l</code>.</li>
				<li>For raw and SSH links (this requires Putty):
					<ul>
						<li>Create a batch file that will receive the URI and pass the arguments to Putty:
							<!-- TODO -->
							<pre><code class="language-batch line-numbers">@echo TODO</code></pre>
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
			If easier, you can enter the path to the application here to generate the registry files and batch script (this assumes you're using Putty and that you'll put the batch script in Putty's directory; modify the generated files as necessary):
			<!-- TODO
			<form method="post" action="/generate-reg">
				<input type="text" name="app_path" :value="defaultPuttyPath">
				<button type="submit">Generate</button>
			</form>
			-->
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import { DeviceJson } from '@/services';

	import Prism from 'prismjs';
	// Prism is getting confused by the parentheses in "Program Files (x86)" and styling "x86" as a keyword, so this hack works around it by adding an earlier token for that whole string
	Prism.languages.insertBefore('batch', 'command', { programFiles: /Program Files \(x86\)/ }, Prism.languages);

	interface Connection {
		key: string;
		nodes: string[];
		name: string;
		gravatar: string | undefined;
	}

	interface AnnotatedDevice {
		device: DeviceJson;
		connections: Connection[];
	}

	function getDeviceConnections(device: DeviceJson): IterableIterator<Connection> {
		const connectionsByHost = new Map<string, Connection>();
		for(const { user } of device.webConnections) {
			if(!connectionsByHost.has(user.host)) {
				connectionsByHost.set(user.host, {
					key: user.host,
					nodes: [ 'Web' ],
					name: user.displayName,
					gravatar: user.gravatar,
				});
			}
		}
		for(const node of device.nodes) {
			for(const { user } of node.tcpConnections) {
				let connection = connectionsByHost.get(user.host);
				if(!connection) {
					connectionsByHost.set(user.host, connection = {
						key: user.host,
						nodes: [],
						name: user.displayName,
						gravatar: user.gravatar,
					});
				}
				connection.nodes.push(node.name);
			}
		}
		return connectionsByHost.values();
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
	import { rootDataComputeds } from '../root-data';
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
		},
		data() {
			return {
				nodesColumns,
			};
		},
		mounted() {
			// Should this be in the root component instead?
			this.app.service('api/devices').on('updated', (data: { device: DeviceJson }) => {
				if(this.devices.state == 'resolved') {
					const idx = this.devices.value.findIndex(device => device.id == data.device.id);
					if(idx >= 0) {
						this.$set(this.devices.value, idx, data.device);
					}
				}
			});
		},
		methods: {
			loadDevice(device: DeviceJson, newTab: boolean = false) {
				if(newTab) {
					window.open(`/devices/${device.id}`, '_blank');
				} else {
					window.location.assign(`/devices/${device.id}`);
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	h1:not(:first-child) {
		margin-top: 3rem;
	}

	.devices {
		display: flex;
		flex-wrap: wrap;
		margin: -15px 0;

		> .ant-card {
			margin: 15px;
			width: 300px;

			/deep/ .ant-card-head {
				min-height: 0;
				padding: 5px 10px;

				.ant-card-head-title {
					padding: 0;
				}
			}

			/deep/ .ant-card-body {
				padding: 5px 10px;
			}

			.ant-timeline {
				position: relative;
				top: 10px;
				left: 5px;

				/deep/ .ant-timeline-item-content {
					margin-left: 24px;
				}
			}

			.ant-table-wrapper {
				margin-top: 5px;

				/deep/ tr th {
					font-weight: bold;
				}
			}
		}
	}

	form input[type=text] {
		width: 400px;
	}
</style>
