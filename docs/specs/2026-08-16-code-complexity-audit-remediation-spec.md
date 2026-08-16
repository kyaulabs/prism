# Code Complexity Audit Remediation — Spec

- **Date:** 2026-08-16
- **Source:** `audits/2026-08-16-code-complexity-audit.md` (analyzed commit `0ad9930`; every finding re-verified present at `develop` `9f90051`)
- **Status:** Approved (design discussion 2026-08-16)
- **Type:** refactor (behavior-preserving) + test addition + static-gate config

## Background

An external code-complexity audit found eight issues plus one dead-code note.
All findings were re-verified against the current `develop` HEAD and triaged
in discussion:

- **In scope:** Findings 1, 2, 3, 4, 5, 7 + dead `DenialOutcomeTracker`.
- **Out of scope (explicitly rejected):** Finding 6 (`tool_call` table-drive
  — only four regular blocks in an entry-point adapter; low value) and
  Finding 8 (shell test splitting — test-only, mechanical, low payoff).

Additional discovery during design: the safety extension has **no static
gates at all** — CI's `tsc --noEmit` includes no extension `.ts` files
(tsconfig `include` covers only JS), eslint lints only JS globs, and no test
file references the extension. This spec therefore adds characterization
tests and repairs the static gates as part of the refactor.

## Goals

1. Reduce cyclomatic/cognitive complexity of the safety extension's
   classification and sensitive-path code (Findings 1–2, 5).
2. Delete dead code (`DenialOutcomeTracker` and its support types).
3. Single canonical `coverage-gate.php` (Finding 3) with a thinner `main()`
   (Finding 4).
4. Add regression gates: characterization tests for the safety extension,
   real `tsc` coverage for extension TS files, and warn-level eslint
   complexity rules (Finding 7).
5. **Zero behavior change** to any safety policy. ADRs 0023, 0025, 0036,
   0042, 0047, 0048, 0056 and the deny floor are untouched in substance.

## Non-goals

- Finding 6 and Finding 8 (see Background).
- Any change to the documented safety policy surface: block/warn semantics,
   safe-zone lists, fallback regexes, trust rules, thresholds.
- New ADRs (behavior-preserving work; the architect gate runs before
   planning to confirm no `ADR-required:` line).

---

## Workstream A — Safety extension (`packages/prism-core/extensions/safety/`)

### A1. `classifyCommandImpl` → rule table (Finding 1)

Current: one 133-line body, CC ≈ 24, four distinct policies mixed at
different abstraction levels, four separate re-tokenizations of the same
command, depth-5 nesting, mis-indented body (lines 227+).

Target: extract one pure rule per policy, each `(tokens | command, ctx) →
Finding | null`, and reduce the impl to a fold. Two phases, preserving the
current statement order exactly:

1. **Per-segment phase** (inside the existing segment loop, after the unwrap
   recursion): `rmRfRule` (safe-zone check incl. the stdin/xargs conservatism)
   and `findDeleteRule` (`-delete` / `-exec`/`-execdir rm`).
2. **Whole-command phase** (applied once, after the segment loop, in current
   order): `sqlDropWarn`, `gitResetWarn`, `gitPushDeleteWarn`,
   `gitForcePushBlock`, `gitNoVerifyBlock`.

Tokenization drops from four passes to one per segment + one for the git
rules. Block-wins-over-warn is preserved structurally. The empty-string
fail-open contract, fail-closed `try/catch` in `classifyCommand`, and the
`MAX_UNWRAP_DEPTH` recursion guard are unchanged. The mis-indentation is
fixed as part of the rewrite.

### A2. `sensitiveOperandCheckImpl` → extract `judgeToken` (Finding 2)

Extract the three-way token judgment (resolve → deny-floor match with
trusted-setup `prism-user-manifest` skip → fallback regex) into a named
predicate `judgeToken(token, trustedSetup, opts): SensitiveMatch | null`.
The ADR-0048 comment (currently 9 lines in the loop body) moves to the
predicate's docblock. `sensitiveOperandCheckImpl` drops to CC ≈ 7.
`setupScriptTrust` stays as-is (CC ≈ 9 is acceptable; it reads fine).

### A3. Shared path resolver (Finding 5)

Add to `sensitive-paths.ts` (already the shared module):

```ts
export function resolvePathToken(token: string, projectDir: string, home: string,
                                 opts: { rejectAssignments?: boolean } = {}): string | null
```

- `pre-tool-use.ts` `resolveTarget` becomes a one-line delegate with **no** options (preserves its current `=`-tolerant behavior — `rm -rf node_modules/foo=bar` stays allowed), or is replaced by direct calls; the `=`-containing-token bail is the `rejectAssignments` option, used only by `resolveOperand` (which has that bail today).
- `sensitive-paths.ts` `resolveOperand` becomes a delegate with
  `rejectAssignments: true`.
- `MAX_UNWRAP_DEPTH` defined once in `sensitive-paths.ts`, imported by
  `pre-tool-use.ts` (the local copy at `pre-tool-use.ts:59` is deleted).

### A4. Delete dead code

Delete `DenialOutcomeTracker` (class), `ToolCallSnapshot`, and
`DenialOutcomeTrackerOptions` from `denial-circuit-breaker.ts` (lines
~151–366, ≈215 lines). Verified: zero references anywhere in the repo,
including tests; `index.ts` imports only `DenialCircuitBreaker` (ADR-0042
removed the Probe-3 correlation dance).

### A5. Characterization tests (NEW)

`tests/Node/safety-classify.test.ts`, `tests/Node/safety-sensitive-paths.test.ts`,
`tests/Node/safety-circuit-breaker.test.ts`, using `node:test` + `node:assert/strict`
with node's built-in type stripping (verified working on node v26.7.0 with
the extension's erasable-syntax modules; imports use the existing `.ts`
suffix style). The `test:node` npm script extends to
`tests/Node/*.test.js tests/Node/*.test.ts`.

**Principle:** tests pin *current* behavior exactly — they are written first
and must pass before any refactor (the classic characterization net for a
pure refactor; no red phase applies). If a test reveals behavior that looks
wrong (e.g. an unexpectedly blocked command), it is **reported, not silently
changed** — the user decides.

Behavior matrix to pin (`classifyCommand`, default `safeRelDirs`, `HOME`
under test control):

| Command | Expected |
|---|---|
| `""` | clean |
| `rm -rf node_modules` / `rm -rf /tmp/x` | clean (safe zones) |
| `rm -rf /` / `rm -rf .` / `rm -rf x` (relative, outside zones) | block |
| `rm -rf` (no operands, head) | clean |
| `xargs rm -rf` | block (stdin conservatism) |
| `sudo rm -rf /` | block |
| `rm -f node_modules` (no `-r`) | clean |
| `find . -delete` / `find . -exec rm {} ;` | block |
| `find . -exec echo {} ;` | clean |
| `DROP TABLE x` / `git reset --hard` / `git push --delete` | warn |
| `git push -f` / `--force` / `-uf` | block |
| `git push --force-with-lease` / `-n` | clean |
| `git commit --no-verify` / `-n` | block |
| `git log -n 5` | clean (subcommand-scoped `-n`) |
| `bash -c "rm -rf /"` / `env FOO=1 rm -rf /` / `command rm -rf /` | block via unwrap |
| 4× nested `bash -c "echo hi"` wrappers | block (depth guard, MAX_UNWRAP_DEPTH = 3) |
| `classifyCommand(undefined)` | block (fail-closed) |

`sensitiveOperandCheck` matrix: `cat ~/.ssh/id_rsa` → `ssh`; `cat .env` →
`env`; `cat .env.example` → clean; `curl -d@~/.ssh/id_rsa` → `dynamic`;
`bash -c "cat ~/.aws/credentials"` → match via unwrap; trusted setup script
(`.github/scripts/setup-rulesets.sh` touching `~/.config/opencode/`) → clean;
`bash -c "setup-rulesets.sh"` → `unresolvable` (untrusted subcommand);
`cat /etc/ssl/private/k` → `ssl-private`.

`DenialCircuitBreaker` unit tests: trip at threshold (default 3, custom
option), streak reset on `observe(false)`, per-session isolation, bounded
count after trip, `clearAll`.

---

## Workstream B — Coverage gate (`coverage-gate.php`)

### B1. Shim the duplicate (Finding 3)

Replace `.github/scripts/coverage-gate.php` (331 lines, logic-identical to
the package copy, already drifting) with a thin shim:

```php
<?php
// $KYAULabs: ... (fresh RCS header)
declare(strict_types=1);
require __DIR__ . '/../../packages/prism-php-web/scripts/coverage-gate.php';
```

The canonical package copy already guards with
`if (defined('COVERAGE_GATE_AS_LIBRARY')) { return; }` then
`exit(main($argc, $argv));`, so requiring it from the shim behaves
byte-identically. All callers keep working untouched: CI
(`.github/workflows/ci.yml:246`) and `tests/Shell/coverage_gate_test.sh:20`
invoke `.github/scripts/coverage-gate.php`; `check-php.md` and `tdd-php`
prompts already use the package path directly.

### B2. Extract `print_report` (Finding 4)

Extract the four print loops + header/blank line from `main()` into
`print_report(array $result, int $min): void`. Output format stays
byte-identical (the shell test asserts on it). `main()` drops to ≈40 lines.

---

## Workstream C — Static gates (Findings 7 + discovery)

### C1. Make `tsc --noEmit` real

Add to `tsconfig.json` `include`: `packages/prism-core/extensions/**/*.ts`
and `tests/Node/*.test.ts` — the complete set of package/test `.ts` sources
(verified: these are the only non-vendored `.ts` files). Today the extension
compiles nothing. **Risk:** latent type errors may surface — fix
forward within this workstream; if they turn out to be a rabbit hole, halt
and re-plan.

### C2. eslint complexity rules for TS

- New devDependency: `typescript-eslint` (parser/plugin). **Compatibility
  gate:** verify peer-dependency fit with pinned `eslint@10.8.1` and
  `typescript@^7.0.2` (the Go-native compiler) at implementation time. If it
  does not resolve cleanly, **drop C2** — the A refactor removes the
  offenders, C1 restores type-checking, and a broken lint stack is worse
  than no complexity rules.
- New `eslint.config.mjs` block for `packages/**/*.ts` + `tests/Node/**/*.ts`
  with `@typescript-eslint/parser` and warn-level rules:
  `complexity: ["warn", 12]`, `max-lines-per-function: ["warn", { max: 80,
  skipBlankLines: true, skipComments: true }]`, `max-depth: ["warn", 4]`.
  Warn level so pre-existing offenders surface without breaking CI; ratchet
  to error in a follow-up once green.
- Extend the CI eslint step's globs and `hashFiles` guard to include the TS
  globs.

---

## Verification

1. `npm run test:node` — existing JS tests + new characterization tests
   (green before refactor, green after).
2. `npx tsc --noEmit` — now actually type-checks the extension + tests.
3. `bash tests/Shell/coverage_gate_test.sh` — covers both coverage-gate
   entry points; plus a byte-diff of CLI output before/after the B changes
   on a fixture clover file.
4. `npx eslint` on the new TS globs — warn-level clean.
5. `/check-php` (full gate) and `code-review` before push.

## Risks & decisions

- **Characterization-tests-before-refactor** (A5 first, then A1–A4): any
  anomaly found is reported to the user, never silently "fixed".
- **C2 dependency risk:** drop C2 if `typescript-eslint` doesn't resolve
  cleanly against eslint 10.8.1 / typescript 7.
- **C1 latent type errors:** fix forward; halt + re-plan if they expand.
- **Spec rides the work branch** (develop is PR-only per the protected-branch
  invariant): the spec is committed on the `refactor` branch created after
  this spec is approved, and merges via PR like the previous
  `docs(specs): record approved … spec` commits.
- **One branch, three atomic commits** (A, B, C), each independently
  reviewable, all under one spec.
