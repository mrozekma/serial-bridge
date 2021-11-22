export default class IdGenerator {
	private readonly ids = new Set<string>();

	constructor(private readonly prefix?: string) {}

	gen(suggestedId?: string) {
		let i: number;
		if(suggestedId) {
			// Issue 'suggestedId', 'suggestedId2', 'suggestedId3', ...
			if(!this.ids.has(suggestedId)) {
				return this.issue(suggestedId);
			}
			i = 2;
		} else if(this.prefix) {
			// Issue 'prefix1', 'prefix2', 'prefix3', ...
			suggestedId = this.prefix;
			i = 1;
		} else {
			throw new Error("Cannot generate an ID with no prefix or suggested base");
		}
		for(;; i++) {
			const id = suggestedId + i;
			if(!this.ids.has(id)) {
				return this.issue(id);
			}
		}
	}

	private issue(id: string): string {
		this.ids.add(id);
		return id;
	}

	release(id: string): boolean {
		return this.ids.delete(id);
	}
}
