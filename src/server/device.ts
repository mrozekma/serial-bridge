import RealSerialPort from 'serialport';

import chalk from 'chalk';
import { Mutex } from 'async-mutex';
import net from 'net';
import { Application } from '@feathersjs/express';

import { ServerServices as Services } from '@/services';
import Connections from './connections';

interface SSHInfo {
	host: string;
	username: string;
	password: string;
}

abstract class Port {
	protected state: {
		open: true;
	} | {
		open: false;
		reason: string;
	} = {
		open: false,
		reason: 'Never opened',
	};

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
	}

	on(...args: Parameters<RealSerialPort['on']>) { this.serialConn.on(...args); }
	off(...args: Parameters<RealSerialPort['off']>) { this.serialConn.off(...args); }
	openImpl() { this.serialConn.open(); }
	closeImpl() { this.serialConn.close(); }
	write(data: Buffer) { this.serialConn.write(data); }
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

class Node {
	public readonly serialPort: SerialPort;
	public readonly tcpPort: TcpPort;
	public readonly tcpConnections: Connections;

	constructor(public readonly device: Device, public readonly name: string, public readonly path: string, public readonly baudRate: number,
		public readonly byteSize: 5 | 6 | 7 | 8, public readonly parity: 'even' | 'odd' | 'none', public readonly stopBits: 1 | 2,
		public readonly tcpPortNumber: number, public readonly webLinks: string[], public readonly ssh: SSHInfo | undefined)
	{
		this.serialPort = new SerialPort(path, baudRate, byteSize, parity, stopBits);
		this.tcpPort = new TcpPort(tcpPortNumber, socket => this.onTcpConnect(socket));
		this.tcpConnections = new Connections();
	}

	toJSON() {
		const { name, path, baudRate, byteSize, parity, stopBits, tcpPortNumber: tcpPort, tcpConnections, webLinks, ssh } = this;
		return {
			name, path, baudRate, byteSize, parity, stopBits, tcpPort, webLinks, ssh,
			tcpConnections: tcpConnections.toJSON(),
		};
	}

	private log(message: string, ...args: any[]) {
		console.log(chalk.bgRed.bold(` ${this.device.name}.${this.name} `) + ' ' + message, ...args);
	}

	private onTcpConnect(socket: net.Socket) {
		let address = socket.address();
		if(typeof address !== 'string') {
			address = address.address;
		}
		this.log(`${address} connected`);
		this.tcpConnections.addConnection(address);
		socket.on('close', () => {
			this.log(`${address} disconnected`);
			this.tcpConnections.removeConnection(address as string);
		}).on('error', console.error);
		// Bi-directional pipe between the socket and the node's serial port
		socket.on('data', buf => this.serialPort.write(buf));
		socketListenTo(socket, this.serialPort, 'data', (buf: Buffer) => socket.write(buf));
	}
}

type NodeCtorArgs = typeof Node extends new (device: Device, ...args: infer T) => Node ? T : never;

export default class Device {
	private _nodes: Node[] = [];
	public readonly webConnections: Connections;
	private readonly commandMutex = new Mutex();

	constructor(public readonly id: string, public readonly name: string) {
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

	emit(app: Application<Services>, event: string, data: {} = {}) {
		app.service('api/devices').emit(event, { id: this.id, ...data });
	}

	runCommand(app: Application<Services>, name: string, fn: (api?: any) => Promise<void>, originSocketId?: string) {
		const sendUpdate = (state: string, rest: { [K: string]: any } = {}) => {
			if(originSocketId) {
				this.emit(app, 'command', {
					to: originSocketId,
					command: name,
					state,
					...rest,
				});
			}
		};

		const api = {
			send: (nodeName: string, message: Buffer | string) => {
				const node = this.nodes.find(node => node.name === nodeName);
				if(!node) {
					throw new Error(`Tried to send to non-existent node '${nodeName}'`);
				}
				if(typeof message === 'string') {
					message = Buffer.from(message, 'utf8');
				}
				node.serialPort.write(message);
			},
			sendln(nodeName: string, message: string) {
				this.send(nodeName, message + '\r\n');
			},
			termLine: (label: string, caps: 'start' | 'end' | undefined) => {
				this.emit(app, 'term-line', { label, caps });
			},
		};

		sendUpdate('pending');
		return this.commandMutex.runExclusive(async () => {
			sendUpdate('running');
			try {
				await fn(api);
				sendUpdate('done');
			} catch(e) {
				sendUpdate('failed', { error: e });
				throw e;
			}
		});
	}

	toJSON() {
		const { id, name, nodes } = this;
		return {
			id,
			name,
			nodes: nodes.map(node => node.toJSON()), // This is done manually for typing reasons
			webConnections: this.webConnections.toJSON(),
		};
	}
}
