import { DeviceJson } from '@/services';

export interface Connection {
	host: string;
	nodes: string[];
	name: string;
	avatar: string | undefined;
}

export function getDeviceConnections(device: DeviceJson): IterableIterator<Connection> {
	const connectionsByHost = new Map<string, Connection>();
	for(const { user } of device.webConnections) {
		if(!connectionsByHost.has(user.host)) {
			connectionsByHost.set(user.host, {
				host: user.host,
				nodes: [ 'Web' ],
				name: user.displayName,
				avatar: user.avatar,
			});
		}
	}
	for(const node of device.nodes) {
		for(const { user } of node.tcpConnections) {
			let connection = connectionsByHost.get(user.host);
			if(!connection) {
				connectionsByHost.set(user.host, connection = {
					host: user.host,
					nodes: [],
					name: user.displayName,
					avatar: user.avatar,
				});
			}
			connection.nodes.push(node.name);
		}
	}
	return connectionsByHost.values();
}
