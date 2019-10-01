import cors from 'cors';
import feathers from '@feathersjs/feathers';
import express from '@feathersjs/express';
import socketio from '@feathersjs/socketio';
import '@feathersjs/transport-commons'; // Adds channel typing to express.Application

import { NotFound } from '@feathersjs/errors';
import { create } from 'domain';

const app = express(feathers()); //<Services>());
app.use(express.static('dist/client'));

//TODO Figure out how to only allow CORS for REST endpoints
// app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.configure(express.rest());

app.configure(socketio(io => {
	io.on('connection', socket => {
		console.log('connection');
		// socket.on('client-to-server', data => {
		// 	console.log('client-to-server', data);
		// 	socket.emit('server-to-client');
		// });
		// app.channel('chan').join(socket);
	});
}));

app.use('test', {
	events: ['custom'],
	async update(x: any) {
		console.log('update', x);
		return 'ret';
	},
});

app.on('connection', connection =>
	app.channel('everybody').join(connection)
);
// app.publish(data => { console.log('publish', data); return app.channel('everybody'); });
app.service('test').publish((data: any) => app.channel('everybody'));

app.use(express.notFound());
app.use(express.errorHandler());
app.listen(8081);
console.log('Ready');

app.service('test').on('updated', (x: any) => console.log('updated', x));

setInterval(() => {
	app.service('test').update('server', {});
	app.service('test').emit('custom', 'test');
}, 1000);
