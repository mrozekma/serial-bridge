import { DeviceJson } from '@/services';

export interface Connection {
	key: string;
	nodes: string[];
	name: string;
	gravatar: string | undefined;
}

export function getDeviceConnections(device: DeviceJson): IterableIterator<Connection> {
	const connectionsByHost = new Map<string, Connection>();
	for(const { user } of device.webConnections) {
		if(!connectionsByHost.has(user.host)) {
			connectionsByHost.set(user.host, {
				key: user.host,
				nodes: [ 'Web' ],
				name: user.displayName,
				gravatar: user.gravatar,
			});
		}
	}
	for(const node of device.nodes) {
		for(const { user } of node.tcpConnections) {
			let connection = connectionsByHost.get(user.host);
			if(!connection) {
				connectionsByHost.set(user.host, connection = {
					key: user.host,
					nodes: [],
					name: user.displayName,
					gravatar: user.gravatar,
				});
			}
			connection.nodes.push(node.name);
		}
	}
	return connectionsByHost.values();
}
