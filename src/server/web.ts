import feathers from '@feathersjs/feathers';
import express, { Application } from '@feathersjs/express';
import socketio from '@feathersjs/socketio';
import '@feathersjs/transport-commons'; // Adds channel typing to express.Application
import { Request, Response, NextFunction } from 'express-serve-static-core';
import Url from 'url-parse';
import chalk from 'chalk';

import { ServerServices as Services, ServiceDefinitions } from '@/services';
import { Config, stripSecure, JsConfig, iterCommands } from './config';
import Device from './device';
import { getUser, setUserInfo } from './connections';

const devicesRoute = /^\/devices\/([^/]+)\/?$/;

function makeServices(app: Application<Services>, config: Config, jsConfig: JsConfig, devices: Device[]): ServiceDefinitions {
	const services: ServiceDefinitions = {
		'api/devices': {
			events: [ 'updated', 'data' ],
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
			async patch(id, data, params) {
				if(id === null) {
					throw new Error("Null ID");
				} else if(params === undefined || params.query === undefined) {
					throw new Error("Missing query");
				}
				const device = await this.get(id);
				switch(params.query.action) {
					case 'runCommand':
						services['api/commands'].find()
						break;
				}
				return device;
			}
		},

		'api/config': {
			async get(id, params) {
				const all = stripSecure(config);
				if(id == 'all') {
					return all;
				} else if(all.hasOwnProperty(id)) {
					return (all as any)[id];
				} else {
					throw new Error(`Config not found: ${id}`);
				}
			},
		},

		'api/users': {
			async get(id, params) {
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
				} else if(!data.displayName || data.displayName.length == 0) {
					throw new Error("Bad data");
				}
				const user = await this.get(id, params);
				return await setUserInfo(user.host, data.displayName, data.email && data.email.length > 0 ? data.email : undefined);
			},
		},

		'api/commands': {
			async find(params) {
				return jsConfig.commands || [];
			},
			async get(id, params) {
				if(jsConfig.commands) {
					for(const command of iterCommands(jsConfig.commands)) {
						if(command.name === id) {
							return command;
						}
					}
				}
				throw new Error(`Command not found: ${id}`);
			},
		},
	};
	return services;
}

function attachDeviceListeners(app: Application<Services>, devices: Device[]) {
	for(const device of devices) {
		const sendUpdate = () => device.emit(app, 'updated', { device });
		device.webConnections.on('connect', sendUpdate).on('disconnect', sendUpdate);
		for(const node of device.nodes) {
			//TODO Type safety here?
			node.serialPort.on('data', (data: Buffer) => device.emit(app, 'data', { node: node.name, data }));
			node.tcpConnections.on('connect', sendUpdate).on('disconnect', sendUpdate);
		}
	}
}

export function makeWebserver(config: Config, jsConfig: JsConfig, devices: Device[]): Application<Services> {
	const app = express(feathers<Services>());

	//TODO Figure out how to only allow CORS for REST endpoints
	// app.use(cors());

	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.configure(express.rest());

	app.configure(socketio(io => {
		io.on('connection', socket => {
			//@ts-ignore socket.feathers does exist even though it's not in the interface
			socket.feathers.ip = socket.conn.remoteAddress;
		});
	}));
	// app.on('connection', connection => app.channel('everybody').join(connection));
	// app.publish((data, hook) => app.channel('everybody'));
	app.publish(data => []);

	// Register a rewriter for /devices/:id for all valid IDs
	app.use((req: Request<any>, res: Response, next: NextFunction) => {
		const match = req.url.match(devicesRoute);
		if(match && devices.find(device => device.id === match[1])) {
			req.url = '/';
		}
		next();
	});

	// Register services
	const services = makeServices(app, config, jsConfig, devices);
	for(const [ name, service ] of Object.entries(services)) {
		app.use(name, service);
	}

	app.use(express.static('dist/client'));
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
		const id = data.id;
		if(id === undefined) {
			throw new Error('Device service event missing device ID');
		}
		return app.channel(`device/${id}`);
	});

	attachDeviceListeners(app, devices);
	return app;
}
