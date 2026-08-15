# Self-Locating Script Resolution Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make every instruction-layer script reference in the prism harness
resolve correctly in all install contexts (checkout, global npm, project-local)
via a new `prism-tool resolve` subcommand, and gate the convention so the bug
cannot return.

**Architecture:** A `resolve` subcommand on the existing `prism-tool` launcher
walks up from the working directory preferring an ancestor prism checkout's
`packages/prism-core/<kind>` directory, else falls back to the running
package's own `<kind>` directory. All instruction-layer `bash
packages/prism-core/...` references are rewritten to
`bash "$(prism-tool resolve scripts|skills)/..."`. The `validate-harness.sh`
gate flags any reintroduced `bash packages/prism-core/(scripts|skills)/`
reference in AGENTS.md files, skills, prompts, and hooks.

**Tech Stack:** Node.js (stdlib only), bash, shell test harness
(`tests/Shell/lib/test_helpers.sh`), conventional commits with signed commits.

## Global constraints

- Spec: `docs/specs/2026-08-15-prism-core-script-resolution-spec.md`
  (read it first; it is authoritative).
- Every source file starts with an RCS header and ends with the vim modeline
  (`# vim: ft=sh sts=4 sw=4 ts=4 et :` for shell) — see the `rcs-header`
  skill. `.github/hooks/*` files already carry headers; keep them.
- Commits are signed (`-S`), conventional-commit format with footers
  `Authored-by: deepseek-v4-flash`, `Implemented-by: deepseek-v4-flash`,
  `Tested-by: deepseek-v4-flash`, `Signed-off-by: <resolved via
  packages/prism-core/scripts/resolve-identity.sh>`.
- Do not edit: `packages/prism-core/README.md`, root `README.md`,
  `CONTRIBUTING.md`, `CODING_HARNESS.md`, `adr/0060`, `adr/0064`,
  `docs/specs/`, `docs/plans/`, `writing-skills` layout tables, and the
  checkout-presence probe lists in `doctor.md` (lines 76–88) — they are
  documentation or deliberate structural probes, exempt from the convention.
- `validate-harness.sh` and `install_global_toolchain_test.sh` go RED in
  Task 1 and stay red until Task 6 — expected mid-branch state; do not push
  or run `/check` until Task 8.

---

### Task 1: Regression gates (RED against the current tree)

**Files:**
- Modify: `packages/prism-core/scripts/validate-harness.sh` (insert one block)
- Modify: `tests/Shell/validate-harness_test.sh` (markers list)
- Modify: `tests/Shell/install_global_toolchain_test.sh` (one assertion)

**Interfaces:**
- Produces: the `err`-based gate and markers that Tasks 3–6 make green.

- [x] **Step 1: Add the instruction-layer check to validate-harness.sh**

Insert this block in `packages/prism-core/scripts/validate-harness.sh`
immediately after the `── Checking package path references ──` block
(which ends with the `done < <(grep ... github-scripts ...)` line) and
before `── Checking retired config references ──`:

```bash
printf '%s\n' '── Checking instruction-layer script references ──'
while IFS=: read -r file line text; do
	[ -n "$file" ] || continue
	err "${file#$REPO_ROOT/}:$line: checkout-relative script reference: $text"
done < <(grep -RInE 'bash packages/prism-core/(scripts|skills)/' \
	"$REPO_ROOT/AGENTS.md" \
	"$REPO_ROOT/packages/prism-core/AGENTS.md" \
	"$REPO_ROOT/packages/prism-core/skills" \
	"$REPO_ROOT/packages/prism-core/prompts" \
	"$REPO_ROOT/packages/prism-php-web/skills" \
	"$REPO_ROOT/packages/prism-php-web/prompts" \
	"$REPO_ROOT/.github/hooks" \
	2>/dev/null || true)
```

- [x] **Step 2: Add the marker to validate-harness_test.sh**

In `tests/Shell/validate-harness_test.sh`, the
`── validate-harness: required checks are present ──` block iterates a
`for marker in ...` list. Add `'Checking instruction-layer script references'`
to that list (keep the existing entries).

- [x] **Step 3: Add the deployed-AGENTS.md assertion to install_global_toolchain_test.sh**

In `tests/Shell/install_global_toolchain_test.sh`, immediately after the
`always-on context resources remain deployed` pass/fail block (around line
112–117), add:

```bash
if grep -q 'bash packages/prism-core/' "$T1/pi-agent/AGENTS.md"; then
    fail "deployed AGENTS.md retains checkout-relative script references"
else
    pass "deployed AGENTS.md has no checkout-relative script references"
fi
```

- [x] **Step 4: Run the gates — expect RED**

```bash
bash tests/Shell/validate-harness_test.sh
bash tests/Shell/install_global_toolchain_test.sh
```

Expected: `validate-harness_test.sh` FAILS ("real package tree passes" —
the new check flags ~15 `bash packages/prism-core/...` references);
`install_global_toolchain_test.sh` FAILS on the new assertion (the deployed
AGENTS.md still carries the references). These are the red proofs that the
gates catch exactly this bug.

- [x] **Step 5: Commit (message type `test` — the gate is the deliverable)**

```bash
git add packages/prism-core/scripts/validate-harness.sh \
        tests/Shell/validate-harness_test.sh \
        tests/Shell/install_global_toolchain_test.sh
git commit -S -m $'test(harness): gate checkout-relative script references\n\nFlags bash packages/prism-core/... invocations in AGENTS.md, skills,\nprompts, and hooks, and asserts the deployed AGENTS.md carries none.\nRed against the current tree; green once resolver-form references land.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: `prism-tool resolve` subcommand (TDD)

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/cli.js` (add command + dispatch)
- Test: `tests/Shell/prism_tool_resolve_test.sh` (new)

**Interfaces:**
- Produces: `prism-tool resolve scripts|skills` — stdout absolute directory
  path; exit 0 on success, 2 on usage error or unresolvable install; usage
  text `usage: prism-tool resolve scripts|skills`.

- [x] **Step 1: Write the failing test**

Create `tests/Shell/prism_tool_resolve_test.sh`:

```bash
#!/usr/bin/env bash
# $KYAULabs: prism_tool_resolve_test.sh git@aura.kyaulabs 2026/08/15 -0700 Exp $


# ── prism-tool resolve contract (script resolution) ───────────────────────
# Instruction-layer script references resolve through the launcher:
#   prism-tool resolve scripts|skills
# An ancestor checkout's packages/prism-core/<kind> wins (dogfooding);
# otherwise the running package's own <kind> directory is printed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

PRISM_TOOL="$REPO_ROOT/packages/prism-core/scripts/prism-tool.js"
CORE_SCRIPTS="$REPO_ROOT/packages/prism-core/scripts"
CORE_SKILLS="$REPO_ROOT/packages/prism-core/skills"
T=$(mktemp -d)
register_temp_dir "$T"

failures=0
assert_eq() {
	local actual="$1" expected="$2" label="$3"
	if [ "$actual" = "$expected" ]; then
		pass "$label"
	else
		fail "$label (expected '$expected', got '$actual')"
		failures=$((failures + 1))
	fi
}

# 1. Own-install fallback from a consumer-like CWD (no ancestor checkout).
mkdir -p "$T/consumer"
out=$(cd "$T/consumer" && node "$PRISM_TOOL" resolve scripts 2>/dev/null) || {
	fail "resolve scripts from consumer CWD exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$CORE_SCRIPTS" "resolve scripts falls back to own install"

# 2. Checkout walk wins from a nested directory of a fake checkout.
mkdir -p "$T/fake/packages/prism-core/scripts" "$T/fake/packages/prism-core/skills"
mkdir -p "$T/fake/deep/nested"
out=$(cd "$T/fake/deep/nested" && node "$PRISM_TOOL" resolve scripts 2>/dev/null) || {
	fail "resolve scripts from fake checkout exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$T/fake/packages/prism-core/scripts" "resolve scripts prefers ancestor checkout"
out=$(cd "$T/fake/deep/nested" && node "$PRISM_TOOL" resolve skills 2>/dev/null) || {
	fail "resolve skills from fake checkout exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$T/fake/packages/prism-core/skills" "resolve skills prefers ancestor checkout"

# 3. Real checkout walk from a nested repository directory.
out=$(cd "$REPO_ROOT/backend" && node "$PRISM_TOOL" resolve scripts 2>/dev/null) || {
	fail "resolve scripts from checkout subdir exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$CORE_SCRIPTS" "resolve scripts walks the real checkout"
out=$(cd "$REPO_ROOT/backend" && node "$PRISM_TOOL" resolve skills 2>/dev/null) || {
	fail "resolve skills from checkout subdir exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$CORE_SKILLS" "resolve skills walks the real checkout"

# 4. Usage errors exit 2 with the usage line on stderr.
for bad in "" "bogus" "scripts extra"; do
	# shellcheck disable=SC2086
	if (cd "$T/consumer" && node "$PRISM_TOOL" resolve $bad >/dev/null 2>&1); then
		fail "resolve $bad should exit non-zero"
		failures=$((failures + 1))
	else
		pass "resolve $bad rejected"
	fi
done
usage_err=$(cd "$T/consumer" && node "$PRISM_TOOL" resolve bogus 2>&1 >/dev/null || true)
case "$usage_err" in
	*"usage: prism-tool resolve scripts|skills"*)
		pass "usage error names the contract" ;;
	*)
		fail "usage error missing contract (got: $usage_err)"
		failures=$((failures + 1)) ;;
esac

# 5. Resolved scripts dir actually contains the harness scripts.
if [ -x "$(cd "$T/consumer" && node "$PRISM_TOOL" resolve scripts 2>/dev/null)/install-hooks.sh" ]; then
	pass "resolved scripts dir contains install-hooks.sh"
else
	fail "resolved scripts dir missing install-hooks.sh"
	failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
	print_summary "prism-tool resolve"
	exit 1
fi
print_summary "prism-tool resolve"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 noet :
```

> Note: the file must end with the vim modeline exactly as shown; the RCS
> header line format matches sibling tests (author/date from `git log` of a
> sibling test may be substituted).

- [x] **Step 2: Run the test to verify it fails**

```bash
bash tests/Shell/prism_tool_resolve_test.sh
```

Expected: FAIL — `resolve` is an unknown command today (exit 2,
"prism-tool: unknown command"), so every case fails except possibly the
usage cases (they expect non-zero, which currently passes for the wrong
reason — the unknown-command path). The meaningful red: cases 1–3 do not
print the expected path.

- [x] **Step 3: Implement the resolver in cli.js**

In `packages/prism-core/scripts/prism-tool/cli.js`, add near the other
command functions (after `renderDoctor` / before `setup`):

```js
const RESOLVE_KINDS = new Set(['scripts', 'skills']);

function resolveKindDir(args, context) {
	const kind = args[0];
	if (args.length !== 1 || !RESOLVE_KINDS.has(kind)) {
		process.stderr.write('usage: prism-tool resolve scripts|skills\n');
		return EXIT.USAGE;
	}
	const isDir = (candidate) => {
		try {
			return fs.statSync(candidate).isDirectory();
		} catch {
			return false;
		}
	};
	let current = fs.realpathSync(context.cwd ?? process.cwd());
	while (true) {
		const candidate = path.join(current, 'packages', 'prism-core', kind);
		if (isDir(candidate)) {
			process.stdout.write(`${candidate}\n`);
			return EXIT.OK;
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const own = path.resolve(__dirname, '../..', kind);
	if (!isDir(own)) {
		process.stderr.write(`prism-tool: installed ${kind} directory is missing\n`);
		return EXIT.USAGE;
	}
	process.stdout.write(`${own}\n`);
	return EXIT.OK;
}
```

Wire the dispatch in `main(argv, context)`:

```js
	if (command === 'setup') return setup(args, context);
	if (command === 'resolve') return resolveKindDir(args, context);
```

- [x] **Step 4: Run the test to verify it passes**

```bash
bash tests/Shell/prism_tool_resolve_test.sh
```

Expected: all PASS.

- [x] **Step 5: Sanity-check the resolver from a consumer CWD (the debug loop)**

```bash
cd /tmp && mkdir -p prism-resolve-check && cd prism-resolve-check
bash "$(node /home/kyau/projects/kyaulabs/prism/packages/prism-core/scripts/prism-tool.js resolve scripts)/classify-greenfield.sh" . ; echo "exit=$?"
```

Expected: exit 2 (`indeterminate` — not a git worktree), NOT exit 127.
Clean up `/tmp/prism-resolve-check`.

- [x] **Step 6: Commit**

```bash
git add packages/prism-core/scripts/prism-tool/cli.js tests/Shell/prism_tool_resolve_test.sh
git commit -S -m $'feat(toolchain): resolve prism-core script dirs through launcher\n\nAdds prism-tool resolve scripts|skills: prefers an ancestor checkout\ncopy (dogfooding) and otherwise falls back to the installed package.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: Rewrite AGENTS.md references (core + root) and the convention

**Files:**
- Modify: `packages/prism-core/AGENTS.md` (lines 139, 151, 160, 165; Toolchain boundary section)
- Modify: `AGENTS.md` (root, lines 52, 60)

**Interfaces:**
- Consumes: `prism-tool resolve scripts` (Task 2).
- Produces: the always-on convention text and resolver-form references.

- [x] **Step 1: Core AGENTS.md — four reference rewrites**

In `packages/prism-core/AGENTS.md`:

- Line 139:
  `To activate hooks after cloning: \`bash packages/prism-core/scripts/install-hooks.sh\``
  → `To activate hooks after cloning: \`bash "$(prism-tool resolve scripts)/install-hooks.sh"\``
- Line 151:
  ``  created via `bash packages/prism-core/scripts/new-branch.sh <type> <desc>`. Allowed types``
  → ``  created via `bash "$(prism-tool resolve scripts)/new-branch.sh <type> <desc>"`. Allowed types``
- Line 160:
  ``  `bash packages/prism-core/scripts/resolve-ocr-model.sh`), and``
  → ``  `bash "$(prism-tool resolve scripts)/resolve-ocr-model.sh"`), and``
- Line 165:
  ``  `bash packages/prism-core/scripts/resolve-identity.sh` (git-config fallback``
  → ``  `bash "$(prism-tool resolve scripts)/resolve-identity.sh"` (git-config fallback``

- [x] **Step 2: Core AGENTS.md — convention paragraph**

In the `## Toolchain boundary` section of `packages/prism-core/AGENTS.md`,
append this paragraph after the existing one (which ends with "...is not
runtime verification."):

```text
Harness scripts resolve the same way: instruction-layer references use
`bash "$(prism-tool resolve scripts)/<tool>.sh"` (skill scripts:
`prism-tool resolve skills`), which prefers the checkout copy when the
working directory is inside a prism checkout and otherwise resolves to the
installed package. Never invoke `packages/prism-core/...` bash paths
literally; if `prism-tool` is unavailable in a prism checkout, fall back to
the checkout copy at `packages/prism-core/` from the repository root.
```

- [x] **Step 3: Root AGENTS.md — two reference rewrites**

In `AGENTS.md` (repo root):

- Line 52:
  ``- **Hooks:** `bash packages/prism-core/scripts/install-hooks.sh` (pre-commit,``
  → ``- **Hooks:** `bash "$(prism-tool resolve scripts)/install-hooks.sh"` (pre-commit,``
- Line 60:
  ``  `packages/prism-core/scripts/resolve-identity.sh` (optional``
  → ``  `bash "$(prism-tool resolve scripts)/resolve-identity.sh"` (optional``

- [x] **Step 4: Verify the gate's red list shrinks**

```bash
grep -RInE 'bash packages/prism-core/(scripts|skills)/' AGENTS.md packages/prism-core/AGENTS.md | wc -l
```

Expected: `0`.

- [x] **Step 5: Commit**

```bash
git add AGENTS.md packages/prism-core/AGENTS.md
git commit -S -m $'docs(harness): resolve AGENTS.md script refs via launcher\n\nEstablishes the script-resolution convention in the toolchain boundary\nsection and rewrites executable references to the resolver form.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: Rewrite skill references (core skills)

**Files:**
- Modify: `packages/prism-core/skills/brainstorming/SKILL.md` (lines 49, 74, 205)
- Modify: `packages/prism-core/skills/tdd/SKILL.md` (line 139)
- Modify: `packages/prism-core/skills/conventional-commits/SKILL.md` (lines 29, 34, 87, 88)
- Modify: `packages/prism-core/skills/from-issue/SKILL.md` (line 176)
- Modify: `packages/prism-core/skills/wayfinder/SKILL.md` (lines 26, 39)
- Modify: `packages/prism-core/skills/websearch/SKILL.md` (line 56)
- Modify: `packages/prism-core/skills/searxng/SKILL.md` (line 53)

**Interfaces:**
- Consumes: `prism-tool resolve scripts|skills` (Task 2).

- [x] **Step 1: brainstorming/SKILL.md**

- Line 49:
  `   - Run \`bash packages/prism-core/scripts/classify-greenfield.sh\` from the project root.`
  → `   - Run \`bash "$(prism-tool resolve scripts)/classify-greenfield.sh"\` from the project root.`
- Line 74:
  ``9. **Create feature branch** — `bash packages/prism-core/scripts/new-branch.sh <type> <desc>``` 
  → ``9. **Create feature branch** — `bash "$(prism-tool resolve scripts)/new-branch.sh <type> <desc>"```
- Line 205:
  `bash packages/prism-core/scripts/new-branch.sh <type> <description>`
  → `bash "$(prism-tool resolve scripts)/new-branch.sh" <type> <description>`

- [x] **Step 2: tdd/SKILL.md**

- Line 139:
  ``  `bash packages/prism-core/scripts/resolve-identity.sh` ``
  → ``  `bash "$(prism-tool resolve scripts)/resolve-identity.sh"` ``

- [x] **Step 3: conventional-commits/SKILL.md**

- Line 29:
  `  it with \`bash packages/prism-core/scripts/resolve-ocr-model.sh\` (reads`
  → `  it with \`bash "$(prism-tool resolve scripts)/resolve-ocr-model.sh"\` (reads`
- Line 34:
  `  \`bash packages/prism-core/scripts/resolve-identity.sh\`; it uses an optional`
  → `  \`bash "$(prism-tool resolve scripts)/resolve-identity.sh"\`; it uses an optional`
- Line 87:
  `` `packages/prism-core/scripts/new-branch.sh` for the canonical creator and ``
  → `` `bash "$(prism-tool resolve scripts)/new-branch.sh"` for the canonical creator and ``
- Line 88:
  `` `packages/prism-core/scripts/validate-branch-name.sh` for the regex. ``
  → `` `bash "$(prism-tool resolve scripts)/validate-branch-name.sh"` for the regex. ``

- [x] **Step 4: from-issue/SKILL.md**

- Line 176:
  `   \`bash packages/prism-core/scripts/new-branch.sh <type> <description>\``
  → `   \`bash "$(prism-tool resolve scripts)/new-branch.sh" <type> <description>\``

- [x] **Step 5: wayfinder/SKILL.md**

- Line 26:
  `` `bash packages/prism-core/scripts/classify-greenfield.sh`, and `established` or ``
  → `` `bash "$(prism-tool resolve scripts)/classify-greenfield.sh"`, and `established` or ``
- Line 39:
  `  \`bash packages/prism-core/scripts/classify-greenfield.sh\`. The repository must`
  → `  \`bash "$(prism-tool resolve scripts)/classify-greenfield.sh"\`. The repository must`

- [x] **Step 6: websearch/SKILL.md and searxng/SKILL.md**

- websearch line 56:
  `bash packages/prism-core/skills/websearch/search.sh "pi coding agent prompt templates"`
  → `bash "$(prism-tool resolve skills)/websearch/search.sh" "pi coding agent prompt templates"`
- searxng line 53:
  `bash packages/prism-core/skills/searxng/search.sh "pi coding agent skills"`
  → `bash "$(prism-tool resolve skills)/searxng/search.sh" "pi coding agent skills"`

- [x] **Step 7: Verify**

```bash
grep -RInE 'bash packages/prism-core/(scripts|skills)/' packages/prism-core/skills/ | wc -l
```

Expected: `0`.

- [x] **Step 8: Commit**

```bash
git add packages/prism-core/skills/
git commit -S -m $'docs(harness): resolve skill script refs via launcher\n\nRewrites all executable references in core skills to the\nprism-tool resolve form.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: Rewrite prompt references (core prompts)

**Files:**
- Modify: `packages/prism-core/prompts/setup-rulesets.md` (lines 6, 19, 40, 51)
- Modify: `packages/prism-core/prompts/setup.md` (lines 175, 212 — line 50 stays)
- Modify: `packages/prism-core/prompts/check.md` (lines 65–66)
- Modify: `packages/prism-core/prompts/release.md` (lines 140, 203, 210, 215)
- Modify: `packages/prism-core/prompts/pr.md` (lines 47, 177, 179)
- Modify: `packages/prism-core/prompts/doctor.md` (lines 94–99, 108 — lines 76–88 stay)

**Interfaces:**
- Consumes: `prism-tool resolve scripts` (Task 2).

- [x] **Step 1: setup-rulesets.md**

- Line 6:
  ``merge-method settings from `packages/prism-core/scripts/setup-rulesets.sh`.``
  → ``merge-method settings from `bash "$(prism-tool resolve scripts)/setup-rulesets.sh"`.``
- Line 19: `   bash packages/prism-core/scripts/setup-rulesets.sh --dry-run`
  → `   bash "$(prism-tool resolve scripts)/setup-rulesets.sh" --dry-run`
- Line 40: `   bash packages/prism-core/scripts/setup-rulesets.sh --apply`
  → `   bash "$(prism-tool resolve scripts)/setup-rulesets.sh" --apply`
- Line 51: `   bash packages/prism-core/scripts/setup-rulesets.sh --check`
  → `   bash "$(prism-tool resolve scripts)/setup-rulesets.sh" --check`

- [x] **Step 2: setup.md** (line 50 is a checkout-presence probe — leave it)

- Line 175: `bash packages/prism-core/scripts/install-hooks.sh`
  → `bash "$(prism-tool resolve scripts)/install-hooks.sh"`
- Line 212: `bash packages/prism-core/scripts/validate-harness.sh`
  → `bash "$(prism-tool resolve scripts)/validate-harness.sh"`

- [x] **Step 3: check.md — reword the probe without changing semantics**

Replace lines 65–66:

```bash
if [ -x packages/prism-core/scripts/validate-harness.sh ]; then
    bash packages/prism-core/scripts/validate-harness.sh
```

with:

```bash
CORE_VALIDATOR="packages/prism-core/scripts/validate-harness.sh"
if [ -x "$CORE_VALIDATOR" ]; then
    bash "$CORE_VALIDATOR"
```

- [x] **Step 4: release.md**

- Line 140: `bash packages/prism-core/scripts/new-branch.sh release "$VERSION"`
  → `bash "$(prism-tool resolve scripts)/new-branch.sh" release "$VERSION"`
- Line 203: `OCR_MODEL=$(bash packages/prism-core/scripts/resolve-ocr-model.sh) \`
  → `OCR_MODEL=$(bash "$(prism-tool resolve scripts)/resolve-ocr-model.sh") \`
- Line 210: `        "$(bash packages/prism-core/scripts/resolve-identity.sh)")`
  → `        "$(bash "$(prism-tool resolve scripts)/resolve-identity.sh")")`
- Line 215: same replacement as line 210.

- [x] **Step 5: pr.md**

- Line 47: `bash packages/prism-core/scripts/validate-branch-name.sh "$BRANCH" \`
  → `bash "$(prism-tool resolve scripts)/validate-branch-name.sh" "$BRANCH" \`
- Line 177: `SIGNED_OFF_BY=$(bash packages/prism-core/scripts/resolve-identity.sh)`
  → `SIGNED_OFF_BY=$(bash "$(prism-tool resolve scripts)/resolve-identity.sh")`
- Line 179: `OCR_MODEL=$(bash packages/prism-core/scripts/resolve-ocr-model.sh) \`
  → `OCR_MODEL=$(bash "$(prism-tool resolve scripts)/resolve-ocr-model.sh") \`

- [x] **Step 6: doctor.md** (lines 76–88 are the checkout-presence probe list — leave them)

- Lines 94–95: reword to the variable form (same as check.md Step 3):

```bash
if [ -x packages/prism-core/scripts/validate-harness.sh ]; then
    bash packages/prism-core/scripts/validate-harness.sh
```

→

```bash
CORE_VALIDATOR="packages/prism-core/scripts/validate-harness.sh"
if [ -x "$CORE_VALIDATOR" ]; then
    bash "$CORE_VALIDATOR"
```

- Line 108:
  `echo "NOT_INSTALLED — run 'bash packages/prism-core/scripts/install-hooks.sh'"`
  → `echo "NOT_INSTALLED — run 'bash "$(prism-tool resolve scripts)/install-hooks.sh"'"`

- [x] **Step 7: Verify**

```bash
grep -RInE 'bash packages/prism-core/(scripts|skills)/' packages/prism-core/prompts/ | wc -l
```

Expected: `0`.

- [x] **Step 8: Commit**

```bash
git add packages/prism-core/prompts/
git commit -S -m $'docs(harness): resolve prompt script refs via launcher\n\nRewrites all executable references in core prompts to the\nprism-tool resolve form; checkout-presence probes stay probes.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: Rewrite hook and adapter references

**Files:**
- Modify: `.github/hooks/prepare-commit-msg` (line 7, messages at 29 and 75)
- Modify: `.github/hooks/pre-push` (line 144, 156, 172; add `REPO_ROOT`)
- Modify: `.github/hooks/commit-msg` (line 38)
- Modify: `.github/hooks/pre-commit` (line 25)
- Modify: `packages/prism-php-web/skills/rcs-header/SKILL.md` (line 51)

**Interfaces:**
- Consumes: `prism-tool resolve scripts` (Task 2).

- [x] **Step 1: prepare-commit-msg — validator resolution**

Replace line 7:

```bash
VALIDATOR="$REPO_ROOT/packages/prism-core/scripts/validate-branch-name.sh"
```

with:

```bash
VALIDATOR="$REPO_ROOT/packages/prism-core/scripts/validate-branch-name.sh"
if [ ! -x "$VALIDATOR" ] && command -v prism-tool >/dev/null 2>&1; then
	RESOLVED_SCRIPTS="$(prism-tool resolve scripts 2>/dev/null || true)"
	if [ -n "$RESOLVED_SCRIPTS" ] && [ -x "$RESOLVED_SCRIPTS/validate-branch-name.sh" ]; then
		VALIDATOR="$RESOLVED_SCRIPTS/validate-branch-name.sh"
	fi
fi
```

The existing `[ -x "$VALIDATOR" ]` guards (lines 14 and 72) now also serve
the resolver path — no other logic change.

- [x] **Step 2: prepare-commit-msg — message forms**

- Line 29 (and line 75):
  `  Run: bash packages/prism-core/scripts/new-branch.sh <type> <description>`
  → `  Run: bash "$(prism-tool resolve scripts)/new-branch.sh" <type> <description>`

- [x] **Step 3: pre-push — anchor on REPO_ROOT and fix the invocation**

- After the `set -euo pipefail` line (top of the hook), add:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
```

- Line 144:
  `if [ "$BRANCH_COUNT" -ge 1 ] && [ -x packages/prism-core/scripts/validate-harness.sh ]; then`
  → `if [ "$BRANCH_COUNT" -ge 1 ] && [ -x "$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh" ]; then`
- Line 156:
  `  Run 'bash packages/prism-core/scripts/install-global.sh' (or /setup) to deploy it.`
  → `  Run 'bash "$(prism-tool resolve scripts)/install-global.sh"' (or /setup) to deploy it.`
- Line 172:
  `	if ! bash packages/prism-core/scripts/validate-harness.sh >"$HLOG" 2>&1; then`
  → `	if ! bash "$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh" >"$HLOG" 2>&1; then`

- [x] **Step 4: commit-msg and pre-commit — message forms**

- `commit-msg` line 38 and `pre-commit` line 25:
  `  Run 'bash packages/prism-core/scripts/install-global.sh' (or /setup) to deploy it,`
  → `  Run 'bash "$(prism-tool resolve scripts)/install-global.sh"' (or /setup) to deploy it,`

- [x] **Step 5: rcs-header/SKILL.md (adapter)**

- Line 51:
  `` `bash packages/prism-core/scripts/install-hooks.sh` once after cloning to activate it. ``
  → `` `bash "$(prism-tool resolve scripts)/install-hooks.sh"` once after cloning to activate it. ``

- [x] **Step 6: Verify the gate is now green**

```bash
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: PASS — `── Checking instruction-layer script references ──` reports
no violations. Also run:

```bash
bash -n .github/hooks/prepare-commit-msg .github/hooks/pre-push .github/hooks/commit-msg .github/hooks/pre-commit
```

Expected: no syntax errors. Also verify the message strings got no spurious
`"` in shell output: `bash -x .github/hooks/pre-push 2>&1 | head -1` is not
needed — the here-docs are quoted (`<<'EOF'`), so the resolver form is inert
text; confirm with `grep -n 'resolve scripts' .github/hooks/*`.

- [x] **Step 7: Commit**

```bash
git add .github/hooks/prepare-commit-msg .github/hooks/pre-push .github/hooks/commit-msg .github/hooks/pre-commit packages/prism-php-web/skills/rcs-header/SKILL.md
git commit -S -m $'fix(hooks): resolve harness scripts through launcher\n\nprepare-commit-msg falls back to prism-tool resolve scripts outside\nthe checkout; pre-push anchors its validator on REPO_ROOT; guidance\nmessages use the resolver form. Adapter rcs-header reference rewritten.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 7: ADR-0065 and CONTEXT.md

**Files:**
- Create: `adr/0065-self-locating-script-resolution.md`
- Modify: `CONTEXT.md` (glossary + ADR index)

**Interfaces:**
- Consumes: nothing (documentation of Tasks 1–6).

- [x] **Step 1: Write ADR-0065**

Create `adr/0065-self-locating-script-resolution.md` (Nygard format, Status:
Accepted, Date: 2026-08-15, Depends on ADR-0058, ADR-0060, ADR-0061/0062):

```markdown
# 0065. Self-Locating Script Resolution

Date: 2026-08-15

## Status

Accepted

Depends on ADR-0058, ADR-0060, ADR-0061 (superseded by ADR-0062).

## Context

ADR-0060 made the core globally installed (`pi install
npm:@kyaulabs/prism-core`), relocating the package from the source checkout
to `~/.pi/agent/npm/node_modules/@kyaulabs/prism-core/` (global) or
`.pi/npm/...` (project-local). The toolchain-contract ADRs (0061/0062/0063)
solved *tool* resolution through the `prism-tool` launcher, but the
instruction layer — AGENTS.md, skills, prompts, and git hooks — still
referenced harness scripts with checkout-relative paths
(`bash packages/prism-core/scripts/...`). In any consumer project those
invocations failed with "No such file or directory" (exit 127).

## Decision

Instruction-layer executable references resolve through the launcher:

1. `prism-tool resolve scripts|skills` prints the prism-core package's
   `scripts/` or `skills/` directory. It walks up from the working directory
   and prefers the first ancestor containing `packages/prism-core/<kind>`
   (the source checkout wins for dogfooding); otherwise it falls back to the
   running package's own `<kind>` directory (the launcher's canonicalized
   install path).
2. AGENTS.md, skills, and prompts invoke harness scripts only as
   `bash "$(prism-tool resolve scripts)/<tool>.sh"` (skill scripts via
   `resolve skills`). If `prism-tool` is unavailable in a prism checkout,
   the checkout copy at `packages/prism-core/` is the fallback.
3. Git hooks prefer the checkout copy (`$REPO_ROOT/packages/prism-core/...`)
   and fall back to the resolver; the pre-push validate-harness gate remains
   checkout-only (it validates the prism package tree).
4. `validate-harness.sh` flags any `bash packages/prism-core/(scripts|skills)/`
   reference in AGENTS.md files, skills, prompts, or hooks.
5. Historical and documentation references (ADRs, specs, plans, READMEs,
   writing-skills layout tables) are exempt — they describe the checkout
   layout or record decisions.

This corrects the stale install-path example in ADR-0060 (".../npm/
@kyaulabs/..." is missing the `node_modules/` segment); the record itself
is immutable and stands.

## Consequences

- **Positive:** every instruction-layer reference resolves in every install
  context; dogfooding keeps using the checkout copy via the CWD walk; the
  gate prevents regression; one mechanism serves scripts and tools.
- **Negative:** references require the `prism-tool` launcher (already the
  declared toolchain boundary; install-global.sh deploys it). Consumers
  need a package release that contains the resolver.
- **Follow-up:** publish a fresh `@kyaulabs/prism-core` npm release so
  installed consumers receive the launcher and resolver.
```

- [x] **Step 2: CONTEXT.md glossary + ADR index**

Add to the glossary table (alphabetical, after "sensitive path" or matching
the existing ordering — insert before "safety extension" to keep the
alphabetical run):

```markdown
| script resolution | The convention by which instruction-layer executable references resolve to the prism-core package's `scripts/` or `skills/` directory via `prism-tool resolve`, preferring an ancestor checkout copy when the working directory is inside a prism checkout (ADR-0065). |
```

Add to the ADR index (the line for ADR-0064, around line 226):

```markdown
- `adr/0065-self-locating-script-resolution.md` — instruction-layer script references resolve via `prism-tool resolve scripts|skills`, gated by validate-harness (extends ADR-0060's install model).
```

- [x] **Step 3: Commit**

```bash
git add adr/0065-self-locating-script-resolution.md CONTEXT.md
git commit -S -m $'docs(adr): adopt self-locating script resolution\n\nADR-0065: instruction-layer references resolve through prism-tool\nresolve scripts|skills with checkout precedence; validate-harness gates\nthe convention. CONTEXT.md gains the glossary term and index entry.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [x] **Step 1: Run the full shell test suite**

```bash
for t in tests/Shell/*_test.sh; do echo "── $t"; bash "$t" || true; done
```

Expected: every test file passes, including the Task 1 gates (now green)
and `prism_tool_resolve_test.sh`.

- [x] **Step 2: Run the adapter's focused checks**

```bash
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: `Harness validation PASSED` with the new check reporting no
violations.

- [x] **Step 3: Debug-loop regression (original symptom)**

```bash
mkdir -p /tmp/prism-repro && cd /tmp/prism-repro
bash "$(prism-tool resolve scripts)/classify-greenfield.sh" . ; echo "exit=$?"
```

Expected: exit 2 (`indeterminate`), NOT exit 127. Clean up the dir.

- [x] **Step 4: Verify no stragglers anywhere in the instruction layer**

```bash
grep -RInE 'bash packages/prism-core/(scripts|skills)/' AGENTS.md packages/prism-core/AGENTS.md packages/prism-core/skills packages/prism-core/prompts packages/prism-php-web/skills packages/prism-php-web/prompts .github/hooks
```

Expected: empty output.

- [x] **Step 5: /check**

Run `/check` (delegates to `/check-php`: php-cs-fixer, stylelint, eslint,
Pest coverage, plus the harness validators). Fix anything it flags, then
re-run until green.

- [x] **Step 6: Re-run the verification-before-completion checklist**

- All tasks' tests green (full suite re-run).
- No `[DEBUG-]` instrumentation (none was added).
- No throwaway scaffolding left (`/tmp/prism-repro`, `/tmp/prism-resolve-check`
  removed).
- Gate greps empty; resolver sanity-check exit codes correct.

## Self-review

- **Spec coverage:** resolver (Task 2) ✓; convention in AGENTS.md (Task 3) ✓;
  hooks (Task 6) ✓; gates — validate-harness check + markers + deployed
  AGENTS.md assertion (Task 1) ✓; ADR-0065 + glossary (Task 7) ✓; acceptance
  criteria exercised in Task 8 ✓; publish follow-up noted in ADR-0065 ✓.
  Pre-push stays checkout-only per amended spec §4.3 ✓ (Task 6 keeps the
  guard, only anchors it on `$REPO_ROOT`).
- **Placeholder scan:** no TBD/TODO; every edit is literal old→new text.
- **Type/name consistency:** `resolveKindDir`, `RESOLVE_KINDS`, usage string
  `usage: prism-tool resolve scripts|skills` are used identically in Task 2's
  test and implementation; the harness invoke form
  `bash "$(prism-tool resolve scripts)/<tool>.sh"` is used uniformly across
  Tasks 3–6.
