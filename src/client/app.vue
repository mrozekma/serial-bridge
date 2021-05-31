<template>
	<div class="app">
		<template v-if="error">
			<sb-navbar/>
			<main>
				<a-alert type="error" message="Bad route" :description="error" showIcon/>
			</main>
		</template>
		<component v-else :is="view" v-bind="props"/>
		<sb-command-palette v-if="showPalette" @close="showPalette = false" />
	</div>
</template>

<script lang="ts">
	import Vue, { VueConstructor } from 'vue';

	import Antd from 'ant-design-vue';
	Vue.use(Antd);
	import 'ant-design-vue/dist/antd.css';

	import VueMeta from 'vue-meta';
	Vue.use(VueMeta);

	// I ended up using FontAwesome Pro, which I have a license for, but using the pro NPM registry would make it impossible for anyone else to build Serial Bridge from source.
	// Instead I downloaded the files and put them in public/fontawesome; the CSS is pulled into the page via public/index.html.
	// import '@fortawesome/fontawesome-free';
	// import '@fortawesome/fontawesome-free/css/all.css';

	import 'animate.css/animate.css';

	import hotkeys from 'hotkeys-js';

	import { rootDataComputeds } from './root-data';
	import { getDeviceUrl } from './device-functions';
	import commandPalette from './command-palette';

	// I'm avoiding a SPA here because it's convenient to start fresh when switching devices, so this is essentially a manual basic vue-router
	import SbNavbar from './components/navbar.vue';
	import SbCommandPalette from './components/command-palette.vue';
	import HomeView from './views/home.vue';
	import DeviceView from './views/device.vue';
	import ManageView from './views/manage.vue';
	import PortsView from './views/ports.vue';
	import PortsFindView from './views/ports-find.vue';
	export default Vue.extend({
		components: { SbNavbar, SbCommandPalette },
		computed: {
			...rootDataComputeds(),
		},
		data() {
			let view: VueConstructor<Vue> | undefined = undefined;
			let props = {};
			let error: string | undefined = undefined;

			const path = window.location.pathname.replace(/\/$/, '');
			const m = path.match(/^\/devices\/([^/]+)(\/manage)?$/);
			if(path == '') {
				view = HomeView;
			} else if(m) {
				view = m[2] ? ManageView : DeviceView;
				props = {
					id: m[1],
				};
			} else if(path == '/ports') {
				view = PortsView;
			} else if(path == '/ports/find') {
				view = PortsFindView;
			} else {
				error = `No view for route: ${path}`;
			}

			return {
				view, props, error,
				showPalette: false,
			};
		},
		mounted() {
			hotkeys('ctrl+shift+p', e => {
				e.preventDefault();
				this.showPalette = true;
			});
			const self = this;
			commandPalette.addProvider('app', function*() {
				yield {
					value: 'home',
					text: 'Home',
					handler: () => window.location.assign('/'),
				};
				if(self.devices.state === 'resolved') {
					for(const device of self.devices.value) {
						yield {
							value: `devices.${device.id}.open`,
							text: [ 'Device', device.name, 'Open' ],
							handler: () => window.location.assign(getDeviceUrl(device, 'device')),
						};
						yield {
							value: `devices.${device.id}.manage`,
							text: [ 'Device', device.name, 'Manage' ],
							handler: () => window.location.assign(getDeviceUrl(device, 'manage')),
						};
					}
				}
				// These are after the devices because they're rarely needed
				yield {
					value: 'full-port-list',
					text: 'Full port list',
					handler: () => window.location.assign('/ports'),
				};
				yield {
					value: 'find-ports',
					text: 'Find ports',
					handler: () => window.location.assign('/ports/find'),
				};
			});
		},
	});
</script>

<style lang="less">
	* {
		transition-duration: 0ms !important;
	}

	.app {
		position: relative;
		min-height: 100%;
	}

	main {
		padding: 5px;
	}

	.ant-card {
		margin: 15px;
		width: 300px;

		.ant-card-head {
			min-height: 0;
			padding: 5px 10px;

			.ant-card-head-title {
				padding: 0;
			}

			.ant-card-extra {
				padding: 0;
			}
		}

		.ant-card-body {
			padding: 5px 10px;

			h4:not(:first-child) {
				margin-top: 10px;
			}

			// Not sure why timelines have such a large gap after them
			.ant-timeline + h4 {
				margin-top: -25px;
			}

			i:not(.ant-spin-dot-item) {
				margin-right: 5px;
			}
		}

		.ant-timeline {
			position: relative;
			top: 10px;
			left: 5px;

			.ant-timeline-item-content {
				margin-left: 24px;
			}
		}

		.ant-table-wrapper {
			margin: 5px 0;

			tr th {
				font-weight: bold;
			}
		}
	}

	.ant-avatar-sm i.anticon-user {
		margin-right: 0;
	}
</style>
