<template>
	<div>
		<sb-navbar></sb-navbar>
		<main>
			<h1>Devices</h1>
			<a-alert v-if="devices.state == 'rejected'" type="error" message="Failed to load devices" :description="devices.error.message" showIcon/>
			<div v-else class="devices">
				<template v-if="devices.state == 'pending'">
					<a-card v-for="i in 3" :key="i" :loading="true">foo</a-card>
				</template>
				<template v-else>
					<a-card v-for="device in devices.value" :key="device.name" :title="device.name" hoverable @click="loadDevice(device)">
						Content
						<template class="ant-card-actions" slot="actions">
							<i class="fas fa-external-link-square-alt"></i>
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

	import SbNavbar from '../components/navbar.vue';
	import { rootDataComputeds } from '../root-data';
	export default Vue.extend({
		components: { SbNavbar },
		computed: {
			...rootDataComputeds(),
		},
		methods: {
			loadDevice(device: DeviceJson) {
				window.location.assign(`/devices/${device.id}`);
			}
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
		// width: calc(100% - 30px);

		> .ant-card {
			margin: 15px;
			width: 250px;
		}
	}

	form input[type=text] {
		width: 400px;
	}
</style>
