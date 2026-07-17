# 0023. Safety Hook for Bash Tool Interception

Date: 2026-07-16

## Status

Accepted

## Context

The OpenCode harness runs autonomous agents that can issue arbitrary bash
commands via the `bash` tool. The existing `permission.bash` rules in
`opencode.jsonc` deny a small set of patterns (e.g. `git push*`) per-agent,
but they are allow/deny-only with no warn capability, are not harness-wide
(some agent definitions omit them), and cannot express risk-graduated
responses. We need a single, harness-wide guardrail that blocks clearly
destructive operations and logs warnings for risky but sometimes-legitimate
commands — adapting the mattpocock/skills v1.1 safety-hook pattern for the
KYAULabs stack.

OpenCode exposes a stable, non-experimental `tool.execute.before` hook
(see `@opencode-ai/plugin` `Hooks` type, line 235 of `dist/index.d.ts`)
that fires before every tool call. Throwing inside it aborts the call,
as demonstrated by the canonical `.env`-protection example in the vendored
`plugins.mdx` docs. Local plugins under `.opencode/plugins/` are
auto-discovered at startup with no config registration required (ADR-0008
establishes the precedent for `.opencode/plugins/` hooks via
`session-bootstrap.ts`).

## Decision

Add `.opencode/plugins/pre-tool-use.ts`, an auto-discovered plugin that
registers a `tool.execute.before` hook. For `input.tool === "bash"` the
hook inspects `output.args.command` and classifies it into one of three
severities:

- **BLOCK** (`throw new Error(...)` — command does not execute):
  - `rm -rf` (recursive + force, any flag spelling: `-rf`, `-fr`, `-r -f`,
    `--recursive --force`, `-rvf`) whose targets resolve outside the safe-zone
    allowlist (below). An unresolvable target (glob, command substitution,
    environment variable) on a detected `rm -rf` is treated as a BLOCK — we do
    not guess.
  - `git push --force` / `git push -f` as standalone tokens (but NOT
    `--force-with-lease`).
  - `git commit --no-verify` / `git commit -n`, and `--no-verify` on any git
    command — bypasses the pre-commit/commit-msg/pre-push hooks. `-n` is blocked
    only on `git commit` (on other commands it is `--dry-run`/`--no-commit`/
    max-count and must not be blocked). See ADR-0025.

- **WARN** (`client.app.log({level:"warn"})`, then allow execution):
  - `git push --delete` (removes a remote ref).
  - `git reset --hard` (discards uncommitted changes).
  - `DROP DATABASE`, `DROP TABLE`, `DROP SCHEMA` — case-insensitive SQL.

- **PASS** — no intervention.

**Safe-zone allowlist** for `rm -rf` — project-relative regenerable/build-artifact
directories and OS temp locations:

- `node_modules/`, `.opencode/node_modules/`, `vendor/`
- `cdn/css/`, `cdn/javascript/`
- `/tmp`, `/var/tmp`, `$TMPDIR` (`os.tmpdir()`)

If ANY target of a multi-target `rm -rf` falls outside the allowlist, the
entire command is BLOCKED.

**Fail-open posture:** The classification logic is a pure, exported function
`classifyCommand()` that never throws (it returns `{severity: null}` on any
internal error). The hook handler additionally wraps the classifier call in
a try/catch and defaults to PASS. A buggy safety hook must never brick all
`bash` tool calls across the entire harness.

**Testable seam:** Classification is extracted into the exported pure function
`classifyCommand(command, { projectDir })` so it can be unit-tested without
mocking the plugin infrastructure. The hook handler is thin glue: classify → act.

**Type-level guard:** A compile-time assertion validates that
`"tool.execute.before"` is a key of the `Hooks` interface, following the
ADR-0008 pattern. If a future SDK version removes or renames the hook, the
build fails loudly.

**No opencode.jsonc change required:** Local plugins in `.opencode/plugins/`
are auto-discovered at startup. The `permission.bash` deny for `git push*`
in `opencode.jsonc` remains as defense-in-depth; the hook covers git push
variants plus the non-push patterns that permissions cannot express.

## Consequences

- **Positive:** Single, harness-wide, testable safety guardrail. Defense-in-depth
  alongside per-agent permission rules. No config registration burden.
- **Negative:** Heuristic detection — a sufficiently obfuscated destructive
  command can evade the regex-based classifier. `rm -rf` with globs is
  conservatively blocked, which may produce false positives on legitimate
  globs inside safe zones (acceptable for v1 — the allowlist extends to
  known glob-safe directories, and false positives are safer than false
  negatives in this context).
- **Negative:** The safe-zone allowlist is hard-coded. Extending it requires
  editing the plugin source and redeploying.
- **Performance:** The hook fires on every `bash` tool call across every agent.
  Classification is a pure function with one synchronous regex sweep per call
  and path resolution on `rm` matches only — negligible overhead. The fail-open
  contract bounds the blast radius of any classifier bug.
- **Maintainability:** The test file `tests/Plugin/pre-tool-use.test.ts` is
  auto-included by the existing `npm run test:plugin` glob. Adding, modifying,
  or removing patterns requires updated tests in the same file.

## Related

- ADR-0008: experimental hook dependency precedent and type-guard pattern.
- ADR-0025: CI-local check parity — the `--no-verify` block extends this hook.
- GitHub epic #127 ("KYAULabs Harness Process Upgrade"), sub-issue #140.
- `.opencode/plugins/session-bootstrap.ts` — sole existing plugin; authoritative
  structure template.
