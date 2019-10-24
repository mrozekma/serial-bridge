import feathers from '@feathersjs/feathers';
import express, { Application } from '@feathersjs/express';
import socketio from '@feathersjs/socketio';
import '@feathersjs/transport-commons'; // Adds channel typing to express.Application
import { Request, Response, NextFunction } from 'express-serve-static-core';
import bodyParser from 'body-parser'; // Temporary for Jenkins adapter
import Url from 'url-parse';
import chalk from 'chalk';
import pathlib from 'path';

import { ServerServices as Services, ServiceDefinitions } from '@/services';
import { Config } from './config';
import Device from './device';
import { getUser, setUserInfo } from './connections';
import Command, { iterCommands } from './command';
import makeSetupZip from './setup-zip';

// From DefinePlugin
declare const BUILD_VERSION: string, BUILD_FILE_HASH: string, BUILD_DATE: string;

const devicesRoute = /^\/devices\/([^/]+)(?:\/manage)?\/?$/;

function makeServices(app: Application<Services>, config: Config, devices: Device[], commands: Command[]): ServiceDefinitions {
	const services: ServiceDefinitions = {
		'api/devices': {
			events: [ 'updated', 'data', 'command', 'term-line', 'command-modal' ],
			async find(params) {
				return devices;
			},
			async get(id, params) {
				const device = devices.find(device => device.id === id);
				if(device) {
					return device;
				}
				throw new Error(`Device not found: ${id}`);
			},
		},

		'api/config': {
			async get(id, params) {
				//HERE
				if(id == 'version') {
					return {
						version: BUILD_VERSION,
						fileHash: BUILD_FILE_HASH,
						date: BUILD_DATE,
					};
				} else if(id == 'users') {
					return {
						identifySupport: config.users ? (config.users.identify !== undefined) : false,
						avatarSupport: config.users ? config.users.avatarSupport : false,
					}
				} else {
					throw new Error(`Config not found: ${id}`);
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
				} else if(!params || !params.connection || !params.connection.device) {
					throw new Error("Missing device");
				}
				const command = await this.get(id);
				const device: Device = params.connection.device;
				await command.run(device, params.socketId);
				return command;
			}
		},

		'api/jenkins': {
			async get(id, params) {
				const device = await services['api/devices'].get(id);
				return device.build || { device: device.name, name: undefined };
			},

			async create(data, params) {
				if(!data.name || !data.device) {
					throw new Error("Missing required field");
				}
				const device = await services['api/devices'].get(data.device);
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

				const device = await services['api/devices'].get(id);
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
					build.result = (dat.result === true);
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
	};
	return services;
}

function makeRawListeners(socket: SocketIO.Socket, devices: Device[], commands: Command[]) {
	//TODO I think there are some other events shoehorned into services that should be moved here
	socket.on('node-stdin', (deviceId: string, nodeName: string, data: string) => {
		const device = devices.find(device => device.id == deviceId);
		if(device) {
			const node = device.nodes.find(node => node.name == nodeName);
			if(node) {
				node.serialPort.write(Buffer.from(data, 'utf8'));
			}
		}
	});
	socket.on('node-state', async (deviceId: string, nodeName: string, state: boolean) => {
		//@ts-ignore
		const host = socket.feathers.ip;
		const user = await getUser(host);
		const device = devices.find(device => device.id == deviceId);
		if(device) {
			const node = device.nodes.find(node => node.name == nodeName);
			if(node) {
				if(state && !node.serialPort.isOpen) {
					node.serialPort.open();
				} else if(!state && node.serialPort.isOpen) {
					node.serialPort.close(`Closed by ${user.displayName}`);
				}
			}
		}
	});
}

function attachDeviceListeners(app: Application<Services>, devices: Device[]) {
	const devicesService = app.service('api/devices');
	for(const device of devices) {
		const sendUpdate = () => devicesService.emit('updated', {
			id: device.id,
			device: device.toJSON(),
		});
		device.on('updated', sendUpdate);
		device.on('command', data => devicesService.emit('command', {
			id: device.id,
			...data,
		}));
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
		}
	}
}

export function makeWebserver(config: Config, devices: Device[], commands: Command[]): Application<Services> {
	const app = express(feathers<Services>());

	//TODO Figure out how to only allow CORS for REST endpoints
	// app.use(cors());

	// Temporary adapter for the Serial Bridge v1 Jenkins interface
	// The current users of this route don't include a Content-Type, so need to deal with that
	app.use('/jenkins', bodyParser.json({ type: () => true }), async (req: Request<any>, res: Response, next: NextFunction) => {
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

	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.configure(express.rest());

	app.configure(socketio(io => {
		io.on('connection', socket => {
			Object.assign(
				//@ts-ignore socket.feathers does exist even though it's not in the interface
				socket.feathers,
				{
					socketId: socket.id,
					ip: socket.conn.remoteAddress,
				}
			);
			makeRawListeners(socket, devices, commands);
		});
	}));
	// app.on('connection', connection => app.channel('everybody').join(connection));
	// app.publish((data, hook) => app.channel('everybody'));
	app.publish(data => []);

	// Register a rewriter for /devices/:id for all valid IDs
	app.use((req: Request<any>, res: Response, next: NextFunction) => {
		const { pathname } = new Url(req.url);
		const match = pathname.match(devicesRoute);
		if(match && devices.find(device => device.id === match[1])) {
			req.url = '/';
		}
		next();
	});

	// Register services
	const services = makeServices(app, config, devices, commands);
	for(const [ name, service ] of Object.entries(services)) {
		app.use(name, service);
	}

	app.get('/serial-bridge.zip', async (req: Request<any>, res: Response, next: NextFunction) => {
		const buffer = await makeSetupZip(req.query.path);
		res.contentType('application/octet-stream').send(buffer);
	});

	const staticDir = (process.env.NODE_ENV === 'development')
		? pathlib.join(__dirname, '..', '..', 'dist', 'client')
		: pathlib.join(pathlib.dirname(process.argv[1]), 'client');

	app.use(express.static(staticDir));
	app.use(express.notFound());
	const errorHandler = express.errorHandler({
		logger: undefined,
	});
	app.use((err: any, req: Request<any>, res: Response, next: NextFunction) => {
		// The default error handler doesn't log errors from services for some reason, so we do it here
		if(err) {
			console.error(err);
		}
		errorHandler(err, req, res, next);
	});

	app.on('connection', connection => {
		const conn: any = connection;
		const { pathname } = new Url(conn.headers.referer);

		// If a connection comes in from /, join the 'home' channel
		if(pathname == '/') {
			app.channel('home').join(connection);
		}

		// If a connection comes in from /device/:id, join that device's channel
		const match = pathname.match(devicesRoute);
		let device: Device | undefined;
		if(match && (device = conn.device = devices.find(device => device.id === match[1]))) {
			device.webConnections.addConnection(conn.ip)
			app.channel(`device/${device.id}`).join(connection);
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
			(conn.device as Device).webConnections.removeConnection(conn.ip);
		}
	});

	// 'updated' device events go to the device's channel and the 'home' channel
	app.service('api/devices').publish('updated', data => {
		const id = data.id;
		if(id === undefined) {
			throw new Error('Device service event missing device ID');
		}
		return [
			app.channel('home'),
			app.channel(`device/${id}`),
		];
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

	attachDeviceListeners(app, devices);
	return app;
}
