//@ts-ignore No declaration file
import ActiveDirectory from 'activedirectory';
import isIp from 'is-ip';

import crypto from 'crypto';
import dns from 'dns';
import { EventEmitter } from 'events';
import { promisify } from 'util';

import { Config } from './config';
import db from './db';

const dnsReverse = promisify(dns.reverse);
// const adLookup = promisify((ad: ActiveDirectory, username: string, cb: (err: Error | null, result: any) => void) => ad.findUser(username, cb));

//TODO Remove this, just for testing
async function adLookup(ad: ActiveDirectory, username: string) {
	return {
		displayName: 'Michael Mrozek',
		// displayName: 'Michael Mrozek long long long long long long long long',
		mail: 'mrozekma@mrozekma.com',
	};
}

export interface User {
	host: string;
	username?: string;
	realName?: string;
	email?: string;
	gravatar?: string;
	displayName: string; // This is either 'host', 'username', or 'realName', depending on the information available
}

class UserFactory {
	private readonly hostPattern?: RegExp;
	private readonly ad?: ActiveDirectory;
	private readonly gravatarUrl?: string;
	private readonly userCache = new Map<string, User>(); // host -> User

	constructor(userDirectoryConfig: Config['userDirectory']) {
		if(userDirectoryConfig) {
			if(userDirectoryConfig.hostPattern) {
				this.hostPattern = new RegExp(userDirectoryConfig.hostPattern);
				if(userDirectoryConfig.url) {
					this.ad = new ActiveDirectory({
						url: userDirectoryConfig.url,
						baseDN: userDirectoryConfig.dn,
						username: userDirectoryConfig.username,
						password: userDirectoryConfig.password,
					});
				}
			}
			this.gravatarUrl = userDirectoryConfig.gravatar;
		}
	}

	async getUser(host: string): Promise<User> {
		let user = this.userCache.get(host);
		if(user) {
			return user;
		}
		user = await this.makeUser(host);
		this.userCache.set(host, user);
		return user;
	}

	async setUserInfo(host: string, displayName: string, email: string | undefined): Promise<User> {
		const user = await this.getUser(host);
		user.displayName = displayName;
		user.email = email;
		this.setGravatar(user);
		db.push(`/hosts/${host}`, {
			host: user.host,
			displayName: user.displayName,
			email: user.email,
		});
		return user;
	}

	private async makeUser(host: string): Promise<User> {
		let user: User;

		if(db.exists(`/hosts/${host}`)) {
			user = db.getData(`/hosts/${host}`);
		} else {
			user = {
				host,
				displayName: '',
			};

			try {
				if(!this.hostPattern || !this.ad) {
					throw new Error("No way to deduce username");
				}
				const hosts = isIp(host) ? await dnsReverse(host) : [ host ];
				for(const host of hosts) {
					const match = host.match(this.hostPattern);
					if(match) {
						user.username = match[1];
						const userInfo = await adLookup(this.ad, user.username);
						if(!userInfo) {
							throw new Error("User not found in active directory");
						}
						user.realName = userInfo.displayName;
						user.email = userInfo.mail;
						break;
					}
				}
			} catch(e) {
				console.error(e);
			}

			user.displayName = user.realName || user.username || user.host;
		}

		this.setGravatar(user);
		return user;
	}

	private setGravatar(user: User) {
		if(user.email && this.gravatarUrl) {
			const hash = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
			user.gravatar = this.gravatarUrl.replace('HASH', hash);
		} else {
			user.gravatar = undefined;
		}
	}
}

let userFactory: UserFactory | undefined = undefined;

export function configureUserFactory(userDirectoryConfig: Config['userDirectory']) {
	userFactory = new UserFactory(userDirectoryConfig);
}

export function getUser(host: string): Promise<User> {
	if(!userFactory) {
		throw new Error("No user factory configured");
	}
	return userFactory.getUser(host);
}

export function setUserInfo(host: string, displayName: string, email: string | undefined): Promise<User> {
	if(!userFactory) {
		throw new Error("No user factory configured");
	}
	return userFactory.setUserInfo(host, displayName, email);
}

interface Connection {
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
