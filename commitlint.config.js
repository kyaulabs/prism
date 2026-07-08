// $KYAULabs: commitlint.config.js kyau@nova 2026/07/07 -0700 Exp $

const { spawnSync } = require('child_process');

const trailersExist = (parsed, when, trailers) => {
	// Exempt merge commits and reverts from trailer enforcement.
	// `git merge --no-ff` and `git revert` produce auto-generated messages
	// that cannot carry Plan-by/Acked-by/Signed-off-by trailers. CI applies
	// the same exemption via this config, so merges/reverts pass everywhere.
	const isMerge =
		(parsed.merge && parsed.merge.length > 0) ||
		(parsed.header && /^Merge /.test(parsed.header));
	const isRevert =
		parsed.revert || (parsed.header && /^Revert /.test(parsed.header));
	if (isMerge || isRevert) {
		return [true, ''];
	}

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
		'trailers-exist': [2, 'always', ['Plan-by:', 'Acked-by:', 'Signed-off-by:']],
		'signed-off-by': [0],
	},
};

// vim: ft=javascript sts=4 sw=4 ts=4 noet :
