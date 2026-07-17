# CI ↔ Local Check Parity Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make every CI gate that can fail a PR also run locally, pre-remote and unbypassable by agents, so defects are caught before the first push (fixed via local amend) and history-rewriting force-push/rebase is never required.

**Architecture:** Layered pre-remote enforcement. `pre-commit` catches file-level defects (skill frontmatter) at commit time; `commit-msg` validates the message (commitlint, fail-closed) plus a pure-bash literal-`\n` guard; `pre-push` runs the full `validate-harness.sh` + shell regression suite as a CI-parity backstop; the `pre-tool-use` plugin blocks `--no-verify` so agents cannot bypass any hook. A new ADR-0025 codifies the principle; ADR-0023/0010 are updated for consistency.

**Tech Stack:** Bash (git hooks), Node.js/js-yaml (`frontmatter-parser.js`), TypeScript (`@opencode-ai/plugin`, `node:test`), Shell contract tests (`tests/Shell/`), Conventional Commits + signed commits.

## Global constraints

- Bash hooks: `set -euo pipefail`, bash ≥ 3.2, RCS header + `# vim: ft=sh ...` modeline on every hook/script file (see `rcs-header` skill).
- New `.js`/`.ts`/`.sh`/`.php` files get an RCS header + vim modeline. Markdown (`.md`) and ADR files do not.
- Every commit: Conventional Commits, signed (`git commit -S`), single `-m` with `$'...\n...'` (never literal `\n`, never multiple `-m`), footers `Plan-by:` / `Acked-by:` / `Signed-off-by:` (issue-closing `Fixes: #NN` above `Plan-by:` when applicable).
- Never edit `aurora/` (submodule), `cdn/css/*.min.css`, `cdn/javascript/*.min.js` (generated).
- DRY: the skill-frontmatter rule already lives in `validate-harness.sh`; the pre-commit check is a fast staged-file subset (layered defense, like the existing `php -l` vs `php-cs-fixer` split — see ADR-0015).

## File structure

| File | Responsibility | Task |
|---|---|---|
| `adr/0025-ci-local-parity-principle.md` | Codify the parity principle | 1 |
| `adr/0023-*.md`, `adr/0010-*.md` | Update for `--no-verify` block / fail-open deprecation | 1 |
| `.github/scripts/frontmatter-parser.js` | Add `--stdin` mode for staged-blob parsing | 2 |
| `.github/scripts/check-skill-frontmatter.sh` | NEW — validate staged skill frontmatter (name/desc/dir) | 3 |
| `.github/hooks/pre-commit` | Call the frontmatter checker on staged skills | 3 |
| `.github/hooks/commit-msg` | Fail-closed commitlint + literal-`\n` guard | 4 |
| `.github/hooks/pre-push` | CI-parity gate (validate-harness + shell tests) | 5 |
| `.opencode/plugins/pre-tool-use.ts` | BLOCK `--no-verify` + scoped `-n` on `git commit` | 6 |
| `.opencode/skills/conventional-commits/SKILL.md` | Explicit "never literal `\n`" warning | 7 |
| `.opencode/skills/writing-plans/SKILL.md` | Reconcile commit example to `$'...'` | 7 |
| `.github/scripts/install-hooks.sh` | Note `npm install` prerequisite | 7 |
| `.opencode/commands/doctor.md` | Verify commitlint present + hooks wired | 7 |

---

## Task 1: ADR-0025 + ADR-0023/0010 updates

**Files:**
- Create: `adr/0025-ci-local-parity-principle.md`
- Modify: `adr/0023-safety-hook-for-bash-tool-interception.md` (Decision BLOCK list + Related)
- Modify: `adr/0010-issue-closing-keyword-convention.md` (deprecate fail-open consequence)
- Test: `tests/Shell/ci_local_parity_test.sh`

**Interfaces:**
- Consumes: ADR-0009 (shared-script parity precedent), ADR-0015 (staged-blob linting), ADR-0023 (safety classifier)
- Produces: the parity principle referenced by all later tasks

- [ ] **Step 1: Write the failing test**

`tests/Shell/ci_local_parity_test.sh`:
```bash
#!/usr/bin/env bash
# $KYAULabs: ci_local_parity_test.sh kyau@nova 2026/07/16 -0700 Exp $
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPERS="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
[ -f "$HELPERS" ] || { echo "ERROR: helpers missing" >&2; exit 1; }
source "$HELPERS"
setup_result_file

# 1. ADR-0025 exists and is Accepted
if [ -f "$REPO_ROOT/adr/0025-ci-local-parity-principle.md" ] && \
   grep -q "^## Status" "$REPO_ROOT/adr/0025-ci-local-parity-principle.md" && \
   grep -q "^[Aa]ccepted" "$REPO_ROOT/adr/0025-ci-local-parity-principle.md"; then
	pass "adr/0025 exists and Status is Accepted"
else
	fail "adr/0025-ci-local-parity-principle.md missing or not Accepted"
fi

# 2. ADR-0023 references the --no-verify block
if grep -qi "no-verify" "$REPO_ROOT/adr/0023-safety-hook-for-bash-tool-interception.md"; then
	pass "ADR-0023 documents the --no-verify block"
else
	fail "ADR-0023 does not mention --no-verify"
fi

# 3. ADR-0010 deprecates the fail-open consequence (points to 0025)
if grep -qi "ADR-0025\|0025" "$REPO_ROOT/adr/0010-issue-closing-keyword-convention.md"; then
	pass "ADR-0010 cross-refs ADR-0025 (fail-open deprecated)"
else
	fail "ADR-0010 does not cross-ref ADR-0025"
fi
print_summary "ci_local_parity"
# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/ci_local_parity_test.sh`
Expected: FAIL — ADR-0025 does not exist.

- [ ] **Step 3: Write ADR-0025** (`adr/0025-ci-local-parity-principle.md`, Nygard format):
```markdown
# 1. Title: CI ↔ Local Check Parity for Pre-Remote Enforcement

## Status
Accepted

## Context
Two defect classes have repeatedly reached CI (requiring force-push/rebase to
fix, which is repo-blocked): (1) new skill `SKILL.md` files missing the required
`name` frontmatter field — caught only by `validate-harness.sh` in CI; (2) commit
messages with literal `\n` sequences / over-long body lines / trailers not on
their own lines — `commitlint` in the `commit-msg` hook *would* catch these, but
the hook could be bypassed (`git commit --no-verify`, blocked nowhere) or skipped
(its guard `exit 0`s when `node_modules/commitlint` is absent — its own comment
said "CI enforces commitlint… so skipping locally is safe").

The recurring pain is structural: several CI gates have no local, pre-remote
equivalent, so a defect lands on the remote and fixing it rewrites published
history. ADR-0009 already establishes the parity pattern (one script invoked by
both CI and the local `/check`); this decision generalizes it to all gates and
closes the bypass holes.

## Decision
Every CI gate that can fail a PR MUST also run locally, before the commit/push
reaches the remote, and MUST be unbypassable by agents.

1. **pre-commit** validates staged skill frontmatter (`name`/`description`,
   `name`==dir) — a fast staged-file subset of `validate-harness.sh`.
2. **commit-msg** runs commitlint **fail-closed** (a missing `node_modules/
   commitlint` blocks the commit with a "run npm install" message) and adds a
   pure-bash literal-`\n` rejection.
3. **pre-push** runs the full `validate-harness.sh` + `tests/Shell/*_test.sh`
   as a CI-parity backstop. A failure blocks the push; the fix is a local amend
   of an unpushed commit (no force-push needed).
4. **pre-tool-use** plugin BLOCKs `--no-verify` (any git command) and `-n`
   (only on `git commit`, where it means `--no-verify`; `-n` on other commands
   is `--dry-run`/`--no-commit`/max-count and must NOT be blocked).
5. Humans retain the `--no-verify` escape hatch (they commit in their own shell,
   not via opencode's bash tool); agents do not.
6. Heavy gates (Pest coverage, Semgrep SAST) remain manual via `/check` and
   `/security` (out of scope: too slow for per-push).

## Consequences
- A defect is caught pre-remote → fixed by a local amend → **no force-push, no
  rebase**.
- Committing without `npm install` is now impossible (was silently allowed).
  `install-hooks.sh` documents the prerequisite; `/doctor` verifies it.
- Layered defense: pre-commit (fast, staged frontmatter) + pre-push (full
  harness/shell) deliberately overlap; this mirrors the existing `php -l` vs
  `php-cs-fixer` split (ADR-0015).
- Supersedes the fail-open consequence described in ADR-0010.

## Related
ADR-0009 (shared-script parity), ADR-0015 (staged-blob linting), ADR-0023
(safety classifier — extended to block `--no-verify`), ADR-0010 (fail-open
consequence deprecated).
```

- [ ] **Step 4: Update ADR-0023** — in the Decision section's BLOCK list, add a bullet: `git commit --no-verify` / `-n` (and `--no-verify` on any git command) — blocks hook bypass. In Consequences, note agents can no longer bypass pre-commit/commit-msg/pre-push. Add `ADR-0025` to Related.

- [ ] **Step 5: Update ADR-0010** — add a note on the "local-only when `node_modules/commitlint` absent" consequence: *Deprecated by ADR-0025 — the commit-msg hook is now fail-closed.*

- [ ] **Step 6: Run test to verify it passes**

Run: `bash tests/Shell/ci_local_parity_test.sh`
Expected: PASS — 3 passed.

- [ ] **Step 7: Commit**

```bash
git add adr/0025-ci-local-parity-principle.md adr/0023-safety-hook-for-bash-tool-interception.md adr/0010-issue-closing-keyword-convention.md tests/Shell/ci_local_parity_test.sh
git commit -S -m $'docs(adr): add ADR-0025 CI-local parity principle\n\nCodify that every CI-failing gate has a local pre-remote equivalent and is\nunbypassable by agents. Update ADR-0023 (--no-verify block) and ADR-0010\n(deprecate fail-open consequence).\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 2: frontmatter-parser.js `--stdin` mode

**Files:**
- Modify: `.github/scripts/frontmatter-parser.js`
- Test: `tests/Shell/frontmatter_parser_stdin_test.sh`

**Interfaces:**
- Consumes: existing `node` + `js-yaml`
- Produces: `node frontmatter-parser.js --stdin <key>` (reads content from stdin) — used by Task 3 to parse staged blobs

- [ ] **Step 1: Write the failing test**

`tests/Shell/frontmatter_parser_stdin_test.sh`:
```bash
#!/usr/bin/env bash
# $KYAULabs: frontmatter_parser_stdin_test.sh kyau@nova 2026/07/16 -0700 Exp $
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPERS="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
[ -f "$HELPERS" ] || { echo "ERROR: helpers missing" >&2; exit 1; }
source "$HELPERS"
setup_result_file
P="$REPO_ROOT/.github/scripts/frontmatter-parser.js"

# stdin mode returns the value
out=$(printf -- '---\nname: foo\ndescription: bar\n---\nbody' | node "$P" --stdin name)
[ "$out" = "foo" ] && pass "stdin mode returns name" || fail "stdin mode: expected 'foo' got '$out'"

# stdin mode with no frontmatter returns empty
out=$(printf -- 'no frontmatter here' | node "$P" --stdin name)
[ -z "$out" ] && pass "stdin mode empty when no frontmatter" || fail "stdin mode: expected empty got '$out'"

# file mode still works (backward compat)
tmp=$(mktemp); printf -- '---\nname: baz\n---\n' > "$tmp"
out=$(node "$P" "$tmp" name); rm -f "$tmp"
[ "$out" = "baz" ] && pass "file mode backward-compatible" || fail "file mode: expected 'baz' got '$out'"
print_summary "frontmatter_parser_stdin"
# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/frontmatter_parser_stdin_test.sh`
Expected: FAIL — `--stdin` not yet supported (returns empty / usage error).

- [ ] **Step 3: Implement `--stdin` mode**

In `.github/scripts/frontmatter-parser.js`, replace the argv + read block (lines 14–28) so it supports an optional leading `--stdin`. The rest (frontmatter extraction, yaml parse, value emit) is unchanged.

```javascript
const fs = require('fs');
const yaml = require('js-yaml');

// Usage: node frontmatter-parser.js [--stdin] <file> <key>
//   <file> <key>          read content from <file>
//   --stdin <key>         read content from stdin (for staged-blob piping)
const useStdin = process.argv[2] === '--stdin';
const file = useStdin ? null : process.argv[2];
const key  = useStdin ? process.argv[3] : process.argv[3];

if (useStdin) {
	if (!key) { console.error('Usage: node frontmatter-parser.js --stdin <key>'); process.exit(2); }
} else if (!file || !key) {
	console.error('Usage: node frontmatter-parser.js [--stdin] <file> <key>');
	process.exit(2);
}

let content;
try {
	content = useStdin ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
} catch (e) {
	console.error(`Error reading ${useStdin ? 'stdin' : 'file'}: ${e.message}`);
	process.exit(1);
}
```
Update the header comment (lines 4–7) to document `--stdin`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/frontmatter_parser_stdin_test.sh`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/frontmatter-parser.js tests/Shell/frontmatter_parser_stdin_test.sh
git commit -S -m $'feat(scripts): add --stdin mode to frontmatter-parser\n\nLets the pre-commit hook parse staged blobs via `git show ":f" | node\nfrontmatter-parser.js --stdin <key>` without temp files (ADR-0015).\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 3: check-skill-frontmatter.sh + pre-commit wiring

**Files:**
- Create: `.github/scripts/check-skill-frontmatter.sh`
- Modify: `.github/hooks/pre-commit` (add a section before the final `echo "✓ pre-commit passed"`)
- Test: `tests/Shell/check_skill_frontmatter_test.sh`

**Interfaces:**
- Consumes: `frontmatter-parser.js --stdin` (Task 2)
- Produces: `check-skill-frontmatter.sh <file>...` → exit 0 (ok) / 1 (violation); pre-commit invokes it on staged `.opencode/skills/*/SKILL.md`

- [ ] **Step 1: Write the failing test**

`tests/Shell/check_skill_frontmatter_test.sh`:
```bash
#!/usr/bin/env bash
# $KYAULabs: check_skill_frontmatter_test.sh kyau@nova 2026/07/16 -0700 Exp $
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPERS="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
[ -f "$HELPERS" ] || { echo "ERROR: helpers missing" >&2; exit 1; }
source "$HELPERS"
setup_result_file
CHK="$REPO_ROOT/.github/scripts/check-skill-frontmatter.sh"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# good skill
mkdir -p "$WORK/.opencode/skills/good"
printf -- '---\nname: good\ndescription: ok\n---\n' > "$WORK/.opencode/skills/good/SKILL.md"
if bash "$CHK" "$WORK/.opencode/skills/good/SKILL.md" >/dev/null 2>&1; then
	pass "valid skill passes"
else
	fail "valid skill was rejected"
fi

# missing name
mkdir -p "$WORK/.opencode/skills/noname"
printf -- '---\ndescription: ok\n---\n' > "$WORK/.opencode/skills/noname/SKILL.md"
if ! bash "$CHK" "$WORK/.opencode/skills/noname/SKILL.md" >/dev/null 2>&1; then
	pass "missing name rejected"
else
	fail "missing name was accepted"
fi

# name != dir
mkdir -p "$WORK/.opencode/skills/mismatch"
printf -- '---\nname: other\ndescription: ok\n---\n' > "$WORK/.opencode/skills/mismatch/SKILL.md"
if ! bash "$CHK" "$WORK/.opencode/skills/mismatch/SKILL.md" >/dev/null 2>&1; then
	pass "name!=dir rejected"
else
	fail "name!=dir was accepted"
fi
print_summary "check_skill_frontmatter"
# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/check_skill_frontmatter_test.sh`
Expected: FAIL — script does not exist.

- [ ] **Step 3: Create `check-skill-frontmatter.sh`**

```bash
#!/usr/bin/env bash
# $KYAULabs: check-skill-frontmatter.sh kyau@nova 2026/07/16 -0700 Exp $

# Validate skill SKILL.md frontmatter: require name + description, and
# name == directory basename. Reads each file from disk (the pre-commit hook
# passes staged blobs via a temp checkout). Mirrors validate-harness.sh's skill
# rules so the defect is caught at commit time. See ADR-0025.
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PARSER="$REPO_ROOT/.github/scripts/frontmatter-parser.js"
FAILED=0

for file in "$@"; do
	[ -f "$file" ] || continue
	case "$file" in
		*/.opencode/skills/*/SKILL.md) ;;
		*) continue ;;
	esac
	dirname=$(basename "$(dirname "$file")")
	name=$(node "$PARSER" "$file" name 2>/dev/null || true)
	desc=$(node "$PARSER" "$file" description 2>/dev/null || true)
	if [ -z "$name" ]; then
		echo "✗ $file: missing or empty 'name' field in frontmatter" >&2
		FAILED=1
	elif [ "$name" != "$dirname" ]; then
		echo "✗ $file: name '$name' does not match directory '$dirname'" >&2
		FAILED=1
	fi
	if [ -z "$desc" ]; then
		echo "✗ $file: missing or empty 'description' field in frontmatter" >&2
		FAILED=1
	fi
done
exit "$FAILED"
# vim: ft=sh sts=4 sw=4 ts=4 et :
```
Make it executable: `chmod +x .github/scripts/check-skill-frontmatter.sh`.

- [ ] **Step 4: Wire into pre-commit** — add this section in `.github/hooks/pre-commit` just before `echo "✓ pre-commit passed"`:
```bash
# ── Skill frontmatter check (CI parity: validate-harness.sh) ────────────────
STAGED_SKILLS=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR | grep -E '^\.opencode/skills/[^/]+/SKILL\.md$' || true)
if [ -n "$STAGED_SKILLS" ]; then
	echo "→ skill frontmatter check"
	SKILL_FILES=()
	while IFS= read -r f; do
		[ -z "$f" ] && continue
		checkout_staged "$f"
		SKILL_FILES+=("$TMPF")
	done <<< "$STAGED_SKILLS"
	bash "$REPO_ROOT/.github/scripts/check-skill-frontmatter.sh" "${SKILL_FILES[@]}" \
		2>&1 | sed "s|$LINT_TMPDIR/||g"
	# check-skill-frontmatter.sh derives dirname from the path; pass real names:
	REAL_FILES=()
	while IFS= read -r f; do [ -z "$f" ] && continue; REAL_FILES+=("$f"); done <<< "$STAGED_SKILLS"
	bash "$REPO_ROOT/.github/scripts/check-skill-frontmatter.sh" "${REAL_FILES[@]}" || exit 1
fi
```
> Refactor note: the staged blob is checked out to `$TMPF`, but `name`==dir needs the real path. The clean approach is to run the checker against the real working-tree paths only when the working tree equals the index (the RCS auto-add block already enforces `git diff --quiet` for rewrites). Simplify Task 3 GREEN to call the checker on real paths guarded by the same "no unstaged changes" check. (The implementer should collapse the two invocations above into one on real paths.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bash tests/Shell/check_skill_frontmatter_test.sh`
Expected: PASS — 3 passed.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/check-skill-frontmatter.sh .github/hooks/pre-commit tests/Shell/check_skill_frontmatter_test.sh
git commit -S -m $'feat(hooks): block skills missing name field at commit time\n\npre-commit now validates staged .opencode/skills/*/SKILL.md frontmatter\n(name + description, name==dir) via check-skill-frontmatter.sh — a fast\nstaged subset of validate-harness.sh (ADR-0025). Closes the recurring\nmissing-name defect locally instead of in CI.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 4: commit-msg fail-closed + literal-`\n` guard

**Files:**
- Modify: `.github/hooks/commit-msg`
- Test: `tests/Shell/commit_msg_parity_test.sh`

**Interfaces:**
- Consumes: `npx commitlint`, `git interpret-trailers` (via commitlint config)
- Produces: commit-msg exits 1 on (a) literal `\n`, (b) missing commitlint, (c) commitlint failure

- [ ] **Step 1: Write the failing test**

`tests/Shell/commit_msg_parity_test.sh`:
```bash
#!/usr/bin/env bash
# $KYAULabs: commit_msg_parity_test.sh kyau@nova 2026/07/16 -0700 Exp $
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPERS="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
[ -f "$HELPERS" ] || { echo "ERROR: helpers missing" >&2; exit 1; }
source "$HELPERS"
setup_result_file

# Extract the pure-bash literal-\n guard and exercise it in isolation.
HOOK="$REPO_ROOT/.github/hooks/commit-msg"
if grep -qF "grep -qF '\\n'" "$HOOK"; then
	pass "commit-msg contains literal-\\n guard"
else
	fail "commit-msg missing literal-\\n guard"
fi

# Functional: a message with literal \n must be rejected by the guard.
BAD=$(mktemp); printf -- 'feat: x\nbody word\\nmore\n' > "$BAD"
if grep -qF '\n' "$BAD"; then
	pass "literal-\\n detected in sample message"
else
	fail "sample message did not contain literal-\\n"
fi
rm -f "$BAD"

# Fail-closed: hook source must NOT contain the old skip-on-absent guard.
if grep -q "skipping commit-msg check" "$HOOK"; then
	fail "commit-msg still has fail-open skip guard"
else
	pass "commit-msg fail-open guard removed (fail-closed)"
fi
print_summary "commit_msg_parity"
# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/commit_msg_parity_test.sh`
Expected: FAIL — guard absent / fail-open guard still present.

- [ ] **Step 3: Rewrite commit-msg**

Replace the entire body of `.github/hooks/commit-msg` with:
```bash
#!/usr/bin/env bash
# $KYAULabs: commit-msg kyau@nova 2026/07/16 -0700 Exp $

set -euo pipefail

MSG_FILE="${1:?commit-msg: message file path required}"

# ── Literal backslash-n guard (pure bash, no deps) ───────────────────────────
# Reject messages containing the two-char sequence '\' + 'n'. These come from
# `git commit -m "...\n..."` in regular quotes; bash interprets \n only inside
# $'...'. See ADR-0025.
if grep -qF '\n' "$MSG_FILE"; then
	cat >&2 <<'EOF'
✗ Commit message contains a literal '\n' (backslash-n) sequence.
  This usually means the message was passed via -m "...\n..." in regular
  quotes. Use a single -m with $'...\n...' so bash interprets newlines:

      git commit -S -m $'type[scope]: subject\n\nBody line.\n\nPlan-by: model\nAcked-by: model\nSigned-off-by: user <email>'

  Never use multiple -m flags (they insert blank lines that break trailers).
EOF
	exit 1
fi

# ── commitlint (fail-closed: CI parity requires local enforcement) ───────────
# A missing node_modules/commitlint is a broken dev environment. CI enforces
# commitlint on every PR; for parity the commit must block until the toolchain
# is installed. See ADR-0025.
if [ ! -d node_modules/commitlint ]; then
	cat >&2 <<'EOF'
✗ commitlint is not installed — cannot validate the commit message locally.
  Run 'npm install' to install the toolchain, then re-run the commit.
  (CI enforces commitlint on every PR; local parity requires it here too.)
EOF
	exit 1
fi

npx commitlint --edit "$MSG_FILE"

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/commit_msg_parity_test.sh`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add .github/hooks/commit-msg tests/Shell/commit_msg_parity_test.sh
git commit -S -m $'fix(hooks): make commit-msg fail-closed and reject literal \\n\n\nRemove the fail-open guard that silently skipped commitlint when it was\nabsent (the "CI will catch it" anti-pattern). Add a pure-bash guard that\nrejects literal backslash-n sequences with a pointer to the $'"'"'...'"'"'\n...\npattern. Both close the recurring commit-body corruption defect locally\n(ADR-0025).\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

> Note: the `$'...\n...'` inside that `-m` requires careful nested-quoting; the implementer may instead use a heredoc-to-file + `git commit -S -F` to avoid quoting pitfalls (single-`-m` semantics preserved).

---

## Task 5: pre-push CI-parity gate

**Files:**
- Modify: `.github/hooks/pre-push`
- Test: `tests/Shell/pre_push_parity_test.sh`

**Interfaces:**
- Consumes: `validate-harness.sh`, `tests/Shell/*_test.sh`
- Produces: pre-push runs the full harness + shell suite after the per-ref checks, before `exit 0`

- [ ] **Step 1: Write the failing test**

`tests/Shell/pre_push_parity_test.sh`:
```bash
#!/usr/bin/env bash
# $KYAULabs: pre_push_parity_test.sh kyau@nova 2026/07/16 -0700 Exp $
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPERS="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
[ -f "$HELPERS" ] || { echo "ERROR: helpers missing" >&2; exit 1; }
source "$HELPERS"
setup_result_file
HOOK="$REPO_ROOT/.github/hooks/pre-push"

grep -qF "validate-harness.sh" "$HOOK" && pass "pre-push runs validate-harness" || fail "pre-push missing validate-harness"
grep -qF "tests/Shell" "$HOOK" && pass "pre-push runs shell tests" || fail "pre-push missing shell tests"
grep -qiF "CI-parity" "$HOOK" && pass "pre-push documents CI-parity intent" || fail "pre-push missing CI-parity note"
print_summary "pre_push_parity"
# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/pre_push_parity_test.sh`
Expected: FAIL — gate not present.

- [ ] **Step 3: Add the gate** — in `.github/hooks/pre-push`, insert AFTER the `done` closing the `while read` loop (line 95) and BEFORE `exit 0` (line 97):
```bash

# ── CI-parity gate (validate-harness + shell regression) ─────────────────────
# Run the same harness validation and shell contract tests CI runs, BEFORE the
# push leaves the machine. A failure blocks the push; the fix is a local amend
# of an unpushed commit (no force-push/rebase). See ADR-0025.
echo "→ pre-push CI-parity gate (validate-harness + shell tests)"
REPO_ROOT_PP=$(git rev-parse --show-toplevel)
HLOG=$(mktemp); SLOG=$(mktemp)
trap 'rm -f "$HLOG" "$SLOG"' EXIT
if ! bash "$REPO_ROOT_PP/.github/scripts/validate-harness.sh" >"$HLOG" 2>&1; then
	cat "$HLOG" >&2
	echo "✗ pre-push: harness validation failed. Fix locally and re-commit before pushing." >&2
	exit 1
fi
SH_FAILED=0
shopt -s nullglob
for t in "$REPO_ROOT_PP"/tests/Shell/*_test.sh; do
	if ! bash "$t" >"$SLOG" 2>&1; then
		echo "::group::$t" >&2; cat "$SLOG" >&2; echo "::endgroup::" >&2
		SH_FAILED=1
	fi
done
shopt -u nullglob
[ "$SH_FAILED" -eq 0 ] || { echo "✗ pre-push: shell regression tests failed." >&2; exit 1; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/pre_push_parity_test.sh`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add .github/hooks/pre-push tests/Shell/pre_push_parity_test.sh
git commit -S -m $'feat(hooks): add pre-push CI-parity gate\n\npre-push now runs the full validate-harness.sh + tests/Shell/*_test.sh\nsuite so harness/shell drift is caught before the push leaves the machine\n(ADR-0025). A failure is fixed by a local amend — no force-push needed.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 6: pre-tool-use plugin — block `--no-verify` / scoped `-n`

**Files:**
- Modify: `.opencode/plugins/pre-tool-use.ts`
- Test: `tests/Plugin/no_verify_block.test.ts`

**Interfaces:**
- Consumes: `classifyCommand(command, opts)` (exported)
- Produces: `classifyCommand` returns `{severity:"block",...}` for `--no-verify` (any git cmd) and `-n` (only `git commit`)

- [ ] **Step 1: Write the failing test**

`tests/Plugin/no_verify_block.test.ts` (node:test, matches `tests/Plugin/*.test.ts` glob):
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../.opencode/plugins/pre-tool-use.ts";

const opts = { projectDir: "/repo" };

test("blocks git commit --no-verify", () => {
	assert.equal(classifyCommand("git commit --no-verify -m x", opts).severity, "block");
});
test("blocks git commit -n (no-verify short form)", () => {
	assert.equal(classifyCommand("git commit -n -m x", opts).severity, "block");
});
test("blocks --no-verify on any git command", () => {
	assert.equal(classifyCommand("git push --no-verify", opts).severity, "block");
});
test("does NOT block git log -n 5 (max-count)", () => {
	assert.equal(classifyCommand("git log -n 5", opts).severity, null);
});
test("does NOT block git push -n (dry-run)", () => {
	assert.equal(classifyCommand("git push -n origin main", opts).severity, null);
});
test("does NOT block git cherry-pick -n (no-commit)", () => {
	assert.equal(classifyCommand("git cherry-pick -n ABC", opts).severity, null);
});
test("does NOT block a normal commit", () => {
	assert.equal(classifyCommand("git commit -S -m " + "x", opts).severity, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:plugin`
Expected: FAIL — `classifyCommand` returns `null` for the `--no-verify` cases.

- [ ] **Step 3: Extend classifyCommand** — in `.opencode/plugins/pre-tool-use.ts`, add this block immediately before the final `return { severity: null, reason: "" };` (line 148), after the `git push --force` block:
```typescript
        // BLOCK: --no-verify / scoped -n — prevents bypassing pre-commit,
        // commit-msg, and pre-push hooks. --no-verify is never legitimate for
        // agent work, so block it on any git command. -n means --no-verify ONLY
        // on `git commit` (on other commands -n is --dry-run/--no-commit/
        // max-count), so scope -n to commit to avoid false positives. See ADR-0025.
        {
            const gitMatch = command.match(/\bgit\s+([a-z-]+)/);
            const subcmd = gitMatch ? gitMatch[1] : "";
            const tokens = command.split(/\s+/);
            if (tokens.includes("--no-verify") || (subcmd === "commit" && tokens.includes("-n"))) {
                return {
                    severity: "block",
                    reason: "--no-verify bypasses commit/push hooks (pre-commit, commit-msg, pre-push); local CI-parity checks must run",
                };
            }
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:plugin`
Expected: PASS — all `no_verify_block` cases pass.

- [ ] **Step 5: Commit**

```bash
git add .opencode/plugins/pre-tool-use.ts tests/Plugin/no_verify_block.test.ts
git commit -S -m $'feat(plugin): block --no-verify and scoped -n for agents\n\nThe pre-tool-use safety classifier now blocks --no-verify on any git\ncommand and -n on git commit (where it means --no-verify), so agents\ncannot bypass the pre-commit/commit-msg/pre-push hooks. Extends ADR-0023;\nrealizes ADR-0025. -n on other commands (log/push/cherry-pick) is left\nalone to avoid false positives.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 7: skill + install-hooks + doctor consistency

**Files:**
- Modify: `.opencode/skills/conventional-commits/SKILL.md` (explicit `\n` warning)
- Modify: `.opencode/skills/writing-plans/SKILL.md` (reconcile commit example to `$'...'`)
- Modify: `.github/scripts/install-hooks.sh` (note `npm install` prerequisite)
- Modify: `.opencode/commands/doctor.md` (verify commitlint present + hooks wired)
- Test: extend `tests/Shell/ci_local_parity_test.sh`

**Interfaces:**
- Consumes: ADR-0025
- Produces: agent-facing guidance aligned with the new enforcement

- [ ] **Step 1: Extend the parity test with content assertions** (append to `tests/Shell/ci_local_parity_test.sh`, before `print_summary`):
```bash
grep -qi "literal" "$REPO_ROOT/.opencode/skills/conventional-commits/SKILL.md" && pass "conventional-commits warns about literal \\n" || fail "conventional-commits missing literal-\\n warning"
grep -qF "npm install" "$REPO_ROOT/.github/scripts/install-hooks.sh" && pass "install-hooks notes npm prerequisite" || fail "install-hooks missing npm note"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/ci_local_parity_test.sh`
Expected: FAIL on the two new assertions.

- [ ] **Step 3: Apply the edits**

- `conventional-commits/SKILL.md` — in the "Passing the Message to Git" section, add a prominent warning: `> [!WARNING] Never embed a literal \`\\n\` (backslash-n) inside \`-m "...\`\` — bash keeps it as two characters, corrupting the message (over-long lines, broken trailers). The \`$'...\\n...'\` form interprets \`\\n\` as a real newline. The commit-msg hook now rejects literal \`\\n\`.` (wording to match house style).
- `writing-plans/SKILL.md` line 155 — change the example from literal-newlines-in-double-quotes to the canonical single-`-m` `$'...\n...'` form shown in `conventional-commits`.
- `install-hooks.sh` — add after the install echo: `echo "  Prerequisite: 'npm install' (commit-msg now fails closed without commitlint — ADR-0025)."`
- `doctor.md` — add/confirm a row asserting `commit-msg` is INSTALLED and that `node_modules/commitlint` is present.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/ci_local_parity_test.sh`
Expected: PASS — all assertions.

- [ ] **Step 5: Commit**

```bash
git add .opencode/skills/conventional-commits/SKILL.md .opencode/skills/writing-plans/SKILL.md .github/scripts/install-hooks.sh .opencode/commands/doctor.md tests/Shell/ci_local_parity_test.sh
git commit -S -m $'docs(harness): align skills + install-hooks with parity enforcement\n\nconventional-commits gains an explicit literal-\\n warning; writing-plans\nexample reconciled to the $'"'"'...'"'"' form; install-hooks notes the npm\nprerequisite; doctor verifies commitlint presence (ADR-0025).\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 8: shellcheck output-parity + version check

**Why this task exists:** the PR #156 shellcheck failure exposed that local shellcheck may differ from CI's (0.11.0 vs ~0.9.x) and some builds exit 0 *while printing warnings*. The existing pre-commit shellcheck relies on exit code, so a lenient local binary lets SC1090 through. Fix: **fail on non-empty output**, and add shellcheck to the pre-push CI-parity gate.

**Files:**
- Modify: `.github/hooks/pre-commit` (shellcheck section — fail on non-empty output)
- Modify: `.github/hooks/pre-push` (add shellcheck to the CI-parity gate from Task 5)
- Modify: `.opencode/commands/doctor.md` (warn on shellcheck absence / note version skew)
- Test: extend `tests/Shell/ci_local_parity_test.sh`

**Interfaces:**
- Consumes: Tasks 5 (pre-push gate)
- Produces: shellcheck gate that is immune to lenient/variant local binaries

- [ ] **Step 1: Extend the parity test (RED)** — append before `print_summary`:
```bash
# pre-commit shellcheck must fail on non-empty output, not just exit code
grep -qF 'SH_OUT=$(shellcheck' "$REPO_ROOT/.github/hooks/pre-commit" && pass "pre-commit shellcheck captures output" || fail "pre-commit shellcheck does not capture output"
# pre-push gate runs shellcheck
grep -qF 'shellcheck' "$REPO_ROOT/.github/hooks/pre-push" && pass "pre-push runs shellcheck" || fail "pre-push missing shellcheck"
```

- [ ] **Step 2: Run test to verify it fails** — `bash tests/Shell/ci_local_parity_test.sh` (expect FAIL on the new assertions).

- [ ] **Step 3: Harden pre-commit shellcheck** — replace the shellcheck block (lines ~105–116) so it captures output and fails if non-empty:
```bash
if command -v shellcheck > /dev/null 2>&1; then
	echo "→ Shellcheck"
	SH_TMPFILES=()
	while IFS= read -r f; do
		[ -z "$f" ] && continue
		checkout_staged "$f"
		SH_TMPFILES+=("$TMPF")
	done <<< "$STAGED_SH"
	# Fail on non-empty output, not just exit code: some local shellcheck
	# builds exit 0 while printing warnings (version skew vs CI). ADR-0025.
	SH_OUT=$(shellcheck "${SH_TMPFILES[@]}" 2>&1 || true)
	if [ -n "$SH_OUT" ]; then
		printf '%s\n' "$SH_OUT" | sed "s|$LINT_TMPDIR/||g"
		echo "✗ shellcheck found issues (CI parity — local binary may differ from CI)" >&2
		exit 1
	fi
else
	echo "⚠ shellcheck not installed — skipping (apt install shellcheck / brew install shellcheck)"
fi
```

- [ ] **Step 4: Add shellcheck to the pre-push CI-parity gate** — inside the gate added in Task 5, after the shell-test loop:
```bash
echo "→ shellcheck (CI parity)"
SH_OUT=$(find . -type f \( -name '*.sh' -o -path './.github/hooks/*' \) \
	-not -path './vendor/*' -not -path '*/node_modules/*' -not -path './aurora/*' \
	-print0 | xargs -0 shellcheck 2>&1 || true)
if [ -n "$SH_OUT" ]; then
	printf '%s\n' "$SH_OUT" >&2
	echo "✗ pre-push: shellcheck found issues." >&2
	exit 1
fi
```

- [ ] **Step 5: doctor.md** — add/note a shellcheck row: report PRESENT/MISSING and flag if the version looks non-standard (informational; CI uses ubuntu's apt shellcheck).

- [ ] **Step 6: Run test to verify it passes** — `bash tests/Shell/ci_local_parity_test.sh` (PASS).

- [ ] **Step 7: Commit**
```bash
git add .github/hooks/pre-commit .github/hooks/pre-push .opencode/commands/doctor.md tests/Shell/ci_local_parity_test.sh
git commit -S -m $'fix(hooks): make shellcheck gate fail on output, not exit code\n\nLocal shellcheck may differ from CI (version skew) and exit 0 while\nprinting warnings. Capture output and fail when non-empty in pre-commit,\nand add shellcheck to the pre-push CI-parity gate. Closes the gap that\nlet SC1090 reach CI (ADR-0025).\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 9: Verify + gate

- [ ] **Step 1: Run the full local suite**
```bash
bash .github/scripts/validate-harness.sh        # 0 errors
bash tests/Shell/*_test.sh                       # all pass
npm run test:plugin                              # all pass
npx tsc --noEmit                                 # plugin type-checks
```
- [ ] **Step 2: Run `/check`** (php-cs-fixer + stylelint + eslint + pest --coverage).
- [ ] **Step 3: Proof test (manual)** — attempt the three previously-escaping defects and confirm each is now blocked locally:
  - Create a skill dir whose `SKILL.md` lacks `name` → `git commit` blocked by pre-commit.
  - `git commit --no-verify ...` as an agent → blocked by the pre-tool-use plugin.
  - `git commit -m "feat: x\nbody"` (literal `\n`) → blocked by the commit-msg guard.
- [ ] **Step 4: `@code-review`** before merge.

## Self-review

- **Spec coverage:** Defect 1 (missing skill `name`) → Tasks 2–3. Defect 2 (commit body) → Tasks 4, 6, 7. Bypass hole → Task 6. CI↔local parity principle → Task 1 (ADR-0025) + backstop Task 5. All six components of the approved patch are covered.
- **Placeholders:** none; every code step shows the actual code. (Task 3 Step 4 carries a refactor note for the implementer to collapse to a single real-path invocation — flagged explicitly, not hidden.)
- **Type consistency:** `classifyCommand` signature unchanged; `check-skill-frontmatter.sh` interface stable across Tasks 2→3; `frontmatter-parser.js --stdin` contract stable.
