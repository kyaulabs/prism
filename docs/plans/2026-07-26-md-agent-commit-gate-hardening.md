# `.md`-Agent git-commit Gate Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Close the prose-only commit-gate gap on `@tdd` and
`@resolve-merge-conflicts` (issue #210) by moving their `"git commit*"` verdict
from `"allow"` to `"ask"` (permission-layer gate, matching `build`/`design`/
`general`), recording the decision in ADR-0006, and extending the harness
validator with the missing `.md`-agent git-commit gate check so the drift class
cannot recur.

**Architecture:** Per `permissions.mdx:205` ("agent permissions are merged with
the global config, and agent rules take precedence"), lifting a rule to the
top-level `permission.bash` would be **overridden** by the agents' own
`.md`-frontmatter `allow` rule. Therefore the fix is necessarily in the `.md`
frontmatter itself (Option A, approved): `"git commit*": "allow"` → `"ask"` in
`tdd.md` and `resolve-merge-conflicts.md`. `"git add*"` stays `"allow"` (staging
is reversible, does not mutate history, and gating it would throttle the tight
Red-Green / merge-resolution loops; the #210 acceptance criterion is
commit-focused). The prose "present the commit message before committing" step
is retained as belt-and-suspenders. The validator gains a `.md`-agent
git-commit gate check that mirrors the inline check added under #202 — this also
makes the inline check's comment (which skips inline agents that have a `.md`
file, claiming the `.md` path covers them) truthful, since that path does not
yet exist. The `general` acceptance criterion of #210 is already satisfied by
the #202 amendment (`general` carries `"git commit*": "ask"`).

**Tech Stack:** YAML frontmatter in `.opencode/agents/*.md`, Bash
(`validate-harness.sh` + Shell tests), Markdown (ADR-0006 amendment +
`AGENTS.md`).

## Global constraints

- **opencode bash permission semantics:** keys are glob *suffixes* matched
  against the command string; `"git commit*"` matches `git commit`, `git commit
  -S -m ...`, etc. Quoting is required on every key (`"git commit*": "ask"`),
  matching the surrounding frontmatter. **Agent rules take precedence over the
  top-level config** (`permissions.mdx:205`) — so the `.md` change is mandatory;
  a top-level lift alone would be overridden. (No top-level change is made in
  this plan — drift is enforced by the validator, matching how #202 solved the
  inline equivalent.)
- **Leave `"git add*": "allow"` unchanged** in both agents. Do NOT add
  `"git stage*"` (neither agent currently carries it; the parity check only
  fires where both `git add*` and `git stage*` coexist). Do NOT touch `git
  push*`/`git tag*` (`deny` stays).
- **Keep the prose message-presentation step** (`tdd.md` Step 7;
  `resolve-merge-conflicts.md` Step 5). It is now redundant with the `ask`
  dialog but harmless and intentionally retained.
- **Markdown/config files do NOT carry RCS headers** (`.md`, `.jsonc`,
  `AGENTS.md`, ADRs) — see `conventions.md`. The only file in this plan that
  already has an RCS header is the Shell test (`tests/Shell/validate-harness_test.sh`);
  it is *modified*, not created, so no new header is added (the pre-commit
  RCS auto-add normalizer handles existing files idempotently).
- **Shell indentation:** `.github/scripts/validate-harness.sh` and
  `tests/Shell/*.sh` use **tabs** (tab-stop 4). Match the surrounding file —
  do not introduce spaces.
- **Signed commits** (`git commit -S`), Conventional Commits format. This issue
  is **Type=Security** → commit type `fix` (per `docs/agents/labels.md` mapping
  Security → `fix`); the ADR/docs task uses `docs(adr):`. Footers required:
  `Authored-by: glm-5.2` (`agent.plan.model`), `Tested-by: deepseek-v4-pro`
  (`agent.code-review.model`), `Signed-off-by:` (resolved via
  `bash .github/scripts/resolve-identity.sh`). Non-closing reference:
  `Refs: #210` (the issue closes on merge, matching the #202 plan convention).
- **Commit quoting:** use the canonical `$'...\n...'` ANSI-C quoting form —
  the `commit-msg` hook rejects literal `\n` (ADR-0025). Never use multiple
  `-m` flags.
- **TDD mandatory:** Red → Green → Refactor. The pre-commit hook does **not**
  run `validate-harness.sh` (only `/check` / CI do), so an intermediate commit
  that leaves the real-repo validator red is not blocked — the branch only
  needs to be green at `/check` time.
- **No new PHP regression test.** Unlike #202 (which added
  `GeneralAgentPermissionTest.php` because the inline validator check *skips*
  inline agents that have a `.md` file), the `.md`-agent regression guard **is**
  the validator check added in Task 2 — if `tdd.md`/`resolve-merge-conflicts.md`
  ever revert to `allow`, the validator fails. A separate Pest test parsing
  `.md` frontmatter would duplicate that guard (YAGNI).

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `adr/0006-readonly-agent-permission-contract.md` | Modify | Append `2026-07-26 (issue #210)` amendment recording the `.md` commit-gate decision + partial supersession of the #198 "intentionally allowlisted" framing |
| `AGENTS.md` | Modify | Update the "Commit and push permissions" bullet for `@tdd`/`@resolve-merge-conflicts` (now `git add` allow + `git commit` ask) |
| `.github/scripts/validate-harness.sh` | Modify | Add the `.md`-agent git-commit gate check (mirrors the inline #202 check) + counters/summary |
| `tests/Shell/validate-harness_test.sh` | Modify | Add 3 fixture tests for the new `.md` check (Red → Green) |
| `.opencode/agents/tdd.md` | Modify | `"git commit*": "allow"` → `"ask"` (frontmatter only; prose + `git add*` unchanged) |
| `.opencode/agents/resolve-merge-conflicts.md` | Modify | `"git commit*": "allow"` → `"ask"` (frontmatter only; prose + `git add*` unchanged) |

**Not in scope:**
- No top-level `permission.bash` change (the validator enforces drift; a global
  default adds little and an inherited `git add*: ask` could prompt on
  legitimately-staging inheriting agents).
- No `"git add*"` tightening (reversible; would throttle the loops).
- No CONTEXT.md change — this is harness-internal (permission model), not
  application domain. CONTEXT.md covers domain glossary/entities only.
- `general` (#202) is already gated; no work.
- The inline `@debug`/`@consult`/`@docs-writer` agents already carry a bash
  catch-all deny (`"*": "deny"`) or `bash: deny` → they cannot commit and are
  skipped by the new check. No work.

---

### Task 1: Amend ADR-0006 + update AGENTS.md (record the decision)

**Files:**
- Modify: `adr/0006-readonly-agent-permission-contract.md` (append to the
  `## Amendments` section, after the existing `2026-07-22 (issue #202)` entry —
  currently the last bullet in that section)
- Modify: `AGENTS.md` (the "Commit and push permissions" bullet for
  `@tdd`/`@resolve-merge-conflicts`)

**Interfaces:** None (decision record + doc).

- [ ] **Step 1: Append the ADR-0006 amendment**

Append to the end of the `## Amendments` section in
`adr/0006-readonly-agent-permission-contract.md` (after the
`2026-07-22 (issue #202)` entry):

```markdown
- **2026-07-26 (issue #210):** The #198 amendment framed `@tdd` and
  `@resolve-merge-conflicts` as "intentionally unscoped (allowlisted)" write
  agents whose commits were governed by disciplined prose cycles ("present the
  message before committing"), not by the permission layer. Issue #210 flagged
  this as fragile: a model that skips the prose step commits silently, with no
  `ask` dialog. This amendment partially supersedes that framing. Both agents'
  `"git commit*"` verdict moves from `"allow"` to `"ask"` — every commit now
  hits the permission-layer approval dialog (which shows the full command and
  message), matching `build`/`design`/`general`. The prose message-presentation
  step is retained as belt-and-suspenders (now redundant with the dialog but
  harmless). `"git add*"` stays `"allow"`: staging is reversible (`git reset`),
  does not mutate history, and gating it would throttle the tight Red-Green and
  conflict-resolution loops that make these agents productive; the #210
  acceptance criterion is commit-focused. The `edit` scoping of both agents is
  unchanged (still intentionally unscoped — they edit arbitrary source). The
  validate-harness check was extended (Decision point 4) with a `.md`-agent
  git-commit gate check mirroring the inline check added under #202: any `.md`
  agent whose bash is not fully denied must explicitly gate `"git commit*"` with
  `ask` or `deny`. This also makes the inline #202 check's comment truthful —
  it skips inline agents that have a `.md` file, claiming the `.md` path covers
  them, and that path now exists. (The `general` acceptance criterion of #210
  was already satisfied by the #202 amendment: `general` carries
  `"git commit*": "ask"`.)
```

- [ ] **Step 2: Update the AGENTS.md "Commit and push permissions" bullet**

In `AGENTS.md`, replace this exact line:

```markdown
- **`@tdd`** and **`@resolve-merge-conflicts`** are permitted to `git add` and `git commit` — commits happen inside disciplined cycles where the commit message is presented to the user before execution.
```

with:

```markdown
- **`@tdd`** and **`@resolve-merge-conflicts`** are permitted to `git add`; `git commit` prompts the user before running (`ask`) — the full command and commit message appear in the approval dialog. The agents' prose "present the message before committing" step is retained as belt-and-suspenders. (`git add` stays `allow`: staging is reversible and gating it would throttle the tight Red-Green / merge loops. See ADR-0006 #210.)
```

- [ ] **Step 3: Verify the amendment + bullet render correctly**

Read both edits. Confirm: the ADR block is a dated bullet under
`## Amendments`, references issue #210, follows the prose style of the
#183/#184/#198/#202 amendments, and explicitly notes the partial supersession
of the #198 framing. Confirm the AGENTS.md bullet now says `git add` (allow) +
`git commit` (`ask`) and cites ADR-0006 #210. No automated test — decision
record + doc.

- [ ] **Step 4: Commit**

```bash
git add adr/0006-readonly-agent-permission-contract.md AGENTS.md
git commit -S -m $'docs(adr): record @tdd/@resolve-merge-conflicts commit gate (#210)\n\nAmends ADR-0006 with a 2026-07-26 (#210) entry: @tdd and\n@resolve-merge-conflicts move git commit* from allow (prose-gated) to ask\n(permission-layer gated), matching build/design/general. git add* stays\nallow (staging reversible; gating throttles the loops). The #198\n"intentionally allowlisted" framing is partially superseded for commit\ngating only; edit scoping unchanged. Updates AGENTS.md Commit and push\npermissions bullet to match.\n\nRefs: #210\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: Add the `.md`-agent git-commit gate validator check (Red → Green)

**Files:**
- Test: `tests/Shell/validate-harness_test.sh` (append 3 fixture tests before
  the final `print_summary`)
- Modify: `.github/scripts/validate-harness.sh` (insert the new check after the
  inline git-commit gating block, before the "git add/git stage verdict parity"
  block)

**Interfaces:**
- Consumes: `AGENT_MD_FILES` array (populated at `validate-harness.sh:704-707`),
  the `err`/`ok`/`warn` helpers, and the awk frontmatter-extraction idiom used
  throughout the file.
- Produces: validator coverage so any future `.md` agent whose bash is not fully
  denied but that lacks a `git commit*` ask/deny gate fails validation. Task 3's
  agent fixes must pass it.

**The check rule (encode exactly):** for each `.md` agent file: if bash is
fully denied (`bash: deny`, or any `"*": "deny"` catch-all — consistent with
the read-only contract check at `validate-harness.sh:755-767`), skip. Otherwise,
the `"git commit*"` verdict must be `ask` or `deny`. Absent or `allow` → error.

- [ ] **Step 1: Write the 3 failing fixture tests (Red)**

In `tests/Shell/validate-harness_test.sh`, insert the following three tests
**immediately before** the final summary block:

```text
# ── Summary ─────────────────────────────────────────────────────────────────────────────

print_summary "validate-harness"
```

(search for `print_summary "validate-harness"` and insert above it). Use these
exact tests (note: `.md` agents are written as agent files, not `opencode.jsonc`):

```bash
# ── Test: .md agent with ungated git commit flagged (issue #210) ──────────────

echo ""
echo "── Test: .md agent (git commit: allow) flagged ──"
T_MGC1=$(mktemp -d)
register_temp_dir "$T_MGC1"
git_init_test_repo "$T_MGC1"
(
	cd "$T_MGC1"
	mkdir -p .opencode/agents
	setup_validator_env

	# tdd/resolve-merge-conflicts drift class: bash open + git commit: allow
	# (prose-gated, not permission-gated).
	cat > .opencode/agents/workhorse.md <<'EOF'
---
description: A write-capable agent that commits in a tight loop.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "allow"
    "git push*": "deny"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -qF "git commit without a gate"; then
		pass "Caught .md agent with ungated git commit (issue #210)"
	else
		fail "Did not detect .md agent with ungated git commit"
	fi
)

# ── Test: .md agent with git commit: ask NOT flagged ──────────────────────────

echo "── Test: .md agent (git commit: ask) not flagged ──"
T_MGC2=$(mktemp -d)
register_temp_dir "$T_MGC2"
git_init_test_repo "$T_MGC2"
(
	cd "$T_MGC2"
	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/gated-worker.md <<'EOF'
---
description: A write-capable agent that gates commits at ask.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "ask"
    "git push*": "deny"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "gated-worker" | grep -qF "git commit without a gate"; then
		fail "Gated .md agent (git commit: ask) was falsely flagged"
	else
		pass "Gated .md agent (git commit: ask) not flagged"
	fi
)

# ── Test: .md agent with bash fully denied NOT flagged (skipped) ──────────────

echo "── Test: .md agent (bash catch-all deny) not flagged (skipped) ──"
T_MGC3=$(mktemp -d)
register_temp_dir "$T_MGC3"
git_init_test_repo "$T_MGC3"
(
	cd "$T_MGC3"
	mkdir -p .opencode/agents
	setup_validator_env

	# read-only posture: bash catch-all deny — no commit possible, skip.
	cat > .opencode/agents/auditor.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "auditor" | grep -qF "git commit without a gate"; then
		fail "Fully-denied .md agent was falsely flagged"
	else
		pass "Fully-denied .md agent (catch-all deny) not flagged"
	fi
)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: the first test **FAILS** ("Did not detect .md agent with ungated git
commit") — the `.md` check does not exist yet, so `allow` is not flagged. The
second and third PASS trivially (nothing is flagged either way). The Red signal
is the first test.

- [ ] **Step 3: Add the `.md`-agent git-commit gate check (Green)**

In `.github/scripts/validate-harness.sh`, insert this block **immediately
after** the inline git-commit gating block (after the `if [ "$INLINE_GC_CHECKED"
-eq 0 ] ... warn ... else ... ok ... fi` that closes the "Checking inline agent
git-commit gating" section, currently around line 905) and **before** the
`# ── Check git add/git stage verdict parity ──` comment (currently around line
907). Use **tab indentation** to match the surrounding file:

```bash
# ── Check .md agent git-commit gating (.opencode/agents/*.md) ─────────────────

echo "── Checking .md agent git-commit gating ──"
MD_GC_CHECKED=0
MD_GC_VIOLATIONS=0

# Any .md agent whose bash is NOT fully denied must explicitly gate "git commit*"
# with ask or deny. A write-capable .md agent shipping "git commit*": "allow"
# (or omitting the rule, inheriting the permissive default) can commit with no
# permission-layer gate — the prose-only drift class of issue #210
# (@tdd/@resolve-merge-conflicts previously relied on a "present the message"
# prose step). Read-only agents (bash: deny, or a "*": deny catch-all) are
# skipped — they cannot commit. Mirrors the inline git-commit gate check above
# (issue #202) for the .md-defined agent path.

for agent_file in "${AGENT_MD_FILES[@]}"; do
	agent_name=$(basename "$agent_file" .md)

	# Extract frontmatter only (lines between first and second ---).
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")

	# Skip agents whose bash is fully denied (read-only — no commit possible).
	# Matches both "bash: deny" and a "*": deny catch-all, consistent with the
	# read-only contract check above (validate-harness.sh:755-767).
	bash_denied=0
	if printf '%s\n' "$fm" | grep -qE '^[[:space:]]*bash:[[:space:]]*"?deny"?[[:space:]]*$'; then
		bash_denied=1
	fi
	if printf '%s\n' "$fm" | grep -qE '"\*"[[:space:]]*:[[:space:]]*"?deny"?'; then
		bash_denied=1
	fi
	[ "$bash_denied" -eq 1 ] && continue

	MD_GC_CHECKED=$((MD_GC_CHECKED + 1))

	# Extract the "git commit*" verdict (allow/ask/deny), or empty if absent.
	gc_v=$(printf '%s\n' "$fm" | grep -oE '"git commit\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true

	case "$gc_v" in
		ask|deny) : ;;  # explicitly gated — OK
		*)
			err "${agent_file}: agent '${agent_name}' can git commit without a gate (issue #210) — add '\"git commit*\": \"ask\"' (or deny). bash is not fully denied but 'git commit*' is '${gc_v:-<unset>}'"
			MD_GC_VIOLATIONS=$((MD_GC_VIOLATIONS + 1))
			;;
	esac
done

if [ "$MD_GC_CHECKED" -eq 0 ]; then
	warn "No non-denied .md agents found — .md git-commit gate check did not run"
else
	ok "${MD_GC_CHECKED} .md agent(s) checked for git-commit gating, ${MD_GC_VIOLATIONS} violation(s)"
fi
```

- [ ] **Step 4: Run the fixture tests to verify Green**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: ALL PASS — the first test now detects "git commit without a gate";
the second (`ask`) and third (catch-all deny) are not flagged.

- [ ] **Step 5: Run the validator against the REAL repo (signal)**

Run: `bash .github/scripts/validate-harness.sh`
Expected: the new "Checking .md agent git-commit gating" section reports
**`3 .md agent(s) checked for git-commit gating, 2 violation(s)`** — flagging
`@tdd` and `@resolve-merge-conflicts` (both still `allow`). `from-issue` passes
(`ask`); the read-only/catch-all-deny agents are skipped. **This 2-violation
result is the intended Red signal** — it proves the check catches the real gap.
Task 3 closes it. (Do NOT suppress these violations — they are correct.)

- [ ] **Step 6: Commit (validator intentionally red on the real repo until Task 3)**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(security): flag ungated .md-agent git commit in validator (#210)\n\nExtends validate-harness.sh (ADR-0006 Decision #4) with a .md-agent\ngit-commit gate check mirroring the inline check added under #202: any\n.opencode/agents/*.md whose bash is not fully denied must explicitly gate\n"git commit*" with ask or deny. Read-only agents (bash: deny or "*": deny\ncatch-all) are skipped. Run on the real repo now reports 2 violations\n(@tdd, @resolve-merge-conflicts) — the gap issue #210 identifies; the\nfollowing commit closes it. Makes the inline #202 check comment (which skips\ninline agents having a .md file, claiming the .md path covers them)\ntruthful.\n\nRefs: #210\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 3: Gate `@tdd` and `@resolve-merge-conflicts` commits (Green on real repo)

**Files:**
- Modify: `.opencode/agents/tdd.md` (frontmatter line 8 only)
- Modify: `.opencode/agents/resolve-merge-conflicts.md` (frontmatter line 8 only)

**Interfaces:**
- Consumes: Task 2's validator check (must pass after this task: 0 violations).

- [ ] **Step 1: Gate `@tdd`**

In `.opencode/agents/tdd.md`, change the frontmatter line (currently line 8):

```yaml
    "git commit*": "allow"
```

to:

```yaml
    "git commit*": "ask"
```

Leave `"git add*": "allow"` (line 7), `"git push*": "deny"` (line 9),
`"git tag*": "deny"` (line 10), the `resolve-identity.sh` allow (line 11), and
`lsp: allow` (line 12) untouched. Do **not** edit the prose — Step 7 ("Produce
commit message") stays as-is.

- [ ] **Step 2: Gate `@resolve-merge-conflicts`**

In `.opencode/agents/resolve-merge-conflicts.md`, change the frontmatter line
(currently line 8):

```yaml
    "git commit*": "allow"
```

to:

```yaml
    "git commit*": "ask"
```

Leave `"git add*": "allow"` (line 7), `"git push*": "deny"` (line 9),
`"git tag*": "deny"` (line 10) untouched. Do **not** edit the prose — Step 5
("Finish the merge/rebase", including `git commit -S`) stays as-is.

- [ ] **Step 3: Run the validator on the REAL repo (Green)**

Run: `bash .github/scripts/validate-harness.sh`
Expected: "Checking .md agent git-commit gating" now reports
**`3 .md agent(s) checked for git-commit gating, 0 violation(s)`** — `@tdd`,
`@resolve-merge-conflicts`, and `from-issue` all carry `git commit*: ask` (or
are skipped). If any OTHER agent is flagged, do NOT suppress it — investigate
(it may be a real new gap; report it before proceeding).

- [ ] **Step 4: Re-run the fixture tests (cross-check)**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: ALL PASS (Task 3 changed real agent files, not the fixtures; confirms
no regression in the check itself).

- [ ] **Step 5: Commit**

```bash
git add .opencode/agents/tdd.md .opencode/agents/resolve-merge-conflicts.md
git commit -S -m $'fix(security): gate @tdd/@resolve-merge-conflicts commits at ask (#210)\n\nBoth agents shipped "git commit*": "allow", gating commits only via a prose\n"present the message" step — fragile (a model that skips the step commits\nsilently). Move the verdict to "ask" so every commit hits the\npermission-layer approval dialog (matching build/design/general), which\nshows the full command and message. git add* stays allow (staging is\nreversible; gating it would throttle the Red-Green / merge loops). The\nprose message-presentation step is retained as belt-and-suspenders. Closes\nthe real-repo validator gap surfaced by the previous commit.\n\nRefs: #210\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Verification (after all tasks)

1. `bash tests/Shell/validate-harness_test.sh` → ALL PASS (incl. the 3 new
   `.md` git-commit-gating tests).
2. `bash .github/scripts/validate-harness.sh` → "Checking .md agent
   git-commit gating" reports `3 .md agent(s) checked, 0 violation(s)`.
3. Confirm `@tdd.md` and `@resolve-merge-conflicts.md` frontmatter now read
   `"git commit*": "ask"` (and `git add*` still `allow`).
4. Confirm ADR-0006 carries the `2026-07-26 (issue #210)` amendment and
   AGENTS.md's "Commit and push permissions" bullet matches.
5. `/check` (php-cs-fixer + stylelint + eslint + pest --coverage + validator)
   → green. (No PHP/SCSS/JS source changed, so coverage is unaffected; the
   validator + shellcheck on the modified `.sh` files are the relevant gates.)
6. `@code-review` on the branch before push.

## Out of scope

- **Top-level `permission.bash` lift** — rejected (Option B, not chosen): the
  `.md` change is mandatory regardless (agent rules take precedence), the
  validator already enforces no-drift for both inline (#202) and `.md` (this
  plan) agents, and an inherited `git add*: ask` could prompt on legitimately-
  staging inheriting agents.
- **`git add*` tightening** — rejected: staging is reversible and gating it
  would throttle the Red-Green / merge-resolution loops. The #210 acceptance
  criterion is commit-focused.
- **A separate PHP/Pest regression test** for the `.md` frontmatter — rejected:
  the validator check (Task 2) is the regression guard for `.md` agents; a Pest
  test parsing `.md` frontmatter would duplicate it (YAGNI). (#202's PHP test
  existed because the inline check *skips* `.md`-having inline agents — not the
  case here.)
- **Trimming the prose message-presentation step** — out of scope; it is
  retained as belt-and-suspenders.
- **Fresh ADR (supersession) vs amendment** — this plan uses an ADR-0006
  amendment for consistency with the #183/#184/#198/#202 precedent. If the
  maintainer prefers a cleaner supersession record (a new ADR marking #198's
  "intentionally allowlisted" framing as superseded for commit gating), that is
  a one-task swap of Task 1 — flag for approval before execution.

## ADR / CONTEXT.md recommendation

- **ADR:** amend ADR-0006 (Task 1) — consistent with the established amendment
  pattern for git-permission decisions. The amendment explicitly records the
  partial supersession of the #198 "intentionally allowlisted" framing
  (commit gating only; `edit` scoping + `git add*` unchanged).
- **CONTEXT.md:** **no update.** CONTEXT.md is the application domain glossary
  (entities, invariants, boundaries). This change is harness-internal
  (opencode permission model) and does not touch domain terms or entities.
