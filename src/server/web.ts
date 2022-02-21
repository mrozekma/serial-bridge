import feathers from '@feathersjs/feathers';
import express, { Application } from '@feathersjs/express';
import socketioServer from '@feathersjs/socketio';
import '@feathersjs/transport-commons'; // Adds channel typing to express.Application
import { Request, Response, NextFunction } from 'express-serve-static-core';
import Url from 'url-parse';
import chalk from 'chalk';
import pathlib from 'path';
import slugify from 'slugify';

import { ServerServices as Services, ServiceDefinitions, DeviceJson } from '@/services';
import { isBlacklisted, getBlacklist } from './blacklist';
import { Config, gitPull, hasGitDir, loadConfig } from './config';
import Device, { Node, Remote, EphemeralDevice, RemoteIONode, Devices, DevicesConfigReloadSpec } from './device';
import { getUser, setUserInfo } from './connections';
import Command, { iterCommands } from './command';
import makeSetupZip from './setup-zip';
import makeMobaSessionsFile from './mobaxterm';
import { parseLockXml, checkJenkinsApiKey } from './jenkins';
import NativePort, { onPortData } from './native-port';
import SavedTerminalStore, { SavedTerminal, SavedTerminalJson } from './saved-terminal';

// From DefinePlugin
declare const BUILD_VERSION: string, BUILD_LINK: string, BUILD_ID: string | undefined, RELEASE_LINK: string | undefined, BUILD_FILE_HASH: string, BUILD_DATE: string, HAS_LICENSES: boolean;

const devicesRoute = /^\/devices\/([^/]+)(?:\/manage)?\/?$/;
const portsRoute = /^\/ports(?:\/find)?\/?$/;
const configRoute = /^\/config\/reload\/?$/;

function makeServices(app: Application<Services>, config: Config, devices: Devices, remotes: Remote[], commands: Command[], saveStore: SavedTerminalStore): ServiceDefinitions {
	function getJenkinsDevice(name: any) {
		const device = devices.find(device => device.jenkinsLockName == name);
		if(device) {
			return device;
		}
		throw new Error(`Device not found: ${name}`);
	}

	function checkPortsFind() {
		if(!config.portsFind.enabled) {
			throw new Error("Ports find tool disabled");
		}
	}

	const services: ServiceDefinitions = {
		'api/devices': {
			events: [ 'updated', 'data', 'command', 'termLine', 'commandModal', 'writeCollision' ],
			async find(params) {
				// If requested, only return local devices. Mainly for requests from remotes.
				if(params?.query?.local !== undefined) {
					return [...devices.map(device => device.toJSON())];
				}
				const remoteDeviceLists = await Promise.all(
					remotes.map(remote => {
						const service = remote.app.service('api/devices');
						service.timeout = 2000; // Shorten so the parent API call won't timeout waiting on this one
						return service.find({ query: { local: true } })
							.then<DeviceJson[]>(devices => devices.map(device => remote.rewriteDeviceJson(device)))
							.catch<DeviceJson[]>(err => {
								const device = new Device('error', `Failed to contact remote '${remote.name}'`, `${err}`, undefined, [{ name: 'error', color: 'red' }], undefined);
								return [ remote.rewriteDeviceJson(device.toJSON(), false) ];
							});
					})
				);
				const rtn: DeviceJson[] = [
					...devices.map(device => device.toJSON()),
					// Not available in Node 10
					// ...remoteDeviceLists.flat(),
					//@ts-ignore
					...[].concat(...remoteDeviceLists),
				];
				return rtn as any;
			},
			async get(id, params) {
				const device = devices.find(device => device.id === id);
				if(device) {
					return device;
				}
				throw new Error(`Device not found: ${id}`);
			},
			async create(data, params) {
				if(!data.name || typeof data.name !== 'string') {
					throw new Error("Missing name");
				}
				if(!data.nodes || !Array.isArray(data.nodes) || data.nodes.length == 0) {
					throw new Error("Missing nodes");
				}
				if(data.nodes.some(node => typeof node.name !== 'string')) {
					throw new Error("Missing node name");
				}
				if(data.nodes.some(node => node.tcpPortNumber !== undefined && typeof node.tcpPortNumber !== 'number')) {
					throw new Error("Invalid TCP port number");
				}
				let id = slugify(data.name, { lower: true });
				for(let i = 2; devices.find(device => device.id === id); i++) {
					id = slugify(data.name + i, { lower: true });
				}
				//TODO Probably need more validation so the user doesn't pass something insane
				const device = new EphemeralDevice(id, data.name, data.description, data.category, data.tags ?? []);
				for(const { name, eol, tcpPortNumber } of data.nodes as Partial<Node>[]) {
					const node = new RemoteIONode(device, name!, eol ?? 'crlf', tcpPortNumber ?? 0, [ 'raw' ]);
					device.addNode(node);
					node.tcpPort.open();
				}
				device.on('updated', () => {
					if(!device.alive) {
						devices.remove(device);
					}
				});
				devices.add(device);
				// There are some ports that need to be open before we serialize the device's JSON, but there's no good way to wait on them.
				// Instead we just wait a tick.
				await new Promise(resolve => process.nextTick(resolve));
				return device;
			},
		},

		'api/deviceLock': {
			async patch(id, data, params) {
				if(!config.jenkinsUrl) {
					throw new Error("Not connected to a Jenkins instance");
				}
				const { action, username, key } = data;
				if(!action) {
					throw new Error("Missing action");
				} else if(!username) {
					throw new Error("Missing username");
				} else if(!key) {
					throw new Error("Missing API key");
				}
				const device = devices.find(device => device.id === id);
				if(!device && action != 'test') {
					throw new Error(`Device not found: ${id}`);
				}
				switch(action) {
					case 'test':
						await checkJenkinsApiKey(config.jenkinsUrl, username, key);
						break;
					case 'reserve':
						await device!.reserveInJenkins(config.jenkinsUrl, username, key);
						break;
					case 'unreserve':
						await device!.unreserveInJenkins(config.jenkinsUrl, username, key);
						break;
					default:
						throw new Error(`Unknown action: ${params!.query!.action}`);
				}
			},
		},

		'api/config': {
			async get(id, params) {
				switch(id) {
				case 'version':
					let changelog = config.changelog;
					if(changelog?.until && new Date(changelog.until).getTime() <= new Date().getTime()) {
						changelog = undefined;
					}
					return {
						version: BUILD_VERSION,
						versionLink: BUILD_LINK,
						buildId: BUILD_ID,
						releaseLink: RELEASE_LINK,
						fileHash: BUILD_FILE_HASH,
						date: BUILD_DATE,
						licenses: HAS_LICENSES,
						// Not the most logical place for these, but it's convenient:
						notice: config.notice,
						changelog: changelog?.show,
					};
				case 'users':
					return {
						identifySupport: config.users ? (config.users.identify !== undefined) : false,
						avatarSupport: config.users ? config.users.avatarSupport : false,
					};
				case 'jenkins':
					return {
						jenkinsUrl: config.jenkinsUrl,
					};
				case 'portsFind':
					return {
						...config.portsFind,
					};
				case 'blacklist':
					return getBlacklist();
				case 'reload':
					if(!config.configReloadable) {
						return {
							enabled: false,
							git: false,
							add: [],
							change: {},
						};
					}
					const newConfig = await loadConfig();
					return {
						...devices.reloadConfig(newConfig.devices),
						enabled: true,
						git: await hasGitDir(),
					};
				}
				throw new Error(`Config not found: ${id}`);
			},
			async patch(id, data: DevicesConfigReloadSpec, params) {
				switch(id) {
				case 'reload':
					if(!config.configReloadable) {
						throw new Error("Tool disabled");
					} else if(!data || !data.add || !data.change) {
						throw new Error("Bad parameters");
					}
					const newConfig = await loadConfig();
					devices.reloadConfig(newConfig.devices, data);
					break;
				case 'reload/pull':
					if(!config.configReloadable) {
						throw new Error("Tool disabled");
					}
					await gitPull();
					break;
				}
			},
		},

		'api/users': {
			async get(id, params) {
				//TODO Allow specifying the host
				if(id != 'self') {
					throw new Error("Can only request 'self'");
				} else if(!params || !params.connection || !params.connection.ip) {
					throw new Error("No connection");
				} else {
					return getUser(params.connection.ip);
				}
			},
			async patch(id, data, params) {
				if(id === null) {
					throw new Error("Null ID");
				}
				const user = await this.get(id, params);
				return await setUserInfo(user.host, data.displayName && data.displayName.length > 0 ? data.displayName : undefined, data.email && data.email.length > 0 ? data.email : undefined);
			},
		},

		'api/commands': {
			async find(params) {
				return commands;
			},
			async get(id, params) {
				for(const command of iterCommands(commands)) {
					if(command.name === id) {
						return command;
					}
				}
				throw new Error(`Command not found: ${id}`);
			},
			async patch(id, data, params) { // Using 'patch' to run commands. CRUD is dumb
				if(id === null) {
					throw new Error("Null ID");
				} else if(!params?.connection?.device) {
					throw new Error("Missing device");
				}
				const command = await this.get(id);
				const device = devices.find(device => device.id === params!.connection!.device);
				if(!device) {
					throw new Error(`Invalid device: ${params.connection.device}`);
				}
				await command.run(device, params.socketId);
				return command;
			},
		},

		'api/jenkins': {
			async get(id, params) {
				const device = getJenkinsDevice(id);
				return device.build || { device: device.name, name: undefined };
			},

			async create(data, params) {
				if(!data.name || !data.device) {
					throw new Error("Missing required field");
				}
				const device = getJenkinsDevice(data.device);
				return device.startBuild(data.name, data.link);
			},

			async patch(id, data, params) {
				if(typeof id !== 'string') {
					throw new Error("Missing device ID");
				}
				const dat: any = data;
				// Support starting a build via patch so it doesn't need to be special-cased in user code
				if(dat.startBuild) {
					return this.create({
						device: id,
						name: dat.name,
						link: dat.link,
					});
				}

				const device = getJenkinsDevice(id);
				const build = device.build || device.startBuild("<Unknown build>");
				if(dat.pushStage) {
					build.pushStage(dat.pushStage);
				} else if(dat.popStage) {
					build.popStage();
				} else if(dat.pushTask) {
					build.pushTask(dat.pushTask);
				} else if(dat.popTask) {
					build.popTask();
				} else if(dat.result !== undefined) {
					build.result = (dat.result === true || dat.result === 'true');
					// This also ends the build so the user doesn't need to send two requests
					device.endBuild();
				} else {
					throw new Error("No operation specified");
				}
				return build;
			},

			async remove(id, params) {
				const device = await services['api/devices'].get(id!);
				return device.endBuild() || { device: device.name, name: undefined };
				// Don't bother sending out an update here; clients will know the build is done from the patch with defined 'result' field
			},
		},

		'api/ports': {
			events: [ 'data' ],
			async find(params) {
				checkPortsFind();
				return await NativePort.list();
			},
			async patch(path, data: any) {
				checkPortsFind();
				if(typeof path !== 'string') {
					throw new Error("Missing port path");
				}
				const port = NativePort.get(path);
				if(!port) {
					throw new Error(`Unknown port: ${path}`);
				}
				if(data.open) {
					const { baudRate, byteSize, parity, stopBits } = data.open;
					await port.open({ baudRate, byteSize, parity, stopBits });
				}
				port.keepAlive();
				return port;
			},
		},

		'api/saveState': {
			async get(id, params): Promise<SavedTerminalJson> {
				if(typeof id !== 'string') {
					throw new Error("Bad ID");
				}
				const state = await saveStore.read(id);
				return {
					user: await getUser(state.host),
					when: state.when,
					scrollback: state.scrollback,
				};
			},
			async create(data, params): Promise<string> {
				if(!Array.isArray(data)) {
					throw new Error("Bad data");
				} else if(!data.every(e => typeof e.nodeName === 'string' && typeof e.text === 'string')) {
					throw new Error("Bad data");
				} else if(!params || !params.connection || !params.connection.ip) {
					throw new Error("No connection");
				}
				const term: SavedTerminal = {
					host: params.connection.ip,
					when: new Date().getTime(),
					scrollback: data,
				};
				const key = await saveStore.write(term);
				return key;
			},
		},
	};
	return services;
}

function makeRawListeners(socket: SocketIO.Socket, devices: Devices, commands: Command[]) {
	//@ts-ignore
	const host = socket.feathers.ip;
	//TODO I think there are some other events shoehorned into services that should be moved here
	socket.on('node-stdin', (deviceId: string, nodeName: string, data: string) => {
		const device = devices.find(device => device.id == deviceId);
		if(device) {
			const node = device.nodes.find(node => node.name == nodeName);
			if(node) {
				node.write(Buffer.from(data, 'utf8'), host);
			}
		}
	});
	socket.on('node-state', async (deviceId: string, nodeName: string, state: boolean) => {
		const user = await getUser(host);
		const device = devices.find(device => device.id == deviceId);
		if(device) {
			const node = device.nodes.find(node => node.name == nodeName);
			if(node) {
				if(state && !node.isOpen()) {
					node.open();
				} else if(!state && node.isOpen()) {
					node.close(`Closed by ${user.displayName}`);
				}
			}
		}
	});
}

function attachDeviceListeners(app: Application<Services>, devices: Device | Devices) {
	const devicesService = app.service('api/devices');
	for(const device of (Device.isDevice(devices) ? [ devices ] : devices)) {
		const sendUpdate = () => devicesService.emit('updated', {
			id: device.id,
			remote: false,
			device: device.toJSON(),
		});
		device.on('updated', sendUpdate);
		for(const event of [ 'command', 'termLine', 'commandModal' ]) {
			device.on(event, data => devicesService.emit(event, {
				id: device.id,
				...data,
			}));
		}
		device.webConnections.on('connect', sendUpdate).on('disconnect', sendUpdate);
		for(const node of device.nodes) {
			node.on('serialData', (data: Buffer) => devicesService.emit('data', {
				id: device.id,
				node: node.name,
				data,
			}));
			node.on('serialStateChanged', sendUpdate);
			node.on('tcpConnect', sendUpdate);
			node.on('tcpDisconnect', sendUpdate);
			node.on('writeCollision', async (hosts: string[]) => devicesService.emit('writeCollision', {
				id: device.id,
				node: node.name,
				users: await Promise.all(hosts.map(host => getUser(host))),
			}));
		}
	}
}

function attachRemoteListeners(app: Application<Services>, remotes: Remote[]) {
	const devicesService = app.service('api/devices');
	for(const remote of remotes) {
		remote.app.service('api/devices').on('updated', (data: any) => {
			if(data.device) {
				data.device = remote.rewriteDeviceJson(data.device);
			}
			devicesService.emit('updated', {
				...data,
				remote: true,
			});
		});
	}
}

export function makeWebserver(config: Config, devices: Devices, remotes: Remote[], commands: Command[]): Application<Services> {
	const app = express(feathers<Services>());

	app.use((req, res, next) => {
		if(isBlacklisted(req.ip)) {
			res.status(403).send('Blacklisted');
		} else {
			next();
		}
	});

	//TODO Figure out how to only allow CORS for REST endpoints
	// app.use(cors());

	// Temporary adapter for the Serial Bridge v1 Jenkins interface
	// The current users of this route don't include a Content-Type, so need to deal with that
	app.use('/jenkins', express.json({ type: () => true }), async (req: Request<any>, res: Response, next: NextFunction) => {
		if(req.method != 'POST') {
			return next();
		}
		const device = devices.find(device => device.name === req.body.device);
		if(!device) {
			res.status(500).send(`Can't find device: ${req.body.device}\n`);
			return;
		}
		const service = app.service('api/jenkins');
		// Type safety is a lie
		const patch = (body: any) => service.patch(device.id, body);
		try {
			switch(req.url) {
			case '/build-start':
				await service.create({
					device: device.id,
					name: req.body.build_name,
					link: req.body.build_link,
				})
				break;
			case '/build-stop':
				await patch({
					result: req.body.result,
				});
				await service.remove(device.id);
				break;
			case '/stage-push':
				await patch({
					pushStage: req.body.stage,
				});
				break;
			case '/stage-pop':
				await patch({
					popStage: true,
				});
				break;
			case '/task-push':
				await patch({
					pushTask: req.body.task,
				});
				break;
			case '/task-pop':
				await patch({
					popTask: true,
				});
				break;
			default:
				return next();
			}
			res.status(200).send();
		} catch(e) {
			res.status(500).send(`${e}\n`);
		}
	});

	app.post('/api/lock', express.text({ type: () => true }), async (req: Request<any>, res: Response, next: NextFunction) => {
		try {
			const locks = await parseLockXml(req.body);
			for(const device of devices) {
				if(device.jenkinsLockName === undefined) {
					continue;
				}
				const lock = locks[device.jenkinsLockName];
				if(lock === undefined) {
					device.jenkinsLockOwner = undefined;
					if(device.build?.fromXml) {
						device.endBuild();
					}
				} else if(lock.type === 'user') {
					if(device.build?.fromXml) {
						device.endBuild();
					}
					device.jenkinsLockOwner = lock.owner;
				} else if(lock.type === 'build') {
					device.jenkinsLockOwner = undefined;
					device.startBuild(lock.owner, undefined, true);
				}
			}
			res.status(200).send();
		} catch(e) {
			console.error(e, req.body);
			res.status(500).send(`${e}\n`);
		}
	});

	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.configure(express.rest());

	app.configure(socketioServer(io => {
		io.on('connection', socket => {
			if(isBlacklisted(socket.conn.remoteAddress)) {
				socket.disconnect();
				return;
			}
			Object.assign(
				//@ts-ignore socket.feathers does exist even though it's not in the interface
				socket.feathers,
				{
					socketId: socket.id,
					ip: socket.conn.remoteAddress,
					pathname: socket.handshake.query.pathname,
					remote: socket.handshake.query.remote,
				}
			);
			makeRawListeners(socket, devices, commands);
		});
	}));
	// app.on('connection', connection => app.channel('everybody').join(connection));
	// app.publish((data, hook) => app.channel('everybody'));
	app.publish(data => []);

	app.use((req, res, next) => {
		const { pathname } = new Url(req.url);
		// Register a rewriter for /devices/:id for all valid IDs
		const match = pathname.match(devicesRoute);
		if(match && devices.find(device => device.id === match[1])) {
			req.url = '/';
		}
		// Also the static routes
		if([ portsRoute, configRoute ].some(pat => pat.test(pathname))) {
			req.url = '/';
		}
		next();
	});

	const saveStore = new SavedTerminalStore(config.savedState.dir, config.savedState.expireAfter, config.savedState.maxSize);

	// Register services
	const services = makeServices(app, config, devices, remotes, commands, saveStore);
	for(const [ name, service ] of Object.entries(services)) {
		app.use(name, service);
	}

	app.get('/serial-bridge.zip', async (req: Request<any>, res: Response, next: NextFunction) => {
		const buffer = await makeSetupZip(req.query.path ? `${req.query.path}` : undefined);
		res.contentType('application/octet-stream').send(buffer);
	});

	app.get('/mobaxterm.mxtsessions', async (req: Request<any>, res: Response, next: NextFunction) => {
		const host = req.headers.host ?? req.query.host;
		if(typeof host !== 'string') {
			return res.status(500).send('Unable to determine host');
		}
		const keyPath = (typeof req.query.key === 'string')
			? (req.query.key !== '' ? req.query.key : '_MyDocuments_\\serial-bridge.ppk')
			: undefined;
		const devices = await app.service('api/devices').find();
		const buffer = makeMobaSessionsFile(devices as unknown as DeviceJson[], host, keyPath);
		res.contentType('text/plain').send(buffer);
	});

	const staticDir = (process.env.NODE_ENV === 'development')
		? pathlib.join(__dirname, '..', '..', 'dist', 'client')
		: pathlib.join(pathlib.dirname(process.argv[1]), 'client');

	app.use(express.static(staticDir));
	app.use(express.notFound());
	const errorHandler = express.errorHandler({
		logger: undefined,
	});
	app.use('/', (err: any, req: any, res: any, next: NextFunction) => {
		// The default error handler doesn't log errors from services for some reason, so we do it here
		if(err) {
			console.error(err);
		}
		errorHandler(err, req, res, next);
	});

	app.on('connection', connection => {
		const conn: any = connection;
		const pathname: string | undefined = conn.pathname?.replace(/\/$/, '');
		const remote: string | undefined = conn.remote;

		// If a connection comes in from /, join the 'home' channel
		if(pathname == '') {
			app.channel('home').join(connection);
		}

		if(remote !== undefined) {
			app.channel('remote').join(connection);
		}

		// If a connection comes in from /devices/:id, join that device's channel
		const match = pathname?.match(devicesRoute);
		let device: Device | undefined;
		if(match && (device = devices.find(device => device.id === match[1]))) {
			conn.device = device.id;
			device.webConnections.addConnection(conn.ip)
			app.channel(`device/${device.id}`).join(connection);
		}

		if(pathname == '/ports/find') {
			app.channel('ports-find').join(connection);
		}

		// If a connection is over socketio, join a channel just for that socket
		if(conn.socketId) {
			app.channel(`socket/${conn.socketId}`).join(connection);
		}

		console.log(chalk.bgBlue.bold(` web (${device ? device.name : '-'}) `) + ` ${conn.ip} connected`);
	});
	app.on('disconnect', connection => {
		const conn: any = connection;
		if(conn.device) {
			const device = devices.find(device => device.id === conn.device);
			device?.webConnections?.removeConnection(conn.ip);
		}
	});

	app.service('api/devices').publish('updated', data => {
		const id = data.id;
		if(id === undefined) {
			throw new Error('Device service event missing device ID');
		}
		function* iterChanNames() {
			// All device updates go to the homepage
			yield 'home';
			if(!data.remote) {
				// Local updates go to that device's channel
				yield `device/${id}`;
				// And are forwarded to remotes
				yield 'remote';
			}
		}
		return app.channel(Array.from(iterChanNames()));
	});

	// Other device events go to the device's channel
	app.service('api/devices').publish(data => {
		const { id, to } = data;
		if(to) {
			// Send message directly to the specified socket; only that client will receive it
			return app.channel(`socket/${to}`);
		} else if(id) {
			// Send message to the device's channel; all clients connected to the device will receive it
			return app.channel(`device/${id}`);
		} else {
			throw new Error('Device service event missing device ID');
		}
	});

	app.service('api/ports').publish(data => app.channel('ports-find'));

	attachDeviceListeners(app, devices);
	devices.on('added', (devices: Devices, device: Device) => attachDeviceListeners(app, device));
	// This is a bit asymmetrical, but there's no reason not to just remove every listener here instead of just the ones added in attachDeviceListeners(), and it's much easier.
	// It's important that this 'removed' event happens after the one that calls Device.kill(), since that one emits an event, but that handler is already registered.
	devices.on('removed', (devices: Devices, device: Device) => device.deepRemoveAllListeners());
	attachRemoteListeners(app, remotes);

	if(config.portsFind.enabled) {
		const portsService = app.service('api/ports');
		onPortData((port, data) => portsService.emit('data', { path: port.path, data }));
	}

	return app;
}
