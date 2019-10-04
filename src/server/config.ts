import { promises as fs } from 'fs';
import pathlib from 'path';

import * as joi from 'typesafe-joi';
import json5 from 'json5';

const nodeJoi = joi.object({
	name: joi.string().required(),
	'com port': joi.string().required(),
	'baud rate': joi.number().integer().required(),
	'byte size': joi.number().default(8).valid(5, 6, 7, 8),
	parity: joi.string().default('none').valid('even', 'odd', 'none'),
	stop: joi.number().default(1).valid(1, 2),
	'tcp port': joi.number().required().port(),
	'web links': joi.array().items(
		joi.string().allow('telnet', 'ssh', 'raw')
	).default([]),
	'web default visible': joi.boolean().default(true),
	'ssh': joi.object({
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

const configJoi = joi.object({
	'web port': joi.number().integer(),
	devices: joi.array().required().items(deviceJoi),
}).required();

const configFilename = (process.env.NODE_ENV === 'development')
	? pathlib.join(__dirname, '..', '..', 'config.json') // We're in serial-bridge/dist/server; config is serial-bridge/config.json
	: pathlib.join(pathlib.dirname(process.argv[1]), 'config.json'); // Same directory as main script

export async function loadConfig() {
	const buf = await fs.readFile(configFilename);
	const obj = json5.parse(buf.toString('utf8'));
	const { error, value } = configJoi.validate(obj);
	if(error) {
		throw new Error(`Failed to parse configuration file ${configFilename}: ${error.message}`);
	}
	return value;
}
export type Config = ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never;
