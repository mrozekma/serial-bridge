import { promises as fs } from 'fs';
import pathlib from 'path';

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

const configFilename = (process.env.NODE_ENV === 'development')
	? pathlib.join(__dirname, '..', '..', 'config.json') // We're in serial-bridge/dist/server; config is serial-bridge/config.json
	: pathlib.join(pathlib.dirname(process.argv[1]), 'config.json'); // Same directory as main script

export async function loadConfig() {
	const buf = await fs.readFile(configFilename);
	const obj = renameConfigKeys(json5.parse(buf.toString('utf8')));
	const { error, value } = configJoi.validate(obj);
	if(error) {
		throw new Error(`Failed to parse configuration file ${configFilename}: ${error.message}`);
	}
	return value;
}
export type Config = ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never;

export function stripSecure(config: Config): object {
	const rtn: Config = JSON.parse(JSON.stringify(config));
	if(rtn.userDirectory) {
		delete rtn.userDirectory.username;
		delete rtn.userDirectory.password;
	}
	for(const device of rtn.devices) {
		for(const node of device.nodes) {
			// Arguably these aren't secret since the device UI provides links that include them
			if(node.ssh) {
				delete node.ssh.username;
				delete node.ssh.password;
			}
		}
	}
	return rtn;
}
