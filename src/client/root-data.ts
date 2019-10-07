import Vue from 'vue';
import feathers from '@feathersjs/feathers';
import socketio from '@feathersjs/socketio-client';
import io from 'socket.io-client';
import { Services, DeviceJson } from '../services';

const app = feathers<Services>();
const socket = io(window.location.protocol + '//' + (process.env.VUE_APP_SERVER_PORT ? `${window.location.hostname}:${process.env.VUE_APP_SERVER_PORT}` : window.location.host));
app.configure(socketio(socket));

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

const devices: Promise<DeviceJson[]> = app.service('devices').find();

const data = {
	app,
	devices: unwrapPromise(devices),
};

type RootData = typeof data;
export function rootDataComputeds(): { [K in keyof RootData]: (this: Vue) => RootData[K] } {
	const rtn: any = {};
	for(const k in data) {
		rtn[k] = function(this: Vue) {
			return this.$root.$data[k];
		};
	}
	return rtn;
}

export default data;
