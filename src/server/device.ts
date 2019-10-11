import RealSerialPort from 'serialport';

import chalk from 'chalk';
import net from 'net';
import { Application } from '@feathersjs/express';
import { ServerServices as Services } from '@/services';

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
	}

	openImpl() { this.tcpServer.listen(this.port); }
	closeImpl() { this.tcpServer.close(); }
}

class Node {
	public readonly serialPort: SerialPort;
	public readonly tcpPort: TcpPort;

	constructor(public readonly device: Device, public readonly name: string, public readonly path: string, public readonly baudRate: number,
		public readonly byteSize: 5 | 6 | 7 | 8, public readonly parity: 'even' | 'odd' | 'none', public readonly stopBits: 1 | 2,
		public readonly tcpPortNumber: number, public readonly webLinks: string[], public readonly ssh: SSHInfo | undefined)
	{
		this.serialPort = new SerialPort(path, baudRate, byteSize, parity, stopBits);
		this.tcpPort = new TcpPort(tcpPortNumber, socket => this.onTcpConnect(socket));
		// this.serialConn.on('data', buf => this.onSerialData(buf));
	}

	toJSON() {
		const { name, path, baudRate, byteSize, parity, stopBits, tcpPortNumber: tcpPort } = this;
		return { name, path, baudRate, byteSize, parity, stopBits, tcpPort };
	}

	private log(message: string, ...args: any[]) {
		console.log(chalk.bgRed.bold(`${this.device.name}.${this.name}`) + ' ' + message, ...args);
	}

	private onTcpConnect(socket: net.Socket) {
		let address = socket.address();
		if(typeof address !== 'string') {
			address = `${address.address}:${address.port}`;
		}
		this.log(`${address} connected`);
		// Bi-directional pipe between the socket and the node's serial port
		socket.on('data', buf => this.serialPort.write(buf));
		const socketWrite = (buf: Buffer) => socket.write(buf);
		this.serialPort.on('data', socketWrite);
		socket.on('close', () => { this.log(`${address} disconnected`); this.serialPort.off('data', socketWrite) });
	}
}

type NodeCtorArgs = typeof Node extends new (device: Device, ...args: infer T) => Node ? T : never;

export default class Device {
	private _nodes: Node[] = [];

	constructor(public readonly id: string, public readonly name: string) {}

	get nodes(): Readonly<Node[]> {
		return this._nodes;
	}

	addNode(...args: NodeCtorArgs): Node {
		const node = new Node(this, ...args);
		this._nodes.push(node);
		return node;
	}

	emit(app: Application<Services>, event: string, data: {} = {}) {
		app.service('api/devices').emit(event, { device: this.id, ...data });
	}

	toJSON() {
		const { id, name, nodes } = this;
		return {
			id,
			name,
			nodes: nodes.map(node => node.toJSON()), // This is done manually for typing reasons
		};
	}
}
