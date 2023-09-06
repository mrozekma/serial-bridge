import { promises } from 'dns';

const resolver = new promises.Resolver();
const list = new Set<string>();

function add(promise: Promise<string[]>) {
	promise.then(names => names.forEach(name => list.add(name))).catch(err => {});
}

export function blocklist(host: string) {
	console.log('blocklist', host);
	list.add(host);
	add(resolver.resolve(host));
	add(resolver.reverse(host));
}

export function isBlocklisted(host: string): boolean {
	return list.has(host);
}

export function getBlocklist(): Readonly<string[]> {
	return [ ...list ];
}
