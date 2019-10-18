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
});

const deviceJoi = joi.object({
	name: joi.string().required(),
	nodes: joi.array().required().items(nodeJoi),
	//TODO commands?
});

const usersJoi = joi.object({
	identify: joi.func().required(),
	avatarSupport: joi.bool().default(false),
});

// Automatic typing on this doesn't work because it's recursive. The 'Command' interface is defined manually below
const commandJoi: any = joi.object({
	label: joi.string().required(),
	icon: joi.string(),
	fn: joi.func().maxArity(1),
	submenu: joi.array().items(joi.lazy(() => commandJoi)),
}).xor('fn', 'submenu');

const configJoi = joi.object({
	webPort: joi.number().integer(),
	users: usersJoi,
	devices: joi.array().required().items(deviceJoi),
	commands: joi.array().items(commandJoi),
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
	const buf = await fs.readFile(filename);
	const context = vm.createContext({
		console,
		require: __non_webpack_require__,
		setTimeout,
	});
	vm.runInContext(buf.toString('utf8'), context, { filename });

	if(typeof context.config !== 'object') {
		throw new Error(`Failed to parse configuration file ${filename}: 'config' variable is not an object`);
	}
	const obj = renameConfigKeys(context.config);
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
