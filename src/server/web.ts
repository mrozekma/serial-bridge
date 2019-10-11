import feathers from '@feathersjs/feathers';
import express, { Application } from '@feathersjs/express';
import socketio from '@feathersjs/socketio';
import '@feathersjs/transport-commons'; // Adds channel typing to express.Application
import { Request, Response, NextFunction } from 'express-serve-static-core';
import Url from 'url-parse';

import { ServerServices as Services, ServiceDefinitions } from '@/services';
import Device from './device';

const devicesRoute = /^\/devices\/([^/]+)\/?$/;

function makeServices(app: Application<Services>, devices: Device[]): ServiceDefinitions {
	return {
		'api/devices': {
			events: [ 'test' ],
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
			async update(id, data, params) {
				//TODO
				throw new Error('Unimplemented');
			}
		},
	};
}

export function makeWebserver(devices: Device[]): Application<Services> {
	const app = express(feathers<Services>());

	//TODO Figure out how to only allow CORS for REST endpoints
	// app.use(cors());

	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.configure(express.rest());

	app.configure(socketio(io => {}));
	// app.on('connection', connection => app.channel('everybody').join(connection));
	// app.publish((data, hook) => app.channel('everybody'));
	app.publish(data => { throw new Error(`Unexpected root-app publish: ${data}`); });

	// Register a rewriter for /devices/:id for all valid IDs
	app.use((req: Request<any>, res: Response, next: NextFunction) => {
		const match = req.url.match(devicesRoute);
		if(match && devices.find(device => device.id === match[1])) {
			req.url = '/';
		}
		next();
	});

	// Register services
	const services = makeServices(app, devices);
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

	// If a connection comes in from /device/:id, join that device's channel
	app.on('connection', connection => {
		const { pathname } = new Url((connection as any).headers.referer);
		const match = pathname.match(devicesRoute);
		if(match && devices.find(device => device.id === match[1])) {
			app.channel(`device/${match[1]}`).join(connection);
		}
	});

	app.service('api/devices').publish(data => {
		const id = data.device;
		if(id === undefined) {
			throw new Error('Device service event missing device ID');
		}
		return app.channel(`device/${id}`);
	});

	return app;
}
