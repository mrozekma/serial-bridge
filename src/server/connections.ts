import isIp from 'is-ip';

import dns from 'dns';
import { EventEmitter } from 'events';
import { promisify } from 'util';

import db from './db';

const dnsReverse = promisify(dns.reverse);

export interface User {
	host: string;
	displayName: string;
	email?: string;
	avatar?: string;
}

class UserFactory {
	private readonly userCache = new Map<string, User>(); // host -> User

	constructor(private readonly resolver?: (user: Partial<User>) => Promise<void>) {}

	async getUser(host: string): Promise<User> {
		host = host.replace(/^::ffff:/, ''); // ::ffff:a.b.c.d is an IPv4 address over IPv6
		let user = this.userCache.get(host);
		if(user) {
			return user;
		}
		user = await this.makeUser(host);
		this.userCache.set(host, user);
		return user;
	}

	async setUserInfo(host: string, displayName: string | undefined, email: string | undefined): Promise<User> {
		const user: Partial<User> = await this.getUser(host);
		user.displayName = displayName;
		user.email = email;
		if(this.resolver) {
			await this.resolver(user).catch(console.error);
		}
		if(displayName) {
			db.push(`/hosts/${host}`, {
				host: user.host,
				displayName: user.displayName,
				email: user.email,
			});
		} else {
			db.delete(`/hosts/${host}`);
			if(!user.displayName) {
				user.displayName = host;
			}
		}
		return user as User;
	}

	private async makeUser(host: string): Promise<User> {
		let user: Partial<User> = { host };

		if(db.exists(`/hosts/${host}`)) {
			// The DB contains the displayName and email; we still run the resolver to get the avatar
			user = db.getData(`/hosts/${host}`);
			if(this.resolver) {
				await this.resolver(user).catch(console.error);
			}
		} else if(this.resolver) {
			const hosts = isIp(host) ? await dnsReverse(host).catch(e => [ host ]) : [ host ];
			for(user.host of hosts) {
				try {
					await this.resolver(user);
					if(user.displayName) {
						break;
					}
				} catch(e) {
					console.error(e);
				}
			}
		}

		// Set the display name to the host if still unset
		if(!user.displayName) {
			user.displayName = host;
		}

		return user as User;
	}
}

let userFactory: UserFactory | undefined = undefined;

export function configureUserFactory(resolver?: (user: Partial<User>) => Promise<void>) {
	userFactory = new UserFactory(resolver);
}

export function getUser(host: string): Promise<User> {
	if(!userFactory) {
		throw new Error("No user factory configured");
	}
	return userFactory.getUser(host);
}

export function setUserInfo(host: string, displayName: string | undefined, email: string | undefined): Promise<User> {
	if(!userFactory) {
		throw new Error("No user factory configured");
	}
	return userFactory.setUserInfo(host, displayName, email);
}

export interface Connection {
	host: string;
	user: User;
	//TODO timestamps
}

export default class Connections extends EventEmitter {
	private readonly connections: Connection[] = [];

	constructor() {
		super();
	}

	get users(): User[] {
		return this.connections.map(connection => connection.user);
	}

	async addConnection(host: string) {
		const connection: Connection = {
			host,
			user: await getUser(host),
		}
		this.connections.push(connection);
		this.emit('connect', connection);
		return connection;
	}

	removeConnection(host: string) {
		const idx = this.connections.findIndex(connection => connection.host == host);
		if(idx >= 0) {
			this.emit('disconnect', this.connections[idx]);
			this.connections.splice(idx, 1);
		}
	}

	toJSON() {
		return this.connections;
	}
}
