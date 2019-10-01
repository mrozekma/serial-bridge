<template>
	<div id="app">
		<router-view/>
		<hr>
		<button @click="update">Update</button>
	</div>
</template>

<script lang="ts">
	import feathers from '@feathersjs/feathers';
	import restClient from '@feathersjs/rest-client';
	import socketio from '@feathersjs/socketio-client';
	import '@feathersjs/transport-commons'; // Adds channel typing to express.Application
	import io from 'socket.io-client';

	// import { Services } from '../services';
	const app = feathers(); //<Services>();

	const socket = io('http://penguin.linux.test:8081/');
	app.configure(socketio(socket));

	const testService = app.service('test');
	// console.log(testService.get('wef'));
	testService.on('updated', (x: any) => console.log('updated', x));
	testService.on('custom', (x: any) => console.log('custom', x));

	import Vue from 'vue';
	export default Vue.extend({
		mounted() {
		},
		methods: {
			async update() {
				await testService.update('client', {});
			},
		},
	});
</script>
