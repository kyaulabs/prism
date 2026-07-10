# Fixes: #NN Issue-Reference Convention — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Standardize all issue-closing references in commit messages to `Fixes: #NN`, placed at the top of the footer block immediately above `Plan-by:`, machine-enforced by commitlint so drift cannot recur.

**Architecture:** Add a custom commitlint plugin rule (`issue-ref-convention`) to `commitlint.config.js` that (a) rejects every GitHub closing keyword except `Fixes:`, (b) requires `Fixes` to be Sentence-case with a colon, and (c) requires `Fixes:`/`Refs:` trailers to precede `Plan-by:`. Back it with shell regression tests in the existing `tests/Shell/commit-msg_test.sh` harness, then fix the contradictory documentation in the `conventional-commits` skill, README, and AGENTS.md that caused the drift. Record the cross-cutting decision in an ADR.

**Tech Stack:** commitlint v21 (custom plugin rule, CJS), bash shell tests, Markdown docs, Nygard-format ADR.

## Global constraints

- PHP 8.5+, Node LTS, commitlint `^21`, `@commitlint/config-conventional` `^21`.
- `commitlint.config.js` is CommonJS (`module.exports`); new rule must be a plain function `(parsed, when) => [boolean, string]`.
- Every new/modified source file keeps its RCS header + vim modeline (the shell test and JS config already have them — preserve).
- Shell tests follow `tests/Shell/commit-msg_test.sh`'s existing Variant-A pattern (`RESULT_FILE`, `pass()`/`fail()`/`skip()`, `COMMITLINT_AVAILABLE` guard).
- TDD: Red → Green → Refactor. No behavior-delta code without a failing test first.
- Signed commits, single `-m` with embedded newlines, Conventional Commits format + `Plan-by`/`Acked-by`/`Signed-off-by` footers.

## Design decisions

1. **`Refs: #NN` stays valid** for non-closing references; `Fixes: #NN` is reserved exclusively for closing.
2. **Machine-enforce via commitlint** (reject non-conforming commits at the `commit-msg` hook + CI).
3. **Ban all other GitHub closing keywords** — `close`, `closes`, `closed`, `resolve`, `resolves`, `resolved`, `fix`, `fixed` — only `Fixes:` may close.
4. **Placement** — `Fixes:` and `Refs:` must appear before `Plan-by:` in the footer.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `commitlint.config.js` | Modify | Add `issue-ref-convention` plugin rule + register it; extract `isMergeOrRevert` helper (DRY) |
| `tests/Shell/commit-msg_test.sh` | Modify | Append Tests 7–13 covering banned keywords, case, colon, placement, green paths |
| `.opencode/skills/conventional-commits/SKILL.md` | Modify | Fix the contradictory `fix(db):` example (move `Fixes:` above `Plan-by:`); add "Issue References" section |
| `README.md` | Modify | Footer section: state `Fixes:` is the sole allowed closing keyword + must precede `Plan-by:` |
| `AGENTS.md` | Modify | Git Workflow footer bullet: add the `Fixes: #NN` placement rule |
| `adr/0010-issue-closing-keyword-convention.md` | Create | Nygard ADR capturing the enforcement decision |

---

### Task 1: `issue-ref-convention` commitlint rule (TDD)

**Files:**
- Modify: `commitlint.config.js`
- Test: `tests/Shell/commit-msg_test.sh`

**Interfaces:**
- Consumes: `parsed.raw` (full commit message string), `parsed.header`, `parsed.merge`, `parsed.revert` — all provided by commitlint's parser.
- Produces: a registered commitlint rule `issue-ref-convention` (level 2, `always`) returning `[boolean, string]`.

**Rule behavior spec:**

- Exempt merge/revert commits (same exemption as `trailers-exist`).
- Scan each line of `parsed.raw` for a closing-keyword pattern: `^\s*(close|closes|closed|resolve|resolves|resolved|fix|fixes|fixed)\b\s*:?\s*#\d+` (case-insensitive). Only lines where a closing keyword is followed by `#NN` match — body prose like "Fixed the bug." is untouched.
- For each matching line:
  - If the keyword (lowercased) is in `{close, closes, closed, resolve, resolves, resolved, fix, fixed}` → violation: ``issue-closing keyword `:<kw>:` is not allowed — use `Fixes: #NN` to close an issue``.
  - Else (keyword is `fixes`, case-insensitive):
    - If the keyword as-written ≠ `Fixes` → violation: ``issue-closing keyword `:<kw>:` must be Sentence-case `Fixes` ``.
    - If the line does not match `^\s*Fixes:\s*#\d+` (i.e., no colon, e.g. `Fixes #42`) → violation: ``issue reference must use the form `Fixes: #NN` (with colon)``.
- Placement: collect indices of all lines matching `^\s*(Fixes|Refs):\s*#\d+` and the first `^\s*Plan-by:\s` line. If any issue-ref index > Plan-by index → violation: ``issue-reference trailers (`Fixes:`, `Refs:`) must appear before `Plan-by:```.
- Multiple violations join with `; `.

**Test matrix:**

| # | Message (footer excerpt) | Expected exit | Asserts |
|---|---|---|---|
| 7 | `Closes #40`, then Plan-by/Acked-by/Signed-off-by | non-zero (reject) | banned keyword `Closes` |
| 8 | `Resolve: #50`, then Plan-by/Acked-by/Signed-off-by | non-zero (reject) | banned keyword `Resolve` |
| 9 | `Fixes #42` (no colon), then Plan-by/Acked-by/Signed-off-by | non-zero (reject) | missing colon |
| 10 | `fixes: #42` (lowercase), then Plan-by/Acked-by/Signed-off-by | non-zero (reject) | lowercase `fixes` (case) |
| 11 | Plan-by/Acked-by/Signed-off-by first, `Fixes: #42` last (after) | non-zero (reject) | `Fixes:` after `Plan-by:` |
| 12 | `Fixes: #42` at top, then Plan-by/Acked-by/Signed-off-by | zero (accept) | green path |
| 13 | `Refs: #123` at top, then Plan-by/Acked-by/Signed-off-by | zero (accept) | green path: `Refs:` non-closing |

- [x] **Step 1: Write the failing tests (Red)** — append Tests 7–13 to `tests/Shell/commit-msg_test.sh`
- [x] **Step 2: Run tests to verify they fail** — Tests 7–11 fail, 12–13 pass
- [x] **Step 3: Implement the rule (Green)** — add `issue-ref-convention` to `commitlint.config.js`, extract `isMergeOrRevert`
- [x] **Step 4: Run tests to verify they pass (Green)** — all 13 tests pass
- [x] **Step 5: Commit**

```bash
git add commitlint.config.js tests/Shell/commit-msg_test.sh
git commit -S -m $'feat(commitlint): enforce Fixes: #NN issue-closing convention\n\nAdd a custom issue-ref-convention rule that rejects every GitHub closing\nkeyword except Fixes (Sentence-case, with colon) and requires\nFixes:/Refs: trailers to precede Plan-by:. Closes/Closed/Resolve/etc.\nand colon-less forms (Fixes #42) are now blocked at the commit-msg hook\nand in CI, eliminating the keyword/placement drift caused by the\nself-contradictory skill example.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 2: Fix contradictory docs (skill + README + AGENTS)

**Files:**
- Modify: `.opencode/skills/conventional-commits/SKILL.md`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [x] **Step 1: Fix the `conventional-commits` skill** — move `Fixes: #42` above `Plan-by:` in the `fix(db):` example, add "Issue References" section
- [x] **Step 2: Update `README.md`** — add paragraph about `Fixes:` as sole closing keyword, move `Refs:` examples above `Plan-by:`
- [x] **Step 3: Update `AGENTS.md`** — add `Fixes: #NN` placement rule to Git Workflow footer bullet
- [x] **Step 4: Commit**

```bash
git add .opencode/skills/conventional-commits/SKILL.md README.md AGENTS.md
git commit -S -m $'docs(commits): standardize Fixes: #NN at top of footer\n\nFix the self-contradictory conventional-commits skill example that placed\nFixes: #42 after Signed-off-by (the root cause of placement drift),\ndocument Fixes: as the sole closing keyword above Plan-by: in the skill,\nREADME, and AGENTS.md, and move the README Refs: example into the\ntop footer block to match.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: ADR-0010 — issue-closing keyword convention

**Files:**
- Create: `adr/0010-issue-closing-keyword-convention.md`

- [x] **Step 1: Write ADR-0010** — Nygard format, recording the enforcement decision
- [x] **Step 2: Commit**

```bash
git add adr/0010-issue-closing-keyword-convention.md
git commit -S -m $'docs(adr): add ADR-0010 Fixes: #NN closing-keyword convention\n\nRecord the decision to enforce Fixes: #NN as the sole issue-closing\nkeyword via commitlint, with Fixes:/Refs: placed above Plan-by:, and\nthe merge/revert exemption rationale.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 4: Verification before completion

- [x] Run `bash tests/Shell/commit-msg_test.sh` → all pass
- [x] Run `/check` (pre-push gate)
- [x] Dispatch `@code-review`
