import { promises as fs } from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import ora from 'ora';

import banner from 'raw-loader!./banner.txt';
import { blacklist } from './blacklist';
import { loadConfig, Config } from './config';
import { Devices, Remote } from './device';
import { configureUserFactory } from './connections';
import Command from './command';
import IdGenerator from './id-generator';
import { Layouts } from '../layout';

// From DefinePlugin
declare const BUILD_VERSION: string, BUILD_ID: string, BUILD_FILE_HASH: string, BUILD_DATE: string;

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
	console.log(`${banner}\n${BUILD_VERSION}${BUILD_ID ? ` (build ${BUILD_ID})` : ''} (${BUILD_FILE_HASH ?? 'no file hash'})\nBuilt ${BUILD_DATE}\n`);
	const config = await spinner("Load configuration", loadConfig);
	configureUserFactory(config.users ? config.users.identify as any : undefined);
	config.blacklist.forEach(blacklist);
	const devices: Devices = await spinner("Load device information", async () => Devices.fromConfig(config.devices));
	if(config.configReloadable) {
		process.on('SIGUSR2', async () => {
			try {
				const newConfig = await spinner("Reload device configuration", loadConfig);
				devices.reloadConfig(newConfig.devices, true);
			} catch(e) {
				console.error(e);
			}
		});
	}
	if(config.web !== undefined) {
		const remotes: Remote[] = (config.remotes.length == 0) ? [] : await spinner("Load remotes", async () => {
			return (config.remotes as Exclude<typeof config.remotes, never[]>).map(c => Remote.fromConfig(c));
		});
		const commands: Command[] = await spinner("Load commands", async () => {
			const idGen = new IdGenerator('command');
			return config.commands ? config.commands.map(commandConfig => Command.fromConfig(commandConfig, idGen)) : [];
		});
		const layouts: Layouts = await spinner("Load layouts", async () => Layouts.fromConfig(config.layouts));
		const app = await spinner("Make webserver", async () => {
			const { makeWebserver } = await import(/* webpackChunkName: 'web' */ './web');
			return makeWebserver(config, devices, remotes, commands, layouts);
		});
		if(config.web.ssl === undefined) {
			app.listen(config.web.port);
			console.log(`Listening on ${config.web.port}`);
		} else {
			let sslPort = config.web.ssl.port;
			const { key, cert, passphrase } = config.web.ssl;
			if(!sslPort && config.web.port == 80) {
				sslPort = 443;
			}
			if(sslPort) { // HTTP and HTTPS are on separate ports. Make an HTTP server that forwards requests to the HTTPS server.
				const httpServer = http.createServer((req, res) => {
					if(req.headers.host) {
						res.writeHead(301, {
							Location: `https://${req.headers.host.replace(/:[0-9]+$/, '')}:${sslPort}${req.url}`,
						}).end();
					} else {
						res.writeHead(400, 'No Host');
					}
				});
				httpServer.listen(config.web.port);
				console.log(`Listening on ${config.web.port} (redirecting to SSL)`);
				const httpsServer = https.createServer({
					key: await fs.readFile(key),
					cert: await fs.readFile(cert),
					passphrase,
				}, app);
				app.setup(httpsServer); // Needs to be called explicitly. https://docs.feathersjs.com/api/express.html#https
				httpsServer.listen(sslPort);
				console.log(`Listening on ${sslPort} (SSL) (HTTP forwarded from ${config.web.port})`);
			} else { // HTTP and HTTPS are on the same port. Make a server that can distinguish the incoming request protocol.
				const httpServer = http.createServer((req, res) => {
					if(req.headers.host) {
						res.writeHead(301, {
							Location: `https://${req.headers.host}${req.url}`,
						}).end();
					} else {
						res.writeHead(400, 'No Host');
					}
				});
				const httpsServer = https.createServer({
					key: await fs.readFile(key),
					cert: await fs.readFile(cert),
					passphrase,
				}, app);
				app.setup(httpsServer); // Needs to be called explicitly. https://docs.feathersjs.com/api/express.html#https
				const server = makeHttpxServer(httpServer, httpsServer);
				server.listen(config.web.port);
				console.log(`Listening on ${config.web.port} (SSL)`);
			}
		}
	}
})().catch(e => {
	console.error(e);
	process.exit(1);
});
