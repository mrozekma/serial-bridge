import { promises as fs } from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import ora from 'ora';
import slugify from 'slugify';

import banner from 'raw-loader!./banner.txt';
import { blacklist } from './blacklist';
import { loadConfig, Config } from './config';
import Device, { Remote, RemoteInfo } from './device';
import { configureUserFactory } from './connections';
import IdGenerator from './id-generator';
import Command from './command';

// From DefinePlugin
declare const BUILD_VERSION: string, BUILD_FILE_HASH: string, BUILD_DATE: string;

function spinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
	const promise = fn();
	// For some reason Ora causes a deadlock on Windows
	if(process.platform == 'win32') {
		console.log(label);
	} else {
		ora.promise(promise).start(label);
	}
	return promise;
}

function makeDevice(deviceConfig: Config['devices'][number], idGen: IdGenerator): Device {
	const id = idGen.gen(slugify(deviceConfig.name, { lower: true }));
	const tags = (deviceConfig.tags as Exclude<typeof deviceConfig.tags, never[]>).map(tag => (typeof tag === 'string') ? { name: tag } : tag);
	const device = new Device(id, deviceConfig.name, deviceConfig.description, deviceConfig.category, tags, deviceConfig.jenkinsLock);
	for(const nodeConfig of deviceConfig.nodes) {
		const node = device.addNode(nodeConfig.name, nodeConfig.comPort, nodeConfig.baudRate, nodeConfig.byteSize, nodeConfig.parity, nodeConfig.stop, nodeConfig.tcpPort, nodeConfig.webLinks, nodeConfig.ssh);
		node.serialPort.open();
		node.tcpPort.open();
	}
	return device;
}

function makeRemote(remoteConfig: Config['remotes'][number]): Remote {
	return new Remote(remoteConfig.name, remoteConfig.url, remoteConfig.deviceRewriter as any);
}

// commandConfig here is type 'any' because the Joi schema for config.commands doesn't have proper inference because it's recursive, so Config['commands'] has type 'never[]'
function makeCommand(commandConfig: any, idGen: IdGenerator): Command {
	const name = idGen.gen();
	const { label, icon, fn, submenu } = commandConfig;
	if(fn) {
		return new Command(name, label, icon, fn);
	} else if(submenu) {
		const subInsts = submenu.map((config: any) => makeCommand(config, idGen));
		return new Command(name, label, icon, subInsts);
	} else {
		throw new Error(`Command ${name} has neither fn nor submenu`);
	}
}

function makeHttpxServer(httpServer: http.Server, httpsServer: https.Server) {
	// https://stackoverflow.com/a/42019773/309308
	return net.createServer(socket => {
		socket.once('data', buffer => {
			socket.pause();
			socket.unshift(buffer);

			if (buffer[0] === 22) {
				httpsServer.emit('connection', socket);
			} else if (32 < buffer[0] && buffer[0] < 127) {
				httpServer.emit('connection', socket);
			} else {
				socket.end();
				return;
			}

			process.nextTick(() => socket.resume());
		});
	});
}

(async () => {
	console.log(`${banner}\n${BUILD_VERSION} (${BUILD_FILE_HASH})\nBuilt ${BUILD_DATE}\n`);
	const config = await spinner("Load configuration", loadConfig);
	configureUserFactory(config.users ? config.users.identify as any : undefined);
	config.blacklist.forEach(blacklist);
	const devices: Device[] = await spinner("Load device information", async () => {
		//TODO Check for duplicate device/node names
		const idGen = new IdGenerator();
		return config.devices.map(deviceConfig => makeDevice(deviceConfig, idGen));
	});
	if(config.web !== undefined) {
		const remotes: Remote[] = (config.remotes.length == 0) ? [] : await spinner("Load remotes", async () => {
			return (config.remotes as Exclude<typeof config.remotes, never[]>).map(c => makeRemote(c));
		});
		const commands: Command[] = await spinner("Load commands", async () => {
			const idGen = new IdGenerator('command');
			return config.commands ? config.commands.map(commandConfig => makeCommand(commandConfig, idGen)) : [];
		});
		const app = await spinner("Make webserver", async () => {
			const { makeWebserver } = await import(/* webpackChunkName: 'web' */ './web');
			return makeWebserver(config, devices, remotes, commands);
		});
		if(config.web.ssl === undefined) {
			app.listen(config.web.port);
			console.log(`Listening on ${config.web.port}`);
		} else {
			const { key, cert, passphrase } = config.web.ssl;
			const httpServer = http.createServer((req, res) => {
				res.writeHead(301, {
					Location: `https://${req.headers.host}${req.url}`,
				}).end();
			});
			const httpsServer = https.createServer({
				key: await fs.readFile(key),
				cert: await fs.readFile(cert),
				passphrase,
			}, app);
			const server = makeHttpxServer(httpServer, httpsServer);
			server.listen(config.web.port);
			console.log(`Listening on ${config.web.port} (SSL)`);
		}
	}
})().catch(e => {
	console.error(e);
	process.exit(1);
});
