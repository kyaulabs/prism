// $KYAULabs: commitlint.config.js kyau@nova 2026/07/05 -0700 Exp $

const { spawnSync } = require('child_process');

const trailersExist = (parsed, when, trailers) => {
	const output = spawnSync('git', ['interpret-trailers', '--parse'], {
		input: parsed.raw || '',
	}).stdout.toString();
	const lines = output.split('\n');
	const negated = when === 'never';
	const missing = trailers.filter(
		(t) => !lines.some((ln) => ln.startsWith(t))
	);
	const allPresent = missing.length === 0;
	return [
		negated ? !allPresent : allPresent,
		'message must have ' +
			trailers.map((t) => '`' + t + '`').join(', ') +
			' trailer' + (trailers.length > 1 ? 's' : ''),
	];
};

module.exports = {
	extends: ['@commitlint/config-conventional'],
	plugins: [
		{
			rules: {
				'trailers-exist': trailersExist,
			},
		},
	],
	rules: {
		'header-max-length': [2, 'always', 100],
		'type-enum': [2, 'always', [
			'build',
			'chore',
			'ci',
			'docs',
			'feat',
			'fix',
			'patch',
			'perf',
			'refactor',
			'revert',
			'style',
			'test',
			'ignore',
		]],
		'trailers-exist': [2, 'always', ['Plan-by:', 'Acked-by:']],
		'signed-off-by': [2, 'always', 'Signed-off-by:'],
	},
};

// vim: ft=javascript sts=4 sw=4 ts=4 noet :
