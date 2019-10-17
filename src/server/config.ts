import { promises as fs } from 'fs';
import pathlib from 'path';
import vm from 'vm';

import * as joi from 'typesafe-joi';
//@ts-ignore No declaration file
import deepRenameKeys from 'deep-rename-keys';
import json5 from 'json5';

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

const userDirectoryJoi = joi.object({
	url: joi.string(),
	dn: joi.string(),
	username: joi.string(),
	password: joi.string(),
	hostPattern: joi.string(),
	gravatar: joi.string(),
}).with('url', 'dn');

const configJoi = joi.object({
	webPort: joi.number().integer(),
	userDirectory: userDirectoryJoi,
	devices: joi.array().required().items(deviceJoi),
}).required();

// Serial Bridge 1's config file had keys with spaces in it, so for backwards compatibility, convert 'foo bar' to 'fooBar'
function renameConfigKeys(obj: object) {
	return deepRenameKeys(obj, (key: string) => key.replace(/ [a-z]/g, substring => substring[1].toUpperCase()));
}

const rootDir = (process.env.NODE_ENV === 'development')
	? pathlib.join(__dirname, '..', '..') // We're in serial-bridge/dist/server
	: pathlib.join(pathlib.dirname(process.argv[1])); // Same directory as main script

export async function loadJsonConfig() {
	const filename = pathlib.join(rootDir, 'config.json');
	const buf = await fs.readFile(filename);
	const obj = renameConfigKeys(json5.parse(buf.toString('utf8')));
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
export type Config = ReturnType<typeof loadJsonConfig> extends Promise<infer T> ? T : never;

interface Command {
	label: string;
	icon?: string;
	// Exactly one of 'fn' or 'submenu' will be set, but encoding that in the type makes it a hassle to actually use
	fn?: () => Promise<void>;
	submenu?: Command[];
}
export interface JsConfig {
	commands?: Command[];
}
export async function loadJsConfig(): Promise<JsConfig> {
	const filename = pathlib.resolve(pathlib.join(rootDir, 'config.js'));
	let buf: Buffer;
	try {
		buf = await fs.readFile(filename);
	} catch(e) {
		if(e.code == 'ENOENT') {
			// This file is optional
			return {};
		}
		throw e;
	}
	const context = vm.createContext({
		console,
		require: __non_webpack_require__,
		setTimeout,
	});
	vm.runInContext(buf.toString('utf8'), context, { filename });
	//TODO Check that 'context' satisfies the JsConfig interface. I suspect there's no good way to automate this
	return context;
}

export function stripSecure(config: Config): object {
	const rtn: Config = JSON.parse(JSON.stringify(config));
	if(rtn.userDirectory) {
		delete rtn.userDirectory.username;
		delete rtn.userDirectory.password;
	}
	for(const device of rtn.devices) {
		for(const node of device.nodes) {
			// These aren't really secret since they're exposed in the device API
			if(node.ssh) {
				delete node.ssh.username;
				delete node.ssh.password;
			}
		}
	}
	return rtn;
}
