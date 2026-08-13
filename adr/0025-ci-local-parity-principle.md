# 0025. CI ↔ Local Check Parity for Pre-Remote Enforcement

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-16

## Status

Accepted

## Context

Two defect classes have repeatedly reached CI — each requiring a force-push or
rebase to fix, both of which are repo-blocked (only an exception list permits
them), and each round-trip costs a full CI cycle:

1. **New skill `SKILL.md` missing the required `name` frontmatter field.**
   Caught only by `validate-harness.sh` in CI; no local hook checked it.
2. **Commit messages with literal `\n` sequences / over-long body lines /
   trailers not on their own lines.** `commitlint` in the `commit-msg` hook
   *would* catch these, but the hook could be bypassed (`git commit --no-verify`,
   blocked nowhere) or skipped (its guard `exit 0`s when `node_modules/commitlint`
   is absent — its own comment said "CI enforces commitlint… so skipping locally
   is safe"). A third related gap: the local shellcheck binary can differ from
   CI's (version skew) and exit 0 while printing warnings, so SC1090 reached CI.

The recurring pain is structural: several CI gates have no local, pre-remote
equivalent, so a defect lands on the remote and fixing it rewrites published
history. ADR-0009 already establishes the parity pattern (one script invoked by
both CI and the local `/check`); this decision generalizes it to all gates and
closes the bypass holes.

## Decision

Every CI gate that can fail a PR MUST also run locally, before the commit/push
reaches the remote, and MUST be unbypassable by agents.

1. **pre-commit** validates staged skill frontmatter (`name`/`description`,
   `name`==dir) via `check-skill-frontmatter.sh` — a fast staged-file subset of
   `validate-harness.sh`.
2. **commit-msg** runs commitlint **fail-closed** (a missing `node_modules/
   commitlint` blocks the commit with a "run npm install" message) and adds a
   pure-bash literal-`\n` rejection.
3. **pre-push** runs `validate-harness.sh` + shellcheck as a CI-parity
   backstop. A failure blocks the push; the fix is a local amend of an unpushed
   commit (no force-push needed). The behavioral `tests/Shell/*_test.sh` suite
   stays CI-only — several tests are incompatible with Windows (where pushes
   originate), so running them pre-push would block legitimate pushes.
4. **pre-tool-use** plugin BLOCKs `--no-verify` (any git command) and `-n`
   (only on `git commit`, where it means `--no-verify`; `-n` on other commands
   is `--dry-run`/`--no-commit`/max-count and must NOT be blocked).
5. **shellcheck output-parity:** the shellcheck gate fails on **non-empty
   output**, not just exit code, so a lenient/variant local binary cannot let a
   warning through. shellcheck is added to the pre-push gate as well.
6. Humans retain the `--no-verify` escape hatch (they commit in their own shell,
   not via opencode's bash tool); agents do not.
7. Heavy gates (Pest coverage, Semgrep SAST) remain manual via `/check` and
   `/security` (too slow for per-push).

## Consequences

- **Positive:** A defect is caught pre-remote → fixed by a local amend → **no
  force-push, no rebase**. CI↔local parity eliminates the round-trip cycles.
- **Negative:** Committing without `npm install` is now impossible (was silently
  allowed). `install-hooks.sh` documents the prerequisite; `/doctor` verifies it.
- **Negative:** pre-push latency increases (~10–15s for harness + shellcheck).
  Acceptable for a push gate that prevents history rewrites.
- **Neutral:** Layered defense — pre-commit (fast, staged frontmatter + shellcheck)
  and pre-push (full harness/shell/shellcheck) deliberately overlap; this mirrors
  the existing `php -l` vs `php-cs-fixer` split (ADR-0015).
- Supersedes the fail-open consequence described in ADR-0010.

## Related

- ADR-0009: shared-script parity (CI and `/check` invoke one script).
- ADR-0015: index/staged-blob linting in the pre-commit hook.
- ADR-0023: safety classifier — extended to block `--no-verify` (Task 6).
- ADR-0010: fail-open consequence deprecated by this ADR.
