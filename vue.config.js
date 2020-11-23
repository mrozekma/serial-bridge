const child_process = require('child_process');
const fs = require('fs');
const pathlib = require('path');

module.exports = {
	outputDir: 'dist/client',
	configureWebpack: config => {
		if(config.mode == 'production') {
			config.plugins.push({
				apply: compiler => {
					compiler.hooks.afterEmit.tapPromise('LicenseGen', () => new Promise(resolve => {
						const ws = fs.createWriteStream(pathlib.join(compiler.outputPath, 'licenses.txt'));
						const proc = child_process.spawn('yarn licenses generate-disclaimer', { cwd: compiler.options.context, shell: true });
						proc.stdout.pipe(ws);
						proc.on('exit', resolve);
					}));
				}
			});
		}
	},
	chainWebpack: config => {
		config.entry('app').clear().add('./src/client/client.ts');
	},
};

try {
	module.exports.devServer = require('./dev-server.js');
} catch(e) {
	if(e.code !== 'MODULE_NOT_FOUND') {
		throw e;
	}
}
