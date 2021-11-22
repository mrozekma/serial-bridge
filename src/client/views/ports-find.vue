<template>
	<div>
		<sb-navbar/>
		<main>
			<h1>Find Ports</h1>
			<a-spin v-if="config.state == 'pending'"/>
			<a-alert v-else-if="config.state == 'rejected'" type="error" message="Failed to load configuration data" :description="config.error.message" showIcon/>
			<a-alert v-else-if="!config.value.enabled" type="error" message="Tool disabled" show-icon>
				<template #description>
					The ports find tool is disabled in Serial Bridge's configuration. See the <samp>portsFind.enabled</samp> key in the configuration file.
				</template>
			</a-alert>
			<template v-else>
				<a-steps v-model="step" direction="vertical" @change="stepChange">
					<a-step title="Unplug device" :status="preChooseStatus"/>
					<a-step title="Scan ports" :status="preChooseStatus"/>
					<a-step title="Plug-in device" :status="preChooseStatus" disabled/>
					<a-step title="Choose ports"/>
					<a-step title="Specify patterns"/>
					<a-step title="Open ports"/>
					<a-step title="Listen"/>
					<a-step title="Generate config"/>
				</a-steps>
				<template v-if="step === STEP_UNPLUG">
					<p>If possible, unplug the target device from the computer running Serial Bridge. This will make it easier to identify which ports correspond with this device. Note that powering off the device is generally insufficient, although if the device is routed through a USB hub, powering off the hub may work.</p>
					<div class="actions">
						<a-button type="primary" @click="setStep(STEP_PRESCAN)">Device is unplugged</a-button>
						<a-button type="danger" @click="setStep(STEP_CHOOSE)">Skip unplugging the device</a-button>
					</div>
				</template>
				<template v-else-if="step === STEP_PRESCAN">
					<template v-if="portsBefore === undefined || portsBefore.state === 'pending'">
						<p>Scanning ports...</p>
						<!-- All the ant tables have keys to prevent Vue from reusing them between steps, which causes problems with the custom renderers -->
						<a-table key="portsBefore" :columns="findColumns" :loading="true"/>
					</template>
					<a-alert v-else-if="portsBefore.state === 'rejected'" type="error" message="Failed to scan ports" :description="portsBefore.error.message" showIcon/>
					<template v-else-if="portsBefore.state === 'resolved'">
						<div class="description">
							<p>{{ portsBefore.value.length }} {{ (portsBefore.value.length == 1) ? 'port' : 'ports' }} found (no action required; click Next below to continue):</p>
							<a-table key="portsBefore" :columns="findColumns" :data-source="portsBefore.value" :pagination="false" :scroll="{ y: 600 }" row-key="comName"/>
						</div>
						<div class="actions">
							<a-button type="primary" @click="setStep(STEP_PLUG)">Next</a-button>
							<a-button @click="setStep(STEP_PRESCAN)">Rescan</a-button>
						</div>
					</template>
				</template>
				<template v-else-if="step === STEP_PLUG">
					<p>Now plug-in the target device's serial connections. New ports will be automatically checked in the next step.</p>
					<div class="actions">
						<a-button type="primary" @click="setStep(STEP_CHOOSE)">Device is plugged in</a-button>
					</div>
				</template>
				<template v-else-if="step === STEP_CHOOSE">
					<template v-if="portsAfter === undefined || portsAfter.state === 'pending'">
						<p>Scanning ports...</p>
						<a-table key="portsAfter" :columns="findColumns" :loading="true"/>
					</template>
					<a-alert v-else-if="portsAfter.state === 'rejected'" type="error" message="Failed to scan ports" :description="portsAfter.error.message" showIcon/>
					<template v-else-if="portsAfter.state === 'resolved'">
						<div class="description">
							<p>
								{{ portsAfter.value.length }} {{ (portsAfter.value.length == 1) ? 'port' : 'ports' }} found.
								<template v-if="numNewPorts">
									{{ numNewPorts }} of these appeared after the device was plugged-in, so they are shown and selected.
								</template>
								Select which ports you want to scan for output:
							</p>
							<a-input-search placeholder="Search" enter-button allow-clear @search="val => searchString = val" />
							<a-table key="portsAfter" :columns="findColumns" :data-source="portsAfter.value" :pagination="false" :scroll="{ y: 600 }" row-key="comName" :row-selection="{ selectedRowKeys: selectedPorts, onChange: rowSelectionChange }">
								<template #isNew="text">
									<a-tag v-if="text" color="volcano">New</a-tag>
								</template>
							</a-table>
						</div>
						<div class="actions">
							<a-button type="primary" @click="setStep(STEP_PATTERNS)">Next</a-button>
						</div>
					</template>
				</template>
				<template v-else-if="step === STEP_PATTERNS">
					<div class="description">
						<p>Specify regular expressions that, if seen on a port, likely identify it as a particular node.</p>
						<template v-if="Object.keys(config.value.patterns).length > 0">
							The following pattern sets are available as a starting point:
							<a-select v-model="patternSelectedSet">
								<a-select-option v-for="name in Object.keys(config.value.patterns)" :key="name" :value="name">{{ name }}</a-select-option>
							</a-select>
							<a-button :disabled="patternSelectedSet === undefined" @click="loadPatternSet">Load</a-button>
						</template>
						<a-table key="patterns" :columns="patternColumns" :data-source="patterns" :pagination="false">
							<template #pattern="_, entry">
								<a-form-item
									has-feedback
									:validateStatus="entry.pattern ? 'success' : entry.patternError ? 'error' : ''"
									:help="entry.patternError ? `${entry.patternError}` : ''">
									<a-input placeholder="Regex to search port output for" v-model="entry.patternString" @focus="() => { entry.pattern = undefined; entry.patternError = undefined; }" @blur="validatePattern(entry)"/>
								</a-form-item>
							</template>
							<template #node="_, entry">
								<a-form-item
									has-feedback
									:validateStatus="entry.nodeName != '' ? 'success' : entry.patternString == '' ? undefined : 'error'"
									:help="entry.nodeName != '' ? '' : entry.patternString == '' ? '' : 'Specify the node this pattern matches'">
									<a-input placeholder="Node name to assign to the port matching this regex" v-model="entry.nodeName"/>
								</a-form-item>
							</template>
							<template #buttons="_, entry">
								<a-button type="danger" class="delete-button" @click="removePattern(entry)">Delete</a-button>
							</template>
						</a-table>
					</div>
					<div class="actions">
						<a-button type="primary" @click="setStep(STEP_OPEN)">Next</a-button>
					</div>
				</template>
				<template v-else-if="step === STEP_OPEN">
					<div class="description">
						Specify the expected serial port settings for the target ports:
						<a-form class="two-col">
							<a-form-item label="Baud rate">
								<a-input v-model="portSettings.baudRate"/>
							</a-form-item>
							<a-form-item label="Byte size">
								<a-select v-model="portSettings.byteSize">
									<a-select-option value="5">5</a-select-option>
									<a-select-option value="6">6</a-select-option>
									<a-select-option value="7">7</a-select-option>
									<a-select-option value="8">8</a-select-option>
								</a-select>
							</a-form-item>
							<a-form-item label="Parity">
								<a-select v-model="portSettings.parity">
									<a-select-option value="none">None</a-select-option>
									<a-select-option value="even">Even</a-select-option>
									<a-select-option value="odd">Odd</a-select-option>
								</a-select>
							</a-form-item>
							<a-form-item label="Stop bits">
								<a-select v-model="portSettings.stopBits">
									<a-select-option value="1">1</a-select-option>
									<a-select-option value="2">2</a-select-option>
								</a-select>
							</a-form-item>
						</a-form>
					</div>
					<div class="actions">
						<a-button type="primary" @click="setStep(STEP_LISTEN)">Next</a-button>
					</div>
				</template>
				<template v-else-if="step === STEP_LISTEN">
					<div class="description">
						<p>Now power on the device. Any data received on the selected ports will be displayed below. If one of the specified patterns is seen in the output, the node identification will be set automatically; otherwise if you recognize a port you can identify it manually.</p>
						<a-table key="portsListening" :columns="listenColumns" :data-source="portsListening" :expandedRowKeys="listenTermsVisible" @expand="(expanded, port) => port.termVisible = expanded" :pagination="false" :locale="{ emptyText: 'No ports selected' }" row-key="path">
							<template #port="openPromise">
								<a-badge v-if="openPromise.state === 'pending'" status="default" text="Opening..."/>
								<a-badge v-else-if="openPromise.state === 'rejected'" status="error" :text="openPromise.error.message"/>
								<a-badge v-else-if="openPromise.state === 'resolved'" status="success" text="Open"/>
							</template>
							<template #data="bytesReceived, port">
								<a-badge v-if="port.openPromise.state === 'pending'" status="default" text="Opening..."/>
								<a-badge v-else-if="port.openPromise.state === 'rejected'" status="error" text="Failed"/>
								<a-badge v-else status="processing" :text="bytesReceived ? `${filesize(bytesReceived)} received` : 'No data received'"/>
							</template>
							<template #node="node, port">
								<a-input v-model="port.node.name" @change="port.node.source = 'user'">
									<template v-if="port.node.source === 'pattern'" #suffix>
										<a-tooltip placement="bottom" title="Set automatically from a pattern match">
											<i class="fas fa-star-exclamation"></i>
										</a-tooltip>
									</template>
								</a-input>
							</template>
							<template #expandedRowRender="port">
								<div v-if="port.bytesReceived > 0":ref="`term-${port.path}`" class="term"></div>
								<a-empty v-else description="No data received yet"/>
							</template>
						</a-table>
					</div>
					<div class="actions">
						<a-button type="primary" @click="setStep(STEP_CONFIG)">Next</a-button>
					</div>
				</template>
				<template v-else-if="step === STEP_CONFIG">
					<div class="description">
						<a-table key="portsConfig" :columns="configColumns" :data-source="portsListening" :pagination="false" :locale="{ emptyText: 'No ports selected' }" row-key="path"/>
						<br>
						<p>You can paste the following <samp>nodes</samp> block into the target device's section in the Serial Bridge configuration. Note that there are other optional keys supported by the <samp>nodes</samp> block; see the example configuration file for more details.</p>
						<a-alert v-if="duplicateNodeNames" type="warning" message="Duplicate nodes" description="The same node name has been assigned to multiple serial ports. The generated configuration reflects this assignment, but will need to be fixed." show-icon />
						<pre><code ref="generatedConfig" class="language-json line-numbers">{{ generatedConfig }}</code></pre>
					</div>
					<div class="actions">
						<a-button @click="setStep(STEP_UNPLUG)">Start over</a-button>
						<a-button @click="goHome">Go home</a-button>
					</div>
				</template>
			</template>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';
	import { AntdComponent } from 'ant-design-vue/types/component';
	import { Column } from 'ant-design-vue/types/table/column';
	import { Step } from 'ant-design-vue/types/steps/step';

	import { Application } from '@feathersjs/feathers';
	import { Terminal } from 'xterm';
	import { FitAddon } from 'xterm-addon-fit';
	import 'xterm/css/xterm.css';
	//@ts-ignore No declaration file
	import filesize from 'filesize.js';
	import Prism from 'prismjs';

	import { NativePortJson, ClientServices as Services } from '@/services';
	import { rootDataComputeds, unwrapPromise, PromiseResult } from '../root-data';
	import { compareStrings } from '../device-functions';

	const STEP_UNPLUG = 0, STEP_PRESCAN = 1, STEP_PLUG = 2, STEP_CHOOSE = 3, STEP_PATTERNS = 4, STEP_OPEN = 5, STEP_LISTEN = 6, STEP_CONFIG = 7;
	const textDecoder = new TextDecoder();

	interface NativePortJsonChooseStep extends NativePortJson {
		isNew: boolean;
	}

	interface NodePattern {
		key: number;
		patternString: string;
		pattern: RegExp | undefined;
		patternError: Error | undefined;
		nodeName: string;
	}

	interface ListenPort {
		path: string;
		openPromise: PromiseResult<NativePortJson>;
		terminal: Terminal | undefined;
		termVisible: boolean;
		bytesReceived: number;
		node: {
			name: string;
			source: 'unknown' | 'pattern' | 'user';
		};
	}

	interface PortData {
		path: string;
		data: Buffer;
	}

	// The first column changes depending on if we're actually using it
	const isNewColDisabled: Omit<Column, keyof AntdComponent> = {
		dataIndex: 'isNew',
		width: 0,
		scopedSlots: {
			customRender: 'isNew',
		},
	};
	const isNewColEnabled: Omit<Column, keyof AntdComponent> = {
		...isNewColDisabled,
		width: 75,
		sorter: (a: NativePortJsonChooseStep, b: NativePortJsonChooseStep) => (a.isNew ? -1 : 1) - (b.isNew ? -1 : 1),
		defaultSortOrder: 'ascend',
		filters: [
			{ text: 'New', value: 'new' },
			{ text: 'Existing', value: 'old' },
		],
		onFilter: (value: string, port: NativePortJsonChooseStep) => port.isNew === (value === 'new'),
	};

	const findColumns: Omit<Column, keyof AntdComponent>[] = [
		isNewColDisabled,
		{
			title: 'Path',
			dataIndex: 'comName',
			sorter: (a: NativePortJson, b: NativePortJson) => compareStrings(a.comName, b.comName, 'last'),
			defaultSortOrder: 'ascend',
			// Filtering gets setup in the mounted hook. The filteredValue is needed to get ant-design to call the filtering function
			filteredValue: [''],
		},
		{
			title: 'Manufacturer',
			dataIndex: 'manufacturer',
			sorter: (a: NativePortJson, b: NativePortJson) => compareStrings(a.manufacturer, b.manufacturer, 'last'),
		},
		{
			title: 'Serial Number',
			dataIndex: 'serialNumber',
			sorter: (a: NativePortJson, b: NativePortJson) => compareStrings(a.serialNumber, b.serialNumber, 'last'),
		},
		{
			title: 'Product ID',
			dataIndex: 'productId',
			sorter: (a: NativePortJson, b: NativePortJson) => compareStrings(a.productId, b.productId, 'last'),
		},
		{
			title: 'Vendor ID',
			dataIndex: 'vendorId',
			sorter: (a: NativePortJson, b: NativePortJson) => compareStrings(a.vendorId, b.vendorId, 'last'),
		},
		{
			title: 'PnP ID',
			dataIndex: 'pnpId',
			sorter: (a: NativePortJson, b: NativePortJson) => compareStrings(a.pnpId, b.pnpId, 'last'),
		},
	];

	const patternColumns: Omit<Column, keyof AntdComponent>[] = [
		{
			title: 'Regular Expression',
			dataIndex: 'patternString',
			scopedSlots: {
				customRender: 'pattern',
			},
		},
		{
			title: 'Node',
			dataIndex: 'nodeName',
			scopedSlots: {
				customRender: 'node',
			},
		},
		{
			scopedSlots: {
				customRender: 'buttons',
			},
		},
	];

	const listenColumns: Omit<Column, keyof AntdComponent>[] = [
		{
			title: 'Path',
			dataIndex: 'path',
			sorter: (a: ListenPort, b: ListenPort) => compareStrings(a.path, b.path),
		},
		{
			title: 'Node identification',
			dataIndex: 'node',
			scopedSlots: {
				customRender: 'node',
			},
		},
		{
			title: 'Port',
			dataIndex: 'openPromise',
			scopedSlots: {
				customRender: 'port',
			},
		},
		{
			title: 'Data',
			dataIndex: 'bytesReceived',
			sorter: (a: ListenPort, b: ListenPort) => a.bytesReceived - b.bytesReceived,
			scopedSlots: {
				customRender: 'data',
			},
		},
	];

	const configColumns: Omit<Column, keyof AntdComponent>[] = [
		{
			title: 'Node',
			dataIndex: 'node.name',
			sorter: (a: ListenPort, b: ListenPort) => compareStrings(a.node.name, b.node.name),
		},
		{
			title: 'Port',
			dataIndex: 'path',
			sorter: (a: ListenPort, b: ListenPort) => compareStrings(a.path, b.path),
		},
	];

	import SbNavbar from '../components/navbar.vue';
	export default Vue.extend({
		components: { SbNavbar },
		computed: {
			...rootDataComputeds(),
			app(): Application<Services> {
				return this.$root.$data.app;
			},
			preChooseStatus(): Step['status'] | undefined {
				return (this.step < STEP_CHOOSE) ? undefined : (this.portsBefore === undefined) ? 'error' : 'finish';
			},
			listenTermsVisible(): string[] {
				return this.portsListening.filter(port => port.termVisible).map(port => port.path);
			},
			duplicateNodeNames(): boolean {
				const names = this.portsListening.map(port => port.node.name).filter(name => name != '');
				return names.length > new Set(names).size;
			},
		},
		data() {
			const app = this.$root.$data.app as Application<Services>;
			return {
				step: 0,
				findColumns, patternColumns, listenColumns, configColumns,
				STEP_UNPLUG, STEP_PRESCAN, STEP_PLUG, STEP_CHOOSE, STEP_PATTERNS, STEP_OPEN, STEP_LISTEN, STEP_CONFIG,
				filesize,

				config: unwrapPromise(app.service('api/config').get('portsFind')),
				searchString: '',
				portsBefore: undefined as PromiseResult<NativePortJson[]> | undefined,
				portsAfter: undefined as PromiseResult<NativePortJsonChooseStep[]> | undefined,
				numNewPorts: undefined as number | undefined,
				selectedPorts: [] as string[],
				portsListening: [] as ListenPort[],
				patternSelectedSet: undefined as string | undefined,
				patterns: [] as NodePattern[],
				portSettings: {
					baudRate: '115200',
					byteSize: '8',
					parity: 'none',
					stopBits: '1',
				},
				generatedConfig: '',
				listenTimer: undefined as NodeJS.Timeout | undefined,
			};
		},
		watch: {
			patterns: {
				handler() {
					if(!this.patterns.some(pattern => pattern.patternString == '')) {
						this.patterns.push({
							key: Math.max(0, ...this.patterns.map(pattern => pattern.key)) + 1,
							patternString: '',
							nodeName: '',
							pattern: undefined,
							patternError: undefined,
						});
					}
				},
				deep: true,
				immediate: true,
			},
		},
		async mounted() {
			findColumns[1].onFilter = (value: string, port: NativePortJsonChooseStep) => {
				if(this.searchString == '') {
					return true;
				}
				const seek = this.searchString.toLowerCase();
				const fields: (string | undefined)[] = [ port.comName, port.manufacturer, port.serialNumber, port.productId, port.vendorId ];
				return fields.some(field => field?.toLowerCase().includes(seek));
			};
		},
		methods: {
			onPortData(portData: PortData) {
				const { path, data } = portData;
				if(data.length == 0) {
					return;
				}
				const port = this.portsListening.find(port => port.path === path);
				if(port) {
					port.bytesReceived += data.byteLength;
					if(!port.terminal) {
						const term = port.terminal = new Terminal({
							scrollback: 500,
							rows: 8,
						});
						port.termVisible = true;
						(async() => {
							// Not sure why waiting two ticks is necessary, but it avoids render glitches in the terminal
							await this.$nextTick();
							await this.$nextTick();
							const div = this.$refs[`term-${port.path}`] as HTMLDivElement;
							term.open(div);
							const fitAddon = new FitAddon();
							term.loadAddon(fitAddon);
							fitAddon.fit();
						})();
					}
					port.terminal.write(new Uint8Array(data));
					if(port.node.name == '' && this.patterns.length > 0) {
						const str = textDecoder.decode(data);
						const pat = this.patterns.find(pat => pat.nodeName != '' && pat.pattern?.test(str));
						if(pat) {
							port.node = {
								name: pat.nodeName,
								source: 'pattern',
							};
						}
					}
				}
			},
			setStep(step: number) {
				this.step = step;
				this.stepChange(step);
			},
			async stepChange(step: number) {
				this.clearListeners();
				const portsService = this.app.service('api/ports');

				switch(step) {
					case STEP_UNPLUG:
						this.portsBefore = undefined;
						this.portsAfter = undefined;
						findColumns[0] = isNewColDisabled;
						break;
					case STEP_PRESCAN:
						this.portsBefore = unwrapPromise(portsService.find());
						break;
					case STEP_PLUG:
						break;
					case STEP_CHOOSE:
						this.portsAfter = unwrapPromise((async () => {
							const portsAfter = await portsService.find();
							if(this.portsBefore?.state === 'resolved') {
								const beforeNames = new Set(this.portsBefore.value.map(port => port.comName));
								const rtn = portsAfter.map<NativePortJsonChooseStep>(port => ({
									...port,
									isNew: !beforeNames.has(port.comName),
								}));
								this.selectedPorts = rtn.filter(port => port.isNew).map(port => port.comName);
								this.numNewPorts = this.selectedPorts.length;
								findColumns[0] = this.numNewPorts ? isNewColEnabled : isNewColDisabled;
								return rtn;
							} else {
								this.numNewPorts = undefined;
								this.selectedPorts = [];
								findColumns[0] = isNewColDisabled;
								return portsAfter.map<NativePortJsonChooseStep>(port => ({
									...port,
									isNew: false,
								}));
							}
						})());
						break;
					case STEP_PATTERNS:
						break;
					case STEP_OPEN:
						this.portsListening = [];
						break;
					case STEP_LISTEN: {
						const portSettings = {
							baudRate: parseInt(this.portSettings.baudRate, 10),
							byteSize: parseInt(this.portSettings.byteSize, 10),
							parity: this.portSettings.parity,
							stopBits: parseInt(this.portSettings.stopBits, 10),
						};
						const selected = new Set(this.selectedPorts);
						this.portsListening = this.selectedPorts.map<ListenPort>(path => ({
							path,
							openPromise: unwrapPromise(portsService.patch(path, {
								open: portSettings,
							} as any).catch(e => {
								console.error(e);
								throw e;
							})),
							terminal: undefined,
							termVisible: false,
							bytesReceived: 0,
							node: {
								name: '',
								source: 'unknown',
							},
						}));
						portsService.on('data', this.onPortData);
						this.listenTimer = setInterval(() => {
							this.portsListening.forEach(port => portsService.patch(port.path, {}));
						}, 30000);
						break; }
					case STEP_CONFIG: {
						const portSettings = {
							baudRate: parseInt(this.portSettings.baudRate, 10),
							byteSize: parseInt(this.portSettings.byteSize, 10),
							parity: this.portSettings.parity,
							stop: parseInt(this.portSettings.stopBits, 10),
						};
						const nodes = this.portsListening.filter(port => port.node.name != '').map(port => ({
							name: port.node.name,
							comPort: port.path,
							...portSettings,
							tcpPort: null,
						}));
						this.generatedConfig = 'nodes: ' + JSON.stringify(nodes, undefined, '\t').replace(/null/g, 'TODO');
						await this.$nextTick();
						Prism.highlightElement(this.$refs['generatedConfig'] as Element);
						break; }
				}
			},
			rowSelectionChange(selectedPorts: string[]) {
				this.selectedPorts = selectedPorts;
			},
			loadPatternSet() {
				if(this.config.state !== 'resolved' || !this.patternSelectedSet) {
					throw new Error("Bad state");
				}
				const patterns: any[] = this.config.value.patterns[this.patternSelectedSet];
				// pattern, name
				let key = Math.max(0, ...this.patterns.map(pattern => pattern.key)) + 1;
				this.patterns = patterns.map<NodePattern>(p => ({
					 key: key++,
					 patternString: p.pattern,
					 pattern: undefined,
					 patternError: undefined,
					 nodeName: p.name,
				}));
				this.patterns.forEach(p => this.validatePattern(p));
				this.patternSelectedSet = undefined;
			},
			validatePattern(pattern: NodePattern) {
				if(pattern.patternString == '') {
					pattern.pattern = undefined;
					pattern.patternError = undefined;
				} else {
					try {
						pattern.pattern = new RegExp(pattern.patternString);
					} catch(e: any) {
						pattern.patternError = e as Error;
					}
				}
			},
			removePattern(pattern: NodePattern) {
				this.patterns.splice(this.patterns.indexOf(pattern), 1);
			},
			goHome() {
				window.location.href = '/';
			},
			clearListeners() {
				if(this.listenTimer) {
					clearInterval(this.listenTimer);
					this.listenTimer = undefined;
				}
				this.app.service('api/ports').off('data', this.onPortData);
			},
		},
		beforeDestroy() {
			this.clearListeners();
		},
	});
</script>

<style lang="less" scoped>
	main {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto 1fr;
		grid-template-areas: "title title"
		                     "steps description"
		                     "steps actions";

		h1 {
			grid-area: title;
		}
		.ant-steps {
			grid-area: steps;
			margin: 0 10px;
		}
		.description, > .ant-spin, > .ant-alert {
			grid-area: description;
		}
		p {
			grid-area: description;
			max-width: 1000px;
		}
		/deep/ .ant-table {
			grid-area: description;
			margin-right: 20px;
		}
		.actions {
			grid-area: actions;
			.ant-btn {
				display: block;
				margin-top: 10px;
			}
		}
	}

	.ant-form.two-col {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 5px;
		padding: 5px;
		max-width: 250px;

		.ant-form-item {
			display: contents;

			// Someday I'll probably come to regret this, but not using these currently and they make large empty grid rows in Firefox
			&::before, &::after {
				display: none;
			}

			.ant-form-item-label {
				grid-column: 1;
				font-weight: bold;
				text-align: right;
			}

			.ant-form-item-control-wrapper {
				grid-column: 2;
			}
		}
	}

	.ant-input-search {
		margin-bottom: 10px;
	}

	.ant-select {
		margin: 0 10px;
		width: 150px;
	}

	.delete-button {
		position: relative;
		top: -12px;
	}

	.term {
		/deep/ .xterm {
			padding: 5px;
		}
	}

	samp {
		font-family: 'Courier New', Courier, monospace;
	}
</style>
