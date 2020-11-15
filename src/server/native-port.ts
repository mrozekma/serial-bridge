import EventEmitter from 'events';
import RealSerialPort, { PortInfo } from 'serialport';
import SerialPort from 'serialport';

const POLL_FREQ = 30000;

const allNativePorts = new Map<string, NativePort>();
let nativePortWatchdog: any = undefined; // Why can't Node decide if setTimeout() returns a Timeout or a number
const eventEmitter = new EventEmitter();
export const onPortData = (handler: (port: NativePort, data: Buffer) => void) => eventEmitter.on('data', handler);

interface PortSettings {
	baudRate: number;
	byteSize: 5 | 6 | 7 | 8;
	parity: 'even' | 'odd' | 'none';
	stopBits: 1 | 2;
}

export default class NativePort {
	private openSettings: PortSettings | undefined;
	private serialPort: SerialPort | undefined;
	private lastPolled: Date | undefined = undefined;

	private constructor(private portInfo: PortInfo) {}

	get path() {
		return this.portInfo.comName;
	}

	updateInfo(portInfo: PortInfo) {
		if(this.path != portInfo.comName) {
			throw new Error("Can't change native port path");
		}
		this.portInfo = portInfo;
	}

	open(settings: PortSettings): Promise<void> {
		let rtn: Promise<void>;
		if(this.openSettings && this.serialPort?.isOpen) {
			// Already open; make sure nothing is changing
			if(this.openSettings.baudRate != settings.baudRate) {
				throw new Error(`Port ${this.path} already open with baud rate ${this.openSettings.baudRate}, can't open with ${settings.baudRate}`);
			}
			if(this.openSettings.parity != settings.parity) {
				throw new Error(`Port ${this.path} already open with parity ${this.openSettings.parity}, can't open with ${settings.parity}`);
			}
			if(this.openSettings.stopBits != settings.stopBits) {
				throw new Error(`Port ${this.path} already open with stop bits ${this.openSettings.stopBits}, can't open with ${settings.stopBits}`);
			}
			if(this.openSettings.byteSize != settings.byteSize) {
				throw new Error(`Port ${this.path} already open with byte size ${this.openSettings.byteSize}, can't open with ${settings.byteSize}`);
			}
			rtn = Promise.resolve();
		} else {
			rtn = new Promise((resolve, reject) => {
				console.log('Opening', this.path);
				this.serialPort = new SerialPort(this.path, {
					baudRate: settings.baudRate,
					parity: settings.parity,
					stopBits: settings.stopBits,
					dataBits: settings.byteSize,
					lock: process.env.NODE_ENV === 'production',
				}, err => {
					if(!err) {
						this.openSettings = settings;
						resolve();
					} else {
						reject(err);
					}
				});
				this.serialPort.on('data', data => { console.log('portdata', this); eventEmitter.emit('data', this, data);});
			});
		}
		this.lastPolled = new Date();
		ensureWatchdog();
		return rtn;
	}

	keepAlive() {
		this.lastPolled = new Date();
		console.log('keepAlive', this.portInfo.comName, this.lastPolled);
	}

	checkAlive() {
		if(!this.serialPort || !this.serialPort.isOpen) {
			return undefined;
		}
		if(this.lastPolled && (new Date().getTime() - this.lastPolled.getTime()) > POLL_FREQ * 3) {
			this.serialPort.close();
			this.serialPort.destroy();
			this.serialPort = undefined;
			this.lastPolled = undefined;
			return false;
		}
		return true;
	}

	static get(path: string) {
		return allNativePorts.get(path);
	}

	// static make(path: string, baudRate: number, byteSize: 5 | 6 | 7 | 8, parity: 'even' | 'odd' | 'none', stopBits: 1 | 2): NativePort {
	static make(portInfo: PortInfo) {
		let rtn = allNativePorts.get(portInfo.comName);
		if(rtn) {
			console.log('NativePort cache hit', portInfo.comName);
			rtn.updateInfo(portInfo);
			return rtn;
		}
		console.log('NativePort make', portInfo.comName);
		rtn = new NativePort(portInfo);
		allNativePorts.set(portInfo.comName, rtn);
		return rtn;
	}

	static async list(): Promise<NativePort[]> {
		const ports = await RealSerialPort.list();
		return ports.map(NativePort.make);
	}

	toJSON() {
		return {
			...this.portInfo,
			open: this.openSettings,
		};
	}
}

function ensureWatchdog() {
	if(nativePortWatchdog === undefined) {
		nativePortWatchdog = setInterval(() => {
			console.log('nativePortWatchdog checking');
			let anyAlive = false;
			for(const port of allNativePorts.values()) {
				switch(port.checkAlive()) {
					case true:
						console.log(port.path, 'alive');
						anyAlive = true;
						break;
					case false:
						console.log(port.path, 'dead');
						// allNativePorts.delete(port.path);
						break;
					case undefined:
						// Not open; ignored
						break;
				}
			}
			if(!anyAlive) {
				console.log('Stopping watchdog');
				clearTimeout(nativePortWatchdog!);
				nativePortWatchdog = undefined;
			}
		}, POLL_FREQ);
	}
}
