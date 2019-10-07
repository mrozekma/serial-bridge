import feathers from '@feathersjs/feathers';

import Device from './server/device';

interface Common {
	// install(app: Application<Services>): void;
	// name: string;
	events?: string[];
}

// https://stackoverflow.com/a/51956054/309308
type KnownKeys<T> = {
	[K in keyof T]: string extends K ? never : number extends K ? never : K
} extends { [_ in keyof T]: infer U } ? U : never;

type MethodNames<T> = Pick<feathers.ServiceMethods<T>, KnownKeys<feathers.ServiceMethods<T>>>;
type M<Chosen extends keyof MethodNames<T>, T = any> = Pick<MethodNames<T>, Chosen>;

export type DeviceJson = ReturnType<Device['toJSON']>;

export interface Services {
	'devices': Common & M<'find' | 'get' | 'update' /*, DeviceJson*/>,
};
