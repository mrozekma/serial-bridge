import ora from 'ora';
import slugify from 'slugify';

import banner from 'raw-loader!./banner.txt';
import { loadConfig, Config } from './config';
import Device from './device';
import { configureUserFactory } from './connections';
import IdGenerator from './id-generator';
import Command from './command';

// From DefinePlugin
declare const BUILD_VERSION: string, BUILD_DATE: string;

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
	const device = new Device(id, deviceConfig.name);
	for(const nodeConfig of deviceConfig.nodes) {
		const node = device.addNode(nodeConfig.name, nodeConfig.comPort, nodeConfig.baudRate, nodeConfig.byteSize, nodeConfig.parity, nodeConfig.stop, nodeConfig.tcpPort, nodeConfig.webLinks, nodeConfig.ssh);
		node.serialPort.open();
		node.tcpPort.open();
	}
	return device;
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

(async () => {
	console.log(`${banner}\n${BUILD_VERSION}\nBuilt ${BUILD_DATE}\n`);
	const config = await spinner("Load configuration", loadConfig);
	configureUserFactory(config.users ? config.users.identify as any : undefined);
	const devices: Device[] = await spinner("Load device information", async () => {
		//TODO Check for duplicate device/node names
		const idGen = new IdGenerator();
		return config.devices.map(deviceConfig => makeDevice(deviceConfig, idGen));
	});
	if(config.webPort !== undefined) {
		const commands: Command[] = await spinner("Load commands", async () => {
			const idGen = new IdGenerator('command');
			return config.commands ? config.commands.map(commandConfig => makeCommand(commandConfig, idGen)) : [];
		});
		const app = await spinner("Make webserver", async () => {
			const { makeWebserver } = await import(/* webpackChunkName: 'web' */ './web');
			return makeWebserver(config, devices, commands);
		});
		app.listen(config.webPort);
		console.log(`Listening on ${config.webPort}`);

	}
})().catch(console.error);
