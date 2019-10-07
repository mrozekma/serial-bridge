module.exports = {
	presets: [
		'@vue/app',
	],
	plugins: [
		["prismjs", {
			"languages": ["batch"],
			"plugins": ["line-numbers", "normalize-whitespace"],
			"theme": "okaidia",
			"css": true
		}]
	]
};
