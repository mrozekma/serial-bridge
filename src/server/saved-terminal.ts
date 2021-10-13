import Crypto from 'crypto';
import { promises as fs } from 'fs';
import pathlib from 'path';

import { User } from './connections';

export interface SavedTerminal {
	host: string;
	when: number;
	scrollback: {
		nodeName: string;
		text: string;
	}[];
}

export interface SavedTerminalJson {
	user: User;
	when: number;
	scrollback: SavedTerminal['scrollback'];
}

export default class SavedTerminalStore {
	constructor(private readonly rootDir: string, private readonly expireMinutes: number | undefined, private readonly maxSize: number | undefined) {
		// Not available in my Node version
		// const ref = new WeakRef(this);
		if(this.expireMinutes) {
			const timer = setInterval(() => {
				// const deref = ref.deref();
				const deref = this;
				if(deref) {
					deref.checkForOldSaves();
				} else {
					clearInterval(timer);
				}
			}, 1000 * 60);
		}
	}

	async read(key: string): Promise<SavedTerminal> {
		const path = pathlib.join(this.rootDir, key);
		try {
			const json = await fs.readFile(path, { encoding: 'utf8' });
			return JSON.parse(json);
		} catch(e: any) {
			if(e.code === 'ENOENT') {
				throw new Error(`No state with key '${key}' found`);
			}
			throw e;
		}
	}

	async write(terminal: SavedTerminal): Promise<string> {
		const json = JSON.stringify(terminal);
		if(this.maxSize && json.length > this.maxSize) {
			throw new Error(`Serialized state too large, server only allows ${this.maxSize} ${(this.maxSize == 1) ? 'byte' : 'bytes'}`);
		}

		let key = '';
		let fd: fs.FileHandle | undefined;
		while(fd === undefined) {
			key = Crypto.randomBytes(20).toString('hex');
			const path = pathlib.join(this.rootDir, key);
			try {
				fd = await fs.open(path, 'wx');
			} catch(e: any) {
				if(e.code === 'EEXIST') {
					// Picked a key that's already in use; try again
				} else {
					throw e;
				}
			}
		}
		await fs.writeFile(fd, json, { encoding: 'utf8' });
		await fd.close();
		return key;
	}

	private async checkForOldSaves() {
		const expireTime = new Date().getTime() - this.expireMinutes! * 1000 * 60;
		const keys = await fs.readdir(this.rootDir);
		for(const key of keys) {
			try {
				const savedTerm = await this.read(key);
				if(typeof savedTerm.when === 'number' && savedTerm.when <= expireTime) {
					await fs.unlink(pathlib.join(this.rootDir, key));
				}
			} catch(e) {}
		}
	}
}
