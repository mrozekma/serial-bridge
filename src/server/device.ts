import SerialPort from 'serialport';

import net from 'net';

interface SSHInfo {
	host: string;
	username: string;
	password: string;
}

class Node {
	private readonly serialConn: SerialPort;
	private readonly tcpServer: net.Server;

	constructor(private device: Device, private name: string, private path: string, private baudRate: number,
		private byteSize: 5 | 6 | 7 | 8, private parity: 'even' | 'odd' | 'none', private stopBits: 1 | 2,
		private tcpPort: number, private webLinks: string[], private ssh: SSHInfo | undefined)
	{
		this.serialConn = new SerialPort(path, {
			baudRate,
			parity,
			stopBits,
			dataBits: byteSize,
			autoOpen: false,
		});
		this.tcpServer = net.createServer(socket => this.onTcpConnect(socket));
	}

	toJSON() {
		const { name, path, baudRate, byteSize, parity, stopBits, tcpPort } = this;
		return { name, path, baudRate, byteSize, parity, stopBits, tcpPort };
	}

	get serialEnabled(): boolean {
		return this.serialConn.isOpen;
	}

	set serialEnabled(b: boolean) {
		if(b) {
			this.serialConn.open();
		} else {
			this.serialConn.close();
		}
	}

	get tcpEnabled(): boolean {
		return this.tcpServer.listening;
	}

	set tcpEnabled(b: boolean) {
		if(b) {
			this.tcpServer.listen(this.tcpPort);
		} else {
			this.tcpServer.close();
		}
	}

	private onTcpConnect(socket: net.Socket) {
		console.log('tcp connect', socket)
	}
}

type NodeCtorArgs = typeof Node extends new (device: Device, ...args: infer T) => Node ? T : never;

export default class Device {
	private nodes: Node[] = [];

	constructor(public readonly id: string, public readonly name: string) {}

	addNode(...args: NodeCtorArgs): Node {
		const node = new Node(this, ...args);
		this.nodes.push(node);
		return node;
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
