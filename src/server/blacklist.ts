import { promises } from 'dns';

const resolver = new promises.Resolver();
const list = new Set<string>();

function add(promise: Promise<string[]>) {
	promise.then(names => names.forEach(name => list.add(name))).catch(err => {});
}

export function blacklist(host: string) {
	console.log('blacklist', host);
	list.add(host);
	add(resolver.resolve(host));
	add(resolver.reverse(host));
}

export function isBlacklisted(host: string): boolean {
	console.log(host);
	return list.has(host);
}

export function getBlacklist(): Readonly<string[]> {
	return [ ...list ];
}
