// $KYAULabs: commitlint.config.js kyau@cosmos.kyaulabs 2026/07/27 -0700 Exp $





const { spawnSync } = require('child_process');

const BANNED_CLOSING = new Set([
	'close', 'closes', 'closed',
	'resolve', 'resolves', 'resolved',
	'fix', 'fixed',
]);
const CLOSING_RE = new RegExp(
	'^\\s*(close|closes|closed|resolve|resolves|resolved|fix|fixes|fixed)\\b\\s*:?\\s*#\\d+\\s*$',
	'i'
);
// ISSUE_REF_RE tracks Fixes:/Refs: trailers for placement enforcement.
// Colon is required (Fixes #42 or refs: #42 are rejected/mis-cased earlier by
// the CLOSING_RE checks). The /i flag catches lowercase `refs:` as well.
const ISSUE_REF_RE = /^\s*(Fixes|Refs):\s*#\d+\s*$/i;
const AUTHORED_BY_RE = /^\s*Authored-by:\s/;

const isMergeOrRevert = (parsed) => {
	const isMerge =
		(parsed.merge && parsed.merge.length > 0) ||
		(parsed.header && /^Merge /.test(parsed.header));
	const isRevert =
		parsed.revert || (parsed.header && /^Revert /.test(parsed.header));
	return isMerge || isRevert;
};

const trailersExist = (parsed, when, trailers) => {
	// Exempt merge commits and reverts from trailer enforcement.
	// `git merge --no-ff` and `git revert` produce auto-generated messages
	// that cannot carry Authored-by/Tested-by/Signed-off-by trailers. CI applies
	// the same exemption via this config, so merges/reverts pass everywhere.
	if (isMergeOrRevert(parsed)) {
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

const issueRefConvention = (parsed, when) => {
	// Exempt merge commits and reverts — same policy as trailersExist.
	if (isMergeOrRevert(parsed)) {
		return [true, ''];
	}

	const negated = when === 'never';
	const lines = (parsed.raw || '').split('\n');
	const violations = [];
	const issueRefIdxs = [];
	let authoredByIdx = -1;

	lines.forEach((line, i) => {
		const m = line.match(CLOSING_RE);
		if (m) {
			const kw = m[1];
			const kwLow = kw.toLowerCase();
			if (BANNED_CLOSING.has(kwLow)) {
				violations.push(
					'issue-closing keyword `' + kw + '` is not allowed — use `Fixes: #NN` to close an issue'
				);
			} else if (kwLow === 'fixes') {
				if (kw !== 'Fixes') {
					violations.push(
						'issue-closing keyword `' + kw + '` must be Sentence-case `Fixes`'
					);
				}
				if (!/^\s*Fixes:\s*#\d+/.test(line)) {
					violations.push(
						'issue reference must use the form `Fixes: #NN` (with colon) — found: `' + line.trim() + '`'
					);
				}
			}
		}
		if (ISSUE_REF_RE.test(line)) {
			issueRefIdxs.push(i);
		}
		if (AUTHORED_BY_RE.test(line) && authoredByIdx === -1) {
			authoredByIdx = i;
		}
	});

	if (authoredByIdx !== -1 && issueRefIdxs.some((idx) => idx > authoredByIdx)) {
		violations.push(
			'issue-reference trailers (`Fixes:`, `Refs:`) must appear before `Authored-by:`'
		);
	}

	const ok = violations.length === 0;
	return [negated ? !ok : ok, violations.join('; ')];
};

module.exports = {
	extends: ['@commitlint/config-conventional'],
	plugins: [
		{
			rules: {
				'trailers-exist': trailersExist,
				'issue-ref-convention': issueRefConvention,
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
		'trailers-exist': [2, 'always', ['Authored-by:', 'Implemented-by:', 'Tested-by:', 'Signed-off-by:']],
		'issue-ref-convention': [2, 'always'],
		'signed-off-by': [0],
	},
};





// vim: ft=javascript sts=4 sw=4 ts=4 noet :
