// This is the server config; the client is built by vue-cli-service and the stock webpack config is modified in vue.config.js
const child_process = require('child_process');
const fs = require('fs');
const NodemonPlugin = require('nodemon-webpack-plugin');
const pathlib = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');
const hashFiles = require('hash-files');

const gitDesc = child_process.execSync('git describe --all --long --abbrev=40 --dirty', { cwd: __dirname, encoding: 'utf8' });
const versionHash = (process.env.NODE_ENV === 'production') ? hashFiles.sync({ files: [ 'src/**' ] }) : undefined;
const definePlugin = new webpack.DefinePlugin({
	BUILD_VERSION: JSON.stringify(gitDesc.replace(/^heads\//, '').trim()),
	BUILD_FILE_HASH: JSON.stringify(versionHash),
	BUILD_DATE: JSON.stringify(new Date().toGMTString()),
	HAS_LICENSES: JSON.stringify(process.env.NODE_ENV == 'production'),
});

module.exports = {
	mode: process.env.NODE_ENV || 'development',
	entry: {
		server: './src/server/server.ts',
	},
	target: 'node',
	output: {
		path: pathlib.resolve(__dirname, 'dist', 'server'),
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
	},
	plugins: [
		definePlugin,
		new NodemonPlugin({
			script: './dist/server/server.js',
			nodeArgs: [ '--inspect' ],
		}),
	],
	externals: [
		nodeExternals({ modulesFromFile: true }),
	],
};
