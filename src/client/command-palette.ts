export interface Command {
	value: string;
	text: string | (string | {
		text: string;
		icon?: string | undefined;
	})[];
	handler: () => void;
}

type Provider = {
	name: string,
	generator: () => Iterable<Command>,
};

export class CommandPalette {
	private providers: Provider[] = [];

	// This is called in mounted() hooks to add to the palette providers. The list is reset when the user switches to another view since we aren't using a SPA.
	public addProvider(name: string, generator: () => Iterable<Command>) {
		const provider: Provider = { name, generator };
		const idx = this.providers.findIndex(provider => provider.name === name);
		if(idx >= 0) {
			// This should only happen on HMR
			console.warn(`Replacing command palette provider: ${name}`);
			this.providers[idx] = provider;
		} else {
			this.providers.push(provider);
		}
	}

	public getCommands(): Command[] {
		return this.providers.flatMap(provider => [...provider.generator()]);
	}

	public runCommand(command: Command | string) {
		if(typeof command === 'string') {
			const c = this.getCommands().find(seek => seek.value === command);
			if(!c) {
				throw new Error(`Unknown command: ${command}`);
			}
			command = c;
		}
		command.handler();
	}
}

const commandPalette = new CommandPalette();
export default commandPalette;
