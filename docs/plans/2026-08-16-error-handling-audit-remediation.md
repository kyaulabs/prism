# Error Handling Audit Remediation Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remediate the five live findings (F-1…F-5) plus the F-7 doc nit from
`audits/2026-08-16-error-handling-audit.md` per the approved spec
`docs/specs/2026-08-16-error-handling-audit-remediation-spec.md`.

**Architecture:** Extract the safety extension's `tool_call` policy into a
new pi-free module (`tool-call-handler.ts`) that is unit-testable from
`tests/Node/`, wrapping the whole handler in a fail-closed catch and moving
`PRISM_SENSITIVE_PATHS` parsing to per-line isolation; `index.ts` becomes a
thin wiring shell. `coverage-gate.php` gains `--min` validation (exit 2),
libxml diagnostics, and a warned bucket for unreadable changed files.
`check-peer-deps.js` gains guarded `statSync`/`walk` so its "always exits 0"
contract holds even when the extensions tree cannot be scanned.

**Tech Stack:** TypeScript (node:test, Node 26 native type-stripping), PHP 8.5
(no framework), bash shell tests, conventional commits (signed).

## Global constraints

- RCS header + vim modeline on every new and modified source file
  (`rcs-header` skill; format `// $KYAULabs: <file> kyau@aura.kyaulabs 2026/08/16 -0700 Exp $`).
- Signed commits (`git commit -S`), Conventional Commits with the four
  footers `Authored-by:` → `Implemented-by:` → `Tested-by:` → `Signed-off-by:`
  (resolved via `bash packages/prism-core/scripts/resolve-identity.sh`),
  using `$'...\n...'` ANSI-C quoting.
- Zero behavior delta on existing allow/block outcomes and exit codes; every
  change is additive error-handling hardening.
- No aurora changes. No `backend/env.php` changes (F-6 already fixed).
- New TS module must be added to `tsconfig.json` `include` (strict: true,
  `allowImportingTsExtensions: true`).
- Node tests run via `npm run test:node`; shell tests via
  `bash tests/Shell/coverage_gate_test.sh`; final gate `/check-php`.

---

### Task 1: Fail-closed tool-call handler module (F-1, F-2, F-7)

**Files:**
- Create: `packages/prism-core/extensions/safety/tool-call-handler.ts`
- Create: `tests/Node/safety-tool-call-handler.test.ts`
- Modify: `tests/Node/safety-sensitive-paths.test.ts` (append tests)
- Modify: `tsconfig.json` (add new module to `include`)
- Test: `node --test tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-sensitive-paths.test.ts`

**Interfaces:**
- Consumes: `classifyCommand` from `./pre-tool-use.ts`;
  `loadAdditionalSensitivePaths`, `sensitiveOperandCheck`, `sensitivePathMatch`,
  `sensitivePatternCheck`, `type SensitivePathOptions` from `./sensitive-paths.ts`;
  `type DenialCircuitBreaker` from `./denial-circuit-breaker.ts`; `resolve`/`normalize`
  from `node:path`.
- Produces: `handleToolCall(toolName: string, input: unknown, deps: ToolCallDeps): ToolCallResult`
  and `resolveExtraPaths(envValue: string | undefined, log?: (msg: string) => void): string[]`
  — consumed by Task 2's `index.ts`.

- [x] **Step 1: Write the failing tests**

Create `tests/Node/safety-tool-call-handler.test.ts` (RCS header `// $KYAULabs: safety-tool-call-handler.test.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $`, vim modeline `// vim: ft=typescript sts=4 sw=4 ts=4 et :`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DenialCircuitBreaker, DEFAULT_THRESHOLD } from "../../packages/prism-core/extensions/safety/denial-circuit-breaker.ts";
import { handleToolCall, type ToolCallDeps } from "../../packages/prism-core/extensions/safety/tool-call-handler.ts";

interface NotifyLog {
    msg: string;
    level: string;
}

function makeDeps(overrides: Partial<ToolCallDeps> = {}): { deps: ToolCallDeps; notifyLog: NotifyLog[] } {
    const notifyLog: NotifyLog[] = [];
    const deps: ToolCallDeps = {
        sid: "s1",
        cwd: "/repo",
        home: "/home/tester",
        safeRelDirs: [],
        extraPaths: [],
        breaker: new DenialCircuitBreaker({ threshold: DEFAULT_THRESHOLD }),
        notify: (msg, level) => { notifyLog.push({ msg, level }); },
        ...overrides,
    };
    return { deps, notifyLog };
}

function trippedBreaker(): DenialCircuitBreaker {
    const b = new DenialCircuitBreaker({ threshold: DEFAULT_THRESHOLD });
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    return b;
}

test("tripped breaker blocks every tool before policy", () => {
    const { deps } = makeDeps({ breaker: trippedBreaker() });
    assert.deepEqual(handleToolCall("read", { path: "/repo/ok.php" }, deps), {
        block: true,
        reason: "[prism safety] BLOCKED: session tripped (3 consecutive bash denials) — circuit breaker active per ADR-0042. Run /new to reset.",
    });
    assert.equal(handleToolCall("bash", { command: "echo hi" }, deps)?.block, true);
});

test("bash sensitive operand blocks and feeds the breaker", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("bash", { command: "cat ~/.ssh/id_rsa" }, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /sensitive-path policy/);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("bash malformed args blocks and feeds the breaker", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("bash", { command: 42 }, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /malformed bash args/);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("bash classifier block feeds the breaker", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("bash", { command: "rm -rf /" }, deps);
    assert.equal(result?.block, true);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("bash classifier warn notifies but allows", () => {
    const { deps, notifyLog } = makeDeps();
    const result = handleToolCall("bash", { command: "git reset --hard" }, deps);
    assert.equal(result, undefined);
    assert.equal(notifyLog.length, 1);
    assert.equal(notifyLog[0].level, "warning");
    assert.match(notifyLog[0].msg, /WARNING/);
    assert.equal(deps.breaker.count("s1"), 0);
});

test("clean bash passes without notify or breaker feed", () => {
    const { deps, notifyLog } = makeDeps();
    assert.equal(handleToolCall("bash", { command: "ls -la /repo" }, deps), undefined);
    assert.equal(notifyLog.length, 0);
    assert.equal(deps.breaker.count("s1"), 0);
});

test("read/ls/find sensitive paths block without feeding the breaker", () => {
    for (const toolName of ["read", "ls", "find"]) {
        const { deps } = makeDeps();
        const result = handleToolCall(toolName, { path: "~/.ssh/id_rsa" }, deps);
        assert.equal(result?.block, true, toolName);
        assert.match(result?.reason ?? "", /sensitive-path policy/);
        assert.equal(deps.breaker.count("s1"), 0, toolName);
    }
});

test("grep sensitive path and glob pattern block", () => {
    const { deps } = makeDeps();
    assert.equal(handleToolCall("grep", { path: "~/.ssh/id_rsa" }, deps)?.block, true);
    const pattern = handleToolCall("grep", { path: "/repo", glob: ".env" }, deps);
    assert.equal(pattern?.block, true);
    assert.match(pattern?.reason ?? "", /sensitive-path policy/);
});

test("find sensitive pattern block", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("find", { path: "/repo", pattern: "**/.ssh/id_rsa" }, deps);
    assert.equal(result?.block, true);
});

test("unhandled tools pass through", () => {
    const { deps } = makeDeps();
    assert.equal(handleToolCall("edit", { path: "/repo/a.php", oldString: "x" }, deps), undefined);
    assert.equal(handleToolCall("write", { path: "/repo/b.php", content: "x" }, deps), undefined);
});

test("internal error fails closed with ADR-0036 reason", () => {
    const throwing = {
        isTripped: () => { throw new Error("boom"); },
    } as unknown as DenialCircuitBreaker;
    const { deps } = makeDeps({ breaker: throwing });
    const result = handleToolCall("bash", { command: "echo hi" }, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /failing closed per ADR-0036/);
    assert.match(result?.reason ?? "", /boom/);
});
```

Append to `tests/Node/safety-sensitive-paths.test.ts` (same RCS header style as
the file's existing header, `kyau@aura.kyaulabs`; add the import at top):

```ts
import { resolveExtraPaths } from "../../packages/prism-core/extensions/safety/tool-call-handler.ts";

test("resolveExtraPaths keeps valid entries and logs rejected lines", () => {
    const logged: string[] = [];
    const paths = resolveExtraPaths("~/.gnupg/\nrelative/path\n/root/good\n\n", (m) => logged.push(m));
    assert.deepEqual(paths, ["~/.gnupg/", "/root/good"]);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /ignoring malformed sensitive-paths entry/);
    assert.match(logged[0], /relative\/path/);
});

test("resolveExtraPaths rejects control-character entries", () => {
    const logged: string[] = [];
    const paths = resolveExtraPaths("/root/ok\n~/.ssh/\u0007bad", (m) => logged.push(m));
    assert.deepEqual(paths, ["/root/ok"]);
    assert.equal(logged.length, 1);
});

test("resolveExtraPaths empty input yields no paths and no logs", () => {
    const logged: string[] = [];
    assert.deepEqual(resolveExtraPaths(undefined, (m) => logged.push(m)), []);
    assert.deepEqual(resolveExtraPaths("", (m) => logged.push(m)), []);
    assert.deepEqual(resolveExtraPaths(" \n\t\n", (m) => logged.push(m)), []);
    assert.equal(logged.length, 0);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-sensitive-paths.test.ts`
Expected: FAIL — module import error (`Cannot find module ... tool-call-handler.ts`).

- [x] **Step 3: Write minimal implementation**

Create `packages/prism-core/extensions/safety/tool-call-handler.ts` (RCS header
`// $KYAULabs: tool-call-handler.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $`,
vim modeline `// vim: ft=typescript sts=4 sw=4 ts=4 et :`):

```ts
import { resolve as resolvePath, normalize } from "node:path";
import { classifyCommand } from "./pre-tool-use.ts";
import {
    loadAdditionalSensitivePaths,
    sensitiveOperandCheck,
    sensitivePathMatch,
    sensitivePatternCheck,
    type SensitivePathOptions,
} from "./sensitive-paths.ts";
import type { DenialCircuitBreaker } from "./denial-circuit-breaker.ts";

const SENSITIVE_REASON = "sensitive-path policy (ADR-0047)";

/**
 * Dependencies injected by the extension wiring (index.ts). Everything the
 * handler needs from the pi host is passed in so this module stays pure and
 * unit-testable without importing @earendil-works/pi-coding-agent.
 */
export interface ToolCallDeps {
    /** Breaker key — stable per session file (computed by the wiring). */
    sid: string;
    /** Project working directory. */
    cwd: string;
    /** User home directory for ~ expansion. */
    home: string;
    /** Project-relative rm -rf safe zones (resolved at session_start). */
    safeRelDirs: readonly string[];
    /** Extra deny-floor paths from PRISM_SENSITIVE_PATHS (F-2). */
    extraPaths: string[];
    /** Per-session consecutive-bash-denial circuit breaker (ADR-0042). */
    breaker: DenialCircuitBreaker;
    /** UI escalation surface; error escalations also fall back to console.error. */
    notify?: (msg: string, level: "error" | "warning") => void;
}

export type ToolCallResult = { block: true; reason: string } | undefined;

/**
 * Resolve the deny-floor extension surface. `PRISM_SENSITIVE_PATHS` is a
 * newline-joined list of `~/`-prefixed or absolute paths appended to the
 * core deny floor. A single malformed line is skipped with a loud log; the
 * remaining valid entries and the core DEFAULT_PATTERNS deny floor stay in
 * effect (ADR-0047) — one bad line never discards the rest (F-2).
 *
 * @param envValue raw PRISM_SENSITIVE_PATHS value (undefined when unset)
 * @param log      per-line rejection logger (defaults to console.error)
 * @return valid extra deny paths
 */
export function resolveExtraPaths(envValue: string | undefined, log: (msg: string) => void = console.error): string[] {
    if (envValue === undefined || envValue === "") return [];
    const paths: string[] = [];
    for (const line of envValue.split("\n")) {
        if (line.trim() === "") continue;
        try {
            paths.push(...loadAdditionalSensitivePaths(line));
        } catch (err) {
            log(
                `[prism safety] ignoring malformed sensitive-paths entry ` +
                `${JSON.stringify(line)} — ${err instanceof Error ? err.message : String(err)}. ` +
                `Other entries and the core deny floor remain active (ADR-0047).`,
            );
        }
    }
    return paths;
}

/**
 * True when a path-shaped argument resolves into the sensitive deny floor.
 * A leading `@` (pi/curl file-ref prefix) is stripped first. `undefined`
 * means "no path arg supplied" (allow); any other non-string shape is
 * present-but-malformed and fails closed (ADR-0036).
 */
function sensitivePathBlocks(pathArg: unknown, opts: SensitivePathOptions): boolean {
    if (pathArg === undefined) return false;
    if (typeof pathArg !== "string") return true;
    if (pathArg === "") return false;
    const p = pathArg.replace(/^@+/, "");
    if (p === "") return false;
    const abs = p.startsWith("~")
        ? normalize(opts.home + p.slice(1))
        : normalize(resolvePath(opts.projectDir, p));
    return sensitivePathMatch(abs, opts) !== null;
}

/**
 * Record a bash denial. On the trip transition (count === threshold),
 * emit the redacted escalation (ADR-0042: no command text, args, output,
 * or metadata — only identity + count). Once tripped, `breaker.isTripped`
 * blocks all subsequent tool calls for the rest of the agent run
 * (fail-closed, ADR-0036); there is no `client.session.abort` in pi, so a
 * mid-run trip persists until the user runs `/new`. Each `agent_end`
 * resets the streak (wired in index.ts), so the block holds within one
 * agent run only.
 */
function noteBashDenial(sid: string, deps: ToolCallDeps): void {
    const obs = deps.breaker.observe(sid, true);
    if (!obs.transitioned) return;
    const redacted =
        `[prism safety] circuit breaker tripped: ${obs.count} consecutive bash ` +
        `denials in this session. All tools blocked until /new. (ADR-0042/ADR-0036)`;
    deps.notify?.(redacted, "error");
}

/**
 * Decide the outcome of one tool_call. Never throws: any internal error
 * fails closed with a BLOCK per ADR-0036 (F-1), so the extension host
 * never sees a rejected handler whose semantics it would have to guess.
 *
 * @param toolName name of the tool being called (from the pi event)
 * @param input    raw tool input (narrowed structurally per tool)
 * @param deps     injected session state (see ToolCallDeps)
 * @return `{ block: true, reason }` to deny, `undefined` to allow
 */
export function handleToolCall(toolName: string, input: unknown, deps: ToolCallDeps): ToolCallResult {
    try {
        // 1. Circuit-breaker tripped (ADR-0042): block ALL tools while the
        //    run is tripped, before the classifier runs. Does not feed the
        //    breaker again (already tripped).
        if (deps.breaker.isTripped(deps.sid)) {
            return {
                block: true,
                reason:
                    `[prism safety] BLOCKED: session tripped (${deps.breaker.count(deps.sid)} ` +
                    `consecutive bash denials) — circuit breaker active per ADR-0042. ` +
                    `Run /new to reset.`,
            };
        }

        const opts: SensitivePathOptions = { projectDir: deps.cwd, home: deps.home, extraPaths: deps.extraPaths };

        // 2. bash: sensitive operands first (ADR-0047/ADR-0048 §5), then the
        //    destructive classifier (ADR-0023, ADR-0036). A blocked bash
        //    feeds the breaker; a warn is surfaced via notify.
        if (toolName === "bash") {
            const command: unknown = (input as { command?: unknown }).command;
            if (typeof command !== "string") {
                noteBashDenial(deps.sid, deps);
                return {
                    block: true,
                    reason: `[prism safety] BLOCKED: malformed bash args — failing closed per ADR-0036`,
                };
            }
            const operandMatch = sensitiveOperandCheck(command, opts);
            if (operandMatch) {
                noteBashDenial(deps.sid, deps);
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            const finding = classifyCommand(command, { projectDir: deps.cwd, safeRelDirs: deps.safeRelDirs });
            if (finding.severity === "block") {
                noteBashDenial(deps.sid, deps);
                return { block: true, reason: `[prism safety] BLOCKED: ${finding.reason}` };
            }
            if (finding.severity === "warn") {
                deps.notify?.(`[prism safety] WARNING: ${finding.reason}`, "warning");
            }
            return;
        }

        // 3. read/ls/grep/find: sensitive-path deny floor (ADR-0047/ADR-0048
        //    §5). Non-bash blocks do NOT feed the bash-only breaker.
        if (toolName === "read" || toolName === "ls") {
            if (sensitivePathBlocks((input as { path?: unknown }).path, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            return;
        }
        if (toolName === "grep") {
            if (sensitivePathBlocks((input as { path?: unknown }).path, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            const pathArg = input as { path?: unknown };
            const base = typeof pathArg.path === "string" ? pathArg.path : deps.cwd;
            if (sensitivePatternCheck((input as { glob?: unknown }).glob, base, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            return;
        }
        if (toolName === "find") {
            if (sensitivePathBlocks((input as { path?: unknown }).path, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            const pathArg = input as { path?: unknown };
            const base = typeof pathArg.path === "string" ? pathArg.path : deps.cwd;
            if (sensitivePatternCheck((input as { pattern?: unknown }).pattern, base, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            return;
        }
        return;
    } catch (err) {
        return {
            block: true,
            reason:
                `[prism safety] BLOCKED: safety handler internal error — ` +
                `failing closed per ADR-0036 (${err instanceof Error ? err.message : String(err)})`,
        };
    }
}
```

Add `"packages/prism-core/extensions/safety/tool-call-handler.ts"` to the
`include` array in `tsconfig.json` (after
`"packages/prism-core/extensions/safety/denial-circuit-breaker.ts",`).

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-sensitive-paths.test.ts`
Expected: PASS (13 handler tests + 3 resolveExtraPaths tests, existing sensitive-paths tests still green).
Also run `npm run test:node` — the full suite (135 + new) must stay green.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/tool-call-handler.ts tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-sensitive-paths.test.ts tsconfig.json
git commit -S -m $'fix(safety): extract fail-closed tool-call handler module\n\nMoves the tool_call policy body into a pi-free, unit-testable module\nwrapped in a fail-closed catch (F-1), isolates PRISM_SENSITIVE_PATHS\nparsing per line (F-2), and documents the breaker trip lifetime (F-7).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: Rewire `index.ts` to the handler module

**Files:**
- Modify: `packages/prism-core/extensions/safety/index.ts`
- Test: `npm run test:node` (full suite must stay green — the wiring itself is
  not unit-tested; its correctness is carried by Task 1's handler tests plus
  review)

**Interfaces:**
- Consumes: `handleToolCall`, `resolveExtraPaths` from `./tool-call-handler.ts` (Task 1).
- Produces: the extension default export with identical event wiring.

- [x] **Step 1: Rewire `index.ts`**

Replace the imports block with (keep `ExtensionAPI`/`ExtensionContext` types,
`homedir`, `resolvePath`, `readFileSync`, `fileURLToPath`):

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DenialCircuitBreaker, DEFAULT_THRESHOLD } from "./denial-circuit-breaker.ts";
import { handleToolCall, resolveExtraPaths } from "./tool-call-handler.ts";
```

Delete from `index.ts` (now owned by the handler module):
`SENSITIVE_REASON`, `sensitivePathBlocks`, the old `resolveExtraPaths`,
the old `noteBashDenial`, and the entire old `pi.on("tool_call", ...)` body.
Also remove the now-unused imports: `isToolCallEventType`, `normalize`,
`classifyCommand`, `loadAdditionalSensitivePaths`, `sensitiveOperandCheck`,
`sensitivePathMatch`, `sensitivePatternCheck`, `SensitivePathOptions`.

Replace the `tool_call` registration with:

```ts
    pi.on("tool_call", (event, ctx) =>
        handleToolCall(event.toolName, event.input, {
            sid: sessionId(ctx),
            cwd: ctx.cwd,
            home: homeDir,
            safeRelDirs,
            extraPaths,
            breaker,
            notify: (msg, level) => {
                if (level === "error") {
                    if (ctx.hasUI) {
                        ctx.ui.notify(msg, "error");
                    } else {
                        console.error(`${msg} (session ${sessionId(ctx)})`);
                    }
                } else if (ctx.hasUI) {
                    ctx.ui.notify(msg, "warning");
                }
            },
        })
    );
```

Update the `session_start` handler to `extraPaths = resolveExtraPaths(process.env.PRISM_SENSITIVE_PATHS);`
(note: the old `!== undefined && !== ""` guard moves inside the new function).
The `tool_execution_end`, `agent_end`, and `session_shutdown` registrations
stay byte-identical. Update the header comment's fail-closed invariants list
to mention the whole handler body fails closed, not just `classifyCommand`.

- [x] **Step 2: Verify**

Run: `npm run test:node`
Expected: PASS (135 existing + 16 new tests; nothing imports `index.ts`, so
this verifies the repo still loads and the module exports are consistent).
Run: `npx eslint packages/prism-core/extensions/safety/index.ts packages/prism-core/extensions/safety/tool-call-handler.ts`
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add packages/prism-core/extensions/safety/index.ts
git commit -S -m $'refactor(safety): index.ts delegates tool_call policy to handler module\n\nThe extension wrapper now owns only pi wiring (event registration,\nsession state, notify mapping); the policy body lives in the tested\ntool-call-handler module. Behavior on every existing path is unchanged.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: `coverage-gate.php` — reject invalid `--min` (F-3)

**Files:**
- Modify: `packages/prism-php-web/scripts/coverage-gate.php` (`parse_args`,
  add `parse_min_value`, `main`)
- Modify: `tests/Shell/coverage_gate_test.sh` (append Test 14)
- Test: `bash tests/Shell/coverage_gate_test.sh`

**Interfaces:**
- Consumes: existing `main`/`parse_args` structure.
- Produces: `$cfg['min']` of type `?int` (null = invalid); `main` returns 2
  with `ERROR: --min must be an integer 1..100` on null.

- [x] **Step 1: Write the failing test**

Append to `tests/Shell/coverage_gate_test.sh` before the `── Summary ──` block
(same indentation style — tabs — as the surrounding tests):

```bash
# ── Test 14: Garbage --min values → usage error, exit 2 ─────────────────────
echo ""
echo "── Test 14: garbage --min values → exit 2 ──"
T14=$(mktemp -d)
register_temp_dir "$T14"
(
	cd "$T14"
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T14" "backend/env.php:10:10"
	for bad in abc 0 -5 101 1e9 ""; do
		rc=0
		printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T14" --min="$bad" >out.txt 2>&1 || rc=$?
		if [ "$rc" -eq 2 ] && grep -q 'ERROR: --min must be an integer 1..100' out.txt; then
			pass "--min='$bad' rejected (exit 2)"
		else
			fail "--min='$bad': expected exit 2 + usage message, got rc=$rc"
		fi
	done
)
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: FAIL — Test 14 reports `--min=abc: expected exit 2…` (today it
exits 0 with min cast to 0). Existing tests 1–13 stay green.

- [x] **Step 3: Write minimal implementation**

In `coverage-gate.php`, change `parse_args` — the `--min` arms and the return
type docblock — and add `parse_min_value` after `parse_args`:

```php
/**
 * Parse CLI arguments.
 *
 * @param array<int,string> $argv
 * @return array{clover:?string, min:?int, root:string, strict:bool}
 */
function parse_args(array $argv): array
{
    $cfg = ['clover' => null, 'min' => 80, 'root' => getcwd(), 'strict' => false];
    $n = count($argv);
    for ($i = 1; $i < $n; $i++) {
        $arg = $argv[$i];
        if ($arg === '--min' && $i + 1 < $n) {
            $cfg['min'] = parse_min_value($argv[++$i]);
        } elseif (str_starts_with($arg, '--min=')) {
            $cfg['min'] = parse_min_value(substr($arg, 6));
        } elseif ($arg === '--root' && $i + 1 < $n) {
            $cfg['root'] = $argv[++$i];
        } elseif (str_starts_with($arg, '--root=')) {
            $cfg['root'] = substr($arg, 7);
        } elseif ($arg === '--strict') {
            $cfg['strict'] = true;
        } elseif (!str_starts_with($arg, '--') && $cfg['clover'] === null) {
            $cfg['clover'] = $arg;
        }
    }
    return $cfg;
}

/**
 * Parse and validate the --min threshold. Returns null for anything that
 * is not an integer 1..100 so main() can report a usage error (exit 2)
 * instead of silently gating at a degenerate threshold (F-3).
 *
 * @param string $raw raw --min value from argv
 * @return ?int valid threshold, or null when invalid
 */
function parse_min_value(string $raw): ?int
{
    $v = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);

    return $v === false ? null : $v;
}
```

In `main`, right after `$args = parse_args($argv);` insert:

```php
    if ($args['min'] === null) {
        fwrite(STDERR, "ERROR: --min must be an integer 1..100\n");

        return 2;
    }
```

(The subsequent `$min = $args['min'];` line now holds a guaranteed int.)

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: PASS — all 13 existing tests + Test 14 (six garbage values).

- [x] **Step 5: Commit**

```bash
git add packages/prism-php-web/scripts/coverage-gate.php tests/Shell/coverage_gate_test.sh
git commit -S -m $'fix(coverage-gate): reject invalid --min values with usage error\n\nGarbage --min values (abc, 0, -5, 101, 1e9, empty) previously cast to\nint and could silently disable the gate at 0%. They now exit 2 with a\nspecific message; the threshold must be an integer 1..100 (F-3).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: `coverage-gate.php` — libxml diagnostics on parse failure (F-4a)

**Files:**
- Modify: `packages/prism-php-web/scripts/coverage-gate.php` (`main`, clover load)
- Modify: `tests/Shell/coverage_gate_test.sh` (append Test 15)
- Test: `bash tests/Shell/coverage_gate_test.sh`

**Interfaces:**
- Consumes: Task 3's `main` structure.
- Produces: on clover parse failure — same exit 2, same first stderr line,
  plus one `       line N: <message>` line per libxml error.

- [x] **Step 1: Write the failing test**

Append before the `── Summary ──` block:

```bash
# ── Test 15: Malformed Clover XML → exit 2 + libxml diagnostics ─────────────
echo ""
echo "── Test 15: malformed clover XML reports libxml detail ──"
T15=$(mktemp -d)
register_temp_dir "$T15"
(
	cd "$T15"
	CLOVER=$(mktemp)
	{
		echo '<?xml version="1.0" encoding="UTF-8"?>'
		echo '<coverage generated="1"><project><file name="/x.php">'
	} > "$CLOVER"
	rc=0
	printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T15" >out.txt 2>&1 || rc=$?
	if [ "$rc" -eq 2 ] && grep -q 'could not parse clover XML' out.txt && grep -q 'line ' out.txt; then
		pass "malformed clover exits 2 with libxml line detail"
	else
		fail "expected exit 2 + libxml detail, got rc=$rc"
	fi
)
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: FAIL — Test 15: today exit 2 is right but no `line ` diagnostic is
printed.

- [x] **Step 3: Write minimal implementation**

In `main`, replace the clover load block:

```php
    $xml = @simplexml_load_file($cloverPath);
    if ($xml === false) {
        fwrite(STDERR, "ERROR: could not parse clover XML at {$cloverPath}\n");
        return 2;
    }
```

with:

```php
    libxml_use_internal_errors(true);
    libxml_clear_errors();
    $xml = simplexml_load_file($cloverPath);
    if ($xml === false) {
        fwrite(STDERR, "ERROR: could not parse clover XML at {$cloverPath}\n");
        foreach (libxml_get_errors() as $e) {
            fwrite(STDERR, sprintf("       line %d: %s", $e->line, $e->message));
        }

        return 2;
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: PASS — 14 existing tests + Test 15.

- [x] **Step 5: Commit**

```bash
git add packages/prism-php-web/scripts/coverage-gate.php tests/Shell/coverage_gate_test.sh
git commit -S -m $'fix(coverage-gate): report libxml diagnostics on clover parse failure\n\nThe @-suppressed simplexml_load_file hid the actionable cause. Errors\nnow surface each libxml error with line number (F-4a); exit code and\nmessage contract unchanged.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: `coverage-gate.php` — unreadable changed file warns instead of skipping (F-4b)

**Files:**
- Modify: `packages/prism-php-web/scripts/coverage-gate.php` (`classify_changed_files`)
- Modify: `tests/Shell/coverage_gate_test.sh` (append Test 16)
- Test: `bash tests/Shell/coverage_gate_test.sh`

**Interfaces:**
- Consumes: Task 3/4's `main`; existing `$warned` bucket + `exit_code_for` (warned fails under `--strict`).
- Produces: unreadable changed files land in `$warned` with reason
  `unreadable — could not verify executable code`.

- [x] **Step 1: Write the failing test**

Append before the `── Summary ──` block:

```bash
# ── Test 16: Unreadable changed file → WARN; --strict fails ─────────────────
echo ""
echo "── Test 16: unreadable changed file warns, --strict fails ──"
if [ "$(id -u)" -eq 0 ]; then
	skip "unreadable-file test skipped when running as root"
else
	T16=$(mktemp -d)
	register_temp_dir "$T16"
	(
		cd "$T16"
		mkdir -p backend
		echo '<?php' > backend/env.php
		printf '<?php\necho "x";\n' > backend/locked.php
		chmod 000 backend/locked.php
		CLOVER=$(mktemp)
		build_clover "$CLOVER" "$T16" "backend/env.php:10:10"
		rc=0
		printf 'backend/locked.php\n' | php "$SCRIPT" "$CLOVER" --root="$T16" >out.txt 2>&1 || rc=$?
		if [ "$rc" -eq 0 ] && grep -q 'unreadable' out.txt; then
			pass "unreadable changed file warns (exit 0)"
		else
			fail "expected exit 0 + unreadable WARN, got rc=$rc"
		fi
		rc=0
		printf 'backend/locked.php\n' | php "$SCRIPT" "$CLOVER" --root="$T16" --strict >out.txt 2>&1 || rc=$?
		if [ "$rc" -eq 1 ] && grep -q 'unreadable' out.txt; then
			pass "unreadable changed file fails under --strict (exit 1)"
		else
			fail "expected exit 1 + unreadable WARN under --strict, got rc=$rc"
		fi
	)
fi
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: FAIL — Test 16: today the unreadable file reads as `''` and is
bucketed `outside <source>, no executable code` → SKIP, no `unreadable` text.

- [x] **Step 3: Write minimal implementation**

In `classify_changed_files`, replace:

```php
        $path = is_file($fullChanged) ? $fullChanged : $changed;
        $source = (string) @file_get_contents($path);
        if ($source !== '' && has_executable_code($source)) {
            $warned[] = [$changed, 'outside <source>, has executable code — register in phpunit.xml <source>'];
        } else {
            $skipped[] = [$changed, 'outside <source>, no executable code'];
        }
```

with:

```php
        $path = is_file($fullChanged) ? $fullChanged : $changed;
        $source = @file_get_contents($path);
        if ($source === false) {
            $warned[] = [$changed, 'unreadable — could not verify executable code'];
        } elseif ($source !== '' && has_executable_code($source)) {
            $warned[] = [$changed, 'outside <source>, has executable code — register in phpunit.xml <source>'];
        } else {
            $skipped[] = [$changed, 'outside <source>, no executable code'];
        }
```

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: PASS — 15 existing tests + Test 16 (both assertions, non-root).

- [x] **Step 5: Commit**

```bash
git add packages/prism-php-web/scripts/coverage-gate.php tests/Shell/coverage_gate_test.sh
git commit -S -m $'fix(coverage-gate): warn on unreadable changed files instead of skipping\n\nAn existing-but-unreadable changed file previously read as empty and\nsilently skipped the gate. It now warns (fails under --strict) so CI\ncannot pass while a file it could not inspect (F-4b).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: `check-peer-deps.js` — never crash out of the always-exit-0 contract (F-5)

**Files:**
- Modify: `packages/prism-core/scripts/check-peer-deps.js`
- Create: `tests/Node/check-peer-deps.test.js`
- Test: `node --test tests/Node/check-peer-deps.test.js`

**Interfaces:**
- Consumes: existing stdout-protocol contract (caller `validate-harness.sh`
  reads stdout lines as violations, discards stderr via `2>/dev/null`).
- Produces: `process.exit(0)` on every path; a scan failure prints
  `cannot scan extensions/: <message>` to stdout.

- [x] **Step 1: Write the failing test**

Create `tests/Node/check-peer-deps.test.js` (RCS header
`// $KYAULabs: check-peer-deps.test.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $`,
vim modeline `// vim: ft=javascript sts=4 sw=4 ts=4 noet :`):

```js
'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const SCRIPT = path.resolve(__dirname, '../../packages/prism-core/scripts/check-peer-deps.js');

function tmpdir(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-deps-'));
	t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
	return dir;
}

function run(pkgJsonPath) {
	// execFileSync throws when the script exits non-zero — the always-exit-0
	// contract means a clean return IS the assertion of exit status 0.
	return execFileSync(process.execPath, [SCRIPT, pkgJsonPath], {encoding: 'utf8'});
}

test('missing package.json argument exits 0 with a message', () => {
	const out = execFileSync(process.execPath, [SCRIPT], {encoding: 'utf8'});
	assert.match(out, /missing package.json path argument/);
});

test('unparsable package.json exits 0 with a message', (t) => {
	const dir = tmpdir(t);
	fs.writeFileSync(path.join(dir, 'package.json'), '{ not json');
	const out = run(path.join(dir, 'package.json'));
	assert.match(out, /cannot parse package.json/);
});

test('missing extensions dir exits 0 silently', (t) => {
	const dir = tmpdir(t);
	fs.writeFileSync(path.join(dir, 'package.json'), '{}');
	assert.equal(run(path.join(dir, 'package.json')), '');
});

test('extensions path that is a file exits 0 silently (guarded statSync)', (t) => {
	const dir = tmpdir(t);
	fs.writeFileSync(path.join(dir, 'package.json'), '{}');
	fs.writeFileSync(path.join(dir, 'extensions'), 'not a dir');
	const out = run(path.join(dir, 'package.json'));
	assert.equal(out, '');
});

test('extension importing a pi core without peerDependencies reports a violation', (t) => {
	const dir = tmpdir(t);
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'pkg'}));
	fs.mkdirSync(path.join(dir, 'extensions'));
	fs.writeFileSync(path.join(dir, 'extensions', 'x.ts'), 'import x from "@earendil-works/pi-coding-agent";\n');
	const out = run(path.join(dir, 'package.json'));
	assert.match(out, /peerDependencies/);
});

test('unscannable extensions tree exits 0 with a stdout line and no stderr', (t) => {
	if (typeof process.getuid === 'function' && process.getuid() === 0) {
		t.skip('running as root — permission denials do not apply');
		return;
	}
	const dir = tmpdir(t);
	fs.writeFileSync(path.join(dir, 'package.json'), '{}');
	fs.mkdirSync(path.join(dir, 'extensions'));
	fs.writeFileSync(path.join(dir, 'extensions', 'blocked.js'), '// x\n');
	fs.chmodSync(path.join(dir, 'extensions', 'blocked.js'), 0o000);
	const res = spawnSync(process.execPath, [SCRIPT, path.join(dir, 'package.json')], {encoding: 'utf8'});
	assert.equal(res.status, 0);
	assert.match(res.stdout, /cannot scan extensions\//);
	assert.equal(res.stderr, '');
});
```

Note: chmod applies to the *file* inside a readable dir so `walk()` fails in
`readFileSync` (EACCES) while the tmpdir cleanup stays permission-safe;
`spawnSync` captures stderr so the "no stack trace" contract is asserted.
This task intentionally creates a *new* test file — the spec's
`tests/Node/toolchain-packaging.test.js` does not spawn `check-peer-deps.js`
(verified during planning), so a dedicated file is the correct home.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/check-peer-deps.test.js`
Expected: FAIL — the last test throws (`execFileSync` rejects: script crashes
with exit 1 + EACCES stack trace on stderr). The other five pass.

- [x] **Step 3: Write minimal implementation**

In `check-peer-deps.js`, replace:

```js
const extDir = path.join(path.dirname(pkgJsonPath), 'extensions');
if (!fs.existsSync(extDir) || !fs.statSync(extDir).isDirectory()) {
	// No extensions -> cannot import a pi core at runtime -> nothing to check.
	process.exit(0);
}
```

with:

```js
const extDir = path.join(path.dirname(pkgJsonPath), 'extensions');
let extStat;
try {
	extStat = fs.statSync(extDir);
} catch {
	// No extensions -> cannot import a pi core at runtime -> nothing to check.
	process.exit(0);
}
if (!extStat.isDirectory()) {
	process.exit(0);
}
```

and replace the bare call:

```js
walk(extDir);
```

with:

```js
try {
	walk(extDir);
} catch (e) {
	// The always-exit-0 contract holds even when the tree cannot be scanned:
	// print the failure on stdout (the caller treats every stdout line as a
	// violation) instead of crashing with an uncaught exception (F-5).
	console.log(`${rel}: cannot scan extensions/: ${e.message}`);
	process.exit(0);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/check-peer-deps.test.js`
Expected: PASS — all six tests (the chmod-based one skipped as root).

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/scripts/check-peer-deps.js tests/Node/check-peer-deps.test.js
git commit -S -m $'fix(peer-deps): keep always-exit-0 contract when extensions tree is unscannable\n\nBare readdirSync/statSync in walk() crashed with an uncaught exception\n(exit 1, stderr stack) which validate-harness.sh silently discarded,\nleaving the package unchecked. Stat and scan are now guarded; failures\nprint a violation line on stdout while still exiting 0 (F-5).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Final verification

- [ ] `npm run test:node` — full Node suite green (135 existing + 20 new).
- [ ] `bash tests/Shell/coverage_gate_test.sh` — full shell suite green (13 existing + 3 new).
- [ ] `/check-php` — php-cs-fixer, stylelint, eslint, Pest coverage ≥ 80% on changed files.
- [ ] `code-review` skill (suggest Ctrl+P to the judge model) before push.
