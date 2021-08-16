import { DeviceJson } from '../services';
export type Node = DeviceJson['nodes'][number];

export function isErrorDevice(device: DeviceJson) {
	return device.tags.some(tag => tag.name.toLowerCase() === 'error');
}

export function getDeviceUrl(device: DeviceJson, type: 'device' | 'manage'): string {
	const url = `${device.remoteInfo?.url ?? ''}/devices/${device.id}`;
	switch(type) {
		case 'device': return url;
		case 'manage': return `${url}/manage`;
	}
}

export type NodeLinkHandler = {
	app: null;
} | {
	app: 'putty';
} | {
	app: 'mobaxterm';
	nameFormat: 'static' | 'device-name' | 'device-node-name',
	keyPath?: string,
};

function makeGenericTelnetLink(deviceName: string, node: Node) {
	return `telnet://${window.location.hostname}:${node.tcpPort}`;
}

abstract class LinkProvider {
	abstract makeTelnetLink(deviceName: string, node: Node): string;
	abstract makeRawLink(deviceName: string, node: Node): string;
	abstract makeSshLink(deviceName: string, node: Node): string;
}

class PuttyLinkProvider extends LinkProvider {
	makeTelnetLink(deviceName: string, node: Node): string {
		return `putty:-telnet ${window.location.hostname} -P ${node.tcpPort}`;
	}

	makeRawLink(deviceName: string, node: Node): string {
		return `putty:-raw ${window.location.hostname} -P ${node.tcpPort}`;
	}

	makeSshLink(deviceName: string, node: Node): string {
		const { host, username, password } = node.ssh!;
		const args = [ host ];
		if(username) { args.push(`-l ${username}`); }
		if(password) { args.push(`-pw ${password}`); }
		return `putty:-ssh ${args.join(' ')}`;
	}
}

// I won't pretend to understand MobaXterm's link format. I used https://stackoverflow.com/a/68448852/309308 to generate a link from an existing session and then patched it.
class MobaxtermLinkProvider extends PuttyLinkProvider {
	constructor(private nameFormat: 'static' | 'device-name' | 'device-node-name', private keyPath?: string) {
		super();
	}

	private makeName(deviceName: string, node: Node, protocol: string): string {
		switch(this.nameFormat) {
			case 'static': return 'Serial Bridge';
			case 'device-name': return `${deviceName} (${protocol})`;
			case 'device-node-name': return `${deviceName} ${node.name} (${protocol})`;
		}
	}

	private buildUri(path: string): string {
		return 'mobaxterm:' + encodeURIComponent(path);
	}

	makeTelnetLink(deviceName: string, node: Node): string {
		const sessionName = this.makeName(deviceName, node, 'Telnet');
		const host = window.location.hostname;
		const port = node.tcpPort;
		return this.buildUri(`${sessionName}= ;  logout#98#1%${host}%${port}%%%2%%%%%0%0%%1080%#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%-1%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1#0# #-1`);
	}

	// Just generate a PuTTY link as a fallback
	// makeRawLink(deviceName: string, node: Node): string;

	makeSshLink(deviceName: string, node: Node): string {
		const { host, username } = node.ssh!;
		const sessionName = this.makeName(deviceName, node, 'SSH');
		const keyPath = this.keyPath ?? '';
		return this.buildUri(`${sessionName}= ;  logout#117#0%${host}%22%${username}%%-1%-1%%%22%%0%0%0%${keyPath}%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%-1%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1#0# #-1`);
	}
}

export const nodeLinkProvider: LinkProvider | undefined = (() => {
	const nlhStr = localStorage.getItem('node-link-handler');
	const nlh: NodeLinkHandler = nlhStr ? JSON.parse(nlhStr) : { app: null };
	switch(nlh.app) {
		case null: return undefined;
		case 'putty': return new PuttyLinkProvider();
		case 'mobaxterm': return new MobaxtermLinkProvider(nlh.nameFormat, nlh.keyPath);
	}
	throw new Error("Bad node link handler");
})();

export interface NodeLink {
	name: string;
	description: string;
	icon: string;
	url?: (deviceName: string, node: DeviceJson['nodes'][number]) => string;
}

export const nodeLinks: Readonly<NodeLink>[] = [
	{ name: 'telnet', description: 'Telnet', icon: 'far fa-external-link-alt', url: nodeLinkProvider ? (deviceName, node) => nodeLinkProvider.makeTelnetLink(deviceName, node) : makeGenericTelnetLink },
	{ name: 'raw',    description: 'Raw',    icon: 'far fa-external-link-alt', url: nodeLinkProvider ? (deviceName, node) => nodeLinkProvider.makeRawLink(deviceName, node) : undefined },
	{ name: 'ssh',    description: 'SSH',    icon: 'far fa-terminal',          url: nodeLinkProvider ? (deviceName, node) => nodeLinkProvider.makeSshLink(deviceName, node) : undefined },
];

// Pretty random spot for these:

export function uniqifyAndSort<T>(arr: T[]): T[] {
	return [...new Set(arr)].sort();
}

const collator = new Intl.Collator(undefined, {
	sensitivity: 'accent',
	numeric: true,
});
export function compareStrings(a: string | undefined, b: string | undefined, undefinedWhere: 'first' | 'last' = 'last'): number {
	const undefinedPos = (undefinedWhere === 'first') ? -1 : 1;
	return (a === undefined && b === undefined) ? 0 :
	       (a === undefined) ? undefinedPos :
	       (b === undefined) ? -undefinedPos :
	       collator.compare(a, b);
}
