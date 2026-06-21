import js from "@eslint/js";

export default [
	js.configs.recommended,
	{
		files: ["cdn/js/**/*.js"],
		ignores: ["cdn/js/**/*.min.js"],
		rules: {
			"no-unused-vars": "warn",
			"no-console": "warn"
		}
	}
];
