// This is the server config; the client is built by vue-cli-service and the stock webpack config is modified in vue.config.js
const child_process = require('child_process');
const fs = require('fs');
const NodemonPlugin = require('nodemon-webpack-plugin');
const pathlib = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');
const hashFiles = require('hash-files');

const GITHUB_URL = 'https://github.com/mrozekma/serial-bridge';

const gitDesc = child_process.execSync('git describe --all --long --abbrev=40 --dirty', { cwd: __dirname, encoding: 'utf8' });
const gitHash = child_process.execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();

const buildVersion = gitDesc.replace(/^heads\//, '').trim();
const buildLink = `${GITHUB_URL}/commit/${gitHash}`;
const buildId = process.env.GITHUB_RUN_NUMBER;
const releaseLink = process.env.GITHUB_RUN_NUMBER ? `${GITHUB_URL}/releases/tag/build-${process.env.GITHUB_RUN_NUMBER}` : undefined;
const versionHash = (process.env.NODE_ENV === 'production') ? hashFiles.sync({ files: [ 'src/**' ] }) : undefined;
const definePlugin = new webpack.DefinePlugin({
	BUILD_VERSION: JSON.stringify(buildVersion),
	BUILD_LINK: JSON.stringify(buildLink),
	BUILD_ID: JSON.stringify(buildId),
	RELEASE_LINK: JSON.stringify(releaseLink),
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
