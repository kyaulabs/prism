# Graphify Vendored Auto-Install Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Remove the silent, unpinned, PEP-668-overriding auto-install of
`graphifyy` from the vendored Graphify build-pipeline reference, pin the
skill's install examples, and add a harness validator rule that prevents
`--break-system-packages` from recurring in agent-loaded documentation.

**Architecture:** The vendored `upstream-pipeline.md` (copied from
Graphify-Labs/graphify on 2026-07-20) Step 1 silently runs
`pip install graphifyy -q 2>/dev/null || pip install graphifyy -q
--break-system-packages` when the import check fails — unpinned,
error-suppressed, and overriding PEP 668. A skill loaded into agent context
that instructs force-installing an unpinned, easily-typosquattable package is
a supply-chain foothold. The fix replaces the auto-install fallback with a
**presence-check-and-STOP** override (consistent with the file's existing
`> Skipped` local-override style and with `SKILL.md`'s own "Graceful
degradation" guidance), pins the `SKILL.md` install examples, and extends
`validate-harness.sh` with a check that scans fenced ```bash/```sh code blocks
in `.opencode/**` for `--break-system-packages` (the existing
`check_install_grants` from issue #183 scans agent frontmatter/`opencode.jsonc`
only — it does not see markdown documentation content, which is the exact gap
this issue exposes).

**Tech Stack:** Bash (harness validator + shell tests), Markdown
(vendored reference + skill). No PHP, no SCSS, no JS.

## Origin

- **Issue:** #208 — "Graphify Auto-Install with --break-system-packages"
- **Type:** Security (commit type `fix` per `docs/agents/labels.md`)
- **Root cause:** Known and fully documented — the offending lines are named
  in the issue. No `@debug` investigation is required; this is the same class
  of supply-chain hardening as the already-resolved issue #183 (plan
  `2026-07-22-review-agent-supply-chain-hardening.md`), extended from agent
  *permission grants* to vendored *documentation content*.

## Global constraints

- **TDD mandatory.** The only new *logic* is the `validate-harness.sh` check
  (Task 2) — it gets Red → Green. The doc/skill edits (Task 1) are prose/config
  changes with no standalone unit test; they are verified by grep + the
  regression guard added in Task 2.
- **Each commit leaves the repo green.** Task 1 (doc fixes) lands first so the
  repo is clean when Task 2 adds the guard. Pre-commit does **not** run
  `validate-harness.sh` (it runs PHP/SCSS/JS linters, shellcheck, gitleaks,
  RCS + skill checks only — same as issue #183 found); the guard is enforced in
  CI (`.github/workflows/ci.yml:92`) and the shell test suite.
- **Vendoring discipline.** `upstream-pipeline.md` is a vendored upstream file.
  Preserve its structure (so future upstream diffs stay readable) and override
  behavior with a clearly-marked `> Local policy override` block — the same
  pattern the file already uses for Steps 0, 2.5, and 6b-8.
- **`shellcheck` clean** at `--severity=warning` (enforced by pre-commit on
  every staged `.sh`).
- **Commit footers.** `Authored-by: glm-5.2` (from `agent.plan.model` =
  `zai-coding-plan/glm-5.2`), `Tested-by: deepseek-v4-pro` (from
  `agent.code-review.model` = `deepseek/deepseek-v4-pro`), `Signed-off-by:`
  resolved via `bash .github/scripts/resolve-identity.sh`. Closing ref
  `Fixes: #208` on Task 1; `Refs: #208` on Task 2.

## Acceptance criteria (from issue #208)

- [ ] `upstream-pipeline.md` forbids silent/auto installs (the auto-install
      block is replaced with a detect-and-STOP override) — Task 1
- [ ] `graphify/SKILL.md` install examples are version-pinned — Task 1
- [ ] No reference to `--break-system-packages` outside forbidden-in-policy
      context; a mechanized guard prevents recurrence — Task 2

## File structure

| File | Change | Task |
| :--- | :--- | :---: |
| `.opencode/skills/graphify/reference/upstream-pipeline.md` | Replace the Step 1 auto-install fallback (lines 98-107) with a detect-and-STOP override; add a `> Local policy override` blockquote above the step | 1 |
| `.opencode/skills/graphify/SKILL.md` | Pin the § Installation examples (lines 33-36) to a version; add a pinning gotcha | 1 |
| `.github/scripts/validate-harness.sh` | New check block: reject `--break-system-packages` in fenced ```bash/```sh/```shell code blocks under `.opencode/**` (skips comment lines; prose outside code blocks is not scanned) | 2 |
| `tests/Shell/validate-harness_test.sh` | Tests 45-47: flag-in-code-block caught, flag-in-prose not flagged, pinned install not flagged | 2 |

> **Version (confirmed at gate):** pin to the floor `graphifyy>=0.9.27`
> (latest stable at plan approval, 2026-07-26). A compatible-release floor pins
> against typosquatting/major-drift without blocking patches — appropriate for
> human-facing install hints (unlike issue #205's exact pins, which target
> auto-spawned LSP/MCP servers that need reproducibility). All `<VERSION>`
> occurrences below resolve to `0.9.27`.

---

### Task 1: Replace the vendored auto-install with a detect-and-STOP override + pin the SKILL.md examples

**Files:**
- Modify: `.opencode/skills/graphify/reference/upstream-pipeline.md` (Step 1
  block, lines 79-113; the auto-install fallback is lines 98-107)
- Modify: `.opencode/skills/graphify/SKILL.md` (§ Installation, lines 29-38;
  § Gotchas, around line 126)

**Interfaces:** None — pure prose/config. Consumes the issue #183 supply-chain
policy rationale; produces the override that Task 2's guard message references.

- [ ] **Step 1: Add the `> Local policy override` blockquote above Step 1**

In `.opencode/skills/graphify/reference/upstream-pipeline.md`, immediately
above the `### Step 1 - Ensure graphify is installed` heading, insert this
blockquote (the literal `--break-system-packages` token lives in **prose**,
outside any code block, so Task 2's code-block scanner will not flag it):

```markdown
> **Local policy override (issue #208):** Upstream Step 1 auto-installs
> `graphifyy` — unpinned, error-suppressed (`2>/dev/null`), and falling back to
> `--break-system-packages`, which overrides PEP 668
> (externally-managed-environment) and force-installs into system Python. With
> an easily-typosquattable double-y package name this is a supply-chain
> foothold. Prism replaces the auto-install with a presence check that STOPs
> with pinned install instructions. Never auto-install from this pipeline;
> never override PEP 668; installs must be version-pinned. Enforced by
> `validate-harness.sh` (issue #208).
```

- [ ] **Step 2: Replace the auto-install fallback with detect-and-STOP**

In the same file, the Step 1 code block currently contains this fallback
(lines 98-107):

```bash
if ! "$PYTHON" -c "import graphify" 2>/dev/null; then
    if command -v uv >/dev/null 2>&1; then
        uv tool install --upgrade graphifyy -q 2>&1 | tail -3
        _UV_PY=$(uv tool run --from graphifyy python -c "import sys; print(sys.executable)" 2>/dev/null)
        if [ -n "$_UV_PY" ]; then PYTHON="$_UV_PY"; fi
    else
        "$PYTHON" -m pip install graphifyy -q 2>/dev/null \
          || "$PYTHON" -m pip install graphifyy -q --break-system-packages 2>&1 | tail -3
    fi
fi
```

Replace that entire `if ! "$PYTHON" -c "import graphify" ... fi` block with:

```bash
# Prism policy (issue #208): do NOT auto-install. Detect presence and STOP.
if ! "$PYTHON" -c "import graphify" 2>/dev/null; then
    echo "ERROR: graphify is not importable under $PYTHON." >&2
    echo "       Prism policy (issue #208): this pipeline does NOT auto-install." >&2
    echo "       Install it yourself, pinned to a specific version:" >&2
    echo "         uv tool install 'graphifyy>=0.9.27'   # preferred" >&2
    echo "         # or: pip install 'graphifyy>=0.9.27'" >&2
    echo "       See .opencode/skills/graphify/SKILL.md § Installation." >&2
    exit 1
fi
```

The interpreter-detection logic above it (the `PYTHON=""` ... `if [ -z
"$PYTHON" ]; then PYTHON="python3"; fi` block, lines 80-97) and the
`.graphify_python` / `.graphify_root` writes below it (lines 108-112) are
**unchanged** — only the auto-install fallback is replaced. After the
override, the `mkdir -p graphify-out` write only runs when graphify imported
successfully (the `exit 1` guarantees that).

> *The `echo` lines print the confirmed floor pin (`graphifyy>=0.9.27`) as
> user-facing guidance when graphify is missing — a literal message string.*

- [ ] **Step 3: Verify the offending lines are gone and the override is in place**

Run (expect zero matches for the auto-install, one match for the override
marker):

```bash
grep -nE 'pip install graphifyy|uv tool install --upgrade graphifyy' .opencode/skills/graphify/reference/upstream-pipeline.md
# Expected: no output (the auto-install lines are gone)
grep -nF 'Prism policy (issue #208)' .opencode/skills/graphify/reference/upstream-pipeline.md
# Expected: the two override lines (comment + echo)
```

- [ ] **Step 4: Pin the SKILL.md § Installation examples**

In `.opencode/skills/graphify/SKILL.md`, the § Installation block currently
reads (lines 29-38):

```markdown
## Installation

Graphify is a Python tool. The PyPI package name has a double-y quirk:

```bash
uv tool install graphifyy        # preferred
# or: pip install graphifyy
```

Requires Python 3.10+. Verify with `graphify --version`.
```

Replace the paragraph + code block with (confirmed floor pin `0.9.27`):

```markdown
## Installation

Graphify is a Python tool. The PyPI package name has a double-y quirk. Pin to
a specific version before installing (issue #208) — an unpinned `graphifyy` is
a typosquatting target:

```bash
uv tool install 'graphifyy>=0.9.27'   # preferred
# or: pip install 'graphifyy>=0.9.27'
```

Requires Python 3.10+. Verify with `graphify --version`.
```

- [ ] **Step 5: Add a pinning gotcha**

In `.opencode/skills/graphify/SKILL.md`, append this entry to the
`## Gotchas` list (after the existing "Package name is `graphifyy` (double-y)"
entry):

```markdown
- *Pin install versions (issue #208)* — install `graphifyy` with a version
  specifier (`graphifyy>=X.Y.Z` or `graphifyy==X.Y.Z`). An unpinned install of
  the double-y package is a typosquatting target; the build pipeline
  (`reference/upstream-pipeline.md`) never auto-installs and never uses
  `--break-system-packages`.
```

- [ ] **Step 6: Verify the examples are pinned and bare installs are gone**

Run (expect zero bare-install matches, two pinned matches):

```bash
grep -nE 'install graphifyy([^>=]|$)' .opencode/skills/graphify/SKILL.md
# Expected: no output (no bare unpinned installs remain)
grep -nF "graphifyy>=" .opencode/skills/graphify/SKILL.md
# Expected: the two pinned example lines
```

- [ ] **Step 7: Commit**

```bash
git add .opencode/skills/graphify/reference/upstream-pipeline.md .opencode/skills/graphify/SKILL.md
git commit -S -m $'fix(graphify): forbid auto-install and pin install examples\n\nThe vendored upstream-pipeline.md Step 1 silently ran `pip install\ngraphifyy` (unpinned, error-suppressed) and fell back to\n--break-system-packages, overriding PEP 668 — a supply-chain foothold if the\ndouble-y package is typosquatted (issue #208). Replace the auto-install with a\npresence check that STOPs with pinned install instructions; pin the SKILL.md\ninstall examples. Enforced by validate-harness.sh in the follow-up commit.\n\nFixes: #208\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

> *Use the canonical `$\'...\\n...\'` ANSI-C quoting form — the commit-msg hook
> rejects literal `\n` sequences (ADR-0025). `Signed-off-by:` is filled by the
> value `resolve-identity.sh` prints, not the literal placeholder.*

---

### Task 2: Add the `--break-system-packages` regression guard (TDD)

**Files:**
- Modify: `tests/Shell/validate-harness_test.sh` (add Tests 45-47 immediately
  before the `# ── Summary ──` section, after Test 44)
- Modify: `.github/scripts/validate-harness.sh` (insert a new check block after
  the "unpinned npx" check, line ~1013, before the `# ── Checking for stale
  plan files ──` comment, line ~1015)

**Interfaces:**
- Consumes: `${HARNESS_DIR}` (defined at validate-harness.sh line 57), the
  `err`/`ok` helpers (lines 69-71).
- Produces: a validator section that exits non-zero when any fenced
  ```bash/```sh/```shell code block under `.opencode/**` contains
  `--break-system-packages` on a non-comment line.

- [ ] **Step 1: Write the failing tests (Red)**

In `tests/Shell/validate-harness_test.sh`, insert the following three tests
immediately before the `# ── Summary ──` line:

````bash
# ── Test 45: --break-system-packages in a skill code block is caught ──────────

echo ""
echo "── Test 45: --break-system-packages in skill code block is caught ──"
T45=$(mktemp -d)
register_temp_dir "$T45"
git_init_test_repo "$T45"
(
	cd "$T45"
	mkdir -p .opencode/skills/demo
	setup_validator_env

	cat > .opencode/skills/demo/SKILL.md <<'EOF'
---
name: demo
description: Demo skill.
---
## Install

```bash
pip install graphifyy -q --break-system-packages
```
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "break-system-packages"; then
		pass "Caught --break-system-packages in skill code block"
	elif echo "$output" | grep -qF "break-system-packages"; then
		fail "Detected --break-system-packages but exited 0"
	else
		fail "Did not detect --break-system-packages in skill code block"
	fi
)

# ── Test 46: --break-system-packages in prose (outside code blocks) is OK ─────

echo "── Test 46: --break-system-packages in prose not flagged ──"
T46=$(mktemp -d)
register_temp_dir "$T46"
git_init_test_repo "$T46"
(
	cd "$T46"
	mkdir -p .opencode/skills/demo
	setup_validator_env

	cat > .opencode/skills/demo/SKILL.md <<'EOF'
---
name: demo
description: Demo skill.
---
## Policy

Never use the `--break-system-packages` flag — it overrides PEP 668 (issue #208).
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "demo/SKILL.md" | grep -qF "break-system-packages"; then
		fail "--break-system-packages in prose was falsely flagged"
	else
		pass "--break-system-packages in prose not flagged"
	fi
)

# ── Test 47: a pinned pip install in a code block is not flagged ──────────────

echo "── Test 47: pinned pip install in code block not flagged ──"
T47=$(mktemp -d)
register_temp_dir "$T47"
git_init_test_repo "$T47"
(
	cd "$T47"
	mkdir -p .opencode/skills/demo
	setup_validator_env

	cat > .opencode/skills/demo/SKILL.md <<'EOF'
---
name: demo
description: Demo skill.
---
## Install

```bash
pip install 'graphifyy==1.2.3'
```
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "demo/SKILL.md" | grep -qF "break-system-packages"; then
		fail "Pinned pip install was falsely flagged"
	else
		pass "Pinned pip install not flagged"
	fi
)
````

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Test 45 FAIL ("Did not detect …"); Tests 46 & 47 PASS (vacuously —
the check does not exist yet, so nothing is flagged).

- [ ] **Step 3: Implement the check (Green)**

In `.github/scripts/validate-harness.sh`, insert this block immediately after
the "unpinned npx" check (the block ending around line 1013) and before the
`# ── Checking for stale plan files ──` comment (line ~1015):

```bash
# ── Check for --break-system-packages in markdown code blocks ────────────────

echo "── Checking for --break-system-packages in markdown code blocks ──"

# --break-system-packages overrides PEP 668 (externally-managed-environment),
# force-installing into system Python. With an unpinned, easily-typosquattable
# package it is a supply-chain foothold (issue #208). Forbidden in executable
# code blocks anywhere in agent-loaded documentation (.opencode/**). Policy
# prose that *mentions* the flag to forbid it lives OUTSIDE code blocks
# (blockquotes), so only fenced ```bash/```sh/```shell blocks are scanned, and
# comment lines within them are skipped (defense-in-depth).

shopt -s nullglob
MD_SCAN_FILES=( "${HARNESS_DIR}"/skills/*/SKILL.md "${HARNESS_DIR}"/skills/*/reference/*.md "${HARNESS_DIR}"/skills/*/references/*.md "${HARNESS_DIR}"/agents/*.md "${HARNESS_DIR}"/commands/*.md "${HARNESS_DIR}"/docs/*.md )
shopt -u nullglob

BSP_HITS=0
for md_file in "${MD_SCAN_FILES[@]}"; do
	[ -f "$md_file" ] || continue
	# Emit "<real_file_lineno>:<line>" for NON-comment lines inside
	# bash/sh/shell fenced blocks (NR tracks the real file line number), then
	# filter to lines carrying the forbidden flag.
	while IFS=: read -r lineno _; do
		[ -z "$lineno" ] && continue
		err "${md_file}:${lineno}: '--break-system-packages' in an executable code block overrides PEP 668 (issue #208) — remove it; never force-install into system Python"
		BSP_HITS=$((BSP_HITS + 1))
	done < <(awk '
		/^```(bash|sh|shell)/ { in_block = 1; next }
		/^```/ && in_block { in_block = 0; next }
		in_block {
			line = $0
			sub(/^[[:space:]]+/, "", line)
			if (line !~ /^#/) print NR ":" $0
		}
	' "$md_file" | grep -F -- '--break-system-packages')
done

if [ "$BSP_HITS" -eq 0 ]; then
	ok "No --break-system-packages in markdown code blocks"
fi
```

- [ ] **Step 4: Run the tests to verify they PASS**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Tests 45, 46, 47 all PASS; full suite reports `0 failed`.

- [ ] **Step 5: Confirm the guard passes on the real repo (Task 1 already removed the offending line)**

Run: `bash .github/scripts/validate-harness.sh`
Expected: exit 0; the new "Checking for --break-system-packages in markdown
code blocks" section prints with no `ERROR` lines and the `OK:` line.

- [ ] **Step 6: Confirm shellcheck is clean (pre-commit parity)**

Run: `shellcheck --severity=warning .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'test(harness): reject --break-system-packages in skill code blocks\n\nAdd a validate-harness check that fails when any fenced bash/sh/shell code\nblock under .opencode/** contains --break-system-packages on a non-comment\nline. The flag overrides PEP 668 and, with an unpinned package, is a\nsupply-chain foothold (issue #208). The existing check_install_grants\n(issue #183) scans agent frontmatter/opencode.jsonc only and does not see\nmarkdown documentation content — this check closes that gap. Tests 45-47\ncover: flag-in-code-block caught, flag-in-prose not flagged, pinned install\nnot flagged.\n\nRefs: #208\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (after both tasks)

1. `bash tests/Shell/validate-harness_test.sh` → all green, 0 failed.
2. `bash .github/scripts/validate-harness.sh` → exit 0, no
   `--break-system-packages` errors.
3. `shellcheck --severity=warning .github/scripts/validate-harness.sh
   tests/Shell/validate-harness_test.sh` → clean.
4. Grep confirms no auto-install remains and the override is in place:
   `grep -nE 'pip install graphifyy|uv tool install --upgrade graphifyy'
   .opencode/skills/graphify/reference/upstream-pipeline.md` → no output.
5. Grep confirms SKILL.md examples are pinned:
   `grep -nE 'install graphifyy([^>=]|$)'
   .opencode/skills/graphify/SKILL.md` → no output.
6. `/check` (pre-push gate) passes.

## Notes

- **Why not route through `@debug`:** the routing matrix maps Security → the
  bug path, but the workflow permits writing the fix plan directly when the
  root cause is already known. Here the issue names the exact offending lines
  with rationale and acceptance criteria — there is no unknown root cause for
  `@debug`'s 6-phase loop to discover. This mirrors issue #183's "Why not
  @debug" note.
- **Scope is `--break-system-packages` only.** The issue names that flag
  specifically (the PEP 668 override). A broader "all `pip install` examples in
  markdown must be version-pinned" guard is a deliberate YAGNI deferral —
  matching issue #183's scoping discipline. Markdown install examples are
  unstructured prose; defining "install example" precisely enough for a
  low-noise guard is not worth it for a one-time pinning fix (AC2), which is
  verified by grep in Task 1 Step 6. The mechanized guard enforces AC3 (the
  recurring-risk surface). The `check_install_grants` regex
  `"(npm|pip) install[^"]*"` from issue #183 is trivially extensible if a
  follow-up asks for broader coverage.
- **Code-block scan, not whole-file.** Scanning only fenced ```bash/```sh/
  ```shell blocks (and skipping `#` comment lines within them) lets policy
  prose legitimately *name* `--break-system-packages` to forbid it (the
  `> Local policy override` blockquote added in Task 1, ADRs, this plan)
  without false positives. The forbidden surface is executable instructions,
  not documentation that mentions the flag.
- **No new ADR (optional).** Issue #183 amended ADR-0006 because that ADR
  *authorized* the removed grants. Here the auto-install originates from
  *vendored upstream content*, not a Prism ADR — there is no decision to amend.
  The policy is recorded in the `> Local policy override` blockquote and the
  validator's code comment (both reference issue #208). A formal ADR-0038 is
  optional if you want cross-cutting documentation; recommended to skip to
  keep scope tight (the test is the enforcement).
