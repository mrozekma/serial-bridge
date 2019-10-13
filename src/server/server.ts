import ora from 'ora';
import slugify from 'slugify';

import banner from 'raw-loader!./banner.txt';
import { loadConfig, Config } from './config';
import Device from './device';
import { configureUserFactory } from './connections';

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

(async () => {
	console.log(`${banner}\n${BUILD_VERSION}\nBuilt ${BUILD_DATE}\n`);
	const config = await spinner("Load configuration", loadConfig);
	configureUserFactory(config.userDirectory);
	const devices: Device[] = await spinner("Load device information", async () => {
		//TODO Check for duplicate device/node names
		const ids = new Set<string>();
		return config.devices.map(deviceConfig => makeDevice(deviceConfig, ids));
	});
	if(config.webPort !== undefined) {
		const app = await spinner("Make webserver", async () => {
			const { makeWebserver } = await import(/* webpackChunkName: 'web' */ './web');
			return makeWebserver(devices);
		});
		app.listen(config.webPort);
		console.log(`Listening on ${config.webPort}`);

	}
})().catch(console.error);
