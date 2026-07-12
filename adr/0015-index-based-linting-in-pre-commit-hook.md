# $KYAULabs: 0015-index-based-linting-in-pre-commit-hook.md kyau@nova 2026/07/11 -0700 Exp $

# 0015. Index-Based Linting in Pre-Commit Hook

Date: 2026-07-11

## Status

Accepted

## Context

The pre-commit hook (`.github/hooks/pre-commit`) selects files from the git
index via `git diff --cached --name-only`, but passes those paths to linters
which read the **working tree** versions of the files. This creates two
failure modes:

1. **False negative**: Stage a broken file, fix it in the working tree without
   `git add` → the hook lints the fixed working-tree version → passes →
   broken code is committed.
2. **False positive**: Stage a clean file, break it in the working tree without
   `git add` → the hook lints the broken working-tree version → fails →
   clean staged commit is blocked.

The hook's own RCS blocks (lines 93-257) already read from the index via
`git show ":$file"` and include a divergence guard (line 135) that blocks
when the working tree diverges from the index. The linter sections do not
have this protection, creating an internal inconsistency.

## Decision

Lint **index blobs** instead of working-tree files, using a hybrid approach
tailored to each linter's capabilities:

- **php -l, shellcheck**: Write staged blob to a temp file via
  `git show ":$f"`, lint the temp file, translate output paths via `sed`.
- **php-cs-fixer**: Write staged blobs to a shared temp directory preserving
  structure, run with `--path-mode=override`, translate output paths.
- **ESLint, Stylelint**: Pipe staged blob via stdin with `--stdin-filename`
  for correct flat-config resolution (ESLint's `files` patterns are matched
  relative to the config directory; temp paths would not match).

A temp directory (`mktemp -d`) with `trap 'rm -rf ...' EXIT` is created near
the top of the hook for linters that need temp files.

## Consequences

### Positive
- Linters validate exactly what will be committed, not what's in the working
  tree.
- Eliminates both false-negative and false-positive failure modes.
- Consistent with the RCS blocks, which already read from the index.

### Negative
- Adds temp-file management complexity to the hook.
- ESLint and Stylelint process files one at a time (via stdin loop) instead
  of batch — slight performance cost, but acceptable for a pre-commit hook
  where typically only a few files are staged.
- Output path translation (`sed`) needed for php -l, php-cs-fixer, and
  shellcheck to show project-relative paths instead of temp paths.
- If the hook is killed with SIGKILL, temp files leak in `/tmp` (acceptable —
  OS-level cleanup handles this; same as the existing RCS block's `mktemp`).

### Neutral
- The RCS auto-add divergence guard (line 135) remains necessary — it prevents
  data loss from the RCS auto-add block's file rewriting, not lint accuracy.

## Alternatives Considered

### Divergence guard only
Add a check at the top of the hook: if any staged file has unstaged
working-tree changes, block with a clear message. Rejected because it forces
full-file staging (breaks `git add -p` workflow) and does not fix the root
cause — the linters still read the wrong data source.

### `git stash --keep-index`
Stash unstaged changes, lint the working tree (which now matches the index),
then pop the stash. Rejected because the RCS auto-add block rewrites files
from the staged blob — a stash pop after this would conflict or silently lose
unstaged changes.

### Document as known limitation
Add a comment noting that linters operate on the working tree. Rejected
because the inconsistency between the RCS blocks (which read the index) and
the linters (which read the working tree) is a correctness bug, not a
documentable limitation.





// vim: ft=markdown sts=4 sw=4 ts=4 et :
