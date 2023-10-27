import * as joi from 'typesafe-joi';
import ArrayWrapper from './array-wrapper';
import Device from './server/device';
import { Config } from './server/config';
import { DeviceJson } from './services';

// Extracting the typing from Joi doesn't work because it's recursive, so this defines the layout in Typescript and then again in Joi

export type CellLayoutItem = {
	type: 'row' | 'column' | 'stack';
	height?: number;
	width?: number;
	children?: LayoutItem[];
}

export interface NodeLayoutItem {
	type: 'node';
	name: string;
	height?: number;
	width?: number;
}

export type LayoutItem = CellLayoutItem | NodeLayoutItem

export interface Layout extends CellLayoutItem {
	name: string;
	devices?: string[] | ((device: DeviceJson) => boolean);
}

function* iterLayoutNodeNames(items: LayoutItem[] | undefined): IterableIterator<string> {
	for(const item of items ?? []) {
		switch(item.type) {
			case 'row':
			case 'column':
			case 'stack':
				yield* iterLayoutNodeNames(item.children);
				break;
			case 'node':
				yield item.name;
				break;
		}
	}
}

function* iterLayoutItems(nodeNames: string[]): IterableIterator<LayoutItem> {
	const nodeCount = nodeNames.length;
	let i = 0;
	if(nodeCount % 2) {
		yield { type: 'node', name: nodeNames[i++] };
	}
	for(const rowLen = Math.floor(nodeCount / 2); i * 2 < nodeCount; i++) {
		yield {
			type: 'column',
			children: [
				{ type: 'node', name: nodeNames[i] },
				{ type: 'node', name: nodeNames[i + rowLen] },
			],
		};
	}
}

export class Layouts extends ArrayWrapper<Layout | 'auto'> {
	constructor(layouts?: Layout[]) {
		super(layouts);
	}

	override add(layout: Layout): void {
		if(this.wrappedArray.find(seek => (seek === 'auto' ? 'auto' : seek.name) === layout.name)) {
			throw new Error(`Duplicate layout name '${layout.name}'`);
		}
		return super.add(layout);
	}

	getLayoutsForDevice(device: Device): Layout[] {
		return Array.from(this.iterLayoutsForDevice(device));
	}

	*iterLayoutsForDevice(device: Device): IterableIterator<Layout> {
		l: for(const layout of this) {
			if(layout === 'auto') {
				yield Layouts.makeAutoLayoutForDevice(device);
			} else if(layout.devices !== undefined) {
				if(Array.isArray(layout.devices)) {
					if(layout.devices.indexOf(device.name) >= 0) {
						yield layout;
					}
				} else if(layout.devices(device.toJSON())) {
					yield layout;
				}
			} else {
				for(const name of iterLayoutNodeNames(layout.children)) {
					if(!device.nodes.some(node => node.name === name)) {
						continue l;
					}
				}
				yield layout;
			}
		}
		if(this.length == 0) {
			yield Layouts.makeAutoLayoutForDevice(device);
		}
	}

	static makeAutoLayoutForDevice(device: Device): Layout {
		return {
			name: '<auto>',
			type: 'row',
			children: [...iterLayoutItems(device.nodes.map(node => node.name))],
		}
	}

	static fromConfig(layoutsConfig: Config['layouts']): Layouts {
		return new Layouts(layoutsConfig as Layout[]);
	}
}

const layoutItemJoi: any = joi.alternatives().try(
	joi.object({
		type: joi.string().required().valid('row', 'column', 'stack'),
		height: joi.number(),
		width: joi.number(),
		children: joi.array().items(joi.lazy(() => layoutItemJoi)),
	}),
	joi.object({
		type: joi.string().required().valid('node'),
		name: joi.string().required(),
		height: joi.number(),
		width: joi.number(),
	}),
);

export const layoutJoi = joi.alternatives().try(
	joi.string().valid('auto'),
	joi.object({
		name: joi.string().required().min(1),
		devices: joi.alternatives().try(
			joi.array().items(joi.string().min(1)),
			joi.func().maxArity(1),
		),
		type: joi.string().required().valid('row', 'column', 'stack'),
		children: joi.array().required().items(layoutItemJoi),
	}),
);
