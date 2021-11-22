import child_process from 'child_process';
import { promises as fs } from 'fs';
import pathlib from 'path';
import vm from 'vm';

import * as joi from 'typesafe-joi';
//@ts-ignore No declaration file
import deepRenameKeys from 'deep-rename-keys';

const nodeJoi = joi.object({
	name: joi.string().required(),
	comPort: joi.string().required(),
	baudRate: joi.number().integer().required(),
	byteSize: joi.number().default(8).valid(5, 6, 7, 8),
	parity: joi.string().default('none').valid('even', 'odd', 'none'),
	stop: joi.number().default(1).valid(1, 2),
	tcpPort: joi.number().required().port(),
	webLinks: joi.array().items(
		joi.string().allow('telnet', 'ssh', 'raw')
	).default([]),
	webDefaultVisible: joi.boolean().default(true),
	ssh: joi.object({
		host: joi.string().required(),
		username: joi.string().required(),
		password: joi.string().required(),
	}),
	metadata: joi.object(),
});

const deviceJoi = joi.object({
	name: joi.string().required(),
	description: joi.string(),
	category: joi.string(),
	tags: joi.array().items(
		joi.string(),
		joi.object({
			name: joi.string().required(),
			description: joi.string(),
			color: joi.string(),
			showOnDevicePage: joi.boolean(),
		}),
	).default([]),
	nodes: joi.array().required().items(nodeJoi),
	//TODO commands?
	jenkinsLock: joi.string(),
	metadata: joi.object(),
});

const usersJoi = joi.object({
	identify: joi.func().required(),
	avatarSupport: joi.bool().default(false),
});

const portsFindJoi = joi.object({
	enabled: joi.bool().default(false),
	patterns: joi.object().pattern(/.+/, joi.array().items(
		joi.object({
			// joi.object().type(RegExp) doesn't work here because the RegExp class in the config file VM is different from the one here.
			// If I pass RegExp in via the VM's context, /.../ still doesn't work. new RegExp(...) does, but then the RegExp doesn't work in the server process.
			pattern: joi.string().required(),
			name: joi.string().required().min(1),
		}),
	)).default({}),
}).default({
	enabled: false,
	patterns: {},
});

const savedStateJoi = joi.object({
	dir: joi.string().default('./saved-state'),
	expireAfter: joi.number().default(60 * 24 * 30),
	maxSize: joi.number(),
}).default({
	dir: './saved-state',
	expireAfter: 60 * 24 * 30,
	maxSize: undefined,
});

const changelogJoi = joi.object({
	show: joi.array().items(joi.string()).required(),
	until: joi.string().isoDate(),
});

const remoteJoi = joi.object({
	name: joi.string().required(),
	url: joi.string().required(),
	deviceRewriter: joi.func().default((device: any) => device),
});

// Automatic typing on this doesn't work because it's recursive. The 'Command' interface is defined manually below
const commandJoi: any = joi.object({
	label: joi.string().required(),
	icon: joi.string(),
	fn: joi.func().maxArity(1),
	submenu: joi.array().items(joi.lazy(() => commandJoi)),
}).xor('fn', 'submenu');

const webJoi = joi.object({
	port: joi.number().default(80),
	ssl: joi.object({
		port: joi.number(),
		key: joi.string().required(),
		cert: joi.string().required(),
		passphrase: joi.string(),
	}),
});

const configJoi = joi.object({
	web: webJoi,
	users: usersJoi,
	portsFind: portsFindJoi,
	configReloadable: joi.bool().default(false),
	savedState: savedStateJoi,
	changelog: changelogJoi,
	devices: joi.array().required().items(deviceJoi),
	remotes: joi.array().items(remoteJoi).default([]),
	commands: joi.array().items(commandJoi),
	jenkinsUrl: joi.string(),
	notice: joi.string(),
	blacklist: joi.array().items(joi.string()).default([]),
}).required();

// Serial Bridge 1's config file had keys with spaces in it, so for backwards compatibility, convert 'foo bar' to 'fooBar'
function renameConfigKeys(obj: object) {
	return deepRenameKeys(obj, (key: string) => key.replace(/ [a-z]/g, substring => substring[1].toUpperCase()));
}

const rootDir = (process.env.NODE_ENV === 'development')
	? pathlib.join(__dirname, '..', '..') // We're in serial-bridge/dist/server
	: pathlib.join(pathlib.dirname(process.argv[1])); // Same directory as main script

export async function loadConfig() {
	const filename = pathlib.resolve(pathlib.join(rootDir, 'config.js'));
	const buf = await fs.readFile(filename, {
		encoding: 'utf8',
	}).catch(e => {
		if(e.code === 'ENOENT') {
			throw new Error(`Couldn't open configuration file: ${filename}. Did you copy the example configuration from config.example?`);
		}
		throw e;
	});
	const context = vm.createContext({
		console,
		require: __non_webpack_require__,
		setTimeout,
		__filename: filename,
	});
	try {
		vm.runInContext(buf, context, { filename });
	} catch(e: any) {
		// Include the beginning part of the trace, which includes the path/line number and bad line of the config
		if(typeof e.stack === 'string') {
			throw new Error(e.stack.replace(/\n    at .*$/s, ''));
		}
		throw e;
	}

	if(typeof context.config === 'function') {
		context.config = await context.config();
	}
	if(typeof context.config !== 'object') {
		throw new Error(`Failed to parse configuration file ${filename}: 'config' variable is not an object`);
	}
	const obj = renameConfigKeys(context.config);
	if(obj.webPort) {
		if(obj.web) {
			throw new Error(`Failed to parse configuration file ${filename}: both 'webPort' and 'web' specified. Use 'web.port' instead`);
		}
		obj.web = {
			port: obj.webPort,
		};
		delete obj.webPort;
	}
	//@ts-ignore "Type instantiation is excessively deep and possibly infinite". Amazing error message, Typescript.
	const { error, value } = configJoi.validate(obj);
	if(error) {
		throw new Error(`Failed to parse configuration file ${filename}: ${error.message}`);
	}
	// Don't think there's a way to encode this in joi:
	for(const device of value.devices) {
		for(const node of device.nodes) {
			if((node.webLinks as string[]).indexOf('ssh') >= 0 && !node.ssh) {
				throw new Error(`Failed to parse configuration file ${filename}: Node ${device.name}.${node.name} specifies an SSH link with no SSH configuration block`);
			}
		}
	}
	if(!pathlib.isAbsolute(value.savedState.dir)) {
		value.savedState.dir = pathlib.join(rootDir, value.savedState.dir);
	}
	try {
		const stats = await fs.stat(value.savedState.dir);
		if(!stats.isDirectory()) {
			throw new Error(`Saved state path is not a directory: ${value.savedState.dir}`);
		}
	} catch(e: any) {
		if(e.code === 'ENOENT') {
			try {
				await fs.mkdir(value.savedState.dir);
			} catch(e2) {
				throw new Error(`Unable to create saved state directory: ${value.savedState.dir}`);
			}
		} else {
			throw new Error(`Unable to stat saved state directory: ${value.savedState.dir}`);
		}
	}
	return value;
}
export type Config = ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never;

// This needs to be kept in-sync with 'commandJoi' above
export interface Command {
	label: string;
	icon?: string;
	// Exactly one of 'fn' or 'submenu' will be set, but encoding that in the type makes it a hassle to actually use
	fn?: () => Promise<void>;
	submenu?: Command[];
}

export async function hasGitDir(): Promise<boolean> {
	try {
		const stat = await fs.stat(pathlib.join(rootDir, '.git'));
		return stat.isDirectory();
	} catch(e) {
		return false;
	}
}

export async function gitPull() {
	if(!await hasGitDir()) {
		throw new Error("No git directory");
	}
	console.log('Running git pull');
	child_process.execSync('git pull', {
		cwd: rootDir,
	});
}
