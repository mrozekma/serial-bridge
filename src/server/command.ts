import Device from './device';

interface CommandJson {
	name: string;
	label: string;
	icon?: string;
	submenu?: CommandJson[];
}

export default class Command {
	public readonly name: string;
	public readonly label: string;
	public readonly icon: string | undefined;
	public readonly submenu: Command[] | undefined;
	private readonly fn: ((api?: any) => Promise<void>) | undefined;

	constructor(name: string, label: string, icon: string | undefined, fn: (api?: any) => Promise<void>);
	constructor(name: string, label: string, icon: string | undefined, submenu: Command[]);
	constructor(name: string, label: string, icon: string | undefined, last: ((api?: any) => Promise<void>) | Command[]) {
		this.name = name;
		this.label = label;
		this.icon = icon;
		if(typeof last === 'function') {
			this.fn = last;
		} else {
			this.submenu = last;
		}
	}

	run(device: Device, originSocketId?: string): Promise<void> {
		if(!this.fn) {
			throw new Error(`Command not runnable: ${this.name} (${this.label})`);
		}
		const sendUpdate = (state: string, rest: { [K: string]: any } = {}) => {
			if(originSocketId) {
				// Is it kosher to tell another object to emit a signal? Oh well
				device.emit('command', {
					to: originSocketId,
					command: this.name,
					state,
					...rest,
				});
			}
		};

		const cancelTokens: (() => void)[] = [];
		const api = {
			getDevice: () => device.toJSON(),
			send: (nodeName: string, message: Buffer | string) => {
				const node = device.nodes.find(node => node.name === nodeName);
				if(!node) {
					throw new Error(`Tried to send to non-existent node '${nodeName}'`);
				}
				if(typeof message === 'string') {
					message = Buffer.from(message, 'utf8');
				}
				node.serialPort.write(message);
			},
			sendln(nodeName: string, message: string = '') {
				this.send(nodeName, message + '\r\n');
			},
			recvAsync: (nodeName: string, handler: (data: Buffer) => void, bufferLines: boolean = false) => {
				const node = device.nodes.find(node => node.name === nodeName);
				if(!node) {
					throw new Error(`Tried to receive from non-existent node '${nodeName}'`);
				}
				if(bufferLines) {
					const userHandler = handler;
					let stored = Buffer.allocUnsafe(0);
					handler = (data: Buffer) => {
						stored = Buffer.concat([ stored, data ]);
						let off = 0;
						for(let nl = stored.indexOf("\r\n"); nl >= 0; off = nl + 2, nl = stored.indexOf("\r\n", off)) {
							userHandler(stored.subarray(off, nl + 2));
						}
						stored = stored.subarray(off);
					};
				}
				node.on('serialData', handler);
				const cancelToken = () => node.off('serialData', handler);
				cancelTokens.push(cancelToken);
				return cancelToken;
			},
			termLine: (label: string, caps: 'start' | 'end' | undefined) => {
				device.emit('termLine', { label, caps });
			},
			showModal: (title: string, rows: { key: string; value: string }[]) => {
				device.emit('commandModal', {
					to: originSocketId,
					title,
					rows,
				});
			},
		};

		sendUpdate('pending');
		return device.commandMutex.runExclusive(async () => {
			sendUpdate('running');
			try {
				await this.fn!(api);
				sendUpdate('done');
			} catch(e) {
				sendUpdate('failed', { error: e });
				throw e;
			} finally {
				for(const cancelToken of cancelTokens) {
					cancelToken();
				}
			}
		});
	}

	toJSON(): CommandJson {
		const { name, label, icon, submenu } = this;
		return {
			name,
			label,
			icon,
			submenu: submenu ? submenu.map(command => command.toJSON()) : undefined,
		};
	}
}

export function* iterCommands(commands: Command[]): IterableIterator<Command> {
	for(const command of commands) {
		yield command;
		const submenu = (command as any).submenu as Command[] | undefined;
		if(submenu) {
			yield* iterCommands(submenu);
		}
	}
}
