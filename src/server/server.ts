import cors from 'cors';
import feathers from '@feathersjs/feathers';
import express from '@feathersjs/express';
import socketio from '@feathersjs/socketio';

import { NotFound } from '@feathersjs/errors';

import { Services } from '../services';

export const st: Services = {
	'/test': {
		async get(id, params) {
			console.log(id);
			console.log(params);
			return {test: 'foo'};
			// return new NotFound('wef');
		},
	},
};

// export type ST = typeof st;

const app = express(feathers());
app.use(express.static('dist/client'));

//TODO Figure out how to only allow CORS for REST endpoints
// app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.configure(express.rest());

app.configure(socketio(io => {
	io.on('connection', socket => {
		console.log('connection', socket);
	});
}));

app.use('/test', st['/test']);

app.use(express.notFound());
app.use(express.errorHandler());
app.listen(8081);
console.log('Ready');

// setInterval(() => {
// 	app.service('test').
// }, 1000);
