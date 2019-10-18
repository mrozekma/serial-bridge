const fs = require('fs-extra');
const pathlib = require('path');
const { promisify } = require('util');

const zipDir = require('zip-dir');
const { yarnToNpm } = require('synp');

if(!__dirname.length) {
	throw new Error("Bad __dirname");
}

const distDir = pathlib.join(__dirname, 'dist');
const rootPackageDir = pathlib.join(__dirname, 'package');
const packageDir = pathlib.join(rootPackageDir, 'serial-bridge');

(async () => {
	console.log('Generating package directory with the proper runtime layout');
	await fs.remove(rootPackageDir);
	await fs.mkdirp(packageDir);

	await Promise.all([
		// Copy dist/client to package/client
		fs.copy(pathlib.join(distDir, 'client'), pathlib.join(packageDir, 'client'), {
			filter(src, dest) {
				// Don't copy map files
				return !src.endsWith('.map');
			}
		}),
		// Copy dist/server/* to package/*
		fs.copy(pathlib.join(distDir, 'server'), packageDir),
		// Copy sample config file
		fs.copy('config.example', pathlib.join(packageDir, 'config.js')),
		// Generate package.json containing just the dependencies field from the real package.json
		(async () => {
			const basePackageJson = JSON.parse(await fs.readFile('package.json', { encoding: 'utf8' }));
			const deployPackageJson = {
				dependencies: basePackageJson.dependencies,
			}
			await fs.writeFile(pathlib.join(packageDir, 'package.json'), JSON.stringify(deployPackageJson, undefined, '\t') + '\n');
		})(),
		// Convert yarn.lock to package-lock.json
		fs.writeFile(pathlib.join(packageDir, 'package-lock.json'), yarnToNpm(__dirname)),
		// Generate .npmrc to silence warnings about the incomplete package.json
		fs.writeFile(pathlib.join(packageDir, '.npmrc'), "loglevel=error\n"),
	]);

	console.log('Generating zip file');
	await promisify(zipDir)(rootPackageDir, {
		saveTo: pathlib.join(__dirname, 'package.zip'),
	});
})().catch(console.error);
