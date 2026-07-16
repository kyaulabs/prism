# Implementation Plan — Router Command + Model Config Fix

Date: 2026-07-16

## Issues

- **Primary:** #139 — `feat(docs): Update AGENTS.md plus add router command task#12` (epic #127)
- **Bundled fix:** Sub-agent `.md` frontmatter `model:` lines unsupported by plugin 1.18.3

## Acceptance criteria (#139)

| Criterion | Status |
|---|---|
| AGENTS.md tables list all skills/agents/commands | Already current |
| Pipeline shows spec/architect/tickets flow | Already current |
| `/plan-to-issues` superseded → `/issue` | Already done |
| **Add `/router` command** | This plan |
| **Pipeline shows 3 on-ramps explicitly** | This plan |

## Design decisions (confirmed)

| Decision | Choice |
|---|---|
| D1 — Issue type | Feature (epic consistency) |
| D2 — `/feature` command | Create thin wrapper → `brainstorming` skill (resolves dangling `@consult.md:105` ref) |
| D3 — `wayfinder` forward-ref | Generic ("see wayfinder skill #142 when available, or brainstorming's decomposition guidance") |
| Bug fix scope | Files + AGENTS.md paragraph + ADR-0022 + regression test |
| Commit ordering | Fix first, then router TDD |

## Context: model-line bug fix

All 20 agents have their `model` + `variant` defined in `opencode.jsonc` `agent` section — not in `.md` frontmatter. Only 3 `.md` files (`code-review`, `spec-review`, `standards-review`) carried redundant `model:` lines added during the 4-axis coordinator work (recent commits). The runtime (plugin 1.18.3) rejects `model:` in sub-agent `.md` frontmatter. No tests break on removal (`ModelConfigTest.php` is guarded; `validate-harness.sh` doesn't check model fields).

## Phase A — Bug fix commit: `fix(agents)`

| File | Action |
|---|---|
| `.opencode/agents/code-review.md` | Remove `model: {env:OPENCODE_MODEL_PRIMARY}` (done by user) |
| `.opencode/agents/spec-review.md` | Remove `model: {env:OPENCODE_MODEL_PRIMARY}` (done by user) |
| `.opencode/agents/standards-review.md` | Remove `model: {env:OPENCODE_MODEL_PRIMARY}` (done by user) |
| `.opencode/package.json` | Bump `@opencode-ai/plugin` 1.17.15 → 1.18.3 (done by user) |
| `.opencode/package-lock.json` | Matching lockfile (done by user) |
| `AGENTS.md` (line 150) | Rewrite "Model selection" paragraph — model/variant live in `opencode.jsonc` `agent` section, not `.md` frontmatter |
| `adr/0022-sub-agent-model-config-opencode-jsonc.md` | New ADR — supersedes model/variant-location clauses of ADR-0012/0013 |
| `adr/0012-configurable-model-variables.md` | Status: append "and ADR-0022 — model-location clause" |
| `adr/0013-configurable-variant-via-env-var.md` | Status: add "Partially superseded by ADR-0022 — variant-location clause" |
| `tests/Unit/Harness/ModelConfigTest.php` | Add regression test: assert no `.md` file has `model:` or `variant:` in frontmatter |

## Phase B — Router TDD: `feat(docs)`

### Affected files

| File | Action |
|---|---|
| `tests/Unit/Harness/RouterCommandTest.php` | CREATE (RED) |
| `.opencode/commands/router.md` | CREATE (GREEN) |
| `.opencode/commands/feature.md` | CREATE (GREEN) |
| `AGENTS.md` | EDIT — add `/router` + `/feature` rows + 3-on-ramps lead-in to Engineering Pipeline |
| `README.md` | EDIT — add `/router` + `/feature` rows to "Slash commands" table |

### TDD tasks

1. **RED:** `RouterCommandTest.php` asserts router.md + feature.md exist, both tables have rows, pipeline has 3 on-ramps.
2. **GREEN:** Create command files, update tables, add pipeline lead-in. Verify `validate-harness.sh` + `validate-harness_test.sh` + `architect_adr_contract_test.sh` + Pest all green.
3. **REFACTOR:** Tighten prose, verify signal heuristics match agent descriptions verbatim.

### Verification (definition of done)

```bash
bash .github/scripts/validate-harness.sh
bash tests/Shell/validate-harness_test.sh
bash tests/Shell/architect_adr_contract_test.sh
php -d pcov.enabled=1 vendor/bin/pest --coverage
/check
# then @code-review before push
```

## Branch history

```
feat/kyau-<hash>-router-command
  ├─ fix(agents): remove unsupported model definitions from sub-agent files
  ├─ feat(docs): add router command harness test (RED)
  ├─ feat(docs): add /router + /feature commands (GREEN)
  └─ feat(docs): tighten router prose (REFACTOR)
```
