# Code Duplication Audit Remediation — Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. All workstreams are pure refactors with existing characterization
> coverage (shell tests + `tests/Node/*`), so the TDD cycle is
> characterization-style: tests green before, kept green after (no red phase).

**Goal:** Eliminate the remaining duplication findings (F2–F6) from
`audits/2026-08-16-code-duplication-audit.md` — shared shell-test libs,
single-sourced safety constants, fail-closed safe-dirs, shared search-script
validation — with zero behavior delta.

**Architecture:** Three workstreams. A: shell test infra (`counter_helpers.sh`,
`fixture_helpers.sh`, six test files re-source). B: safety extension
(`DEFAULT_THRESHOLD` exported from the breaker; both in-code safe-dirs
fallback lists deleted → fail-closed empty; classifier tests get explicit
`safeRelDirs`). C: `skills/lib/search_common.sh` shared validation lib, both
`search.sh` scripts source it, `search_skills_test.sh` grep coverage extended
to the lib.

**Tech Stack:** bash 5 (shell tests), TypeScript (safety extension + node:test
characterization suite), no new dependencies.

## Global constraints

- **No behavior change.** Safety policy surface (ADRs
  0023/0036/0042/0047/0048/0056), search-script exit codes and messages, and
  test pass/fail counts are all pinned. The two pre-existing shell-test
  failures (`check_skill_frontmatter` 5/1, `validate-harness` 7/1) and the
  pre-existing `classify_greenfield` history-section hang must behave
  identically before and after.
- **Commits:** conventional commits, three footers in order per ADR-0064 —
  `Implemented-by: deepseek-v4-flash` (active session model),
  `Tested-by:` via `bash packages/prism-core/scripts/resolve-ocr-model.sh`
  (currently `deepseek-v4-flash`), `Signed-off-by:` via
  `bash packages/prism-core/scripts/resolve-identity.sh` (currently
  `kyau <kyau@kyau.net>`). Signed commits (`git commit -S`). Footers are
  written as resolved values in the message, not `$(...)` substitutions
  (ANSI-C `$'...'` quoting does not expand command substitutions).
- **RCS headers + vim modelines** are managed by the pre-commit hook
  (ADR-0041): write new source files **without** a `$KYAULabs:` header — the
  hook inserts it on commit. Add the vim modeline as the last line yourself
  (`# vim: ft=sh sts=4 sw=4 ts=4 et :`).
- **Session gotcha:** the harness's own safety extension blocks bash tool
  calls whose text contains `rm -rf` + path patterns. `fixture_helpers.sh`
  legitimately contains `rm -rf "$dir"` — write it with the `write` tool, and
  run tests via `bash tests/Shell/...` (the classifier inspects the agent's
  command string, not file contents).
- **Verification baseline:** `npm run test:node`, `npx tsc --noEmit`,
  `npx eslint packages/prism-core/extensions/safety tests/Node`, plus
  per-task shell runs. Final gate: `/check` + `code-review`.

---

### Task 1: A1 — `counter_helpers.sh` + six-file source swap (Finding 2)

**Files:**
- Create: `tests/Shell/lib/counter_helpers.sh`
- Modify: `tests/Shell/classify_greenfield_test.sh`,
  `tests/Shell/check_skill_frontmatter_test.sh`,
  `tests/Shell/resolve_identity_test.sh`,
  `tests/Shell/setup_rulesets_command_test.sh`,
  `tests/Shell/search_skills_test.sh`,
  `tests/Shell/validate-harness_test.sh`

**Interfaces:**
- Produces: `counter_helpers.sh` — sets `PASS=0`, `FAIL=0`; defines
  `pass <msg>` (stdout, increments `PASS`) and `fail <msg>` (stderr,
  increments `FAIL`). Consumed by the six test files (and Task 2's two files).

- [ ] **Step 1: Baseline — record current pass/fail counts**

Run:
`bash tests/Shell/check_skill_frontmatter_test.sh; echo rc=$?; bash tests/Shell/setup_rulesets_command_test.sh; echo rc=$?; bash tests/Shell/search_skills_test.sh; echo rc=$?; bash tests/Shell/validate-harness_test.sh; echo rc=$?; timeout 15 bash tests/Shell/resolve_identity_test.sh; echo rc=$?`
Expected: 5/1 (rc=1), 10/0 (rc=0), 6/0 (rc=0), 7/1 (rc=1), 5/0 (rc=0), then
classify_greenfield hangs at the history section (timeout kills it, rc=124) —
all pre-existing, all re-verified after each task.

- [ ] **Step 2: Create the shared module**

Write `tests/Shell/lib/counter_helpers.sh` (no `$KYAULabs:` header — the hook
adds it):

```sh
#!/usr/bin/env bash

# ── Counter-style test reporters for tests/Shell/*_test.sh ─────────────────────
#
# Source this file after REPO_ROOT is set:
#   source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
#
# Provides:
#   - PASS/FAIL counters, initialized to 0
#   - pass <msg>: print '  PASS <msg>', increment PASS
#   - fail <msg>: print '  FAIL <msg>' to stderr, increment FAIL
#
# The test file owns its summary line and exit status
# (printf '\n<name>: %d passed, %d failed\n' "$PASS" "$FAIL"; [ "$FAIL" -eq 0 ]).
# This is a different contract from test_helpers.sh (RESULT_FILE + EXIT trap).

PASS=0
FAIL=0

pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }


# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 3: Swap the four counter-only test files**

In each of `check_skill_frontmatter_test.sh`, `setup_rulesets_command_test.sh`,
`search_skills_test.sh`, `validate-harness_test.sh`, replace this exact 5-line
block:

```sh
PASS=0
FAIL=0

pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }
```

with:

```sh
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
```

- [ ] **Step 4: Swap `classify_greenfield_test.sh` and `resolve_identity_test.sh`**

In each of these two, replace the exact block (lines 12–23):

```sh
PASS=0
FAIL=0
TMP_DIRS=()

cleanup() {
	for dir in "${TMP_DIRS[@]}"; do rm -rf "$dir"; done
}
trap cleanup EXIT

pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }
fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; printf '%s' "$d"; }
```

with:

```sh
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
```

> *Note for the executor:* Task 1 leaves `TMP_DIRS`/`cleanup`/`trap`/`fixture`
> inline in these two files; Task 2 replaces that remaining block. Each task's
> state is independently testable.

- [ ] **Step 5: Verify**

Run:
`bash -n tests/Shell/classify_greenfield_test.sh tests/Shell/check_skill_frontmatter_test.sh tests/Shell/resolve_identity_test.sh tests/Shell/setup_rulesets_command_test.sh tests/Shell/search_skills_test.sh tests/Shell/validate-harness_test.sh && bash tests/Shell/check_skill_frontmatter_test.sh; bash tests/Shell/setup_rulesets_command_test.sh; bash tests/Shell/search_skills_test.sh; bash tests/Shell/validate-harness_test.sh; timeout 15 bash tests/Shell/resolve_identity_test.sh`
Expected: identical counts to Step 1 (5/1, 10/0, 6/0, 7/1, 5/0; classify hangs
as before).

- [ ] **Step 6: Commit**

```bash
git add tests/Shell/lib/counter_helpers.sh tests/Shell/classify_greenfield_test.sh tests/Shell/check_skill_frontmatter_test.sh tests/Shell/resolve_identity_test.sh tests/Shell/setup_rulesets_command_test.sh tests/Shell/search_skills_test.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'refactor(shell-test): extract shared counter reporters\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: A2 — `fixture_helpers.sh` + two-file swap (Finding 4)

**Files:**
- Create: `tests/Shell/lib/fixture_helpers.sh`
- Modify: `tests/Shell/classify_greenfield_test.sh`,
  `tests/Shell/resolve_identity_test.sh`

**Interfaces:**
- Produces: `fixture_helpers.sh` — sets `TMP_DIRS=()`, defines `cleanup()`
  (removes all tracked dirs), installs `trap cleanup EXIT`, defines `fixture()`
  (mktemp -d + `git init -q`, registers dir, prints path). Consumed by the two
  test files.

- [ ] **Step 1: Create the shared module**

Write `tests/Shell/lib/fixture_helpers.sh`:

```sh
#!/usr/bin/env bash

# ── Temp-dir fixture helpers for tests/Shell/*_test.sh ─────────────────────────
#
# Source this file after REPO_ROOT is set:
#   source "$REPO_ROOT/tests/Shell/lib/fixture_helpers.sh"
#
# Provides:
#   - TMP_DIRS: array of directories to remove on exit
#   - cleanup: rm -rf every tracked dir (installed via `trap cleanup EXIT`)
#   - fixture: mktemp -d, git init -q inside it, track it, print its path
#
# Note: test_helpers.sh's register_temp_dir is a separate RESULT_FILE-style
# contract; this module serves the counter-style tests.

TMP_DIRS=()

cleanup() {
	for dir in "${TMP_DIRS[@]}"; do rm -rf "$dir"; done
}
trap cleanup EXIT

fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; printf '%s' "$d"; }


# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Replace the remaining inline block in both files**

In `classify_greenfield_test.sh` and `resolve_identity_test.sh`, replace the
block left inline by Task 1 (after Task 1's edit it is `TMP_DIRS=()` through
`fixture()`):

```sh
TMP_DIRS=()

cleanup() {
	for dir in "${TMP_DIRS[@]}"; do rm -rf "$dir"; done
}
trap cleanup EXIT

fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; printf '%s' "$d"; }
```

with:

```sh
source "$REPO_ROOT/tests/Shell/lib/fixture_helpers.sh"
```

(the `counter_helpers.sh` source line from Task 1 stays in place above it).

- [ ] **Step 3: Verify**

Run:
`bash -n tests/Shell/classify_greenfield_test.sh tests/Shell/resolve_identity_test.sh && timeout 15 bash tests/Shell/resolve_identity_test.sh; echo rc=$?`
Expected: `resolve_identity` 5/0 rc=0; `classify_greenfield` still hangs at
history (rc=124 via timeout — identical to baseline).

- [ ] **Step 4: Commit**

```bash
git add tests/Shell/lib/fixture_helpers.sh tests/Shell/classify_greenfield_test.sh tests/Shell/resolve_identity_test.sh
git commit -S -m $'refactor(shell-test): extract shared fixture helpers\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: B1 — single-source the breaker trip threshold (Finding 3)

**Files:**
- Modify: `packages/prism-core/extensions/safety/denial-circuit-breaker.ts:43`,
  `packages/prism-core/extensions/safety/index.ts:15,51-58,153`,
  `packages/prism-core/extensions/safety/README.md`

**Interfaces:**
- Consumes: `DEFAULT_THRESHOLD` (exported by this task from
  `denial-circuit-breaker.ts`).
- Produces: `index.ts` imports `DEFAULT_THRESHOLD` from
  `./denial-circuit-breaker.ts`; `TRIP_THRESHOLD` deleted.

- [ ] **Step 1: Export the breaker's default**

In `denial-circuit-breaker.ts`, change line 43:

```ts
const DEFAULT_THRESHOLD = 3;
```

to:

```ts
export const DEFAULT_THRESHOLD = 3;
```

- [ ] **Step 2: Import it in `index.ts` and delete the local constant**

Change the import (line 15):

```ts
import { DenialCircuitBreaker } from "./denial-circuit-breaker.ts";
```

to:

```ts
import { DenialCircuitBreaker, DEFAULT_THRESHOLD } from "./denial-circuit-breaker.ts";
```

Delete lines 51–58 (the doc-comment + `const TRIP_THRESHOLD = 3;`). Change
line 153:

```ts
const breaker = new DenialCircuitBreaker({ threshold: TRIP_THRESHOLD });
```

to:

```ts
const breaker = new DenialCircuitBreaker({ threshold: DEFAULT_THRESHOLD });
```

- [ ] **Step 3: Update the README row**

In `packages/prism-core/extensions/safety/README.md`, change the
`denial-circuit-breaker.ts` table row:

```
| `denial-circuit-breaker.ts` | opencode-era `denial-circuit-breaker` plugin | **Verbatim.** Pure `DenialCircuitBreaker` state machine. The opencode-era `DenialOutcomeTracker` correlator was deleted (dead code — the pi wrapper uses the breaker directly, see below). |
```

to:

```
| `denial-circuit-breaker.ts` | opencode-era `denial-circuit-breaker` plugin | **Verbatim, later restructured.** Pure `DenialCircuitBreaker` state machine. The audit remediation exported `DEFAULT_THRESHOLD` (no behavior change). The opencode-era `DenialOutcomeTracker` correlator was deleted (dead code — the pi wrapper uses the breaker directly, see below). |
```

- [ ] **Step 4: Verify**

Run: `npm run test:node && npx tsc --noEmit && npx eslint packages/prism-core/extensions/safety`
Expected: all node tests pass (safety-classify, safety-circuit-breaker,
safety-sensitive-paths), tsc clean, eslint no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/denial-circuit-breaker.ts packages/prism-core/extensions/safety/index.ts packages/prism-core/extensions/safety/README.md
git commit -S -m $'refactor(safety): single-source breaker trip threshold\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: B2 — fail-closed safe-dirs fallback (Finding 6)

**Files:**
- Modify: `packages/prism-core/extensions/safety/index.ts:63-64,100-108,155-158`,
  `packages/prism-core/extensions/safety/pre-tool-use.ts:35-42,46-52,239`,
  `tests/Node/safety-classify.test.ts:9`,
  `packages/prism-core/extensions/safety/README.md`

**Interfaces:**
- Consumes: `ClassifyOptions.safeRelDirs` (existing option).
- Produces: `resolveSafeRelDirs` level 3 returns `[]`; `classifyCommandImpl`
  defaults `safeRelDirs` to `[]`; tests pass
  `safeRelDirs: ["node_modules", "vendor"]` explicitly.

- [ ] **Step 1: Delete the index.ts fallback list**

In `index.ts`, delete lines 63–64:

```ts
/** Fallback safe `rm -rf` dirs when neither adapter nor core safe-dirs resolve. */
const FALLBACK_SAFE_REL_DIRS: readonly string[] = ["node_modules", ".pi/npm", ".pi/git"];
```

Change the level-3 return in `resolveSafeRelDirs` (line ~105):

```ts
    return FALLBACK_SAFE_REL_DIRS;
```

to:

```ts
    return [];
```

Update the function's doc-comment step 3 from `3. Hardcoded fallback (never empty).`
to:

```ts
 *   3. Fail-closed: empty (every `rm -rf` is blocked) when neither JSON
 *      source resolves.
```

Change the pre-session default (line ~157):

```ts
    let safeRelDirs: readonly string[] = FALLBACK_SAFE_REL_DIRS;
```

to:

```ts
    let safeRelDirs: readonly string[] = [];
```

and update its comment from `Defaults keep the gate usable even before the
first session_start fires.` to `Fail-closed until session_start resolves the
safe zones.`

- [ ] **Step 2: Delete the classifier's fallback list**

In `pre-tool-use.ts`, delete lines 46–52:

```ts
/** Built-in fallback project-relative directories where rm -rf is permitted. */
const SAFE_REL_DIRS: readonly string[] = [
    "node_modules",
    ".pi/npm",
    ".pi/git",
    "vendor",
    "cdn/css",
    "cdn/javascript",
];
```

Update the `ClassifyOptions.safeRelDirs` doc-comment (lines 39–41):

```
 * `safe-dirs.json` (core default otherwise). When omitted, the built-in
 * SAFE_REL_DIRS fallback applies. The classify algorithm itself is
 * unchanged from the opencode-era plugin.
```

to:

```
 * `safe-dirs.json` (core default otherwise). When omitted, no
 * project-relative directories are safe (fail closed, ADR-0036). The
 * classify algorithm itself is unchanged from the opencode-era plugin.
```

Change line 239:

```ts
        safeRelDirs: opts.safeRelDirs ?? SAFE_REL_DIRS,
```

to:

```ts
        safeRelDirs: opts.safeRelDirs ?? [],
```

- [ ] **Step 3: Make the classifier tests explicit**

In `tests/Node/safety-classify.test.ts`, change line 9:

```ts
const OPTS = { projectDir: "/repo" };
```

to:

```ts
const OPTS = { projectDir: "/repo", safeRelDirs: ["node_modules", "vendor"] };
```

(Verified against every assertion: `node_modules` and `vendor` cover the clean
cases; `/tmp/*` stays clean via `SAFE_ABS_DIRS`; all block cases are outside
both.)

- [ ] **Step 4: Update the README fallback bullet**

In `packages/prism-core/extensions/safety/README.md`, replace:

```
3. **Hardcoded fallback** `["node_modules", ".pi/npm", ".pi/git"]`.
```

with:

```
3. **Fail-closed default** — no project-relative safe zones when neither
   JSON source resolves (every `rm -rf` is blocked).
```

- [ ] **Step 5: Verify**

Run: `npm run test:node && npx tsc --noEmit && npx eslint packages/prism-core/extensions/safety`
Expected: all node tests pass, tsc clean, eslint clean.

- [ ] **Step 6: Commit**

```bash
git add packages/prism-core/extensions/safety/index.ts packages/prism-core/extensions/safety/pre-tool-use.ts packages/prism-core/extensions/safety/README.md tests/Node/safety-classify.test.ts
git commit -S -m $'refactor(safety): fail closed when safe-dirs config is missing\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: C1 — shared search-script validation lib (Finding 5)

**Files:**
- Create: `packages/prism-core/skills/lib/search_common.sh`
- Modify: `packages/prism-core/skills/searxng/search.sh`,
  `packages/prism-core/skills/websearch/search.sh`,
  `tests/Shell/search_skills_test.sh`

**Interfaces:**
- Produces: `search_common.sh` — requires `$SKILL` set by the sourcing script;
  defines `usage_guard <argc>` (exit 2), `require_cmd <exe> <message-body>`
  (exit 3), `require_env <VAR>` (exit 4), `require_posint <VAR> <value>`
  (exit 2). Exit codes and message texts byte-identical to today's scripts.

- [ ] **Step 1: Create the shared module**

Write `packages/prism-core/skills/lib/search_common.sh`:

```sh
#!/usr/bin/env bash

# ── Shared validation helpers for skill search scripts ─────────────────────────
#
# Source this file from a skill's search.sh (after $SKILL is set):
#   SKILL=searxng
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/search_common.sh"
#
# Provides (fail-closed; exit codes and messages are stable contract):
#   - usage_guard <argc>:   'Usage: <basename> <query>'                       exit 2
#   - require_cmd <exe> <body>: '<SKILL>: <body>' (e.g. 'curl is required.')  exit 3
#   - require_env <VAR>:    '<SKILL>: <VAR> is not set. Configure it in the
#                            environment; never pass it as an argument.'      exit 4
#   - require_posint <VAR> <value>: '<SKILL>: <VAR> must be a positive
#                            integer.'                                        exit 2

usage_guard() {
	if [ "$1" -eq 0 ]; then
		printf 'Usage: %s <query>\n' "$(basename "$0")" >&2
		exit 2
	fi
}

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		printf '%s: %s\n' "$SKILL" "$2" >&2
		exit 3
	fi
}

require_env() {
	if [ -z "${!1:-}" ]; then
		printf '%s: %s is not set. Configure it in the environment; never pass it as an argument.\n' "$SKILL" "$1" >&2
		exit 4
	fi
}

require_posint() {
	case "$2" in
		''|*[!0-9]*|0)
			printf '%s: %s must be a positive integer.\n' "$SKILL" "$1" >&2
			exit 2
			;;
	esac
}


# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Rewrite the searxng preamble**

In `packages/prism-core/skills/searxng/search.sh`, replace lines 14–43 (the
usage guard through the `SEARXNG_URL` env check) with:

```sh
SKILL=searxng
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/search_common.sh"
usage_guard "$#"
require_cmd curl 'curl is required.'
require_cmd node 'Node.js is required to normalize JSON safely.'
require_env SEARXNG_URL
```

Keep the URL-scheme `case` (it differs from websearch) exactly as-is. Then
replace the `RESULT_LIMIT` case:

```sh
case "$RESULT_LIMIT" in
	''|*[!0-9]*|0)
		printf 'searxng: SEARXNG_RESULT_LIMIT must be a positive integer.\n' >&2
		exit 2
		;;
esac
```

with:

```sh
require_posint SEARXNG_RESULT_LIMIT "$RESULT_LIMIT"
```

- [ ] **Step 3: Rewrite the websearch preamble**

In `packages/prism-core/skills/websearch/search.sh`, replace lines 14–31
(usage guard through the `DEEPSEEK_API_KEY` env check) with:

```sh
SKILL=websearch
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/search_common.sh"
usage_guard "$#"
require_cmd curl 'curl is required.'
require_cmd node 'Node.js is required to encode and format JSON safely.'
require_env DEEPSEEK_API_KEY
```

Keep the `THINKING` enum and `BASE_URL` scheme `case` blocks exactly as-is.
Then replace the `MAX_TOKENS` case:

```sh
case "$MAX_TOKENS" in
	''|*[!0-9]*|0)
		printf 'websearch: WEBSEARCH_MAX_TOKENS must be a positive integer.\n' >&2
		exit 2
		;;
esac
```

with:

```sh
require_posint WEBSEARCH_MAX_TOKENS "$MAX_TOKENS"
```

- [ ] **Step 4: Extend the test grep coverage**

In `tests/Shell/search_skills_test.sh`, add a `LIB` variable next to
`WEB`/`SEARX`:

```sh
LIB="$REPO_ROOT/packages/prism-core/skills/lib/search_common.sh"
```

and extend both "does not print the key value" greps to scan the lib too:

```sh
if grep -qE 'printf[^\n]*\$\{?DEEPSEEK_API_KEY|echo[^\n]*\$\{?DEEPSEEK_API_KEY' "$WEB" "$LIB"; then
```

```sh
if grep -qE 'printf[^\n]*\$\{?SEARXNG_URL|echo[^\n]*\$\{?SEARXNG_URL' "$SEARX" "$LIB"; then
```

(The lib contains `"${!1:-}"` — never a literal key name — so the greps stay
clean and meaningful.)

- [ ] **Step 5: Verify**

Run:
`bash -n packages/prism-core/skills/searxng/search.sh packages/prism-core/skills/websearch/search.sh packages/prism-core/skills/lib/search_common.sh && bash tests/Shell/search_skills_test.sh`
Expected: 6/0 rc=0 (both error-path rc=4 assertions and the extended
secret-handling greps pass). Then smoke:

```bash
env -u DEEPSEEK_API_KEY bash packages/prism-core/skills/websearch/search.sh query; echo rc=$?
env -u SEARXNG_URL bash packages/prism-core/skills/searxng/search.sh query; echo rc=$?
```

Expected: rc=4 with the exact existing messages.

- [ ] **Step 6: Commit**

```bash
git add packages/prism-core/skills/lib/search_common.sh packages/prism-core/skills/searxng/search.sh packages/prism-core/skills/websearch/search.sh tests/Shell/search_skills_test.sh
git commit -S -m $'refactor(skills): share search script validation helpers\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

**Final gate (after Task 5):** `/check` (delegates to `/check-php`) +
`code-review` on the branch, then present disposal options via
`finishing-a-development-branch`.

**Self-review notes:** Spec coverage — F2→Task 1, F4→Task 2, F3→Task 3,
F6→Task 4, F5→Task 5, all five in scope with verification steps; no
placeholders; interface names consistent across tasks (`DEFAULT_THRESHOLD`,
`safeRelDirs`, lib function names). One deliberate deviation from the spec's
"one commit per workstream": Tasks 1–2 split workstream A into two commits (F2
and F4 are distinct findings the reviewer may reject independently — the
rule-of-three question was a real discussion point). Five atomic commits total.
