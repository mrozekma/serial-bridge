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

export interface NodeLink {
	name: string;
	description: string;
	icon: string;
	url: (node: DeviceJson['nodes'][number]) => string;
}

export const nodeLinks: Readonly<NodeLink>[] = [
	{ name: 'telnet', description: 'Telnet', icon: 'far fa-external-link-alt', url: node => `telnet://${window.location.hostname}:${node.tcpPort}` },
	{ name: 'raw',    description: 'Raw',    icon: 'far fa-external-link-alt', url: node => `putty:-raw ${window.location.hostname} -P ${node.tcpPort}` },
	{ name: 'ssh',    description: 'SSH',    icon: 'far fa-terminal',          url: node => {
		const { host, username, password } = node.ssh!;
		const args = [ host ];
		if(username) { args.push(`-l ${username}`); }
		if(password) { args.push(`-pw ${password}`); }
		return `putty:-ssh ${args.join(' ')}`;
	}},
];
