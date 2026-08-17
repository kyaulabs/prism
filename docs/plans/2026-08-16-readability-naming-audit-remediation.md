# Readability & Naming Audit Remediation Implementation Plan

> **Status:** Complete — all tasks green at b1f48ee (2026-08-16): node 156/156,
> Pest 77 passed at 100.0% coverage, php-cs-fixer/stylelint/eslint clean.

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [x]`) syntax for
> tracking. This plan is a **zero-behavior-delta refactor** — spec D8 adds no
> new tests, so each task's cycle is baseline-green → change → suite-green →
> commit (the existing suites are the regression net; a forced Red step would
> be meaningless for pure renames).

**Goal:** Remediate audit findings F4–F11 (readability/naming) with zero
behavior delta on any classify outcome, env parse result, or test expectation.

**Architecture:** Five pure-rename/API-shape tasks in the safety module
(`extensions/safety/`), one rename in `backend/env.php`, one mechanical
whitespace-conversion task for all first-party JS plus the pre-commit hook's
modeline and the eslint backstop, a new `.editorconfig`, and one padding
collapse across every touched file.

**Tech Stack:** TypeScript (Node 24 native type stripping, `node --test`),
PHP 8.5 (Pest 5), eslint 10, perl for mechanical whitespace conversion.

## Global constraints

- **No behavior delta.** Every task must leave all existing allow/block
  outcomes, env parse results, and test expectations identical.
- **Signed commits** (`git commit -S`) with the full footer block
  (Authored-by / Implemented-by / Tested-by / Signed-off-by) — resolve
  identity via `bash packages/prism-core/scripts/resolve-identity.sh`.
- Branch: `refactor/kyau-2234-readability-naming-remediation` (already
  created; spec committed).
- Node tests: `npm run test:node` (full) or
  `node --test tests/Node/<file>.test.ts` (focused).
- PHP tests: `vendor/bin/pest` (full) or
  `vendor/bin/pest tests/Unit/LoadEnvTest.php` (focused).
- ESLint: `npx eslint commitlint.config.js packages tests/Node`.
- Existing files keep their `$KYAULabs:` header lines unchanged. New header
  (eslint.config.mjs only): `// $KYAULabs: eslint.config.mjs kyau@aura.kyaulabs 2026/08/16 Exp $`
  with modeline `// vim: ft=javascript sts=4 sw=4 ts=4 et :`.
- Every task ends with exactly one commit; never bundle tasks.

---

### Task 1: Rename `basename` to `commandBasename` (F4)

**Files:**
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts` (function
  def ~line 59; call sites ~lines 72, 102, 290, 300)

**Interfaces:**
- Consumes: nothing.
- Produces: `function commandBasename(token: string): string` — private to
  `pre-tool-use.ts`, same semantics as the old `basename` (last-`/` segment
  of a command token).

- [x] **Step 1: Baseline — run the safety tests**

Run: `node --test tests/Node/safety-classify.test.ts tests/Node/safety-sensitive-paths.test.ts tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-circuit-breaker.test.ts`
Expected: all pass (baseline green).

- [x] **Step 2: Rename**

Replace the definition:

```ts
function basename(token: string): string {
```

with:

```ts
function commandBasename(token: string): string {
```

Then replace each remaining occurrence of `basename(` (not preceded by
`command`) in this file — 4 call sites:

```ts
    if (i >= tokens.length || commandBasename(tokens[i]) !== "rm") return null;
        if (commandBasename(tokens[i]) === "rm") return i;
    if (commandBasename(tokens[0]) !== "find") return null;
            if (commandBasename(tokens[i + 1]) === "rm") {
```

Do NOT touch `sensitive-paths.ts` (its `basename` is the real
`node:path` import).

- [x] **Step 3: Run the safety tests**

Run: same command as Step 1.
Expected: all pass. `grep -n "basename" packages/prism-core/extensions/safety/pre-tool-use.ts` shows only `commandBasename` + the import line's `resolvePathToken` import is untouched.

- [x] **Step 4: Commit**

```bash
git add packages/prism-core/extensions/safety/pre-tool-use.ts
git commit -S -m $'refactor(safety): rename basename to commandBasename\n\nLocal helper shadowed node:path basename imported by sibling\nsensitive-paths.ts with different semantics (audit F4).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: Expand one-letter locals in `sensitive-paths.ts` + name the walk bound (F5 + F8)

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts`

**Interfaces:**
- Consumes: nothing (all renames are private).
- Produces: `const MAX_CANONICALIZE_STEPS = 64` (module-private, used by
  `canonicalizePath`); all public signatures unchanged.

- [x] **Step 1: Baseline**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts tests/Node/safety-classify.test.ts`
Expected: all pass.

- [x] **Step 2: `normalizeRaw` — `p` → `expanded`**

```ts
function normalizeRaw(raw: string, home: string): string {
    const expanded = raw.startsWith("~/") ? home + "/" + raw.slice(2) : raw;
    return normalize(expanded).replace(/\/+$/, "");
}
```

- [x] **Step 3: `sensitivePathMatch` — `p` → `canonical`, `pat` → `patternPath`**

```ts
export function sensitivePathMatch(absPath: string, opts: SensitivePathOptions): SensitiveMatch | null {
    const canonical = canonicalizePath(absPath);
    const name = basename(canonical);
    if (isEnvBasename(name)) return { className: "env" };
    if (name === "auth.json" || name === "mcp-auth.json") return { className: "opencode-auth-store" };
    for (const pattern of DEFAULT_PATTERNS) {
        const patternPath = canonicalizePath(normalizeRaw(pattern.raw, opts.home));
        if (canonical === patternPath || (pattern.dir && canonical.startsWith(patternPath + "/"))) return { className: pattern.className };
    }
    for (const raw of opts.extraPaths ?? []) {
        const patternPath = canonicalizePath(normalizeRaw(raw, opts.home));
        const dir = raw.endsWith("/");
        if (canonical === patternPath || (dir && canonical.startsWith(patternPath + "/"))) return { className: "additional" };
    }
    return null;
}
```

- [x] **Step 4: `sensitivePatternCheck` — `p` → `trimmed`**

```ts
    const trimmed = pattern.trim();
    if (trimmed === "") return null;
    const expanded = trimmed.startsWith("~") ? opts.home + trimmed.slice(1) : trimmed;
    const metaIdx = expanded.search(/[*?[{]/);
    const probe = metaIdx !== -1 && !expanded.startsWith("/") ? expanded.slice(0, metaIdx) : expanded;
    const abs = probe.startsWith("/") ? probe : resolvePath(base, probe);
    const match = sensitivePathMatch(abs, opts);
    if (match) return match;
    if (trimmed.endsWith(".env.example")) return null;
    if (SENSITIVE_FALLBACK_RE.test(trimmed)) return { className: "dynamic" };
    return null;
```

(`metaIdx`/`probe`/`abs` stay — multi-letter abbreviations the audit
blessed.)

- [x] **Step 5: `resolvePathToken` — `p` → `path`**

```ts
export function resolvePathToken(token: string, projectDir: string, home: string,
                                 opts: { rejectAssignments?: boolean } = {}): string | null {
    let path = token.trim();
    if (
        (path.startsWith('"') && path.endsWith('"')) ||
        (path.startsWith("'") && path.endsWith("'"))
    ) {
        path = path.slice(1, -1);
    }
    if (path.startsWith("~")) path = home + path.slice(1);
    if (opts.rejectAssignments && path.includes("=")) return null;
    if (/[*?$`(<]/.test(path)) return null;
    return normalize(resolvePath(projectDir, path));
}
```

- [x] **Step 6: `setupScriptTrust` — `t` → `token`**

```ts
    for (; i < tokens.length; i++) {
        const token = tokens[i];
        if (isOptionToken(token)) continue;
        const name = basename(token);
        if (depth > 0) return SETUP_SCRIPTS.has(name) ? "untrusted-subcommand" : "none";
        if (!SETUP_SCRIPTS.has(name)) return "none";
        const resolved = token.startsWith("~") ? normalize(opts.home + token.slice(1)) : normalize(resolvePath(opts.projectDir, token));
        const scriptsDir = normalize(resolvePath(opts.projectDir, ".github/scripts"));
        return resolved.startsWith(scriptsDir + "/") ? "trusted" : "none";
    }
```

- [x] **Step 7: F8 — name the magic `64`**

Add immediately above `canonicalizePath`:

```ts
/** Max ancestor hops when walking up to an existing realpath-able prefix. */
const MAX_CANONICALIZE_STEPS = 64;
```

and change the loop bound:

```ts
    for (let i = 0; i < MAX_CANONICALIZE_STEPS; i++) {
```

- [x] **Step 8: Run the safety tests**

Run: same as Step 1.
Expected: all pass.

- [x] **Step 9: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts
git commit -S -m $'refactor(safety): expand one-letter locals; name walk bound\n\np had three distinct meanings across normalizeRaw, sensitivePathMatch,\nsensitivePatternCheck, resolvePathToken; t shadowed token in two loops.\nCanonicalize walk cap 64 becomes MAX_CANONICALIZE_STEPS (audit F5/F8).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: Expand one-letter locals in classifier and handler (F5)

**Files:**
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts` (parseRmTokens)
- Modify: `packages/prism-core/extensions/safety/tool-call-handler.ts` (sensitivePathBlocks)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (private locals only).

- [x] **Step 1: Baseline**

Run: `node --test tests/Node/safety-classify.test.ts tests/Node/safety-tool-call-handler.test.ts`
Expected: all pass.

- [x] **Step 2: `pre-tool-use.ts` `parseRmTokens` — `t` → `token`**

In the operand loop:

```ts
    for (; i < tokens.length; i++) {
        const token = tokens[i];
        if (!onlyOperands && token === "--") {
            onlyOperands = true;
            continue;
        }
        if (!onlyOperands && token.startsWith("-") && token.length > 1) {
            if (token.startsWith("--")) {
                if (token === "--recursive") recursive = true;
                else if (token === "--force") force = true;
            } else {
                const chars = token.slice(1);
                if (chars.includes("r") || chars.includes("R")) recursive = true;
                if (chars.includes("f")) force = true;
            }
            continue;
        }
        operands.push(token);
    }
```

- [x] **Step 3: `tool-call-handler.ts` `sensitivePathBlocks` — `p` → `path`**

```ts
    const path = pathArg.replace(/^@+/, "");
    if (path === "") return false;
    const abs = path.startsWith("~")
        ? normalize(opts.home + path.slice(1))
        : normalize(resolvePath(opts.projectDir, path));
```

- [x] **Step 4: Run the safety tests**

Run: same as Step 1.
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/pre-tool-use.ts packages/prism-core/extensions/safety/tool-call-handler.ts
git commit -S -m $'refactor(safety): expand one-letter locals in classifier and handler\n\nparseRmTokens loop local t and sensitivePathBlocks p were single-letter\nbindings carrying domain meaning (audit F5).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: Return `Finding | null` from the classifier (F6)

**Files:**
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts`
- Modify: `packages/prism-core/extensions/safety/tool-call-handler.ts`
- Test: `tests/Node/safety-classify.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type Severity = "block" | "warn";
  export interface Finding { severity: Severity; reason: string; }
  export function classifyCommand(command: string, opts: ClassifyOptions): Finding | null;
  ```
  The `SEGMENT_RULES`/`COMMAND_RULES` signatures are unchanged (already
  `Finding | null`).

- [x] **Step 1: Write the failing (updated) tests**

Edit `tests/Node/safety-classify.test.ts`:

Delete the sentinel constant:

```ts
const CLEAN = { severity: null, reason: "" };
```

Replace every `assert.deepEqual(classifyCommand(<expr>, OPTS), CLEAN);` with
`assert.equal(classifyCommand(<expr>, OPTS), null);` — 17 sites (the empty
command + 16 clean-path assertions listed in the spec, D3).

Replace the final test:

```ts
test("non-string command fails closed", () => {
    const f = classifyCommand(undefined as unknown as string, OPTS);
    assert.equal(f?.severity, "block");
    assert.match(f?.reason ?? "", /internal error/);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: FAIL — type/runtime errors referencing the removed `CLEAN` (the
test file references a now-undefined constant), proving the shape change.

- [x] **Step 3: Implement**

`pre-tool-use.ts`:

```ts
export type Severity = "block" | "warn";
```

```ts
export function classifyCommand(command: string, opts: ClassifyOptions): Finding | null {
    // Empty command = nothing to evaluate (preserved from original fail-open contract)
    if (typeof command === "string" && command.length === 0) {
        return null;
    }
    try {
        return classifyCommandImpl(command, opts, 0);
    } catch {
        return { severity: "block", reason: "safety classifier internal error — failing closed per #178 / ADR-0036" };
    }
}
```

```ts
function classifyCommandImpl(command: string, opts: ClassifyOptions, depth: number): Finding | null {
    if (depth > MAX_UNWRAP_DEPTH) {
        return { severity: "block", reason: "nested wrapper depth exceeded — failing closed" };
    }
    ...
        if (innerFinding !== null) return innerFinding;
    ...
    return null;
}
```

(The unwrap recursion check changes from `innerFinding.severity !== null`
to `innerFinding !== null`; the final clean return becomes `null`. The rule
arrays and per-rule functions are unchanged.)

`tool-call-handler.ts` (bash branch):

```ts
            const finding = classifyCommand(command, { projectDir: deps.cwd, safeRelDirs: deps.safeRelDirs });
            if (finding?.severity === "block") {
                noteBashDenial(deps.sid, deps);
                return { block: true, reason: `[prism safety] BLOCKED: ${finding.reason}` };
            }
            if (finding?.severity === "warn") {
                deps.notify?.(`[prism safety] WARNING: ${finding.reason}`, "warning");
            }
            return;
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/Node/safety-classify.test.ts tests/Node/safety-sensitive-paths.test.ts tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-circuit-breaker.test.ts`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/pre-tool-use.ts packages/prism-core/extensions/safety/tool-call-handler.ts tests/Node/safety-classify.test.ts
git commit -S -m $'refactor(safety): return Finding | null from classifier\n\nSeverity no longer carries null; absence is explicit at the function\nboundary instead of the { severity: null, reason: "" } sentinel (audit F6).\nOnly consumers are tool-call-handler.ts and the Node tests (grep-verified).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: Drop dead `parseRm`; name `rmNotAtHead` (F9)

**Files:**
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts`

**Interfaces:**
- Consumes: Task 1's `commandBasename` (call sites above remain intact).
- Produces: nothing new.

- [x] **Step 1: Baseline**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: all pass.

- [x] **Step 2: Delete the dead wrapper**

Remove (the F1 restructure orphaned it — verified zero callers, zero test
references):

```ts
function parseRm(segment: string): ParsedRm | null {
    const tokens = tokenizeCommand(segment);
    return parseRmTokens(tokens, 0);
}
```

`tokenizeCommand` remains used by `classifyCommandImpl` — the import stays.

- [x] **Step 3: Name the `foundIdx > 0` tests**

In `rmRfRule`, insert after the `if (!parsed) { … }` block:

```ts
    // rm appeared behind a wrapper (xargs, timeout, …)
    const rmNotAtHead = foundIdx > 0;
```

and replace both `foundIdx > 0` uses:

```ts
    if (parsed.operands.length === 0) {
        if (rmNotAtHead || tokens[0] === "xargs") {
```

- [x] **Step 4: Run the safety tests**

Run: `node --test tests/Node/safety-classify.test.ts tests/Node/safety-sensitive-paths.test.ts tests/Node/safety-tool-call-handler.test.ts`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/pre-tool-use.ts
git commit -S -m $'refactor(safety): drop dead parseRm; name rmNotAtHead\n\nThe F1 rule-table restructure orphaned the parseRm wrapper; rmRfRule\nnow calls parseRmTokens directly. foundIdx > 0 expressed as rmNotAtHead\nso the wrapped-rm case reads as intent (audit F9).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: `$commentStart` in `parse_env_value` (F7)

**Files:**
- Modify: `backend/env.php` (`parse_env_value`, ~line 95)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (same `string` → `string` signature; semantics
  byte-identical).

- [x] **Step 1: Baseline**

Run: `vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: all pass.

- [x] **Step 2: Rename `$cut` → `$commentStart`**

Replace the unquoted-comment block:

```php
    // Unquoted: locate the first `#` that starts the value or follows
    // whitespace. `FOO=a#b` is preserved (no whitespace before the `#`).
    $commentStart = null;

    if ($value !== '' && $value[0] === '#') {
        $commentStart = 0;
    } else {
        foreach ([' #', "\t#"] as $marker) {
            $at = strpos($value, $marker);

            if ($at !== false) {
                $commentStart = $at + 1;
                break;
            }
        }
    }

    if ($commentStart !== null) {
        $value = substr($value, 0, $commentStart);
    }
```

- [x] **Step 3: Run the env tests**

Run: `vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: all pass.

- [x] **Step 4: Commit**

```bash
git add backend/env.php
git commit -S -m $'refactor(env): name comment offset as $commentStart\n\nparse_env_value cut held an int-or-false offset; commentStart names what\nit is and null makes absence explicit (audit F7).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 7: Convert all first-party JS to 4-space `et` (F10 — code)

**Files:**
- Modify (convert tabs → 4 spaces + modeline `noet` → `et`): all 25:
  `packages/prism-core/scripts/glob-match.js`, `check-peer-deps.js`,
  `frontmatter-parser.js`, `jsonc-strip.js`, `prism-tool.js`,
  `prism-tool/cli.js`, `prism-tool/contract.js`, `prism-tool/discovery.js`,
  `prism-tool/preflight.js`, `prism-tool/process.js`,
  `packages/prism-php-web/scripts/prism-tool-adapter.js`,
  `packages/prism-php-web/scripts/toolchain/{audit,project,transaction,workspace}.js`,
  `tests/Node/helpers.js`, `check-peer-deps.test.js`,
  `prism-tool-apply.test.js`, `prism-tool-discovery.test.js`,
  `prism-tool-preflight.test.js`, `prism-tool-resolve.test.js`,
  `prism-tool-run.test.js`, `source-toolchain-parity.test.js`,
  `toolchain-contract.test.js`, `toolchain-packaging.test.js`
- Modify: `commitlint.config.js` (modeline only), `eslint.config.mjs`
  (convert + add RCS header + modeline + `indent` rule),
  root `package.json` (tabs → 2 spaces), `.github/hooks/pre-commit`
  (js modeline mapping)

**Interfaces:**
- Consumes: nothing.
- Produces: the repo's JS policy — 4-space `et` everywhere, enforced by
  eslint for `packages/**/*.js` + `tests/Node/**/*.js` + `commitlint.config.js`.

- [x] **Step 1: Convert the 25 JS files (leading tabs only)**

```bash
cd /home/kyau/projects/kyaulabs/prism
JS_FILES=$(find packages tests/Node -name '*.js' -not -path '*/node_modules/*')
for f in $JS_FILES; do perl -pi -e '1 while s/^\t/    /' "$f"; done
```

Verified: no mid-line tabs exist in any of the 25 files, so leading-tab-only
conversion cannot alter string literals.

- [x] **Step 2: Flip the modelines `noet` → `et` (25 files + commitlint.config.js)**

```bash
cd /home/kyau/projects/kyaulabs/prism
JS_FILES=$(find packages tests/Node -name '*.js' -not -path '*/node_modules/*')
for f in $JS_FILES; do
    perl -pi -e 's/sts=4 sw=4 ts=4 noet/sts=4 sw=4 ts=4 et/' "$f"
done
perl -pi -e 's/sts=4 sw=4 ts=4 noet/sts=4 sw=4 ts=4 et/' commitlint.config.js
```

- [x] **Step 3: Convert root `package.json` (tabs → 2 spaces)**

```bash
perl -pi -e '1 while s/^\t/  /' package.json
```

- [x] **Step 4: Convert `eslint.config.mjs` + add header, modeline, indent rule**

```bash
perl -pi -e '1 while s/^\t/    /' eslint.config.mjs
```

Add the RCS header as line 1, followed by exactly one blank line, then the
first import:

```js
// $KYAULabs: eslint.config.mjs kyau@aura.kyaulabs 2026/08/16 Exp $

import js from "@eslint/js";
```

Append the modeline at end of file (one blank line above it):

```js
// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Add the backstop to the second config block (the one with
`files: ["commitlint.config.js", "packages/**/*.js", "tests/Node/**/*.js"]`):

```js
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "indent": ["error", 4],
        },
```

(4-space indentation shown — matches the converted file.)

- [x] **Step 5: Update the pre-commit hook's JS modeline**

`.github/hooks/pre-commit` line ~224:

```sh
			js)    ML="// vim: ft=javascript sts=4 sw=4 ts=4 et :" ;;
```

This MUST land in this same commit — otherwise the hook re-appends `noet`
on the next commit of any JS file.

- [x] **Step 6: Verify — eslint + full Node suite**

Run: `npx eslint commitlint.config.js packages tests/Node`
Expected: clean (exit 0), with the new `indent` rule active.

Run: `npm run test:node`
Expected: all pass (whitespace-only change; the suite executes the converted
sources).

- [x] **Step 7: Commit**

```bash
git add packages tests/Node commitlint.config.js eslint.config.mjs package.json .github/hooks/pre-commit
git commit -S -m $'style(scripts): convert JS sources to 4-space et\n\nAll first-party JS (packages scripts, prism-php-web toolchain, tests)\nconvert from tabs to 4-space with et modelines; pre-commit hook js\nmodeline and eslint indent backstop land in the same commit so the\nconversion cannot be reverted by the next commit (audit F10).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 8: Add `.editorconfig` (F10 — config)

**Files:**
- Create: `.editorconfig`

**Interfaces:**
- Consumes: Task 7's policy (JS = 4-space et, JSON = 2-space, scss = 2-space).
- Produces: repo-root editor contract.

- [x] **Step 1: Create the file**

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

Every rule matches a verified modeline or observed file content; the
`[*.md]` override preserves markdown hard line breaks.

- [x] **Step 2: Verify — no tooling consumes it yet, so sanity-check only**

Run: `node -e "const fs=require('fs'); console.log(fs.readFileSync('.editorconfig','utf8').split('\n').length + ' lines')"`
Expected: file reads back; 30 lines.

- [x] **Step 3: Commit**

```bash
git add .editorconfig
git commit -S -m $'chore(editorconfig): add per-language indentation rules\n\nDeclares the verified repo conventions: 4-space for js/cjs/mjs/ts/php/sh,\n2-space for scss and json, lf, final newline, md trailing-space exception\n(audit F10).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 9: Collapse RCS-header blank padding (F11)

**Files:**
- Modify (padding only): `packages/prism-core/extensions/safety/pre-tool-use.ts`,
  `sensitive-paths.ts`, `denial-circuit-breaker.ts`, `index.ts`,
  `tool-call-handler.ts`, `backend/env.php`, `.github/scripts/coverage-gate.php`,
  all 25 JS files from Task 7, `commitlint.config.js`, `eslint.config.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: canonical header spacing — exactly one blank line after the
  `$KYAULabs:` header line, exactly one blank line before the vim modeline.

- [x] **Step 1: Collapse header padding**

For each file above: reduce the blank run between the `$KYAULabs:` header
line and the first body line to exactly one blank line. Current runs:
pre-tool-use.ts 16, env.php 14, coverage-gate.php 5, index.ts 5,
tool-call-handler.ts 3, denial-circuit-breaker.ts 2, sensitive-paths.ts 1
(already canonical — leave), JS files 3–7 (variable), commitlint.config.js 2.
`eslint.config.mjs`: its header (Task 7) must be followed by exactly one
blank line.

- [x] **Step 2: Collapse trailing padding**

For each file above: reduce the blank run before the `vim:` modeline to
exactly one blank line. Current runs: sensitive-paths.ts 21, denial-circuit-
breaker.ts 7, pre-tool-use.ts 6, tool-call-handler.ts 6, index.ts 5,
env.php 5, coverage-gate.php 2. JS files: apply the same rule.

- [x] **Step 3: Verify — full suites**

Run: `npm run test:node` and `vendor/bin/pest`
Expected: all pass (padding is body — the pre-commit hook strips and
rebuilds only header/modeline lines, verified).

- [x] **Step 4: Commit**

```bash
git add packages/prism-core/extensions/safety backend/env.php .github/scripts/coverage-gate.php packages tests/Node commitlint.config.js eslint.config.mjs
git commit -S -m $'style: collapse RCS-header blank padding\n\nVariable-width blank runs after headers and before modelines collapse to\nthe canonical one-blank form the pre-commit normalizer emits; padding is\nbody, not load-bearing (audit F11).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 10: Final verification + plan completion

**Files:**
- Modify: `docs/plans/2026-08-16-readability-naming-audit-remediation.md`
  (checkbox states)

**Interfaces:**
- Consumes: all tasks above.

- [x] **Step 1: Full gate**

Run: `npm run test:node` — all green.
Run: `vendor/bin/pest` — all green (coverage ≥ 80% on changed files via
`/check-php`).
Run: `npx eslint commitlint.config.js packages tests/Node` — clean.
Run: `/check-php` — full gate green.

- [x] **Step 2: Mark the plan complete**

Set every checkbox in this plan to `- [x]` and add a completion note at the
top: `**Status:** Complete — all tasks green at <commit> (2026-08-16).`

- [x] **Step 3: Commit**

```bash
git add docs/plans/2026-08-16-readability-naming-audit-remediation.md
git commit -S -m $'docs(plans): mark readability-naming audit remediation tasks complete\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

- [x] **Step 4: Hand off**

Present the branch for `code-review` (suggest Ctrl+P to the judge model)
before push, per the spec's verification section.
