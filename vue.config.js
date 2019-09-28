const child_process = require('child_process');

module.exports = {
	devServer: {
		host: '0.0.0.0',
		disableHostCheck: true,
	},
	publicPath: '',
	chainWebpack: config => {
		config.plugin('define').tap(args => {
			const gitDesc = child_process.execSync('git describe --all --long --abbrev=40 --dirty', { cwd: config.store.get('context'), encoding: 'utf8' });
			args[0].BUILD_VERSION = JSON.stringify(gitDesc.replace(/^heads\//, '').trim());
			args[0].BUILD_DATE = JSON.stringify(new Date().toGMTString());
			return args;
		});
	},
}
