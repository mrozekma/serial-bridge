import feathers from '@feathersjs/feathers';

// https://stackoverflow.com/a/51956054/309308
type KnownKeys<T> = {
	[K in keyof T]: string extends K ? never : number extends K ? never : K
} extends { [_ in keyof T]: infer U } ? U : never;

type MethodNames = Pick<feathers.ServiceMethods<any>, KnownKeys<feathers.ServiceMethods<any>>>;
type M<Chosen extends keyof MethodNames> = Pick<MethodNames, Chosen>;

export interface Services {
	'/test': M<'get' | 'update'> & {events: string[]},
};
