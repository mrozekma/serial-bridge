<template>
	<div id="app">
		<router-view/>
		<hr>
		<button @click="click">Test</button>
	</div>
</template>

<script lang="ts">
	import feathers from '@feathersjs/feathers';
	import restClient from '@feathersjs/rest-client';
	import socketio from '@feathersjs/socketio-client';
	import io from 'socket.io-client';

	import { Services } from '../services';
	const app = feathers<Services>();

	// const rest = restClient('http://penguin.linux.test:8081');
	// app.configure(rest.fetch(window.fetch));

	const socket = io('http://penguin.linux.test:8081/');
	app.configure(socketio(socket));

	const testService = app.service('/test');
	console.log(testService.get('wef'));

	import Vue from 'vue';
	export default Vue.extend({
		mounted() {
			// testService.
		},
		methods: {
			async click() {
				console.log(await testService.get('button'));
			},
		},
	});
</script>
