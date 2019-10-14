import feathers from '@feathersjs/feathers';

import Device from './server/device';
import Connections, { User } from './server/connections';
import { Config } from './server/config';

// Variant of feathers.ServiceMethods with some narrower return types
interface ServiceMethods<T> extends feathers.ServiceMethods<T> {
	find(params?: feathers.Params): Promise<T[]>;
	get(id: feathers.Id, params?: feathers.Params): Promise<T>;
	create(data: Partial<T> | Array<Partial<T>>, params?: feathers.Params): Promise<T>;
	update(id: feathers.NullableId, data: T, params?: feathers.Params): Promise<T>;
	patch(id: feathers.NullableId, data: Partial<T>, params?: feathers.Params): Promise<T>;
	remove(id: feathers.NullableId, params?: feathers.Params): Promise<T>;
}

/**
 * This pulls the specified methods out of ServiceMethods.
 * ServerClient specifies if we're on the server or client. Services on the server return actual class instances, while services on the client return JSON representations.
 * Chosen is the list of implemented methods, as a string union.
 * T is the optional type backing the service. Service methods return promises containing T or T[].
 */
type M<
	ServerClient extends 'server' | 'client',
	Chosen extends keyof ServiceMethods<T>,
	T = any
> = Pick<ServiceMethods<ServerClient extends 'server' ? T : (T extends { toJSON: () => any } ? ReturnType<T['toJSON']> : T)>, Chosen> & {
	events?: string[];
};

export type DeviceJson = ReturnType<Device['toJSON']>;
export type ConnectionsJson = ReturnType<Connections['toJSON']>;

/**
 * This defines the list of services and which methods they implement.
 * This is used in the server to actually implement these methods.
 */
interface SCServiceDefinitions<ServerClient extends 'server' | 'client'> {
	'api/devices': M<ServerClient, 'find' | 'get' | 'update', Device>;
	'api/config': M<ServerClient, 'get', Config>; //TODO Typing this as 'Config' is wrong, it's really Config | a child of Config
	'api/users': M<ServerClient, 'get' | 'patch', User>;
};

// Since only the server needs SCServiceDefinitions, only that is exported here:
export type ServiceDefinitions = SCServiceDefinitions<'server'>;

/**
 * This takes SCServiceDefinitions and adds on functions that are provided by feathers.
 * This is what you get back when you call app.service().
 */
type Services<ServerClient extends 'server' | 'client'> = {
	[K in keyof SCServiceDefinitions<ServerClient>]: SCServiceDefinitions<ServerClient>[K] & feathers.ServiceAddons<any>;
};

export type ServerServices = Services<'server'>;
export type ClientServices = Services<'client'>;
