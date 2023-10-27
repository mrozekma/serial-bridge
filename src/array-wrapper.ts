import { EventEmitter } from 'events';

export default abstract class ArrayWrapper<T> extends EventEmitter {
	protected wrappedArray: T[] = [];

	protected constructor(arr?: T[]) {
		super();
		if(arr) {
			this.wrappedArray.push(...arr);
		}
	}

	protected tComparator(a: T, b: T): boolean {
		return a === b;
	}

	// Theoretically these could be of the form foo(...args: Parameters<T[]['foo']), but I can't figure out how to handle the generics, so the declarations are copied from the Array<T> interface.
	[Symbol.iterator]() {
		return this.wrappedArray[Symbol.iterator]();
	}
	find<S extends T>(predicate: (this: void, value: T, index: number, obj: T[]) => value is S): S | undefined;
	find(predicate: (value: T, index: number, obj: T[]) => unknown): T | undefined;
	find(predicate: (value: T, index: number, obj: T[]) => unknown): T | undefined {
		return this.wrappedArray.find(predicate);
	}
	map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[] {
		return this.wrappedArray.map(callbackfn);
	}
	some(predicate: (value: T, index: number, array: T[]) => unknown): boolean {
		return this.wrappedArray.some(predicate);
	}
	filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
	filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[] {
		return this.wrappedArray.filter(predicate);
	}
	get length(): number {
		return this.wrappedArray.length;
	}

	add(item: T) {
		const len = this.wrappedArray.push(item);
		this.emit('added', this, item, len - 1);
	}

	remove(itemOrIdx: T | number): T | undefined {
		if(typeof itemOrIdx === 'number') {
			const idx = itemOrIdx;
			if(idx >= 0 && idx < this.wrappedArray.length) {
				const [ item ] = this.wrappedArray.splice(idx, 1);
				this.emit('removed', this, item, idx);
				return item;
			}
			return undefined;
		} else {
			return this.remove(this.wrappedArray.findIndex(seek => this.tComparator(seek, itemOrIdx)));
		}
	}
}
