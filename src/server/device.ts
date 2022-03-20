import { SerialPort as RealSerialPort } from 'serialport';

import { Mutex } from 'async-mutex';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import feathers from '@feathersjs/feathers';
import socketioClient from '@feathersjs/socketio-client';
import net from 'net';
import slugify from 'slugify';
import ioClient from 'socket.io-client';

import { ClientServices as Services } from '@/services';
import { isBlacklisted } from './blacklist';
import { Config } from './config';
import Connections, { Connection } from './connections';
import IdGenerator from './id-generator';
import Build, { setLockReservation } from './jenkins';

interface SSHInfo {
	host: string;
	username: string;
	password: string;
}

type PortState = {
	open: true;
} | {
	open: false;
	reason: string;
};

abstract class Port extends EventEmitter {
	private _state: PortState = {
		open: false,
		reason: 'Never opened',
	};

	get state() {
		return this._state;
	}

	set state(state) {
		this._state = state;
		this.emit('stateChanged', state);
	}

	get isOpen() {
		return this.state.open;
	}

	get whyClosed() {
		if(this.state.open) {
			throw new Error("Not closed");
		} else {
			return this.state.reason;
		}
	}

	open() {
		this.openImpl();
		// Leave it to the implementation to update this.state when the port is actually open
	}

	close(reason?: string) {
		if(reason) {
			this.state = {
				open: false,
				reason,
			};
		}
		this.closeImpl();
	}

	abstract openImpl(): void;
	abstract closeImpl(): void;
	abstract write(data: Buffer): void;
}

class SerialPort extends Port {
	private static readonly reconnectPeriods = [1000, 1000, 1000, 2000, 2000, 2000, 3000, 4000, 5000, 10000, 15000, 30000];
	private static readonly reconnectingSuffix = ". Attempting to reconnect";

	private readonly serialConn: RealSerialPort;
	private retryTimer: any = undefined; // Should be NodeJS.Timeout, but Typescript keeps getting confused between the Node setInterval() and the browser version.

	constructor(path: string, private baudRate: number, private byteSize: 5 | 6 | 7 | 8, private parity: 'even' | 'odd' | 'none', private stopBits: 1 | 2) {
		super();
		this.serialConn = new RealSerialPort({
			path,
			baudRate,
			parity,
			stopBits,
			dataBits: byteSize,
			autoOpen: false,
			lock: process.env.NODE_ENV === 'production',
		});
		this.serialConn.on('open', () => {
			if(this.retryTimer) {
				clearInterval(this.retryTimer);
				this.retryTimer = undefined;
			}
			this.state = {
				open: true,
			};
		});
		this.serialConn.on('close', (err: any) => {
			if(this.isOpen) {
				this.state = {
					open: false,
					reason: (err?.disconnected ? "Disconnected" : `Error: ${err}`) + SerialPort.reconnectingSuffix,
				};
				const periods = [...SerialPort.reconnectPeriods].reverse();
				const sched = () => {
					const period = periods.pop();
					this.retryTimer = (periods.length > 0)
						? setTimeout(() => { sched(); this.open(); }, period)
						: setInterval(() => this.open(), period);
				};
				sched();
			}
		});
		this.serialConn.on('error', console.error);
		this.serialConn.on('data', (data: Buffer) => this.emit('data', data));
	}

	openImpl() {
		this.serialConn.open(err => {
			if(err) {
				this.state = {
					open: false,
					reason: err.message + (this.retryTimer ? SerialPort.reconnectingSuffix : ''),
				};
			}
		});
	}

	closeImpl() {
		this.serialConn.close();
	}

	write(data: Buffer) {
		this.serialConn.write(data);
	}
}

class TcpPort extends Port {
	private readonly tcpServer: net.Server;
	private _port: number;
	private sockets = new Set<net.Socket>();

	constructor(port: number, onConnect: (socket: net.Socket) => void) {
		super();
		this._port = port;
		this.tcpServer = net.createServer(socket => {
			this.sockets.add(socket);
			socket.on('close', () => this.sockets.delete(socket));
			onConnect(socket);
		});
		this.tcpServer.on('error', console.error);
		this.tcpServer.on('listening', () => {
			const addr = this.tcpServer.address() as net.AddressInfo;
			// In case the original portNum was 0
			this._port = addr.port;
		});
	}

	get port() {
		return this._port;
	}

	openImpl() {
		this.tcpServer.once('listening', () => this.state = {
			open: true,
		});
		this.tcpServer.listen(this.port);
	}

	closeImpl() {
		this.tcpServer.close();
		this.sockets.forEach(socket => socket.end());
	}

	write(data: Buffer) {
		// Should never be sending here; sending to a remote TCP connection happens through its socket
		throw new Error("Cannot write to TCP server port");
	}
}

interface OnOff {
	on: (event: string, cb: (...args: any[]) => void) => void;
	off: (event: string, cb: (...args: any[]) => void) => void;
}

function socketListenTo(socket: net.Socket, target: OnOff, event: string, listener: (...args: any[]) => void) {
	target.on(event, listener);
	socket.on('close', () => target.off(event, listener));
}

export abstract class Node extends EventEmitter {
	public readonly tcpPort: TcpPort;
	public readonly tcpConnections: Connections;
	private recentWrites = new Map<string, NodeJS.Timeout>(); // host -> timer

	constructor(public readonly device: Device, public readonly name: string,
		public readonly eol: 'cr' | 'lf' | 'crlf',  tcpPortNumber: number, public readonly webLinks: string[],
		public readonly ssh: SSHInfo | undefined, public readonly metadata?: object)
	{
		super();
		this.tcpPort = new TcpPort(tcpPortNumber, socket => this.onTcpConnect(socket));
		this.tcpConnections = new Connections();
		this.tcpConnections.on('connect', (connection: Connection) => this.emit('tcpConnect', connection));
		this.tcpConnections.on('disconnect', (connection: Connection) => this.emit('tcpDisconnect', connection));
		// Wait until the child class constructor has initialized this.port before attaching listeners
		process.nextTick(() => {
			this.port.on('stateChanged', () => this.emit('serialStateChanged'));
			this.port.on('data', (data: Buffer) => this.emit('serialData', data));
		});
	}

	abstract get port(): Port;

	get tcpPortNumber() {
		return this.tcpPort.port;
	}

	toJSON() {
		const { name, tcpPortNumber: tcpPort, tcpConnections, webLinks, ssh, eol, metadata } = this;
		return {
			name, tcpPort, webLinks, ssh, eol, metadata,
			type: this.constructor.name,
			tcpConnections: tcpConnections.toJSON(),
			state: this.port.state,
		};
	}

	matchesConfig(nodeConfig: Config['devices'][number]['nodes'][number]) {
		return false;
	}

	private log(message: string, ...args: any[]) {
		console.log(chalk.bgRed.bold(` ${this.device.name}.${this.name} `) + ' ' + message, ...args);
	}

	private onTcpConnect(socket: net.Socket) {
		const address = socket.remoteAddress!;
		if(isBlacklisted(address)) {
			this.log(`${address} rejected -- blacklisted`);
			socket.write("Blacklisted\r\n");
			socket.destroy();
			return;
		}
		this.log(`${address} connected`);
		this.tcpConnections.addConnection(address);
		socket.on('close', () => {
			this.log(`${address} disconnected`);
			this.tcpConnections.removeConnection(address);
		}).on('error', console.error);
		this.onTcpConnectImpl(socket);
	}

	protected abstract onTcpConnectImpl(socket: net.Socket): void;

	deepRemoveAllListeners() {
		super.removeAllListeners();
		this.tcpPort.removeAllListeners();
		this.tcpConnections.removeAllListeners();
		return this;
	}

	isOpen() {
		return this.port.isOpen;
	}

	open() {
		this.port.open();
	}

	close(reason: string) {
		this.port.close(reason);
	}

	write(buf: Buffer, host?: string) {
		this.port.write(buf);
		if(host) {
			const timer = this.recentWrites.get(host);
			if(timer) {
				clearTimeout(timer);
			}
			this.recentWrites.set(host, global.setTimeout(() => this.recentWrites.delete(host), 1000));
			if(this.recentWrites.size > 1) {
				this.emit('writeCollision', [...this.recentWrites.keys()]);
			}
		}
	}
}

export class SerialNode extends Node {
	public readonly serialPort: SerialPort;

	constructor(device: Device, name: string, public readonly path: string, public readonly baudRate: number,
		public readonly byteSize: 5 | 6 | 7 | 8, public readonly parity: 'even' | 'odd' | 'none', public readonly stopBits: 1 | 2,
		public readonly eol: 'cr' | 'lf' | 'crlf',
		tcpPortNumber: number, webLinks: string[], ssh: SSHInfo | undefined, public readonly metadata?: object)
	{
		super(device, name, eol, tcpPortNumber, webLinks, ssh, metadata);
		this.serialPort = new SerialPort(path, baudRate, byteSize, parity, stopBits);
	}

	get port() {
		return this.serialPort;
	}

	toJSON() {
		const { path, baudRate, byteSize, parity, stopBits } = this;
		return {
			...super.toJSON(),
			type: 'serial',
			path, baudRate, byteSize, parity, stopBits,
		};
	}

	matchesConfig(nodeConfig: Config['devices'][number]['nodes'][number]) {
		if(this.baudRate !== nodeConfig.baudRate) { return false; }
		if(this.byteSize !== nodeConfig.byteSize) { return false; }
		if(this.path !== nodeConfig.comPort) { return false; }
		if(JSON.stringify(this.metadata) !== JSON.stringify(nodeConfig.metadata)) { return false; }
		if(this.name !== nodeConfig.name) { return false; }
		if(this.parity !== nodeConfig.parity) { return false; }
		if(JSON.stringify(this.ssh) !== JSON.stringify(nodeConfig.ssh)) { return false; }
		if(this.stopBits !== nodeConfig.stop) { return false; }
		if(nodeConfig.tcpPort !== 0 && this.tcpPortNumber !== nodeConfig.tcpPort) { return false; }
		return true;
	}

	onTcpConnectImpl(socket: net.Socket) {
		// Bi-directional pipe between the socket and the node's serial port
		socket.on('data', buf => this.write(buf, socket.remoteAddress!));
		socketListenTo(socket, this.serialPort, 'data', (buf: Buffer) => socket.write(buf));
	}
}

class RemoteIOPort extends Port {
	private socket: net.Socket | undefined;
	private _portNum: number = 0;

	constructor() {
		super();
		const server = new net.Server(socket => {
			if(this.isOpen) {
				this.close();
			}
			this.socket = socket;
			this.state = {
				open: true,
			};
			socket.on('close', () => {
				if(this.socket === socket) {
					this.socket = undefined;
					this.state = {
						open: false,
						reason: `Remote process disconnected. Waiting for new connection on port ${this.portNum}`,
					};
				}
			});
			socket.on('data', data => this.emit('data', data));
		});
		server.on('listening', () => {
			const addr = server.address() as net.AddressInfo;
			this._portNum = addr.port;
			this.state = {
				open: false,
				reason: `Waiting for connection on port ${this.portNum}`,
			};
		});
		server.listen();
	}

	get portNum() {
		return this._portNum;
	}

	get remoteAddress() {
		return this.socket?.remoteAddress;
	}

	openImpl() {
		throw new Error("Open this node by connecting to its port");
	}

	closeImpl() {
		if(this.socket === undefined) {
			throw new Error("Not open");
		}
		this.socket.destroy();
		this.socket = undefined;
	}

	write(data: Buffer) {
		if(this.socket === undefined) {
			throw new Error("Not open");
		}
		this.socket.write(data);
	}
}

export class RemoteIONode extends Node {
	public readonly port: RemoteIOPort;

	constructor(device: Device, name: string, eol: 'cr' | 'lf' | 'crlf', tcpPortNumber: number, webLinks: string[]) {
		super(device, name, eol, tcpPortNumber, webLinks, undefined);
		this.port = new RemoteIOPort();
	}

	toJSON() {
		const { remoteAddress, portNum: port } = this.port;
		return {
			...super.toJSON(),
			type: 'remote_io',
			remoteAddress, port,
		};
	}

	onTcpConnectImpl(socket: net.Socket) {
		// Bi-directional pipe between the sockets
		socket.on('data', buf => this.port.isOpen && this.port.write(buf));
		socketListenTo(socket, this.port, 'data', (buf: Buffer) => socket.write(buf));
	}
}

interface Tag {
	name: string;
	description?: string;
	color?: string;
	showOnDevicePage?: boolean;
}

export interface RemoteInfo {
	name: string;
	url: string;
}

export interface DevicesConfigReloadSpec {
	add: string[];
	change: {
		[K: string]: 'update' | 'remove';
	}
}

export class Devices extends EventEmitter {
	private devices: Device[] = [];

	constructor(devices?: Device[], private readonly idGen: IdGenerator = new IdGenerator()) {
		super();
		if(devices) {
			this.devices.push(...devices);
		}
		this.on('removed', (devices: Devices, device: Device, idx: number) => {
			device.kill();
			idGen.release(device.id);
		});
	}

	// Pass some array functions through to this.devices
	// Theoretically these could be of the form foo(...args: Parameters<Device[]['foo']), but I can't figure out how to handle the generics, so the declarations are copied from the Array<T> interface.
	[Symbol.iterator]() {
		return this.devices[Symbol.iterator]();
	}
	find<S extends Device>(predicate: (this: void, value: Device, index: number, obj: Device[]) => value is S): S | undefined;
	find(predicate: (value: Device, index: number, obj: Device[]) => unknown): Device | undefined;
	find(predicate: (value: Device, index: number, obj: Device[]) => unknown): Device | undefined {
		return this.devices.find(predicate);
	}
	map<U>(callbackfn: (value: Device, index: number, array: Device[]) => U): U[] {
		return this.devices.map(callbackfn);
	}
	some(predicate: (value: Device, index: number, array: Device[]) => unknown): boolean {
		return this.devices.some(predicate);
	}

	add(device: Device) {
		const len = this.devices.push(device);
		this.emit('added', this, device, len - 1);
	}

	remove(deviceOrIdx: Device | number): Device | undefined {
		if(typeof deviceOrIdx === 'number') {
			const idx = deviceOrIdx;
			if(idx >= 0 && idx < this.devices.length) {
				const [ device ] = this.devices.splice(idx, 1);
				this.emit('removed', this, device, idx);
				return device;
			}
			return undefined;
		} else {
			return this.remove(this.devices.findIndex(seek => seek.id === deviceOrIdx.id));
		}
	}

	removeByName(name: string): Device | undefined {
		return this.remove(this.devices.findIndex(device => device.name === name));
	}

	// Return a spec of all possible changes given this new config
	reloadConfig(devicesConfig: Config['devices']): DevicesConfigReloadSpec;
	// Make the changes provided in the given spec
	reloadConfig(devicesConfig: Config['devices'], spec: DevicesConfigReloadSpec): void;
	// Make all possible changes
	reloadConfig(devicesConfig: Config['devices'], spec: true): void;
	reloadConfig(devicesConfig: Config['devices'], spec?: DevicesConfigReloadSpec | true): DevicesConfigReloadSpec | undefined {
		const rtn: DevicesConfigReloadSpec | undefined = spec ? undefined : {
			add: [],
			change: {},
		};
		// Check the current devices for any that have been updated or removed
		for(const device of this) {
			if(device.ephemeral) {
				continue;
			}
			const deviceConfig = devicesConfig.find(seek => seek.name === device.name);
			if(!deviceConfig) { // Removed
				if(rtn) {
					rtn.change[device.id] = 'remove';
				} else if(spec === true || spec!.change[device.id] === 'remove') {
					this.remove(device);
				}
			} else if(!device.matchesConfig(deviceConfig)) { // Updated
				if(rtn) {
					rtn.change[device.id] = 'update';
				} else if(spec === true || spec!.change[device.id] === 'update') {
					this.remove(device);
					const newDevice = Device.fromConfig(deviceConfig, device.id);
					newDevice.copyRuntimeData(device);
					this.add(newDevice);
				}
			}
		}
		// Check for new devices
		for(const deviceConfig of devicesConfig) {
			if(!this.some(device => device.name === deviceConfig.name)) {
				if(rtn) {
					rtn.add.push(deviceConfig.name);
				} else if(spec === true || spec!.add.indexOf(deviceConfig.name) >= 0) {
					this.add(Device.fromConfig(deviceConfig, this.idGen));
				}
			}
		}
		return rtn;
	}

	static fromConfig(devicesConfig: Config['devices']): Devices {
		//TODO Check for duplicate device/node names
		const idGen = new IdGenerator();
		return new Devices(devicesConfig.map(deviceConfig => Device.fromConfig(deviceConfig, idGen)), idGen);
	}
}

// NB: The Command class causes Device to emit many events not visible here
export default class Device extends EventEmitter {
	protected _nodes: Node[] = [];
	private _alive = true;
	public readonly webConnections: Connections;
	private readonly _commandMutex = new Mutex();
	private _build: Build | undefined = undefined;
	private _jenkinsLockOwner: string | undefined = undefined;

	constructor(public readonly id: string, public readonly name: string, public readonly description: string | undefined, public readonly category: string | undefined, public readonly tags: Tag[], public readonly jenkinsLockName?: string, public readonly metadata?: object) {
		super();
		this.webConnections = new Connections();
	}

	emit(event: string | symbol, ...args: any[]) {
		if(!this._alive) {
			console.log(`Event ${String(event)} on dead device ${this.id}`);
		}
		return super.emit(event, ...args);
	}

	get nodes(): Readonly<Node[]> {
		return this._nodes;
	}

	addNode(node: Node) {
		if(node.device !== this) {
			throw new Error("Node belongs to wrong device");
		}
		this._nodes.push(node);
	}

	get commandMutex(): Mutex {
		return this._commandMutex;
	}

	get build(): Build | undefined {
		return this._build;
	}

	startBuild(name: string, link?: string, fromXml: boolean = false): Build {
		this._build = new Build(this.name, name, link, fromXml);
		this._build.on('updated', () => this.emit('updated'));
		this._build.emit('updated', 'started');
		return this._build;
	}

	endBuild() {
		const rtn = this._build;
		this._build = undefined;
		if(rtn) {
			rtn.emit('updated', 'ended');
		}
		return rtn;
	}

	get jenkinsLockOwner(): string | undefined {
		return this._jenkinsLockOwner;
	}

	set jenkinsLockOwner(owner: string | undefined) {
		this._jenkinsLockOwner = owner;
		this.emit('updated');
	}

	reserveInJenkins(jenkinsBaseUrl: string, jenkinsUsername: string, jenkinsApiKey: string) {
		if(!this.jenkinsLockName) {
			throw new Error(`Device ${this.name} has no associated Jenkins lock`);
		}
		return setLockReservation(jenkinsBaseUrl, jenkinsUsername, jenkinsApiKey, this.jenkinsLockName, 'reserve');
	}

	unreserveInJenkins(jenkinsBaseUrl: string, jenkinsUsername: string, jenkinsApiKey: string) {
		if(!this.jenkinsLockName) {
			throw new Error(`Device ${this.name} has no associated Jenkins lock`);
		}
		return setLockReservation(jenkinsBaseUrl, jenkinsUsername, jenkinsApiKey, this.jenkinsLockName, 'unreserve');
	}

	get alive() {
		return this._alive;
	}

	get ephemeral() {
		return false;
	}

	kill() {
		this._alive = false;
		for(const node of this.nodes) {
			if(node.isOpen()) {
				node.port.close();
			}
			if(node.tcpPort.isOpen) {
				node.tcpPort.close();
			}
		}
		this.emit('updated');
	}

	deepRemoveAllListeners() {
		super.removeAllListeners();
		this.webConnections.removeAllListeners();
		for(const node of this.nodes) {
			node.removeAllListeners();
		}
		return this;
	}

	toJSON() {
		const { id, name, description, category, tags, nodes, webConnections, build, jenkinsLockName, jenkinsLockOwner, metadata, alive, ephemeral } = this;
		return {
			id,
			name,
			description,
			category,
			tags,
			nodes: nodes.map(node => node.toJSON()),
			webConnections: webConnections.toJSON(),
			build: build ? build.toJSON() : undefined,
			jenkinsLockName,
			jenkinsLockOwner,
			metadata,
			alive,
			ephemeral,
			remoteInfo: undefined as RemoteInfo | undefined,
		};
	}

	matchesConfig(deviceConfig: Config['devices'][number]): boolean {
		if(this.category !== deviceConfig.category) { return false; }
		if(this.description !== deviceConfig.description) { return false; }
		if(this.jenkinsLockName !== deviceConfig.jenkinsLock) { return false; }
		if(JSON.stringify(this.metadata) !== JSON.stringify(deviceConfig.metadata)) { return false; }
		if(this.name !== deviceConfig.name) { return false; }
		if(this.nodes.length !== deviceConfig.nodes.length) { return false; }
		if(this.tags.length !== deviceConfig.tags.length) { return false; }
		for(let i = 0; i < this.nodes.length; i++) {
			if(!this.nodes[i].matchesConfig(deviceConfig.nodes[i])) { return false; }
		}
		const tags = Device.normalizeTags(deviceConfig.tags);
		for(let i = 0; i < this.tags.length; i++) {
			if(this.tags[i].name !== tags[i].name) { return false; }
			if(this.tags[i].description !== tags[i].description) { return false; }
			if(this.tags[i].color !== tags[i].color) { return false; }
			if(this.tags[i].showOnDevicePage !== tags[i].showOnDevicePage) { return false; }
		}
		return true;
	}

	copyRuntimeData(device: Device) {
		this.webConnections.addFrom(device.webConnections);
		this._build = device._build ? Build.makeFrom(device._build) : undefined;
		this._build?.on('updated', () => this.emit('updated'));
		this._jenkinsLockOwner = device._jenkinsLockOwner;
	}

	static normalizeTags(tagsConfig: Config['devices'][number]['tags']): Tag[] {
		return (tagsConfig as Exclude<typeof tagsConfig, never[]>).map(tag => (typeof tag === 'string') ? { name: tag } : tag);
	}

	static fromConfig(deviceConfig: Config['devices'][number], id: string | IdGenerator): Device {
		if(typeof id !== 'string') {
			id = id.gen(slugify(deviceConfig.name, { lower: true }));
		}
		const device = new Device(id, deviceConfig.name, deviceConfig.description, deviceConfig.category, Device.normalizeTags(deviceConfig.tags), deviceConfig.jenkinsLock, deviceConfig.metadata);
		for(const nodeConfig of deviceConfig.nodes) {
			const node = new SerialNode(device, nodeConfig.name, nodeConfig.comPort, nodeConfig.baudRate, nodeConfig.byteSize, nodeConfig.parity, nodeConfig.stop, nodeConfig.eol, nodeConfig.tcpPort, nodeConfig.webLinks, nodeConfig.ssh, nodeConfig.metadata);
			device.addNode(node);
			node.serialPort.open();
			node.tcpPort.open();
		}
		return device;
	}

	static isDevice(device: any): device is Device {
		return !!(device.id && device.name && device.nodes);
	}
}

// Dies when all nodes are closed
export class EphemeralDevice extends Device {
	private gracePeriod = true;

	constructor(...args: (typeof Device extends new (...args: infer T) => Device ? T : never)) {
		super(...args);
		setTimeout(() => {
			this.gracePeriod = false;
			this.checkDead();
		}, 10000);
	}

	get ephemeral() {
		return true;
	}

	addNode(node: Node) {
		super.addNode(node);
		node.on('serialStateChanged', () => {
			if(!node.isOpen()) {
				this.checkDead();
			}
		});
	}

	checkDead() {
		if(!this.gracePeriod && !this.nodes.some(node => node.isOpen())) {
			this.kill();
		}
	}
}

type DeviceJson = ReturnType<Device['toJSON']>;
export class Remote {
	public readonly app: feathers.Application<Services>;

	constructor(public readonly name: string, public readonly url: string, public readonly deviceRewriter: (device: DeviceJson) => DeviceJson) {
		this.app = feathers<Services>();
		const remoteSocket = ioClient(`${this.url}?remote`);
		this.app.configure(socketioClient(remoteSocket));
	}

	public rewriteDeviceJson(device: DeviceJson, applyConfigRewrites: boolean = true): DeviceJson {
		return {
			...(applyConfigRewrites ? this.deviceRewriter(device) : device),
			remoteInfo: {
				name: this.name,
				url: this.url,
			},
		};
	}

	static fromConfig(remoteConfig: Config['remotes'][number]): Remote {
		return new Remote(remoteConfig.name, remoteConfig.url, remoteConfig.deviceRewriter as any);
	}
}
