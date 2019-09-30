// This is the server config; the client is built by vue-cli-service and the stock webpack config is modified in vue.config.js
const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
	mode: process.env.NODE_ENV || 'development',
	entry: './src/server/server.ts',
	target: 'node',
	output: {
		path: path.resolve(__dirname, 'dist', 'server'),
	},
	externals: [ nodeExternals() ],
};
