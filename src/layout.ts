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
	children?: LayoutItem[] | '*';
}

export interface NodeLayoutItem {
	type: 'node';
	name: string;
	height?: number;
	width?: number;
	optional?: boolean;
}

export type LayoutItem = CellLayoutItem | NodeLayoutItem

export interface Layout extends CellLayoutItem {
	name: string;
	devices?: string[] | ((device: DeviceJson) => boolean);
}

function* iterLayoutNodeNames(items: LayoutItem[] | '*' | undefined): IterableIterator<{ name: string, optional?: boolean }> {
	if(items === '*') {
		return;
	}
	for(const item of items ?? []) {
		switch(item.type) {
			case 'row':
			case 'column':
			case 'stack':
				yield* iterLayoutNodeNames(item.children);
				break;
			case 'node':
				yield {
					name: item.name,
					optional: item.optional,
				};
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

function validateLayout(layout: Layout) {
	// Make sure there aren't multiple wildcard children
	let wildcards = 0;
	function helper(item: LayoutItem) {
		if(item.type === 'node' || item.children === undefined) {
			return;
		} else if(item.children === '*') {
			wildcards++;
		} else {
			for(const child of item.children) {
				helper(child);
			}
		}
	}
	if(layout.children !== '*' && layout.children !== undefined) {
		for(const child of layout.children) {
			helper(child);
		}
	}
	if(wildcards > 1) {
		throw new Error(`Layout '${layout.name}' has multiple wildcard containers`);
	}
}

export class Layouts extends ArrayWrapper<Layout> {
	constructor(layouts?: Layout[]) {
		super(layouts);
		for(const layout of layouts ?? []) {
			validateLayout(layout);
		}
	}

	override add(layout: Layout): void {
		if (this.wrappedArray.find(seek => seek.name === layout.name)) {
			throw new Error(`Duplicate layout name '${layout.name}'`);
		}
		validateLayout(layout);
		return super.add(layout);
	}

	getLayoutsForDevice(device: Device): Layout[] {
		return Array.from(this.iterLayoutsForDevice(device));
	}

	*iterLayoutsForDevice(device: Device): IterableIterator<Layout> {
		l: for(const layout of this) {
			if (layout.devices !== undefined) {
				if(Array.isArray(layout.devices)) {
					if(layout.devices.indexOf(device.name) >= 0) {
						yield layout;
					}
				} else if(layout.devices(device.toJSON())) {
					yield layout;
				}
			} else {
				for (const { name, optional } of iterLayoutNodeNames(layout.children)) {
					if (!optional && !device.nodes.some(node => node.name === name)) {
						continue l;
					}
				}
				yield layout;
			}
		}
		yield Layouts.makeAutoLayoutForDevice(device);
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

const childrenJoi = joi.alternatives().try(
	joi.array().items(joi.lazy(() => layoutItemJoi)),
	joi.string().required().valid('*'),
);

const layoutItemJoi: any = joi.alternatives().try(
	joi.object({
		type: joi.string().required().valid('row', 'column', 'stack'),
		height: joi.number(),
		width: joi.number(),
		children: childrenJoi,
	}),
	joi.object({
		type: joi.string().required().valid('node'),
		name: joi.string().required(),
		height: joi.number(),
		width: joi.number(),
		optional: joi.bool().default(false),
	}),
);

export const layoutJoi = joi.object({
	name: joi.string().required().min(1),
	devices: joi.alternatives().try(
		joi.array().items(joi.string().min(1)),
		joi.func().maxArity(1),
	),
	type: joi.string().required().valid('row', 'column', 'stack'),
	children: childrenJoi.required(),
});
