// This is the server config; the client is built by vue-cli-service and the stock webpack config is modified in vue.config.js
const child_process = require('child_process');
const NodemonPlugin = require('nodemon-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

const gitDesc = child_process.execSync('git describe --all --long --abbrev=40 --dirty', { cwd: __dirname, encoding: 'utf8' });
const definePlugin = new webpack.DefinePlugin({
	BUILD_VERSION: JSON.stringify(gitDesc.replace(/^heads\//, '').trim()),
	BUILD_DATE: JSON.stringify(new Date().toGMTString()),
});

module.exports = {
	mode: process.env.NODE_ENV || 'development',
	entry: './src/server/server.ts',
	target: 'node',
	output: {
		path: path.resolve(__dirname, 'dist', 'server'),
	},
	node: {
		__dirname: true,
		__filename: true,
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: [ '.tsx', '.ts', '.js' ],
		alias: {
			// figlet$: path.resolve(__dirname, 'figlet.js')
		},
	},
	plugins: [
		definePlugin,
		new NodemonPlugin(),
	],
	externals: [
		nodeExternals({ modulesFromFile: true }),
	],
};
