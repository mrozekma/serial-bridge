module.exports = {
	outputDir: 'dist/client',
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
