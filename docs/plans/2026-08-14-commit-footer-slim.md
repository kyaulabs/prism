# Commit Footer Slim Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Reduce required commit footers from four to three (`Implemented-by:`,
`Tested-by:`, `Signed-off-by:`), source `Tested-by:` from OCR's configured
model via a redaction-safe resolver script, and re-anchor issue-ref ordering.

**Architecture:** A first-party bash resolver (`resolve-ocr-model.sh`) reads
only the top-level `model` key from `~/.opencodereview/config.json` (Node
JSON.parse; Node ≥22 is guaranteed by the toolchain), emits the bare model id,
and fails closed on any error — never emitting the API key. Commitlint drops
`Authored-by:` from `trailers-exist` and re-anchors `issue-ref-convention` from
`Authored-by:` to `Implemented-by:`. Docs, prompts, hooks, and tests follow.

**Tech Stack:** Bash (script + Shell tests), Node ≥22 (JSON parsing, toolchain
guaranteed), commitlint 21.2.2 (config), conventional-commits format.

## Global constraints

- Sign every commit (`git commit -S`); run commits with
  `PATH="/home/kyau/.venv/bin:$PATH"` prepended so the fail-closed doctor
  finds Semgrep (this session's shell lacks it on PATH).
- **Trailer-format transition:** Tasks 1–2 commit with the OLD four-trailer
  format (`Authored-by:` still required by the current config). Task 3 commits
  the config change itself, so it is validated by the NEW config — from Task 3
  onward every commit uses the NEW three-trailer format (no `Authored-by:`).
- New source files (`*.sh`) carry a concrete RCS header
  (`# $KYAULabs: <file> <user>@<host> <date> ±TZ Exp $`, e.g.
  `# $KYAULabs: resolve-ocr-model.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $` —
  the pre-commit hook re-normalizes it on commit; never use literal
  `creator@host`/`YYYY/MM/DD` template text, the placeholder guard blocks it)
  and end with `# vim: ft=sh sts=4 sw=4 ts=4 et :`.
- Never read, print, or exfiltrate `~/.opencodereview/config.json` or any
  credential file. The resolver script is the only sanctioned reader, and it
  emits exactly one non-secret value. Tests use only synthetic canary
  fixtures via `PRISM_OCR_CONFIG` — never real configs.
- Spec: `docs/specs/2026-08-14-commit-footer-slim-spec.md` (approved).
- Merge/revert commits stay exempt from trailer enforcement.

---
### Task 1: ADR-0064 + CONTEXT.md reference update

**Files:**
- Create: `adr/0064-slim-commit-footers-and-ocr-sourced-tested-by.md`
- Modify: `CONTEXT.md:226`

**Interfaces:**
- Consumes: approved spec, architect GO (`ADR-required: 0064`)
- Produces: the ADR-0064 record and the corrected CONTEXT.md ADR index the
  remaining tasks cite

- [x] **Step 1: Write the ADR**

Create `adr/0064-slim-commit-footers-and-ocr-sourced-tested-by.md` with
exactly this content:

```markdown
# 0064. Slim Commit Footers; `Tested-by` Sourced from OCR Config

Date: 2026-08-14

## Status

Accepted

Supersedes the footer clauses of ADR-0031 and ADR-0040 (both opencode-era
records, already superseded where moot by ADR-0057 for the pi harness).
Amends ADR-0010's ordering rule (anchor moves from `Authored-by:` to
`Implemented-by:`). Depends on ADR-0029 (identity resolution), ADR-0047 /
ADR-0056 (sensitive-path deny floor), ADR-0057 (single-model manual
cycling), ADR-0063 (OCR as mandatory external prerequisite).

## Context

The pi harness (ADR-0057) runs a single primary model
(`deepseek/deepseek-v4-flash`) with one judge (`deepseek/deepseek-v4-pro`)
reachable via manual Ctrl+P cycling. Under this design the planning and
implementation attribution converge: the same session model plans and
implements, so `Authored-by:` (the planning model, ADR-0031/0040) routinely
duplicates `Implemented-by:`. The four-footer set carries attribution
overhead without separation.

`Tested-by:` is also mis-sourced. It is defined as "the active review model —
the judge if cycled for review, else the primary", which conflates review
attribution with remembered session state. Meanwhile the harness's external
review tool, Open Code Review (`ocr`, `@alibaba-group/open-code-review`), is
a mandatory external core prerequisite (ADR-0063) with its own configured
LLM model recorded in `~/.opencodereview/config.json` (top-level `model`
key). Commit metadata should record the model the review tool actually uses,
not a remembered session cycle.

`~/.opencodereview/config.json` is a credential-bearing path on the
immutable deny floor (ADR-0047: class `review-config`; the file holds the
provider API key). Any resolution mechanism must extract exactly one
non-secret value and never expose the key to the agent.

## Decision

### 1. Three required footers

Every non-merge, non-revert commit must include, in order:

`Implemented-by:` → `Tested-by:` → `Signed-off-by:`

- `Implemented-by:` — the model pi is using (the active session model; bare
  ID segment after the last `/`).
- `Tested-by:` — the model open-code-review is configured with, resolved by
  the first-party script `packages/prism-core/scripts/resolve-ocr-model.sh`
  (bare ID segment after the last `/`).
- `Signed-off-by:` — the human user, resolved via
  `packages/prism-core/scripts/resolve-identity.sh` (ADR-0029).

`Authored-by:` is removed. Issue references (`Fixes:`/`Refs:`) sit at the
top of the footer block, immediately above `Implemented-by:` (ADR-0010
ordering preserved, anchor re-pointed). Each model footer is the model ID
segment after the last `/` (e.g. `deepseek/deepseek-v4-flash` →
`deepseek-v4-flash`).

### 2. `resolve-ocr-model.sh` — redaction-safe single-key resolver

The script mirrors `resolve-identity.sh` in shape and failure posture:

- Reads `~/.opencodereview/config.json` (override: `PRISM_OCR_CONFIG` env
  var — the test seam; production always uses the default path).
- Parses with Node `JSON.parse` (Node ≥22 guaranteed by the package
  toolchain; no jq dependency).
- Extracts ONLY the top-level `model` key; validates it against
  `[A-Za-z0-9._/-]+`; prints the bare segment after the last `/`.
- Never prints the raw file, `providers.*`, `api_key`, or any other field.
  Node stderr is discarded so stack traces and file content cannot leak.
- Fails closed (exit 3, empty stdout) when: config missing / not a regular
  file, JSON unparseable, `model` missing/empty/invalid. Error messages are
  generic; they never include file contents or the API key.
- The deny floor is unchanged: the agent may never read
  `~/.opencodereview/` directly; the script is the sole sanctioned channel
  and its stdout is exactly one non-secret value.

### 3. Enforcement

`commitlint.config.cjs` `trailers-exist` requires
`['Implemented-by:', 'Tested-by:', 'Signed-off-by:']`. The
`issue-ref-convention` rule re-anchors on `Implemented-by:` (constant
renamed `AUTHORED_BY_RE` → `IMPLEMENTED_BY_RE`). Merge/revert exemption
unchanged.

## Consequences

**Positive:**
- Attribution slims to three trailers carrying distinct signal; `Authored-by:`
  duplication disappears.
- `Tested-by:` mechanically resolves to the model OCR actually reviews with —
  no remembered-cycle source, no conflation with the session model.
- The API key stays on the deny floor; the resolver emits one non-secret
  value and is canary-tested against key leakage.
- Fail-closed resolution matches OCR's mandatory NO-GO status (ADR-0063): a
  missing/malformed OCR config halts footer resolution with a clear message
  pointing at `ocr config model`, rather than fabricating a value.

**Negative:**
- `Tested-by:` is fixed-source uniform (like the previous footers): a
  docs-only commit carries OCR's configured model even though no OCR review
  ran — the same fixed-source imprecision the harness already accepted
  (ADR-0031/0040). Dynamic per-commit re-sourcing remains out of scope.
- Commit-msg-hook-adjacent flows (pr.md title validation, release.md) now
  depend on OCR config presence; they fail closed with a clear message when
  it is absent.
- The resolver is outside the harness-layer guarantee for its internal read
  (ADR-0047 residual risk: helper script whose operand is the script, not
  the credential) — mitigated by single-key extraction, stderr discard,
  fail-closed output, and the canary leakage test.

**Neutral:**
- ADR-0010's ordering rule survives re-anchored.
- Aurora submodule's own commitlint config is untouched (separate repo).

## Alternatives Considered

- **Documented fixed convention** ("Tested-by: the model OCR is configured
  with, operator-maintained"): rejected by the operator — no mechanical
  source; drift risk between OCR config and docs.
- **Env var mirroring OCR config** (e.g. `PRISM_OCR_MODEL`): rejected — new
  config surface and a sync burden; the harness just retired the
  `OPENCODE_MODEL_*` vars (ADR-0057).
- **Read OCR config via the agent directly**: rejected — violates the
  immutable deny floor (ADR-0047).
- **Dynamic per-commit footer re-sourcing**: rejected in ADR-0040; retained
  fixed-source for consistency.

## Cross-references

- ADR-0031, ADR-0040 (footer clauses superseded; opencode-era)
- ADR-0010 (preserved; ordering anchor re-pointed)
- ADR-0029 (Signed-off-by resolution)
- ADR-0047, ADR-0056 (deny floor, residual-risk model)
- ADR-0057 (single-model manual cycling)
- ADR-0063 (OCR mandatory external prerequisite)
- Spec: `docs/specs/2026-08-14-commit-footer-slim-spec.md`
```

- [x] **Step 2: Update CONTEXT.md line 226**

Change:

```text
- `adr/0040-gpt-5-6-sol-on-design-planner-tiers.md` — retain the four commit-attribution footers; model-tier clauses are superseded.
```

to:

```text
- `adr/0064-slim-commit-footers-and-ocr-sourced-tested-by.md` — three commit footers; `Tested-by:` sourced from OCR config (supersedes ADR-0040's footer clause).
```

- [x] **Step 3: Verify**

Run:

```bash
test -f adr/0064-slim-commit-footers-and-ocr-sourced-tested-by.md && grep -q "0064" CONTEXT.md && echo OK
```

Expected: `OK`

- [x] **Step 4: Commit (OLD four-trailer format — config not yet changed)**

```bash
git add adr/0064-slim-commit-footers-and-ocr-sourced-tested-by.md CONTEXT.md
PATH="/home/kyau/.venv/bin:$PATH" git commit -S -m $'docs(adr): record three-footer policy with OCR-sourced tested-by\n\nSupersedes ADR-0031/0040 footer clauses; re-anchors ADR-0010 ordering\non Implemented-by; documents the redaction-safe resolver contract.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---
### Task 2: `resolve-ocr-model.sh` resolver script (TDD)

**Files:**
- Create: `packages/prism-core/scripts/resolve-ocr-model.sh`
- Create: `tests/Shell/resolve-ocr-model_test.sh`
- Create: `tests/Shell/fixtures/ocr-config.json` (committed canary fixture)

**Interfaces:**
- Consumes: nothing (standalone)
- Produces: `bash packages/prism-core/scripts/resolve-ocr-model.sh` →
  stdout bare model id (e.g. `deepseek-v4-flash`), exit 0; exit 3 with empty
  stdout on any failure. Honors `PRISM_OCR_CONFIG` override (test seam).
  Later consumed by: Task 5 (pr.md, release.md), Task 6 (docs).

- [x] **Step 1: Write the failing test**

Create `tests/Shell/fixtures/ocr-config.json`:

```json
{
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "providers": {
        "deepseek": {
            "api_key": "sk-CANARY-MUST-NEVER-LEAK",
            "model": "deepseek-v4-flash"
        }
    },
    "llm": {}
}
```

Create `tests/Shell/resolve-ocr-model_test.sh`:

```bash
#!/usr/bin/env bash
# $KYAULabs: resolve-ocr-model_test.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $


# resolve-ocr-model_test.sh — contract tests for resolve-ocr-model.sh
# (ADR-0064). Uses ONLY synthetic fixtures via PRISM_OCR_CONFIG; never the
# real ~/.opencodereview config. Asserts single-key extraction, bare-model
# output, fail-closed behavior, and the canary no-key-leak guarantee.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/packages/prism-core/scripts/resolve-ocr-model.sh"
CANARY="$REPO_ROOT/tests/Shell/fixtures/ocr-config.json"

if [ ! -x "$SCRIPT" ] && [ ! -f "$SCRIPT" ]; then
	fail "resolve-ocr-model.sh not found at $SCRIPT"
	print_summary "resolve_ocr_model"
	exit 1
fi

# run_script <config-path> — invoke the resolver against a given config;
# captures rc and stdout. Always redirects stderr away from the test log.
run_script() {
	local cfg="$1"
	set +e
	OUTPUT="$(PRISM_OCR_CONFIG="$cfg" bash "$SCRIPT" 2>/dev/null)"
	RC=$?
	set -e
}

# ── 1. Valid canary config → bare model id, no key leakage ────────────────
run_script "$CANARY"
if [ "$RC" -eq 0 ] && [ "$OUTPUT" = "deepseek-v4-flash" ]; then
	pass "valid config yields bare model id"
else
	fail "valid config: rc=$RC output='$OUTPUT'"
fi
if printf '%s' "$OUTPUT" | grep -q 'sk-CANARY-MUST-NEVER-LEAK'; then
	fail "CANARY LEAK: api_key value appeared in resolver output"
else
	pass "canary: resolver output contains no api_key value"
fi

# ── 2. Provider-prefixed model → bare segment after last / ─────────────────
PREFIXED=$(mktemp)
register_temp_dir "$(dirname "$PREFIXED")"
printf '{"provider":"deepseek","model":"deepseek/deepseek-v4-pro","providers":{},"llm":{}}\n' > "$PREFIXED"
run_script "$PREFIXED"
if [ "$RC" -eq 0 ] && [ "$OUTPUT" = "deepseek-v4-pro" ]; then
	pass "provider-prefixed model normalized to bare segment"
else
	fail "prefixed model: rc=$RC output='$OUTPUT'"
fi

# ── 3. Missing config file → exit 3, empty stdout ──────────────────────────
MISSING=$(mktemp -u)
register_temp_dir "$(dirname "$MISSING")"
run_script "$MISSING"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "missing config fails closed (exit 3, empty stdout)"
else
	fail "missing config: rc=$RC output='$OUTPUT'"
fi

# ── 4. Malformed JSON → exit 3, empty stdout ───────────────────────────────
MALFORMED=$(mktemp)
register_temp_dir "$(dirname "$MALFORMED")"
printf '{"provider": "deepseek", "model": "deepseek-v4-flash", ' > "$MALFORMED"
run_script "$MALFORMED"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "malformed JSON fails closed"
else
	fail "malformed JSON: rc=$RC output='$OUTPUT'"
fi

# ── 5. Missing model key → exit 3, empty stdout ────────────────────────────
NOKEY=$(mktemp)
register_temp_dir "$(dirname "$NOKEY")"
printf '{"provider":"deepseek","providers":{},"llm":{}}\n' > "$NOKEY"
run_script "$NOKEY"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "missing model key fails closed"
else
	fail "missing model key: rc=$RC output='$OUTPUT'"
fi

# ── 6. Empty model string → exit 3, empty stdout ───────────────────────────
EMPTYMODEL=$(mktemp)
register_temp_dir "$(dirname "$EMPTYMODEL")"
printf '{"provider":"deepseek","model":"","providers":{},"llm":{}}\n' > "$EMPTYMODEL"
run_script "$EMPTYMODEL"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "empty model fails closed"
else
	fail "empty model: rc=$RC output='$OUTPUT'"
fi

# ── 7. Non-string model (e.g. number) → exit 3, empty stdout ───────────────
NUMERIC=$(mktemp)
register_temp_dir "$(dirname "$NUMERIC")"
printf '{"provider":"deepseek","model":42,"providers":{},"llm":{}}\n' > "$NUMERIC"
run_script "$NUMERIC"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "non-string model fails closed"
else
	fail "non-string model: rc=$RC output='$OUTPUT'"
fi

# ── 8. Malicious model with newline/injection chars → exit 3 ───────────────
INJECT=$(mktemp)
register_temp_dir "$(dirname "$INJECT")"
printf '{"provider":"deepseek","model":"deepseek-v4-flash\\nSigned-off-by: evil <e@e>","providers":{},"llm":{}}\n' > "$INJECT"
run_script "$INJECT"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "injection-shaped model fails closed"
else
	fail "injection-shaped model: rc=$RC output='$OUTPUT'"
fi

print_summary "resolve_ocr_model"
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/resolve-ocr-model_test.sh`
Expected: FAIL — the script does not exist yet; every case fails with
"resolve-ocr-model.sh not found" or the invocation errors. This is the Red.

- [x] **Step 3: Write the minimal implementation**

Create `packages/prism-core/scripts/resolve-ocr-model.sh`:

```bash
#!/usr/bin/env bash
# $KYAULabs: resolve-ocr-model.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $



# resolve-ocr-model.sh — Resolve the OCR review model for the Tested-by
# commit footer (ADR-0064). Reads ONLY the top-level `model` key from
# ~/.opencodereview/config.json via Node JSON.parse and prints the bare
# model id (segment after the last /). Never prints the API key, provider
# config, or any other field; fails closed (exit 3, empty stdout) on every
# error path. PRISM_OCR_CONFIG overrides the config path (test seam only).
#
# Output: bare model id on stdout (e.g. "deepseek-v4-flash")
# Exit: 0 success, 3 when no valid model resolves

set -euo pipefail

CONFIG_FILE="${PRISM_OCR_CONFIG:-$HOME/.opencodereview/config.json}"

if [ ! -f "$CONFIG_FILE" ]; then
	printf '✗ OCR model resolution failed: config not found at %s\n' "$CONFIG_FILE" >&2
	exit 3
fi

MODEL="$(node -e '
const fs = require("fs");
const path = process.argv[1];
let raw;
try {
  raw = fs.readFileSync(path, "utf8");
} catch (e) {
  process.exit(3);
}
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  process.exit(3);
}
if (typeof data.model !== "string" || data.model.trim() === "") {
  process.exit(3);
}
process.stdout.write(data.model.trim());
' "$CONFIG_FILE" 2>/dev/null)" || {
	printf '✗ OCR model resolution failed: config unreadable or missing model key\n' >&2
	exit 3
}

case "$MODEL" in
	''|*[!A-Za-z0-9._/-]*)
		printf '✗ OCR model resolution failed: model value is not a valid model id\n' >&2
		exit 3
		;;
esac

printf '%s\n' "${MODEL##*/}"

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/resolve-ocr-model_test.sh`
Expected: 8 PASS lines, 0 FAIL, summary `✓ resolve_ocr_model: 8 passed, 0 failed`

- [x] **Step 5: Commit (OLD four-trailer format — config not yet changed)**

```bash
chmod +x packages/prism-core/scripts/resolve-ocr-model.sh
git add packages/prism-core/scripts/resolve-ocr-model.sh tests/Shell/resolve-ocr-model_test.sh tests/Shell/fixtures/ocr-config.json
PATH="/home/kyau/.venv/bin:$PATH" git commit -S -m $'feat(scripts): resolve OCR review model for commit footers\n\nReads only the top-level model key from the OCR config; emits the\nbare model id; fails closed on every error path; canary-tested\nagainst API-key leakage (ADR-0064).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---
### Task 3: Commitlint config + commit-msg hook example (first new-format commit)

**Files:**
- Modify: `packages/prism-core/config/commitlint.config.cjs`
- Modify: `.github/hooks/commit-msg:19`

**Interfaces:**
- Consumes: Task 2's resolver contract (documented; not called by commitlint)
- Produces: the NEW required-trailer set `['Implemented-by:', 'Tested-by:',
  'Signed-off-by:']` and the re-anchored `issue-ref-convention` rule. All
  later commits and test fixtures must use the new format.

- [x] **Step 1: Edit the commitlint config**

In `packages/prism-core/config/commitlint.config.cjs`:

1. Rename the constant and its uses (`issueRefConvention` body):

```text
const AUTHORED_BY_RE = /^\s*Authored-by:\s/;
```
→
```text
const IMPLEMENTED_BY_RE = /^\s*Implemented-by:\s/;
```

and inside `issueRefConvention`:

```text
		if (AUTHORED_BY_RE.test(line) && authoredByIdx === -1) {
			authoredByIdx = i;
		}
```
→
```text
		if (IMPLEMENTED_BY_RE.test(line) && authoredByIdx === -1) {
			authoredByIdx = i;
		}
```

Rename the local `authoredByIdx` → `implementedByIdx` throughout
`issueRefConvention` (declaration, assignment, and the check
`issueRefIdxs.some((idx) => idx > authoredByIdx)`), and update the two
violation strings:

```text
'issue-reference trailers (`Fixes:`, `Refs:`) must appear before `Authored-by:`'
```
→
```text
'issue-reference trailers (`Fixes:`, `Refs:`) must appear before `Implemented-by:`'
```

and in `trailersExist`'s message the trailer names come from the rule list
(below), so no other string change is needed.

2. Change the `trailers-exist` rule list:

```text
		'trailers-exist': [2, 'always', ['Authored-by:', 'Implemented-by:', 'Tested-by:', 'Signed-off-by:']],
```
→
```text
		'trailers-exist': [2, 'always', ['Implemented-by:', 'Tested-by:', 'Signed-off-by:']],
```

- [x] **Step 2: Update the commit-msg hook example**

In `.github/hooks/commit-msg` line 19, change the heredoc example:

```text
      git commit -S -m $'type[scope]: subject\n\nBody line.\n\nAuthored-by: model\nTested-by: model\nSigned-off-by: user <email>'
```
→
```text
      git commit -S -m $'type[scope]: subject\n\nBody line.\n\nImplemented-by: model\nTested-by: model\nSigned-off-by: user <email>'
```

- [x] **Step 3: Verify the new rule set**

Run:

```bash
cd /home/kyau/projects/kyaulabs/prism
printf 'feat: ok\n\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > /tmp/footer-new-ok.txt
printf 'feat: bad\n\nImplemented-by: x\nSigned-off-by: x <x@x>\n' > /tmp/footer-new-missing.txt
printf 'feat: anchor\n\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\nFixes: #1\n' > /tmp/footer-new-anchor.txt
PATH="/home/kyau/.venv/bin:$PATH" node packages/prism-core/scripts/prism-tool.js run commitlint -- --edit /tmp/footer-new-ok.txt
PATH="/home/kyau/.venv/bin:$PATH" node packages/prism-core/scripts/prism-tool.js run commitlint -- --edit /tmp/footer-new-missing.txt; test $? -ne 0
PATH="/home/kyau/.venv/bin:$PATH" node packages/prism-core/scripts/prism-tool.js run commitlint -- --edit /tmp/footer-new-anchor.txt; test $? -ne 0
echo "new-rule verification OK"
```

Expected: first commitlint call exits 0; second and third exit non-zero;
final line `new-rule verification OK`.

- [x] **Step 4: Commit (NEW three-trailer format — config in effect now)**

```bash
git add packages/prism-core/config/commitlint.config.cjs .github/hooks/commit-msg
PATH="/home/kyau/.venv/bin:$PATH" git commit -S -m $'build(commitlint): require three footers and re-anchor issue-ref ordering\n\nDrop Authored-by from trailers-exist; Fixes/Refs must precede\nImplemented-by (ADR-0064, ADR-0010 re-anchored).\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---
### Task 4: Test fixture updates (commit-msg_test.sh, template footer, release workflow, pr command, Node)

**Files:**
- Modify: `tests/Shell/commit-msg_test.sh` (18 `Authored-by:` occurrences)
- Modify: `tests/Shell/commit_template_footer_test.sh:20-40`
- Modify: `tests/Shell/release_workflow_test.sh:525-545`
- Modify: `tests/Shell/pr_command_test.sh:340-380`
- Modify: `tests/Node/prism-tool-run.test.js:134,185`

**Interfaces:**
- Consumes: Task 3's new trailer rule set
- Produces: green suites asserting the three-trailer contract

- [x] **Step 1: Update commit-msg_test.sh fixtures**

Remove the `Authored-by: x` line from every fixture message and update the
Test 11 placement case to anchor on `Implemented-by:`. Specific edits:

1. All valid-message fixtures (lines 89, 118, 151, 210, 384, 407 and the
   `VALID=$'...'` cases at 118/151/210) become:

```text
feat: test

Implemented-by: x
Tested-by: x
Signed-off-by: x <x@x>
```

2. Rejection fixtures (lines 269, 292, 315, 338, 430, 453 — Closes/Resolve/
   Fixes/fixes:/Fix variants) keep their bad keyword, drop `Authored-by: x`:

```text
fix(db): sqli in search

Closes #40
Implemented-by: x
Tested-by: x
Signed-off-by: x <x@x>
```

3. Test 11 (placement, lines 353-371): retitle to
   `── Test 11: Fixes: after Implemented-by: rejected ──`, change the fixture
   to put `Fixes: #42` after `Signed-off-by:` (i.e. after the anchor):

```text
printf 'fix(db): sqli in search\n\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\nFixes: #42\n' > "$MSG"
```

and update the pass/fail message strings to say `Implemented-by:`.

4. Test 16 (lines 468-486): fixture becomes missing `Implemented-by:`:

```text
printf 'feat: missing impl\n\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
```

(assertion text unchanged — still "Missing Implemented-by rejected").

- [x] **Step 2: Update commit_template_footer_test.sh**

Change section 1 (release.md footer check, lines ~20-40) from requiring
`Authored-by:` to requiring the three-trailer set and the resolver script:

```text
if grep -qF "Implemented-by:" "$RELEASE" \
	&& grep -qF "Tested-by:" "$RELEASE" \
	&& grep -qF "Signed-off-by:" "$RELEASE" \
	&& ! grep -qF "Authored-by:" "$RELEASE"; then
	pass "release.md changelog commit includes three required footers"
else
	fail "release.md changelog commit missing Implemented-by/Tested-by/Signed-off-by (or still has Authored-by)"
fi
```

Also update the section comment (lines 26-28) to say the three-trailer rule.

- [x] **Step 3: Update release_workflow_test.sh P20**

Replace the `grep -qF 'Authored-by:'` line with the resolver-script check and
update the label:

```text
# ── P20. Signed chore(release) commit with three dynamic footers ───────────

if grep -qF 'git commit -S' "$RELEASE_CMD" && \
   grep -qF 'chore(release): v' "$RELEASE_CMD" && \
   grep -qF 'PI_MODEL' "$RELEASE_CMD" && \
   grep -qF 'MODEL_ID' "$RELEASE_CMD" && \
   grep -qF 'resolve-identity.sh' "$RELEASE_CMD" && \
   grep -qF 'resolve-ocr-model.sh' "$RELEASE_CMD" && \
   grep -qF 'Implemented-by:' "$RELEASE_CMD" && \
   grep -qF 'Tested-by:' "$RELEASE_CMD" && \
   grep -qF 'Signed-off-by:' "$RELEASE_CMD" && \
   ! grep -qF 'Authored-by:' "$RELEASE_CMD"; then
	pass "P20: /release creates a signed chore(release) commit with three dynamically resolved footers"
else
	fail "P20: /release signed-commit or dynamic-footer contract violated"
fi
```

- [x] **Step 4: Update pr_command_test.sh title-validation section**

In the title-validation run (lines ~352-363), add `PRISM_OCR_CONFIG` to the
environment and strengthen the assertion:

```text
	rc=0
	(cd "$REPO_ROOT" && PRISM_TOOL="$LAUNCHER" PATH="$TOOLCHAIN_PATH" \
		PRISM_OCR_CONFIG="$REPO_ROOT/tests/Shell/fixtures/ocr-config.json" \
		TITLE_FILE="$title_file" VALIDATION_FILE="$validation_file" \
		bash "$TITLE_SCRIPT") >/dev/null 2>&1 || rc=$?
	validation_title=""
	IFS= read -r validation_title < "$validation_file" 2>/dev/null || true
	if [ "$rc" -eq 0 ] \
		&& [ "$validation_title" = 'feat(commands): prepare pull request' ] \
		&& grep -Fq 'Implemented-by:' "$validation_file" \
		&& grep -Fq 'Tested-by:' "$validation_file" \
		&& grep -Fq 'Signed-off-by:' "$validation_file" \
		&& ! grep -Fq 'Authored-by:' "$validation_file"; then
		pass 'title validation accepts a conventional title with three attribution trailers'
	else
		fail 'title validation rejected a conventional title'
	fi
```

- [x] **Step 5: Update tests/Node/prism-tool-run.test.js**

Line 134 fixture: remove `Authored-by:` so it tests the missing
`Implemented-by:` rejection under the new rule:

```text
		'feat: missing implementation attribution\n\nTested-by: model\nSigned-off-by: user <user@example.com>\n'
```

Line 185 fixture:

```text
		'feat: valid attribution\n\nImplemented-by: model\nTested-by: model\nSigned-off-by: user <user@example.com>\n'
```

- [x] **Step 6: Run the suites**

Run:

```bash
cd /home/kyau/projects/kyaulabs/prism
bash tests/Shell/commit-msg_test.sh
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/release_workflow_test.sh
bash tests/Shell/pr_command_test.sh
node tests/Node/prism-tool-run.test.js
```

Expected: every suite prints `✓ <label>: N passed, 0 failed` (commit-msg
suite runs via its own pass/fail tally; commitlint-dependent tests require
`node_modules/commitlint` — if absent locally, the skip guard fires and CI
covers them).

- [x] **Step 7: Commit (NEW format)**

```bash
git add tests/Shell/commit-msg_test.sh tests/Shell/commit_template_footer_test.sh tests/Shell/release_workflow_test.sh tests/Shell/pr_command_test.sh tests/Node/prism-tool-run.test.js
PATH="/home/kyau/.venv/bin:$PATH" git commit -S -m $'test(hooks): update footer fixtures to three-trailer set\n\nDrop Authored-by from commitlint fixtures; re-anchor placement and\nmissing-trailer cases on Implemented-by; wire PRISM_OCR_CONFIG into\npr title validation and release-workflow assertions (ADR-0064).\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---
### Task 5: Prompts — pr.md and release.md source Tested-by from the resolver

**Files:**
- Modify: `packages/prism-core/prompts/pr.md:181-184`
- Modify: `packages/prism-core/prompts/release.md:205-212`

**Interfaces:**
- Consumes: Task 2's `resolve-ocr-model.sh`
- Produces: pr.md/release.md emitting the three-trailer set with
  `Tested-by:` resolved from OCR config; fails closed with a clear message
  when the resolver exits 3.

- [x] **Step 1: Update pr.md title-validation block**

Replace lines 181-184:

```text
SIGNED_OFF_BY=$(bash packages/prism-core/scripts/resolve-identity.sh)
MODEL_ID="${PI_MODEL##*/}"
{
    cat "$TITLE_FILE"
    printf '\n\nAuthored-by: %s\n' "$MODEL_ID"
    printf 'Implemented-by: %s\n' "$MODEL_ID"
    printf 'Tested-by: %s\n' "$MODEL_ID"
    printf 'Signed-off-by: %s\n' "$SIGNED_OFF_BY"
} > "$VALIDATION_FILE"
```

with:

```text
SIGNED_OFF_BY=$(bash packages/prism-core/scripts/resolve-identity.sh)
MODEL_ID="${PI_MODEL##*/}"
OCR_MODEL=$(bash packages/prism-core/scripts/resolve-ocr-model.sh) \
    || { printf 'PR title validation failed: OCR model could not be resolved (run: ocr config model)\n' >&2; exit 1; }
{
    cat "$TITLE_FILE"
    printf '\n\nImplemented-by: %s\n' "$MODEL_ID"
    printf 'Tested-by: %s\n' "$OCR_MODEL"
    printf 'Signed-off-by: %s\n' "$SIGNED_OFF_BY"
} > "$VALIDATION_FILE"
```

- [x] **Step 2: Update release.md release-commit construction**

Replace both `RELEASE_MSG=$(printf 'chore(release): v%s\n\n...` blocks
(lines 205-212) with the three-trailer form; the `Tested-by:` value must be
resolved before the `printf`, with the same fail-closed message. Concretely,
after the `RELEASE_REF` validation block and before `git add CHANGELOG.md`,
insert:

```text
OCR_MODEL=$(bash packages/prism-core/scripts/resolve-ocr-model.sh) \
    || { echo "✗ Release commit blocked: OCR model could not be resolved (run: ocr config model)." >&2; exit 1; }
```

and change both `printf` blocks to:

```text
if [ -n "$RELEASE_REF" ]; then
    RELEASE_MSG=$(printf 'chore(release): v%s\n\n%s\nImplemented-by: %s\nTested-by: %s\nSigned-off-by: %s' \
        "$VERSION" "$RELEASE_REF" "$MODEL_ID" \
        "$OCR_MODEL" \
        "$(bash packages/prism-core/scripts/resolve-identity.sh)")
else
    RELEASE_MSG=$(printf 'chore(release): v%s\n\nImplemented-by: %s\nTested-by: %s\nSigned-off-by: %s' \
        "$VERSION" "$MODEL_ID" \
        "$OCR_MODEL" \
        "$(bash packages/prism-core/scripts/resolve-identity.sh)")
fi
```

- [x] **Step 3: Verify**

Run:

```bash
cd /home/kyau/projects/kyaulabs/prism
bash tests/Shell/pr_command_test.sh
bash tests/Shell/release_workflow_test.sh
bash tests/Shell/commit_template_footer_test.sh
```

Expected: all three suites green (`0 failed`), with the new
`resolve-ocr-model.sh` assertions in P20 and the title-validation check.

- [x] **Step 4: Commit (NEW format)**

```bash
git add packages/prism-core/prompts/pr.md packages/prism-core/prompts/release.md
PATH="/home/kyau/.venv/bin:$PATH" git commit -S -m $'feat(prompts): source tested-by from OCR model resolver\n\npr.md title validation and release.md emit the three-trailer set\nwith Tested-by resolved via resolve-ocr-model.sh; both fail closed\nwith a clear message when OCR config is missing (ADR-0064).\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---
### Task 6: Documentation — AGENTS.md, skills, README, CONTRIBUTING

**Files:**
- Modify: `packages/prism-core/AGENTS.md:157-166,174-175`
- Modify: `packages/prism-core/skills/conventional-commits/SKILL.md`
- Modify: `packages/prism-core/skills/tdd/SKILL.md:135-137`
- Modify: `packages/prism-core/skills/writing-plans/SKILL.md:149,172`
- Modify: `packages/prism-core/skills/resolve-merge-conflicts/SKILL.md:64`
- Modify: `README.md:554-612`
- Modify: `CONTRIBUTING.md:81-92`

**Interfaces:**
- Consumes: Tasks 2-5 contracts (resolver path, three-trailer set)
- Produces: every doc stating the three-trailer policy with `Tested-by:`
  sourced from `resolve-ocr-model.sh`

- [x] **Step 1: Update AGENTS.md**

Replace lines 157-166:

```text
- Every commit must include `Authored-by:` (the active planning model),
  `Implemented-by:` (the active implementation model — the primary
  `deepseek-v4-flash` unless Ctrl+P cycled), `Tested-by:` (the active review
  model — `deepseek-v4-pro` if cycled for review, else the primary), and
  `Signed-off-by:` (user) footers, in pipeline order `Authored-by` →
  `Implemented-by` → `Tested-by` → `Signed-off-by` (ADR-0040). Each model
  footer is the model ID segment after the last `/` (e.g. `deepseek-v4-flash`,
  `deepseek-v4-pro`). `Signed-off-by:` is resolved dynamically via
  `bash packages/prism-core/scripts/resolve-identity.sh` (git-config fallback
  per ADR-0029: `git config user.name`/`user.email`). Issue-closing references use `Fixes: #NN` (Sentence-case, with colon; `Closes`/`Resolve`/`Fix`/etc. are rejected by commitlint), placed at the top of the footer immediately above `Authored-by:`. Use `Refs: #NN` for non-closing references.
```

with:

```text
- Every commit must include `Implemented-by:` (the model pi is using — the
  active session model), `Tested-by:` (the model open-code-review is
  configured with — resolved via
  `bash packages/prism-core/scripts/resolve-ocr-model.sh`), and
  `Signed-off-by:` (user) footers, in pipeline order `Implemented-by` →
  `Tested-by` → `Signed-off-by` (ADR-0064). Each model footer is the model
  ID segment after the last `/` (e.g. `deepseek-v4-flash`, `deepseek-v4-pro`).
  `Signed-off-by:` is resolved dynamically via
  `bash packages/prism-core/scripts/resolve-identity.sh` (git-config fallback
  per ADR-0029: `git config user.name`/`user.email`). Issue-closing references use `Fixes: #NN` (Sentence-case, with colon; `Closes`/`Resolve`/`Fix`/etc. are rejected by commitlint), placed at the top of the footer immediately above `Implemented-by:`. Use `Refs: #NN` for non-closing references.
```

And lines 174-175:

```text
`conventional-commits` skill and produce: type[scope]: subject + Authored-by +
Implemented-by + Tested-by + Signed-off-by footers. The commit-msg hook blocks
```
→
```text
`conventional-commits` skill and produce: type[scope]: subject +
Implemented-by + Tested-by + Signed-off-by footers. The commit-msg hook blocks
```

- [x] **Step 2: Update conventional-commits skill**

In `packages/prism-core/skills/conventional-commits/SKILL.md`:

1. Header line:
```text
- Every commit must include `Authored-by:`, `Implemented-by:`, `Tested-by:`, and `Signed-off-by:` footers
```
→
```text
- Every commit must include `Implemented-by:`, `Tested-by:`, and `Signed-off-by:` footers
```

2. "Required Footers" section (bullets + caution + notes): rewrite to the
three-trailer set:

```text
Every commit message must end with three footers:

- **`Implemented-by:`** — the model pi is using (the active session model).
  Use the model ID segment after the last `/` (for example,
  `deepseek/deepseek-v4-flash` → `deepseek-v4-flash`).
- **`Tested-by:`** — the model open-code-review is configured with. Resolve
  it with `bash packages/prism-core/scripts/resolve-ocr-model.sh` (reads
  only the `model` key from `~/.opencodereview/config.json`; fails closed,
  exit 3, when the config is missing or unreadable).
- **`Signed-off-by:`** — the human user approving the change, formatted as
  `Name <email>`. Resolve it dynamically with
  `bash packages/prism-core/scripts/resolve-identity.sh`; it uses an optional
  `~/.config/prism/identity` override and then git
  `user.name`/`user.email`, failing closed when neither resolves.

> [!CAUTION]
> Do NOT use role names (`build-agent`, `code-review`, `tdd`, etc.) — only the
> model ID. The Implemented-by / Tested-by footers track which configured
> models implemented and verified the change — not which agent role
> orchestrated it.
>
> `Tested-by:` records the model the review tool (open-code-review) uses;
> `Implemented-by:` attributes the coding model. See ADR-0064.
```

3. The "Issue References" section: replace `Authored-by:` with
`Implemented-by:` in both placement sentences.

4. All four examples: drop `Authored-by:` lines; keep the rest.

5. Enforcement paragraph: `Authored-by:`/`Implemented-by:`/`Tested-by:`/
`Signed-off-by:` → `Implemented-by:`/`Tested-by:`/`Signed-off-by:`.

6. "Passing the Message to Git" examples: drop `Authored-by:` from the
CORRECT example and both WRONG `-m` examples.

- [x] **Step 3: Update tdd skill**

`packages/prism-core/skills/tdd/SKILL.md` lines 135-137:

```text
- `Authored-by:` with the model that planned the work
- `Implemented-by:` with the model that wrote the implementation
- `Tested-by:` with the model that ran verification/review
```
→
```text
- `Implemented-by:` with the model that wrote the implementation
- `Tested-by:` with the model open-code-review is configured with (via
  `resolve-ocr-model.sh`)
```

- [x] **Step 4: Update writing-plans skill**

Line 149 commit example:

```text
git commit -S -m $'feat(scope): concise subject describing the change\n\nAuthored-by: <active-planning-model>\nImplemented-by: <active-implementation-model>\nTested-by: <active-review-model>\nSigned-off-by: <resolved via resolve-identity.sh>'
```
→
```text
git commit -S -m $'feat(scope): concise subject describing the change\n\nImplemented-by: <active-session-model>\nTested-by: <resolved via resolve-ocr-model.sh>\nSigned-off-by: <resolved via resolve-identity.sh>'
```

Line 172: `type[scope]: subject + Authored-by + Implemented-by + Tested-by + Signed-off-by` → `type[scope]: subject + Implemented-by + Tested-by + Signed-off-by`.

- [x] **Step 5: Update resolve-merge-conflicts skill**

Line 64: `exempt from the Authored-by/Implemented-by/Tested-by/Signed-off-by rule` → `exempt from the Implemented-by/Tested-by/Signed-off-by rule` and `Do NOT add the four footers` → `Do NOT add the three footers`.

- [x] **Step 6: Update README.md**

Lines 554-557 (footer token list):

```text
  'Authored-by',        # Required — the design/planning model (e.g. glm-5.2)
  'Implemented-by',     # Required — the implementation model (primary deepseek-v4-flash, or deepseek-v4-pro if Ctrl+P cycled)
  'Tested-by',          # Required — the review model (deepseek-v4-pro if cycled for review, else the primary)
```
→
```text
  'Implemented-by',     # Required — the model pi is using (the active session model)
  'Tested-by',          # Required — the model open-code-review is configured with (via resolve-ocr-model.sh)
```

Lines 567-577 (prose): "Every commit must include `Authored-by`,
`Implemented-by`, `Tested-by`, and `Signed-off-by` footers." → the
three-trailer sentence; drop "Each model footer..." paragraph stays; fix
"immediately above `Authored-by:`" → "immediately above `Implemented-by:`".

Lines 597-612 (examples): drop `Authored-by:` lines from both examples.

- [x] **Step 7: Update CONTRIBUTING.md**

Lines 81-84:

```text
- `Authored-by:` — the model that did the design/planning (e.g. `glm-5.2`)
- `Implemented-by:` — the model that did the implementation
- `Tested-by:` — the model that did the verification/review
```
→
```text
- `Implemented-by:` — the model that did the implementation (the active
  session model)
- `Tested-by:` — the model open-code-review is configured with, resolved via
  `bash packages/prism-core/scripts/resolve-ocr-model.sh`
```

Line 92 (`review/verification step and record that model in `Tested-by:`.`)
→ reword to the OCR-model sourcing.

- [x] **Step 8: Verify docs consistency**

Run:

```bash
cd /home/kyau/projects/kyaulabs/prism
grep -rn "Authored-by" packages/prism-core/AGENTS.md packages/prism-core/skills/conventional-commits/SKILL.md packages/prism-core/skills/tdd/SKILL.md packages/prism-core/skills/writing-plans/SKILL.md packages/prism-core/skills/resolve-merge-conflicts/SKILL.md README.md CONTRIBUTING.md packages/prism-core/prompts/pr.md packages/prism-core/prompts/release.md .github/hooks/commit-msg || echo "no Authored-by references remain"
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/release_workflow_test.sh
bash tests/Shell/pr_command_test.sh
```

Expected: the grep prints nothing (exit 1 swallowed by `|| echo` shows
"no Authored-by references remain"); all three suites green.

- [x] **Step 9: Commit (NEW format)**

```bash
git add packages/prism-core/AGENTS.md packages/prism-core/skills/conventional-commits/SKILL.md packages/prism-core/skills/tdd/SKILL.md packages/prism-core/skills/writing-plans/SKILL.md packages/prism-core/skills/resolve-merge-conflicts/SKILL.md README.md CONTRIBUTING.md
PATH="/home/kyau/.venv/bin:$PATH" git commit -S -m $'docs(commits): document three-footer convention with OCR-sourced tested-by\n\nAGENTS.md, conventional-commits, tdd, writing-plans,\nresolve-merge-conflicts, README, and CONTRIBUTING now state the\nthree-trailer set and the resolve-ocr-model.sh sourcing (ADR-0064).\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---
## Final verification

Run:

```bash
cd /home/kyau/projects/kyaulabs/prism
for t in tests/Shell/*_test.sh; do bash "$t" || echo "FAILED: $t"; done
node tests/Node/prism-tool-run.test.js
PATH="/home/kyau/.venv/bin:$PATH" /check 2>/dev/null || PATH="/home/kyau/.venv/bin:$PATH" bash .github/scripts/check-php.sh 2>/dev/null || echo "run /check manually"
```

Expected: every Shell suite and the Node test green; `/check` passes
(php-cs-fixer, stylelint, eslint, Pest coverage ≥ 80% — the Pest gate
applies to changed files; this change touches no PHP).
