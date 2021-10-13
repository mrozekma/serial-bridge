import Vue from 'vue';
import feathers from '@feathersjs/feathers';
import socketio from '@feathersjs/socketio-client';
import io from 'socket.io-client';
import {} from 'ant-design-vue/types/notification';

import { ClientServices as Services, DeviceJson } from '../services';

export function makeFeathersApp(rootUrl?: string | undefined): {
	app: feathers.Application<Services>;
	socket: SocketIOClient.Socket;
 } {
	if(!rootUrl) {
		if(window.location.hostname.endsWith('.githubpreview.dev')) {
			rootUrl = window.location.protocol + '//' + window.location.host.replace(/-[0-9]+\.githubpreview\.dev$/, `-${process.env.VUE_APP_SERVER_PORT}.githubpreview.dev`);
		} else {
			rootUrl = window.location.protocol + '//' + (process.env.VUE_APP_SERVER_PORT ? `${window.location.hostname}:${process.env.VUE_APP_SERVER_PORT}` : window.location.host);
		}
		rootUrl += `?pathname=${window.location.pathname}`;
	}
	const app = feathers<Services>();
	const socket = io(rootUrl);
	app.configure(socketio(socket));
	return { app, socket };
}

const { app, socket } = makeFeathersApp();
export const appName = 'Serial Bridge';

export type PromiseResult<T> = {
	state: 'pending';
} | {
	state: 'resolved';
	value: T;
} | {
	state: 'rejected';
	error: Error;
}

export function unwrapPromise<T>(promise: Promise<T>): PromiseResult<T> {
	const result = {
		state: 'pending',
		value: undefined as T | undefined,
		error: undefined as Error | undefined,
	};
	promise.then(value => {
		result.value = value;
		result.state = 'resolved';
	}).catch(err => {
		result.error = err;
		result.state = 'rejected';
	});
	return result as PromiseResult<T>;
}

const devices: Promise<DeviceJson[]> = app.service('api/devices').find();

const data = {
	app,
	socket,
	connected: true,
	devices: unwrapPromise(devices),
};

type RootData = typeof data;
export function rootDataComputeds(): {
	[K in keyof RootData]: {
		get: (this: Vue) => RootData[K],
		set: (this: Vue, val: RootData[K]) => void,
	}
} {
	const rtn: any = {};
	for(const k in data) {
		rtn[k] = {
			get(this: Vue) {
				return this.$root.$data[k];
			},
			set(this: Vue, val: any) {
				this.$root.$data[k] = val;
			},
		};
	}
	return rtn;
}

export function rootDataUpdater(this: Vue) {
	const rootData = this.$data as RootData;

	// Initially connected is set to true to avoid a flash of disconnected errors on page load
	// After a couple seconds, set it false if the socket still isn't connected
	const timeout = setTimeout(() => rootData.connected = false, 2000);
	socket.once('connect', () => clearTimeout(timeout));
	socket.on('connect', () => rootData.connected = true);
	socket.on('disconnect', () => rootData.connected = false);

	// Tell the user when the build has changed
	let version: any = undefined;
	let notice: string | undefined | null = undefined; // undefined means we're just coming up, versus null meaning there is no notice
	socket.on('connect', async () => {
		const newVersion = await rootData.app.service('api/config').get('version');
		if(newVersion.notice) {
			if(version !== undefined && newVersion.notice !== notice) {
				this.$notification.close('notice');
				this.$notification.info({
					key: 'notice',
					duration: 0,
					placement: 'bottomRight',
					message: "Server Notice",
					description: newVersion.notice,
					onClick: () => {
						this.$notification.close('notice');
					},
				});
			}
			notice = newVersion.notice;
			delete newVersion.notice;
		} else {
			notice = null;
		}
		if(version && JSON.stringify(version) != JSON.stringify(newVersion)) {
			this.$notification.close('version');
			let userClosed = false;
			this.$notification.info({
				key: 'version',
				duration: 0,
				placement: 'bottomRight',
				message: "New Version",
				description: "A new version of Serial Bridge is available. Click here to refresh the page.",
				onClick() {
					if(!userClosed) {
						window.location.reload();
					}
				},
				onClose(e: any) {
					// onClick() still gets called when the user clicks the close button, but onClose() gets called first
					userClosed = true;
				}
			});
		}
		version = newVersion;
	});

	rootData.app.service('api/devices').on('updated', (data: { device: DeviceJson }) => {
		if(rootData.devices.state == 'resolved') {
			const idx = rootData.devices.value.findIndex(device => device.id == data.device.id && ((device.remoteInfo === undefined && data.device.remoteInfo === undefined) || device.remoteInfo?.name === data.device.remoteInfo?.name));
			if(idx >= 0) {
				this.$set(rootData.devices.value, idx, data.device);
			}
		}
	});
}

export default data;
