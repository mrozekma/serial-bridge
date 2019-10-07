import feathers from '@feathersjs/feathers';

import Device from './server/device';

// Variant of feathers.ServiceMethods with some narrower return types
interface ServiceMethods<T> {
	find (params?: feathers.Params): Promise<T[]>;
	get (id: feathers.Id, params?: feathers.Params): Promise<T>;
	create (data: Partial<T> | Array<Partial<T>>, params?: feathers.Params): Promise<T>;
	update (id: feathers.NullableId, data: T, params?: feathers.Params): Promise<T>;
	patch (id: feathers.NullableId, data: Partial<T>, params?: feathers.Params): Promise<T>;
	remove (id: feathers.NullableId, params?: feathers.Params): Promise<T>;
}

interface Common {
	events?: string[];
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
	T extends { toJSON: () => any } = any
> = Pick<ServiceMethods<ServerClient extends 'server' ? T : ReturnType<T['toJSON']>>, Chosen>;

export type DeviceJson = ReturnType<Device['toJSON']>;

interface Services<ServerClient extends 'server' | 'client'> {
	'devices': Common & M<ServerClient, 'find' | 'get' | 'update', Device>,
};

export type ServerServices = Services<'server'>;
export type ClientServices = Services<'client'>;
