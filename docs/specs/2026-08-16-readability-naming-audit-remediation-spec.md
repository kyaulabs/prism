# Readability & Naming Audit Remediation — Spec

- **Date:** 2026-08-16
- **Source:** `audits/2026-08-16-readability-naming-audit.md` (analyzed commit `0ad9930`; every finding re-verified against `develop` `1f4e780`)
- **Status:** Approved (design discussion 2026-08-16)
- **Type:** refactor (readability/naming — zero behavior delta on any allow/block outcome, env parse result, or test expectation)

## Background

An external readability-and-naming audit (11 findings, F1…F11) was triaged
against the current `develop` HEAD. Six findings are already resolved by
subsequent work (the safety-module restructure), one is dispositioned, and
five are live:

| # | Finding | Imp. | Verdict at `1f4e780` |
|---|---------|------|----------------------|
| F1 | `classifyCommandImpl` is a 130-line function with comment-labeled sections and stray block scopes | 7 | **Resolved** — restructured into a rule table: `SEGMENT_RULES`/`COMMAND_RULES` + one named predicate per policy (`rmRfRule`, `findDeleteRule`, `sqlDropWarn`, `gitResetWarn`, `gitPushDeleteWarn`, `gitForcePushBlock`, `gitNoVerifyBlock`); no section comments, no bare scopes, no duplicated tokenization |
| F2 | Indentation broken for the bulk of `classifyCommandImpl` | 6 | **Resolved** — correctly indented at `develop`; backstop residue (no eslint indent rule for packages JS) is folded into F10 below |
| F3 | Duplicated constants and near-duplicate helpers across the safety module | 6 | **Resolved** — `MAX_UNWRAP_DEPTH` single-sourced in `sensitive-paths.ts` and imported; `index.ts` imports `DEFAULT_THRESHOLD` from `denial-circuit-breaker.ts`; `resolveTarget`/`resolveOperand` both delegate to the shared exported `resolvePathToken`. Residue (segment regex `/[;&|\n]/` still duplicated 2×) is a deliberate non-goal — see Non-goals |
| F4 | Local `basename()` shadows `node:path`'s `basename` with different semantics | 5 | **Live** — `pre-tool-use.ts` still defines a private `basename(token)` (4 call sites) while sibling `sensitive-paths.ts` imports the real `node:path` `basename` |
| F5 | Cryptic single/double-letter names in non-trivial logic | 5 | **Live** — `p` (three distinct meanings in `sensitive-paths.ts`), `pat`, `t` across `sensitive-paths.ts`, `pre-tool-use.ts`, and `tool-call-handler.ts` |
| F6 | `Severity = "block" \| "warn" \| null` and the `{ severity: null, reason: "" }` sentinel | 4 | **Live** — clean paths still return a fake `Finding`; callers test `severity !== null` |
| F7 | `parse_env_value`'s `$cut = false` int-or-false union | 3 | **Live** — `$cut` still holds an offset-or-false in `backend/env.php` |
| F8 | Magic number `64` in `canonicalizePath` | 3 | **Live** — unnamed bound in `sensitive-paths.ts` |
| F9 | `foundIdx > 0` reads like an off-by-one | 3 | **Live** — `foundIdx > 0` re-tested far from its assignment in `rmRfRule`. Also: `parseRm` is now **dead code** (orphaned by the F1 restructure — defined, never called, no test references) |
| F10 | Tabs-vs-spaces split between JS scripts and TS extensions | 2 | **Live** — 25 first-party JS files (`packages/prism-core/scripts/**`, `packages/prism-php-web/scripts/**`, `tests/Node/**`) are tab-indented `noet`; TS files are 4-space `et`; no `.editorconfig` exists |
| F11 | Decorative blank-line padding after RCS headers | 2 | **Live + now answerable** — verified not load-bearing: the pre-commit hook strips and rebuilds only the header/modeline lines; the blank runs are body and are never consulted |

## Goals

1. **F4:** the private `basename` in `pre-tool-use.ts` becomes
   `commandBasename` — no stdlib-name shadowing in the safety package.
2. **F5:** single-letter locals get domain words; single letters remain only
   as loop indices (`i`) and one-line lambda params.
3. **F6:** absence of a finding is explicit at the function boundary —
   `classifyCommand` returns `Finding | null`; the `null`-in-`Severity`
   sentinel and `{ severity: null, reason: "" }` fake findings are deleted.
4. **F7:** `$commentStart = null` names what the offset actually is in
   `parse_env_value`.
5. **F8:** the canonicalize walk bound is a named constant
   (`MAX_CANONICALIZE_STEPS = 64`) with a doc comment.
6. **F9:** `rmNotAtHead` expresses the wrapped-rm case; the dead `parseRm`
   wrapper is deleted.
7. **F10:** every first-party JS file is 4-space `et` (matching TS/PHP/sh),
   enforced by an `.editorconfig` and an eslint `indent` rule; the pre-commit
   hook's JS modeline matches.
8. **F11:** blank padding collapses to the canonical form the hook's own
   normalizer emits (one blank line after the header, one before the
   modeline).

## Non-goals

- **No F1/F2/F3 re-work** — already resolved at `develop`; the audit's
  F3-residue suggestion (export `SEGMENT_SEPARATOR_RE` for the two remaining
  `/[;&|\n]/` uses) is deliberately skipped: two co-located uses in the same
  shared module, and exporting a regex constant for two call sites adds an
  indirection the audit itself rated trivial.
- **No `cdn/` changes** — no cdn tree exists in this checkout; the eslint
  `cdn/js` block in `eslint.config.mjs` is dead config for downstream
  consumers and is left untouched.
- **No behavior delta** on any classify allow/block outcome, env parse
  result, or test expectation. F6 changes the *shape* of the internal
  return type; its only consumers are `tool-call-handler.ts` and the Node
  tests (verified by grep), so the change is contained.
- **No `.editorconfig` rules for unobserved languages** — only js/cjs/mjs/
  ts/php/sh/scss/json are declared, matching verified modelines and file
  contents.
- **No audit-file annotation** — prior remediations (error-handling,
  error-flow, code-complexity) left their audit files as historical records;
  this one does the same.

## Design

### D1 — Safety renames (F4, F5, F8) — `extensions/safety/`

All renames are pure identifier swaps with zero behavior delta:

- **F4:** `pre-tool-use.ts` — `basename` → `commandBasename` (definition +
  4 call sites: `parseRmTokens`, `findRmAnywhere`, `findDeleteRule` ×2).
- **F5:** one-letter locals get words:
  - `pre-tool-use.ts` `parseRmTokens`: `t` → `token`
  - `sensitive-paths.ts` `normalizeRaw`: `p` → `expanded`
  - `sensitive-paths.ts` `sensitivePathMatch`: `p` → `canonical`,
    `pat` → `patternPath` (both the `DEFAULT_PATTERNS` and `extraPaths`
    loops)
  - `sensitive-paths.ts` `sensitivePatternCheck`: `p` → `trimmed`
  - `sensitive-paths.ts` `resolvePathToken`: `p` → `path`
  - `sensitive-paths.ts` `setupScriptTrust`: `t` → `token`
  - `tool-call-handler.ts` `sensitivePathBlocks`: `p` → `path`
  - `metaIdx`/`probe`/`abs` stay — multi-letter and consistent with the
    audit-blessed abbreviations (`subcmd`, `opts`, `idx`).
- **F8:** `sensitive-paths.ts` `canonicalizePath` — add
  `const MAX_CANONICALIZE_STEPS = 64` with the doc comment
  `/** Max ancestor hops when walking up to an existing realpath-able prefix. */`;
  the loop bound becomes `i < MAX_CANONICALIZE_STEPS`.

### D2 — `rmRfRule` clarity + dead code (F9) — `pre-tool-use.ts`

- Delete the dead `parseRm` wrapper (verified: zero callers, zero test
  references; `rmRfRule` already calls `parseRmTokens` directly).
- In `rmRfRule`, introduce `const rmNotAtHead = foundIdx > 0;` immediately
  after the `if (!parsed) { … }` block and use it at both existing sites
  (the empty-operands unresolvable-targets check and its `tokens[0] ===
  "xargs"` sibling), with a short comment: `// rm appeared behind a wrapper (xargs, timeout, …)`.

### D3 — `Finding | null` (F6) — `pre-tool-use.ts`, `tool-call-handler.ts`, `safety-classify.test.ts`

`pre-tool-use.ts`:

```ts
export type Severity = "block" | "warn";
export interface Finding { severity: Severity; reason: string; }
export function classifyCommand(command: string, opts: ClassifyOptions): Finding | null;
```

- Empty-command branch: `return null` (was `{ severity: null, reason: "" }`).
- `classifyCommandImpl` returns `Finding | null`; the depth guard and rule
  matches still return real `Finding`s; the final clean return becomes
  `null`; the unwrap recursion test becomes `if (innerFinding !== null)`.
- The `SEGMENT_RULES`/`COMMAND_RULES` signatures already return
  `Finding | null` — unchanged.
- `tool-call-handler.ts`: `finding?.severity === "block"` /
  `finding?.severity === "warn"` (two sites).
- `tests/Node/safety-classify.test.ts`: delete the `CLEAN` constant; all 17
  clean-path assertions (verified count) become
  `assert.equal(classifyCommand(...), null)`;
  the non-string fail-closed test uses `f?.severity` / `f?.reason` (it is
  typed `Finding | null` but returns a real block `Finding`).

### D4 — `$commentStart` (F7) — `backend/env.php`

In `parse_env_value`, replace the `$cut = false` int-or-false union with
`$commentStart = null` (offset of the first unquoted `#` comment, if any):
`$commentStart = 0` for a leading `#`, `$commentStart = $at + 1` per marker,
`if ($commentStart !== null)` gate, `substr($value, 0, $commentStart)`.
Semantics byte-identical; the existing docblock already describes the rule.

### D5 — JS on 4-space `et` (F10) — 25 files + hook + eslint

- Convert tabs → 4 spaces and flip the vim modeline `noet` → `et` in all
  25 first-party JS files: `packages/prism-core/scripts/**` (10),
  `packages/prism-php-web/scripts/**` (5), `tests/Node/**` (10).
- `commitlint.config.js`: modeline `noet` → `et` (already flat, no
  indentation to convert).
- `eslint.config.mjs`: convert tabs → 4 spaces; add the RCS header and the
  `// vim: ft=javascript sts=4 sw=4 ts=4 et :` modeline manually (the
  pre-commit hook's extension map has no `.mjs` case).
- Root `package.json`: convert tabs → 2 spaces to match the other 17 JSON
  files in the repo.
- `.github/hooks/pre-commit`: the `js)` modeline mapping changes
  `noet` → `et` — **required in the same commit**, or the hook re-appends
  `noet` on the next commit of any JS file and fights the conversion.
- `eslint.config.mjs`: add `"indent": ["error", 4]` to the block covering
  `commitlint.config.js`, `packages/**/*.js`, `tests/Node/**/*.js` — the
  mechanical backstop the audit's F2 suggested; enforced by the pre-commit
  eslint run. The dead `cdn/js` block stays as-is.

### D6 — `.editorconfig` (F10)

New repo-root `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{js,cjs,mjs,ts,php,sh}]
indent_style = space
indent_size = 4

[*.scss]
indent_style = space
indent_size = 2

[*.{json,jsonc}]
indent_style = space
indent_size = 2
```

The `[*.md]` override preserves markdown hard line breaks (two trailing
spaces). Every rule matches a verified modeline or observed file content.

### D7 — Padding collapse (F11) — all touched files

Collapse the variable-width blank runs to the canonical form (header + one
blank line; one blank line + modeline) in: `pre-tool-use.ts`,
`sensitive-paths.ts`, `denial-circuit-breaker.ts`, `index.ts`,
`tool-call-handler.ts`, `backend/env.php`, `.github/scripts/coverage-gate.php`,
all 25 converted JS files, `commitlint.config.js`, and `eslint.config.mjs`.
Verified not load-bearing: the pre-commit hook strips only the
header/modeline lines and rebuilds them around the body, so the collapse is
stable across future commits.

### D8 — Tests

No new test files. The change is zero-behavior-delta by construction; the
existing suites are the regression net:

- `tests/Node/safety-classify.test.ts` — updated for D3 (sentinel removal).
- `tests/Node/safety-sensitive-paths.test.ts`, `safety-circuit-breaker.test.ts`,
  `safety-tool-call-handler.test.ts` — unchanged, must stay green (they
  exercise the renamed code paths).
- `tests/Unit/LoadEnvTest.php` — unchanged, must stay green (D4 is a pure
  rename).
- All `tests/Node/*.test.js` — must stay green through the D5 whitespace
  conversion (they execute the converted sources).

## Verification

1. `npm run test:node` — the full Node suite (all `tests/Node/*.test.js`
   + `*.test.ts`) green.
2. PHP suite — `vendor/bin/pest` green; `tests/Unit/LoadEnvTest.php` covers
   the D4 path.
3. `npx eslint commitlint.config.js packages tests/Node` — clean with the
   new `indent: 4` rule (the pre-commit hook enforces the same).
4. `/check-php` — php-cs-fixer, stylelint, eslint, Pest coverage ≥ 80%.
5. `code-review` before push (suggest Ctrl+P to the judge model).

## Risks & decisions

- **F10's footprint is 25 files / ~4,500 tab lines** — the diff is large
  but semantically empty, and every converted file is executed by the
  existing test suite. Chosen over the audit-scoped alternative (prism-core
  scripts only) because a partial conversion would leave the tree with two
  JS standards while `.editorconfig` declared one.
- **Hook modeline change lands in the same commit as the conversions** —
  otherwise the hook re-appends `noet` and reverts the modelines on the
  next JS commit.
- **eslint `indent` backstop lands with the conversions** — pre-commit runs
  eslint on staged JS; the rule and the conversion must reach the staged
  state together or the hook blocks the commit.
- **F6 is an internal API change** — `classifyCommand`'s return type
  simplifies, but its consumers are verified by grep to be
  `tool-call-handler.ts` and the Node tests only; no pi-external surface.
- **Root `package.json` converts to 2-space** — matches the other 17 JSON
  files; recorded in `.editorconfig` so editors agree.
- **`eslint.config.mjs` gets header + modeline manually** — the hook's
  extension map lacks `.mjs`; the file otherwise violates the RCS-header
  policy.
- **Spec rides the work branch** — develop is PR-only (protected-branch
  invariant); the spec commits on the refactor branch and merges via PR,
  like the prior remediations.
- **One branch, atomic commits per finding** — `refactor(safety): …`,
  `refactor(env): …`, `style(scripts): …`, `chore(editorconfig): …`,
  `style: …`, each independently reviewable under this spec.
