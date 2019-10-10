import { Application } from '@feathersjs/express';
import { Request, Response, NextFunction } from 'express-serve-static-core';
import ora from 'ora';
import slugify from 'slugify';
import Url from 'url-parse';

import banner from 'raw-loader!./banner.txt';
import { loadConfig, Config } from './config';
import Device from './device';
import { ServerServices as Services, ServiceDefinitions } from '@/services';

// From DefinePlugin
declare const BUILD_VERSION: string, BUILD_DATE: string;

function spinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
	const promise = fn();
	ora.promise(promise).start(label);
	return promise;
}

function makeDevice(deviceConfig: Config['devices'][number], existingIds?: Set<string>): Device {
	let id = slugify(deviceConfig.name, { lower: true });
	if(existingIds && existingIds.has(id)) {
		let i;
		for(i = 2; existingIds.has(`${id}-${i}`); i++);
		id = `${id}-${i}`;
	}
	const device = new Device(id, deviceConfig.name);
	for(const nodeConfig of deviceConfig.nodes) {
		const node = device.addNode(nodeConfig.name, nodeConfig.comPort, nodeConfig.baudRate, nodeConfig.byteSize, nodeConfig.parity, nodeConfig.stop, nodeConfig.tcpPort, nodeConfig.webLinks, nodeConfig.ssh);
		node.serialPort.open();
		node.tcpPort.open();
	}
	return device;
}

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

(async () => {
	console.log(`${banner}\n${BUILD_VERSION}\nBuilt ${BUILD_DATE}\n`);
	const config = await spinner("Load configuration", loadConfig);
	const devices: Device[] = await spinner("Load device information", async () => {
		//TODO Check for duplicate device/node names
		const ids = new Set<string>();
		return config.devices.map(deviceConfig => makeDevice(deviceConfig, ids));
	});
	if(config.webPort !== undefined) {
		const devicesRoute = /^\/devices\/([^/]+)\/?$/;
		const app = await spinner("Make webserver", async () => {
			const { makeWebserver } = await import(/* webpackChunkName: 'web' */ './web');
			return makeWebserver(app => {
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
			});
		});
		app.listen(config.webPort);
		console.log(`Listening on ${config.webPort}`);
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
			return [
				app.channel('everyone'),
				app.channel(`device/${id}`),
			];
		});
		let i = 0;
		const device = devices.find(device => device.id == 'test-device')!;
		setInterval(() => {
			device.emit(app, 'test', { i: i++ });
		}, 1000);
	}
})().catch(console.error);
