# Issue #36: Harden session-bootstrap.ts + Fix RCS-Header Policy Contradiction

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Wrap `session-bootstrap.ts` readFileSync in try/catch so missing
bootstrap doc emits a warning instead of breaking plugin init; resolve RCS-header
policy contradiction by aligning AGENTS.md, the pre-commit hook, and the
rcs-header skill on a single, consistently-enforced rule.

**Architecture:** The plugin fix is a defensive try/catch returning an empty
hooks object. The policy fix extends the RCS system to `.ts` files, drops the
`.opencode/` exclusion from the pre-commit hook, and adds missing headers to
three files. A new JS test runner (`tsx` + `node:test`) provides regression
coverage for the plugin.

**Tech Stack:** TypeScript (plugin), Bash (pre-commit hook, fetch.sh), PHP
(.php-cs-fixer.dist.php), Markdown (skill/AGENTS.md docs), tsx + node:test
(JS test runner).

## Global constraints

- PHP 8.5+, Pest v4 for PHP tests; new JS tests use `tsx` + `node:test`
- RCS header format per `rcs-header` skill — one-time creation stamp, never updated
- TS indentation: 4-space (matching existing `session-bootstrap.ts`)
- `/check` gate must pass (including new JS test step) at plan completion
- Signed conventional commits required
- No explanatory inline comments unless explicitly requested

---

### Task A: Extend RCS-header system to `.ts` and drop `.opencode/` exclusion

**Files:**
- Modify: `.opencode/skills/rcs-header/SKILL.md:12-49`
- Modify: `.opencode/docs/conventions.md` (Indentation table)
- Modify: `.github/hooks/pre-commit:87-134`
- Modify: `AGENTS.md:76-83`

**Interfaces:**
- Produces: `.ts` is now a supported RCS extension. Pre-commit no longer excludes `.opencode/`. AGENTS.md states policy once with exemptions.

- [ ] **Step 1: Update rcs-header skill**

Extend line 12 to include `.ts`:
```
Applies to **source files only**: `.php`, `.js`, `.scss`, `.sh`, `.ts`. Markdown, JSON,
YAML, and other non-source files do not carry RCS headers.
```

Add TS format after Bash line:
```
TS:   // $KYAULabs: filename.ts creator@host YYYY/MM/DD ±TZ Exp $
```

Add TS modeline after Bash line:
```
TS:   // vim: ft=typescript sts=4 sw=4 ts=4 et :
```

Add TS placement after SCSS/JS:
```
- **TS**: first line of the file.
```

- [ ] **Step 2: Update conventions.md**

Add TS row to indentation table: `TS | 4-space`.

- [ ] **Step 3: Update pre-commit hook**

Line 87: `'\.(php|js|scss|sh)$'` → `'\.(php|js|scss|sh|ts)$'`
Line 88: drop `\.opencode/|` from exclusion grep.

Add `ts)` case to header block (after `sh)`):
```bash
ts)   HDR="// \$KYAULabs: $FNAME $CREATOR@$HOSTNAME $DATESTR Exp \$" ;;
```

Add `ts)` case to modeline block (after `sh)`):
```bash
ts)   ML="// vim: ft=typescript sts=4 sw=4 ts=4 et :" ;;
```

- [ ] **Step 4: Update AGENTS.md Commenting**

Change lines 78-83 to:
```
> - Every source file (`.php`, `.js`, `.scss`, `.sh`, `.ts`) starts with an
>   RCS-style header — see `rcs-header` skill. Exempt: `vendor/`, `node_modules/`,
>   `aurora/`, and generated `cdn/css/` + `cdn/javascript/` files.
> - Every source file ends with a vim modeline — see `rcs-header` skill
> - PHP classes/methods: PHPDoc (PSR-5) with params, return types, exceptions
> - No explanatory comments unless explicitly requested
```

- [ ] **Step 5: Commit A**

```bash
git add .opencode/skills/rcs-header/SKILL.md .opencode/docs/conventions.md .github/hooks/pre-commit AGENTS.md
git commit -S -m $'fix: extend rcs-header system to .ts and drop .opencode/ exclusion\n\nAlign AGENTS.md, the rcs-header skill, and the pre-commit hook on a\nsingle, consistently-enforced RCS-header policy. .ts files are now\nsupported; the .opencode/ exclusion is removed.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task B: Harden session-bootstrap.ts via @tdd

**Files:**
- Create: `tests/Plugin/session-bootstrap.test.ts`
- Modify: `.opencode/plugins/session-bootstrap.ts:22`
- Modify: `package.json` (add `tsx` devDep), `package-lock.json`

**Interfaces:**
- Consumes: `.ts` RCS convention from Task A.
- Produces: `session-bootstrap.ts` returns `{}` on readFileSync failure with a console.warn. Test in `tests/Plugin/` exercises missing-file and happy-path.

Dispatch to `@tdd` agent with the following task specification:

---

**B1. Add tsx devDep**

```bash
npm install --save-dev tsx
```
Regenerate `package-lock.json`.

**B2. Red — write `tests/Plugin/session-bootstrap.test.ts`**

```ts
// $KYAULabs: session-bootstrap.test.ts kyau@nova 2026/07/07 -0700 Exp $

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We import the raw module and call SessionBootstrap with a crafted directory
// to test both paths.  Because the plugin reads from `directory/.opencode/docs/session-bootstrap.md`,
// we create temp dirs with and without that file.

let warnCalls: string[] = [];
const originalWarn = console.warn;

async function loadPlugin(dir: string) {
    // Dynamic import so each test gets a fresh module (node caches per path;
    // we work around by reading the source and using a temp copy).  For
    // simplicity, we call the function directly by importing once and
    // varying the directory arg.
    const mod = await import("../../.opencode/plugins/session-bootstrap.ts");
    return mod.SessionBootstrap;
}

describe("SessionBootstrap plugin", () => {
    let tempDir: string;

    beforeEach(() => {
        warnCalls = [];
        console.warn = (...args: unknown[]) => {
            warnCalls.push(args.map(a => String(a)).join(" "));
        };
        tempDir = mkdtempSync(join(tmpdir(), "session-bootstrap-test-"));
    });

    afterEach(() => {
        console.warn = originalWarn;
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns empty hooks and warns when session-bootstrap.md is missing", async () => {
        const SessionBootstrap = await loadPlugin(tempDir);
        // Do NOT create .opencode/docs/session-bootstrap.md
        const result = await SessionBootstrap({ directory: tempDir });

        assert.deepStrictEqual(result, {});
        assert.ok(
            warnCalls.some(msg =>
                msg.includes("session-bootstrap.md") &&
                msg.includes("could not read")
            ),
            `Expected warning about missing bootstrap doc, got: ${JSON.stringify(warnCalls)}`
        );
    });

    it("returns hooks that push bootstrap text when file exists", async () => {
        const docsDir = join(tempDir, ".opencode", "docs");
        mkdirSync(docsDir, { recursive: true });
        writeFileSync(join(docsDir, "session-bootstrap.md"), "# Test bootstrap content", "utf-8");

        const SessionBootstrap = await loadPlugin(tempDir);
        const result = await SessionBootstrap({ directory: tempDir });

        assert.ok(result["experimental.chat.system.transform"], "should have system.transform hook");
        assert.ok(result["experimental.session.compacting"], "should have session.compacting hook");

        const outputSystem: unknown[] = [];
        await result["experimental.chat.system.transform"](
            {},
            { system: outputSystem },
        );
        assert.strictEqual(outputSystem.length, 1);
        assert.strictEqual(outputSystem[0], "# Test bootstrap content");

        const outputContext: unknown[] = [];
        await result["experimental.session.compacting"](
            {},
            { context: outputContext },
        );
        assert.strictEqual(outputContext.length, 1);
        assert.strictEqual(outputContext[0], "# Test bootstrap content");
    });
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
```

Run: `node --import tsx --test tests/Plugin/session-bootstrap.test.ts`
Expected: **FAIL** — the import of session-bootstrap.ts triggers readFileSync which throws when the file is missing (the module eagerly evaluates `readFileSync`, so even before the test runs, the import itself breaks). This confirms the bug.

- [ ] **Step 2: Green — fix session-bootstrap.ts**

Replace line 22:
```ts
const bootstrap = readFileSync(bootstrapPath, "utf-8");
```
with:
```ts
let bootstrap = "";
try {
    bootstrap = readFileSync(bootstrapPath, "utf-8");
} catch (err: unknown) {
    console.warn(
        `[session-bootstrap] could not read ${bootstrapPath}: ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        `Anti-drift bootstrap disabled for this session.`
    );
    return {};
}
```

Also add RCS header at top of file (per Task A .ts convention):
```
// $KYAULabs: session-bootstrap.ts kyau@nova 2026/07/07 -0700 Exp $
```
...and vim modeline at end:
```
// vim: ft=typescript sts=4 sw=4 ts=4 et :
```

Run test → **PASS**.

- [ ] **Step 3: Commit B**

```bash
git add package.json package-lock.json tests/Plugin/ .opencode/plugins/session-bootstrap.ts
git commit -S -m $'fix: harden session-bootstrap.ts against missing bootstrap doc\n\nWrap readFileSync in try/catch so a missing session-bootstrap.md emits a\nconsole warning and returns {} instead of throwing and breaking plugin init.\n\nAdd tsx devDep and node:test-based test coverage for both missing-file and\nhappy-path scenarios.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task C: Add missing RCS headers to fetch.sh and .php-cs-fixer.dist.php

**Files:**
- Modify: `.opencode/skills/opencode-docs/fetch.sh`
- Modify: `.php-cs-fixer.dist.php`

- [ ] **Step 1: Add header to fetch.sh**

After shebang (line 1), insert RCS header, then blank line, then existing comment block:
```
#!/usr/bin/env bash
# $KYAULabs: fetch.sh kyau@nova 2026/07/07 -0700 Exp $

# fetch.sh — Refresh vendored OpenCode docs...
```

Append modeline as last line:
```
# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Add header to .php-cs-fixer.dist.php**

After `declare(strict_types=1);`, insert:
```
# $KYAULabs: .php-cs-fixer.dist.php kyau@nova 2026/07/07 -0700 Exp $
```
Append modeline as last line:
```
// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 3: Commit C**

```bash
git add .opencode/skills/opencode-docs/fetch.sh .php-cs-fixer.dist.php
git commit -S -m $'fix: add missing rcs headers to fetch.sh and .php-cs-fixer.dist.php\n\nBoth files shipped headerless, contradicting the policy. They are now in\nscope after dropping the .opencode/ exclusion and extending to .ts.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task D: Wire JS/TS tests into /check command

**Files:**
- Modify: `.opencode/commands/check.md` (between step 4 and step 5)

- [ ] **Step 1: Add JS/TS test step to check.md**

Insert after step 4 (Pest coverage) and before step 5 (PHP syntax):
```markdown
## 5. JS/TS tests

```bash
if compgen -G "tests/Plugin/*.test.ts" > /dev/null 2>&1; then
  node --import tsx --test tests/Plugin/*.test.ts
else
  echo "SKIPPED: no tests/Plugin/*.test.ts files found"
fi
```

Run on staged files; if nothing is staged, run on the working tree's modified
files. Report PASS if all exit 0, FAIL with the failing test output, or
SKIPPED if the directory is empty/missing.
```

Renumber existing steps 5-6 to 6-7.

- [ ] **Step 2: Commit D**

```bash
git add .opencode/commands/check.md
git commit -S -m $'fix: wire js/ts tests into /check command\n\nAdd a step for node:test-based plugin tests so /check covers the\nsession-bootstrap.ts regression guard.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task E: Verification

- [ ] **Step 1: Run /check**

```bash
# PHP code style
php-cs-fixer fix . --dry-run --diff

# SCSS lint
npx stylelint "cdn/sass/**/*.scss" 2>/dev/null || echo "SKIPPED"

# JS lint
npx eslint "cdn/js/**/*.js" --ignore-pattern "*.min.js" 2>/dev/null || echo "SKIPPED"

# PHP tests
php -d pcov.enabled=1 vendor/bin/pest --coverage

# JS/TS tests
node --import tsx --test tests/Plugin/*.test.ts

# PHP syntax
git diff --staged --name-only --diff-filter=AM | grep '\.php$' | while read f; do php -l "$f"; done
```

All must pass.

- [ ] **Step 2: Scratch-clone repro**

Verify acceptance criterion #1 — deleting `session-bootstrap.md` produces a warning, not a failure:
```bash
node --import tsx -e "
(async () => {
    const { mkdtempSync, rmSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'scratch-'));
    // Intentionally do NOT create .opencode/docs/session-bootstrap.md
    const { SessionBootstrap } = await import('./.opencode/plugins/session-bootstrap.ts');
    const result = await SessionBootstrap({ directory: dir });
    console.log('Result:', JSON.stringify(result));
    rmSync(dir, { recursive: true, force: true });
})();
"
```
Expected output: warning + `Result: {}`.

- [ ] **Step 3: @code-review**

Dispatch `@code-review` agent on staged changes before push.
