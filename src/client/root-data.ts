import Vue from 'vue';
import feathers from '@feathersjs/feathers';
import socketio from '@feathersjs/socketio-client';
import io from 'socket.io-client';
import { ClientServices as Services, DeviceJson } from '../services';

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

const devices: Promise<DeviceJson[]> = app.service('api/devices').find();

const data = {
	app,
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

export default data;
