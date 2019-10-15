import { Application } from '@feathersjs/express';

import Device from './device';
import { ServerServices as Services } from '@/services';

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

	run(app: Application<Services>, device: Device, originSocketId?: string): Promise<void> {
		if(!this.fn) {
			throw new Error(`Command not runnable: ${this.name} (${this.label})`);
		}
		return device.runCommand(app, this.name, this.fn, originSocketId);
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
