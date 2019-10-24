import RealSerialPort from 'serialport';

import chalk from 'chalk';
import { Mutex } from 'async-mutex';
import net from 'net';
import { EventEmitter } from 'events';

import { ServerServices as Services } from '@/services';
import Connections, { Connection } from './connections';
import Build from './jenkins';

interface SSHInfo {
	host: string;
	username: string;
	password: string;
}

abstract class Port extends EventEmitter {
	private _state: {
		open: true;
	} | {
		open: false;
		reason: string;
	} = {
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
}

class SerialPort extends Port {
	private readonly serialConn: RealSerialPort;

	constructor(path: string, private baudRate: number, private byteSize: 5 | 6 | 7 | 8, private parity: 'even' | 'odd' | 'none', private stopBits: 1 | 2) {
		super();
		this.serialConn = new RealSerialPort(path, {
			baudRate,
			parity,
			stopBits,
			dataBits: byteSize,
			autoOpen: false,
		});
		this.serialConn.on('open', () => this.state = { open: true });
		this.serialConn.on('close', err => {
			if(this.isOpen) {
				this.state = {
					open: false,
					reason: err.disconnected ? "Disconnected" : `Error: ${err}`,
				};
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
					reason: err.message,
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

	constructor(private port: number, onConnect: (socket: net.Socket) => void) {
		super();
		this.tcpServer = net.createServer(onConnect);
		this.tcpServer.on('error', console.error);
	}

	openImpl() { this.tcpServer.listen(this.port); }
	closeImpl() { this.tcpServer.close(); }
}

interface OnOff {
	on: (event: string, cb: (...args: any[]) => void) => void;
	off: (event: string, cb: (...args: any[]) => void) => void;
}

function socketListenTo(socket: net.Socket, target: OnOff, event: string, listener: (...args: any[]) => void) {
	target.on(event, listener);
	socket.on('close', () => target.off(event, listener));
}

class Node extends EventEmitter {
	public readonly serialPort: SerialPort;
	public readonly tcpPort: TcpPort;
	public readonly tcpConnections: Connections;

	constructor(public readonly device: Device, public readonly name: string, public readonly path: string, public readonly baudRate: number,
		public readonly byteSize: 5 | 6 | 7 | 8, public readonly parity: 'even' | 'odd' | 'none', public readonly stopBits: 1 | 2,
		public readonly tcpPortNumber: number, public readonly webLinks: string[], public readonly ssh: SSHInfo | undefined)
	{
		super();
		this.serialPort = new SerialPort(path, baudRate, byteSize, parity, stopBits);
		this.tcpPort = new TcpPort(tcpPortNumber, socket => this.onTcpConnect(socket));
		this.tcpConnections = new Connections();

		this.serialPort.on('stateChanged', () => this.emit('serialStateChanged'));
		this.serialPort.on('data', (data: Buffer) => this.emit('serialData', data));
		this.tcpConnections.on('connect', (connection: Connection) => this.emit('tcpConnect', connection));
		this.tcpConnections.on('disconnect', (connection: Connection) => this.emit('tcpDisconnect', connection));
	}

	toJSON() {
		const { name, path, baudRate, byteSize, parity, stopBits, tcpPortNumber: tcpPort, tcpConnections, webLinks, ssh } = this;
		return {
			name, path, baudRate, byteSize, parity, stopBits, tcpPort, webLinks, ssh,
			tcpConnections: tcpConnections.toJSON(),
			state: this.serialPort.state,
		};
	}

	private log(message: string, ...args: any[]) {
		console.log(chalk.bgRed.bold(` ${this.device.name}.${this.name} `) + ' ' + message, ...args);
	}

	private onTcpConnect(socket: net.Socket) {
		let address = socket.remoteAddress!;
		this.log(`${address} connected`);
		this.tcpConnections.addConnection(address);
		socket.on('close', () => {
			this.log(`${address} disconnected`);
			this.tcpConnections.removeConnection(address);
		}).on('error', console.error);
		// Bi-directional pipe between the socket and the node's serial port
		socket.on('data', buf => this.serialPort.write(buf));
		socketListenTo(socket, this.serialPort, 'data', (buf: Buffer) => socket.write(buf));
	}
}

type NodeCtorArgs = typeof Node extends new (device: Device, ...args: infer T) => Node ? T : never;

// NB: The Command class causes Device to emit many events not visible here
export default class Device extends EventEmitter {
	private _nodes: Node[] = [];
	public readonly webConnections: Connections;
	private readonly _commandMutex = new Mutex();
	private _build: Build | undefined = undefined;

	constructor(public readonly id: string, public readonly name: string) {
		super();
		this.webConnections = new Connections();
	}

	get nodes(): Readonly<Node[]> {
		return this._nodes;
	}

	addNode(...args: NodeCtorArgs): Node {
		const node = new Node(this, ...args);
		this._nodes.push(node);
		return node;
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



	toJSON() {
		const { id, name, nodes, webConnections, build } = this;
		return {
			id,
			name,
			nodes: nodes.map(node => node.toJSON()),
			webConnections: webConnections.toJSON(),
			build: build ? build.toJSON() : undefined,
		};
	}
}
