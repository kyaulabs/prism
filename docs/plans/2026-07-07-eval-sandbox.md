# Eval Sandbox & Slow-Group Exclusion — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Prevent the eval runner from mutating the source tree and from running during default `pest` invocations.

**Architecture:** Exclude `@group slow` in `phpunit.xml`. Add a disposable `git worktree` lifecycle to `Runner` so the `@tdd` agent writes into a throwaway worktree, removed in a `finally` path. Add a read-only `judge` agent to `opencode.json` and wire `buildJudgeCommand` to `--agent judge`. Assert source-tree `git status` is unchanged in the integration test.

**Tech Stack:** PHP 8.5+, Pest v4, git worktree, opencode `run` CLI.

**Spec:** GitHub issue #29 — [Sandbox eval executions and exclude `@group slow` from default runs](https://github.com/kyaulabs/template/issues/29)

## Global constraints

- PHP `declare(strict_types=1)` on all backend classes; PSR-12; 4-space indent.
- Every new/modified source file keeps its RCS header + vim modeline (`rcs-header` skill).
- Never edit `cdn/css/*.min.css` or `cdn/javascript/*.min.js`.
- Signed commits, Conventional Commits format, with `Plan-by` / `Acked-by` / `Signed-off-by` footers.
- `opencode run` has no `--permissions` flag — read-only-ness comes from agent config.
- Scope: template repo only. The `aurora/` submodule has parallel copies but is a separate repo (out of scope — separate issue).

## File structure

| File | Action | Responsibility |
|---|---|---|
| `phpunit.xml` | Modify | Exclude `slow` group from default runs |
| `opencode.json` | Modify | Add read-only `judge` agent |
| `.opencode/evals/bin/includes/EvalRunner.php` | Modify | `Runner::createWorktree`/`removeWorktree`; `buildCommand` optional `$dir`; `buildJudgeCommand` uses `--agent judge` |
| `.opencode/evals/bin/run-eval.php` | Modify | Wrap agent run in worktree try/finally; no `exit` inside try |
| `tests/Unit/Eval/RunnerTest.php` | Modify | Tests for worktree primitives + `--agent judge` |
| `tests/Integration/Eval/RunEvalIntegrationTest.php` | Modify | Add `INVALID` to accepted verdicts; before==after `git status` assertion |
| `.opencode/evals/README.md` | Modify | Document slow-group opt-in + worktree behavior |

---
## Task outline

1. **Task 1:** Exclude `@group slow` from default pest runs (`phpunit.xml`)
2. **Task 2:** Add read-only `judge` agent to `opencode.json`
3. **Task 3:** Make `buildJudgeCommand` use `--agent judge` (TDD)
4. **Task 4:** Add worktree primitives + dir override to `Runner` (TDD)
5. **Task 5:** Wire worktree lifecycle into `run-eval.php`
6. **Task 6:** Harden the integration test (INVALID verdict + git-status guard)
7. **Task 7:** Document slow-group opt-in and worktree behavior in the evals README

---
## Acceptance criteria mapping

| Issue criterion | Task(s) |
|---|---|
| Plain pest skips slow group | 1 |
| `git status --porcelain` unchanged after a real eval run (asserted) | 4, 5, 6 |
| Judge carries no write-capable permissions | 2, 3 |
| Evals README documents opt-in group + worktree behavior | 7 |
| Add `INVALID` to accepted verdicts | 6 |

## Notes / out of scope

- **`aurora/` submodule** has identical parallel copies of `EvalRunner.php`, `RunEvalIntegrationTest.php`, `phpunit.xml`, and the evals README. It is a separate git repo — fixing it requires its own issue/PR in the aurora repo plus a submodule bump here. Flagged, not addressed.
- **`run-suite.php`** shells out to `run-eval.php` per case, so the worktree isolation in Task 5 covers suite runs automatically — no changes needed there.
- The `judge` agent uses `temperature: 0.0` for deterministic judging.

## Verification (after all tasks)

- [ ] `php vendor/bin/pest tests/Unit/Eval/` — all unit tests green.
- [ ] `php vendor/bin/pest` (no group) — slow test skipped, no 180s hang.
- [ ] `php vendor/bin/pest --group slow --list-tests` — slow test present.
- [ ] `php -l` on all modified PHP files — no syntax errors.
- [ ] `php -r 'json_decode(file_get_contents("opencode.json")); echo json_last_error_msg();'` — `No error`.
- [ ] (If opencode installed) `php vendor/bin/pest --group slow` — runs the eval; afterward `git status --porcelain` is unchanged in the source repo.

