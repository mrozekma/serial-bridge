import RealSerialPort from 'serialport';

import chalk from 'chalk';
import { Mutex } from 'async-mutex';
import net from 'net';
import { EventEmitter } from 'events';
import feathers from '@feathersjs/feathers';
import socketioClient from '@feathersjs/socketio-client';
import ioClient from 'socket.io-client';

import { ClientServices as Services } from '@/services';
import { isBlacklisted } from './blacklist';
import Connections, { Connection } from './connections';
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
	private static readonly reconnectPeriod = 30000;
	private static readonly reconnectingSuffix = ". Attempting to reconnect";

	private readonly serialConn: RealSerialPort;
	private retryTimer: any = undefined; // Should be NodeJS.Timeout, but Typescript keeps getting confused between the Node setInterval() and the browser version.

	constructor(path: string, private baudRate: number, private byteSize: 5 | 6 | 7 | 8, private parity: 'even' | 'odd' | 'none', private stopBits: 1 | 2) {
		super();
		this.serialConn = new RealSerialPort(path, {
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
		this.serialConn.on('close', err => {
			if(this.isOpen) {
				this.state = {
					open: false,
					reason: (err.disconnected ? "Disconnected" : `Error: ${err}`) + SerialPort.reconnectingSuffix,
				};
				this.retryTimer = setInterval(() => this.open(), SerialPort.reconnectPeriod);
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

	constructor(public readonly device: Device, public readonly name: string,
		tcpPortNumber: number, public readonly webLinks: string[], public readonly ssh: SSHInfo | undefined)
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
		const { name, tcpPortNumber: tcpPort, tcpConnections, webLinks, ssh } = this;
		return {
			name, tcpPort, webLinks, ssh,
			type: this.constructor.name,
			tcpConnections: tcpConnections.toJSON(),
			state: this.port.state,
		};
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

	isOpen() {
		return this.port.isOpen;
	}

	open() {
		this.port.open();
	}

	close(reason: string) {
		this.port.close(reason);
	}

	write(buf: Buffer) {
		this.port.write(buf);
	}
}

export class SerialNode extends Node {
	public readonly serialPort: SerialPort;

	constructor(device: Device, name: string, public readonly path: string, public readonly baudRate: number,
		public readonly byteSize: 5 | 6 | 7 | 8, public readonly parity: 'even' | 'odd' | 'none', public readonly stopBits: 1 | 2,
		tcpPortNumber: number, webLinks: string[], ssh: SSHInfo | undefined)
	{
		super(device, name, tcpPortNumber, webLinks, ssh);
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

	onTcpConnectImpl(socket: net.Socket) {
		// Bi-directional pipe between the socket and the node's serial port
		socket.on('data', buf => this.serialPort.write(buf));
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

	constructor(device: Device, name: string, tcpPortNumber: number, webLinks: string[]) {
		super(device, name, tcpPortNumber, webLinks, undefined);
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

// NB: The Command class causes Device to emit many events not visible here
export default class Device extends EventEmitter {
	protected _nodes: Node[] = [];
	private _alive = true;
	public readonly webConnections: Connections;
	private readonly _commandMutex = new Mutex();
	private _build: Build | undefined = undefined;
	private _jenkinsLockOwner: string | undefined = undefined;

	constructor(public readonly id: string, public readonly name: string, public readonly description: string | undefined, public readonly category: string | undefined, public readonly tags: Tag[], public readonly jenkinsLockName?: string) {
		super();
		this.webConnections = new Connections();
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

	startBuild(name: string, link?: string): Build {
		this._build = new Build(this.name, name, link);
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

	protected kill() {
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

	toJSON() {
		const { id, name, description, category, tags, nodes, webConnections, build, jenkinsLockName, jenkinsLockOwner, alive } = this;
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
			alive,
			remoteInfo: undefined as RemoteInfo | undefined,
		};
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
}
