import ora from 'ora';

import banner from 'raw-loader!./banner.txt';
import { loadConfig, Config } from './config';
import Device from './device';

// From DefinePlugin
declare const BUILD_VERSION: string, BUILD_DATE: string;

function spinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
	const promise = fn();
	ora.promise(promise).start(label);
	return promise;
}

function makeDevice(deviceConfig: Config['devices'][number]): Device {
	const device = new Device(deviceConfig.name);
	for(const nodeConfig of deviceConfig.nodes) {
		const node = device.addNode(nodeConfig.name, nodeConfig["com port"], nodeConfig["baud rate"], nodeConfig["byte size"], nodeConfig.parity, nodeConfig.stop, nodeConfig["tcp port"], nodeConfig["web links"], nodeConfig.ssh);
		// node.serialEnabled = true;
		// node.tcpEnabled = true;
	}
	return device;
}

(async () => {
	console.log(`${banner}\n${BUILD_VERSION}\nBuilt ${BUILD_DATE}\n`);
	const config = await spinner("Load configuration", loadConfig);
	const devices: Device[] = await spinner("Load device information", async () => config.devices.map(makeDevice));
	if(config["web port"] !== undefined) {
		// await spinner("Load web interface", ...);
	}
})().catch(console.error);
