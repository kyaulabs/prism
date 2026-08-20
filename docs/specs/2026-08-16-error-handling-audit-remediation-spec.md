# Error Handling Audit Remediation — Spec

- **Date:** 2026-08-16
- **Source:** `audits/2026-08-16-error-handling-audit.md` (analyzed commit `0ad9930`; every finding re-verified against `develop` `0ca8be0`)
- **Status:** Approved (design discussion 2026-08-16)
- **Type:** fix (error-handling hardening — additive only, no behavior delta on existing outcomes)

## Background

An external error-handling audit (9 findings, F-1…F-9) was triaged against the
current `develop` HEAD. Five findings are live, one is already fixed, two are
subsumed/dispositional, and one is out of scope:

| # | Finding | Imp. | Verdict at `0ca8be0` |
|---|---------|------|----------------------|
| F-1 | `tool_call` handler not wrapped fail-closed | 8 | **Live** — `index.ts` unchanged: `sensitiveOperandCheck`/`sensitivePathBlocks`/`sensitivePatternCheck` run bare; only `classifyCommand` self-catches |
| F-2 | One bad `PRISM_SENSITIVE_PATHS` line drops all extra paths | 6 | **Live** — `resolveExtraPaths` is all-or-nothing; `loadAdditionalSensitivePaths` throws on first malformed line |
| F-3 | `coverage-gate.php` accepts garbage `--min` (typo → gate at 0%) | 6 | **Live** — `parse_args` `(int)`-casts both `--min` forms; exit 2 never used for this |
| F-4 | `@`-suppressed XML/file diagnostics; unreadable changed file silently SKIPs | 5 | **Live** — `@simplexml_load_file` (no libxml detail); `(string) @file_get_contents` false→`''`→"no executable code" |
| F-5 | `check-peer-deps.js` bare `walk()` crashes despite "always exits 0" contract | 4 | **Live** — unchanged since 2026-08-13; also `existsSync`+`statSync` TOCTOU |
| F-6 | `load_env()` E_WARNING leak | 3 | **Resolved** — PR #324 (`6018fe4`): `is_readable` + `@file` + `error_log`; `env_bool` logs garbage too |
| F-7 | Breaker half-open; `agent_end` reset undocumented | 3 | **Doc nit only** — half-open is a deliberate ADR-0042 trade-off; `agent_end` comment exists; `noteBashDenial` docblock still says "for the session" |
| F-8 | HTTP 4xx/5xx in aurora — "unable to verify" at audit time | n/a | **Out of scope** — submodule now initialized; user + prior session decision: no aurora changes |
| F-9 | No unhandled-rejection backstop | 2 | **Subsumed by F-1** — a never-rejecting `tool_call` handler makes it moot |

Note the relationship to the earlier error-flow audit: its F4 (fail-open parse
contract of `check-peer-deps.js`) was dispositioned as documented behavior and
its F3/F6 (env.php) are the changes that resolved this audit's F-6. This
audit's F-5 is the *crash* case — an uncaught exception breaking the
"always exits 0" contract — which remains unfixed.

## Goals

1. **F-1:** the `tool_call` handler never rejects — any internal throw becomes
   `{ block: true, reason: … failing closed per ADR-0036 }`.
2. **F-2:** a malformed `PRISM_SENSITIVE_PATHS` line is skipped with a loud
   log; valid lines in the same env var are still honored.
3. **F-3:** `--min` outside 1..100 (or non-integer) is a usage error → exit 2
   with a specific message.
4. **F-4:** Clover parse failures report libxml line/column/cause; a changed
   file that exists but cannot be read is WARNED (fails under `--strict`),
   never silently SKIPped.
5. **F-5:** `check-peer-deps.js` keeps its "always exits 0, stdout is the
   protocol" contract even when the extensions tree cannot be scanned.
6. **F-7:** docblock states the trip's real lifetime (rest of the agent run;
   `agent_end` resets; `/new` clears mid-run).

## Non-goals

- **No aurora changes** (F-8). The submodule owns its error display; the
  prior error-flow session's out-of-scope decision stands.
- **No `env.php` changes** (F-6 already fixed).
- **No `unhandledRejection` backstop** (F-9, subsumed).
- **No half-open circuit breaker** — the trip-until-`/new` design is a
  deliberate ADR-0042 trade-off (no `client.session.abort` in pi).
- **No behavior delta** on any existing allow/block outcome or exit code.
  Every change is additive error-handling hardening.

## Design

### D1 — New `tool-call-handler.ts` (F-1, F-2, F-7)

New file `packages/prism-core/extensions/safety/tool-call-handler.ts`
importing only node builtins + `pre-tool-use.ts`, `sensitive-paths.ts`,
`denial-circuit-breaker.ts` — the same purity pattern the existing files
follow. No pi imports, so `tests/Node/` can import it (the pi API package
`@earendil-works/pi-coding-agent` does not resolve in this repo).

```ts
export interface ToolCallDeps {
    sid: string;                    // breaker key
    cwd: string;
    home: string;
    safeRelDirs: readonly string[];
    extraPaths: string[];
    breaker: DenialCircuitBreaker;  // injected → trip/denial bookkeeping testable
    notify?: (msg: string, level: "error" | "warning") => void;
}

export type ToolCallResult = { block: true; reason: string } | undefined;

export function handleToolCall(toolName: string, input: unknown, deps: ToolCallDeps): ToolCallResult
```

- The whole policy body moves in: trip-first blocking → bash
  operand/classifier (with `noteBashDenial` breaker feeding + redacted
  escalation via `notify`) → read/ls/grep/find path checks.
- The body is wrapped in a top-level `try/catch` returning
  `{ block: true, reason: "[prism safety] BLOCKED: safety handler internal error — failing closed per ADR-0036 (…)" }`.
  The handler is synchronous (all current calls are sync) so a plain
  try/catch suffices; the async wrapper in `index.ts` turns any residual
  throw into a rejection — which the catch already prevents.
- An internal-error block does **not** feed the breaker (safety-extension
  fault, not a bash-denial-of-intent).
- `input` is narrowed structurally (`{ command?: unknown }`,
  `{ path?: unknown }`, `{ glob?: unknown }`, `{ pattern?: unknown }`) —
  exactly the fields the current `isToolCallEventType` guards expose.
- `noteBashDenial` docblock (F-7): state that the trip blocks for the
  remainder of the agent run (each `agent_end` resets the streak) and a
  mid-run trip requires `/new`.

### D2 — `resolveExtraPaths` per-line (F-2)

Moves into `tool-call-handler.ts` as a pure function:

```ts
export function resolveExtraPaths(envValue: string | undefined, log: (msg: string) => void = console.error): string[]
```

Iterates lines; calls `loadAdditionalSensitivePaths` per line inside
`try/catch`; pushes valid entries; logs each rejected line
(`ignoring malformed sensitive-paths entry …`) and continues. The core
deny floor and all valid user entries remain active (ADR-0047).

### D3 — `index.ts` becomes wiring (F-1, F-2)

`index.ts` keeps all pi-API knowledge: `sessionId`, `isToolCallEventType`
discrimination to a plain `toolName` string + `input`, `ctx.ui.notify` /
`console.error` mapping into the `notify` callback, and session-state
resolution (`safeRelDirs`, `extraPaths`, `homeDir`) at `session_start`.
The five event registrations remain unchanged (`session_start`, `tool_call`,
`tool_execution_end`, `agent_end`, `session_shutdown`).
Exact `ToolCallEvent` plumbing is verified against pi's installed type
definitions during planning.

### D4 — `coverage-gate.php` `--min` validation (F-3)

In `parse_args`, both `--min N` and `--min=N` forms validate with
`filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]])`;
on failure `$cfg['min'] = null` (type becomes `?int`). In `main`, a null
min writes `ERROR: --min must be an integer 1..100` to stderr and returns
exit 2 (the documented usage-error code). Valid invocations are unchanged.

### D5 — `coverage-gate.php` libxml diagnostics (F-4a)

Replace `@simplexml_load_file` with `libxml_use_internal_errors(true)` +
`libxml_clear_errors()` + `simplexml_load_file($cloverPath)`; on `false`,
print `ERROR: could not parse clover XML at …` plus one stderr line per
`libxml_get_errors()` entry (`line %d: %s`), then exit 2. Same exit code
and first line as today — only the diagnostics are added.

### D6 — `coverage-gate.php` unreadable changed file (F-4b)

In `classify_changed_files`, capture the raw `file_get_contents` result:
`false` → `$warned[] = [$changed, 'unreadable — could not verify executable code']`;
non-empty with executable code → warn (unchanged); else skip (unchanged).
The warned bucket already prints to stderr and fails under `--strict`
via `exit_code_for`. Warned-not-hard-fail keeps the documented exit-0
contract for non-strict invocations; `/check-php` runs `--strict`, so CI
fails on uninspectable files.

### D7 — `check-peer-deps.js` guards (F-5)

- Replace `existsSync(extDir) || !statSync(extDir).isDirectory()` with a
  single guarded `statSync` (catch → `process.exit(0)`), then the
  `isDirectory()` check.
- Wrap `walk(extDir)` in `try/catch` → `console.log(\`${rel}: cannot scan extensions/: ${e.message}\`)`
  + `process.exit(0)`. The caller (`validate-harness.sh`) treats every
  stdout line as a violation, so an unscannable tree fails the gate loudly
  while the "always exits 0" contract and stdout protocol hold.

### D8 — Tests

- **New `tests/Node/safety-tool-call-handler.test.ts`:** trip-first
  blocking; bash operand match → block + breaker fed; malformed bash args →
  block + breaker fed; classifier block → block + breaker fed; classifier
  warn → notify + allow; read/ls/grep/find path blocks; grep glob and find
  pattern blocks; allow passthrough; internal error → block with
  "failing closed per ADR-0036" (via a throwing breaker mock cast).
- **Extend `tests/Node/safety-sensitive-paths.test.ts`:** `resolveExtraPaths`
  with mixed valid/invalid lines → valid kept, rejected logged.
- **Extend `tests/Shell/coverage_gate_test.sh`:** `--min=abc`, `--min=0`,
  `--min=-5` → exit 2 + message; malformed Clover XML → exit 2 + `line N:`
  diagnostic; changed-file-unreadable (chmod 000, root-skip) → WARN on
  stderr, exit 1 with `--strict` / exit 0 without.
- **Extend `tests/Node/toolchain-packaging.test.js`:** extDir-is-a-file →
  exit 0, no stderr; unreadable extensions dir (chmod 000, root-skip) →
  exit 0 + stdout `cannot scan` line.

## Verification

1. `npm run test:node` — 135 existing + new tests green.
2. `bash tests/Shell/coverage_gate_test.sh` — existing 10 tests + new cases
   green, output contracts byte-identical for existing cases.
3. `/check-php` — php-cs-fixer, stylelint, eslint, Pest coverage ≥ 80% on
   changed files (the PHP gate changes participate in the changed-file
   coverage gate; test seams confirmed during planning).
4. `code-review` before push (suggest Ctrl+P to the judge model).

## Risks & decisions

- **chmod-000 tests skip as root** — established repo pattern (env tests);
  the portable cases (min validation, malformed XML, extDir-is-file) carry
  the contract without permission games.
- **Warned-not-hard-fail for unreadable changed files** — preserves the
  non-strict exit-0 contract; `--strict` (CI) fails. Chosen over
  always-fail which would change behavior for existing non-strict callers.
- **Internal-error block does not feed the breaker** — keeps the breaker a
  bash-denial-of-intent counter; a broken safety handler blocks with a
  clear per-call reason instead of tripping the session.
- **Structural `input` narrowing in the handler** — avoids importing pi
  types; verified against `ToolCallEvent` during planning so the field
  names match what the guards expose.
- **`resolveExtraPaths` logs via injected logger** — keeps the module
  testable (spy) while defaulting to `console.error`.
- **Spec rides the work branch** — develop is PR-only (protected-branch
  invariant); the spec commits on `fix/kyau-8466-error-handling-audit-remediation`
  and merges via PR, like the error-flow remediation.
- **One branch, atomic commits per finding** — `fix(safety): …`,
  `fix(tooling): …`, `fix(coverage-gate): …`, each independently
  reviewable under this spec.
