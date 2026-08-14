import js from "@eslint/js";

export default [
	js.configs.recommended,
	{
		files: ["cdn/js/**/*.js"],
		ignores: ["cdn/js/**/*.min.js"],
		rules: {
			"no-unused-vars": "warn",
			"no-console": "warn",
			"indent": ["error", "tab"],
		},
	},
	{
		files: ["commitlint.config.js", "packages/**/*.js", "tests/Node/**/*.js"],
		languageOptions: {
			globals: {
				Buffer: "readonly",
				require: "readonly",
				process: "readonly",
				console: "readonly",
				__dirname: "readonly",
				module: "readonly",
			},
		},
		rules: {
			"no-unused-vars": "warn",
			"no-console": "off",
		},
	},
];
