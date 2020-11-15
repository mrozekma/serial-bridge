module.exports = {
	presets: [
		'@vue/app',
	],
	plugins: [
		["prismjs", {
			"languages": ["batch", "json"],
			"plugins": ["line-numbers", "normalize-whitespace"],
			"theme": "okaidia",
			"css": true,
		}],
	],
};
