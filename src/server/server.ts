import { Application } from '@feathersjs/express';
import { Request, Response, NextFunction } from 'express-serve-static-core';
import ora from 'ora';
import slugify from 'slugify';

import banner from 'raw-loader!./banner.txt';
import { loadConfig, Config } from './config';
import Device from './device';
import { ServerServices as Services } from '@/services';

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

function makeServices(app: Application<Services>, devices: Device[]): Services {
	return {
		'api/devices': {
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
		const app = await spinner("Make webserver", async () => {
			const { makeWebserver } = await import(/* webpackChunkName: 'web' */ './web');
			return makeWebserver(app => {
				// Register a rewriter for /devices/:id for all valid IDs
				const devicesPat = /^\/devices\/([^/]+)\/?$/;
				app.use((req: Request<any>, res: Response, next: NextFunction) => {
					const match = req.url.match(devicesPat);
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
	}
})().catch(console.error);
