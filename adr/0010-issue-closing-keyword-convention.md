# 0010. Standardize on `Fixes: #NN` for issue-closing references

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-09

## Status

Accepted

Amended by ADR-0031 (2026-07-20): `Plan-by:` renamed to `Authored-by:`.
All references to `Plan-by:` in this ADR should be read as `Authored-by:`.

## Context

Issue-closing references in commit messages were inconsistent: `Refs #xx`,
`Closes #xx`, and `Fixes: #xx` all appeared; placement varied between
top-of-footer (above `Authored-by:`) and after `Signed-off-by:`. GitHub
recognizes many closing keywords — close, closes, closed, fix, fixes,
fixed, resolve, resolves, resolved — so there was no machine feedback
when the wrong keyword was chosen.

Root cause: the `conventional-commits` skill contained a self-contradictory
example that placed `Fixes: #42` after `Signed-off-by:` at the bottom of the
footer, while README examples and actual commit practice placed it at the
top. Without a commitlint rule to reject the banned keywords or enforce
placement, drift was silent and cumulative.

## Decision

Enforce `Fixes: #NN` (Sentence-case, with colon) as the sole
issue-closing keyword via a custom commitlint rule `issue-ref-convention`
in `commitlint.config.js`. Reject all other GitHub closing keywords
(close, closes, closed, resolve, resolves, resolved, fix, fixed).
Require `Fixes:`/`Refs:` trailers to precede `Authored-by:` in the footer
block. Retain `Refs: #NN` for non-closing references, in the same
top-of-footer block.

Merge commits (`git merge --no-ff`) and revert commits (`git revert`)
remain exempt from trailer enforcement — their auto-generated messages
cannot carry custom trailers, and the existing `trailersExist` exemption
is reused.

The rule is enforced at the local `commit-msg` hook (via `core.hooksPath`)
and in CI on pull requests (`npx commitlint --from ... --to ... --verbose`).

## Consequences

- **Positive:** Consistent footer ordering — issue references are always
  grouped at the top, followed by `Authored-by:`, `Tested-by:`, and
  `Signed-off-by:`. Deterministic GitHub auto-close behavior (only
  `Fixes: #NN` closes). Keyword drift is impossible — the commitlint hook
  blocks non-conforming messages with a corrective message.
- **Negative:** Contributors who habitually write `Closes: #NN` or
  `Fixes #42` (no colon) will see their first non-conforming commit
  blocked. The error message directs them to the correct form.
- **Neutral:** `Refs:` remains available for references that should not
  close an issue. The rule is local-only when `node_modules/commitlint`
  is absent (fresh clone without `npm install`), but CI enforces on
  every PR commit regardless. *(Note: the local-only fail-open behavior
  described here is **deprecated by ADR-0025** — the `commit-msg` hook is
  now fail-closed, so commitlint is enforced locally as well.)*

## Alternatives Considered

- **Docs-only fix (no commitlint rule):** would fix the contradictory
  skill example but provides no backstop against future drift. Rejected
  because the original drift occurred despite documentation.
- **Accept all GitHub closing keywords (just fix placement):** would
  resolve the footer-ordering problem but leave keyword inconsistency
  across the commit log. Rejected — standardizing on one keyword makes
  git-log searching and changelog generation simpler.
- **Ban `Refs:` too (force `Fixes:` for all references):** simpler but
  loses the close-vs-reference semantic distinction. Rejected — `Refs:`
  serves a useful purpose for commits that relate to an issue without
  closing it.
