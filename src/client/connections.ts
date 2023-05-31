import { DeviceJson } from '@/services';

export interface Connection {
	host: string;
	nodes: string[];
	name: string;
	avatar: string | undefined;
	webState: {
		connectedAt: Date;
		active: boolean;
		asOf: Date;
	} | undefined;
}

export function getDeviceConnections(device: DeviceJson): IterableIterator<Connection> {
	const connectionsByHost = new Map<string, Connection>();
	for(const { user, connectedAt, state } of device.webConnections) {
		const connection = connectionsByHost.get(user.host);
		if(!connection) {
			connectionsByHost.set(user.host, {
				host: user.host,
				nodes: [ 'Web' ],
				name: user.displayName,
				avatar: user.avatar,
				webState: {
					connectedAt: new Date(connectedAt),
					active: state.active,
					asOf: new Date(state.asOf),
				},
			});
		} else if(connection.webState?.active === false && state.active) {
			// The user has multiple web connections and at least one of them is active
			connection.webState = {
				connectedAt,
				active: state.active,
				asOf: state.asOf,
			};
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
					webState: undefined,
				});
			}
			connection.nodes.push(node.name);
		}
	}
	return connectionsByHost.values();
}
