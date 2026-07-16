# PreToolUse Safety Hook — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Add a harness-wide safety hook that blocks destructive bash commands (rm -rf outside safe zones, git push --force) and warns on risky ones (git push --delete, DROP DATABASE/TABLE, git reset --hard).

**Architecture:** A single auto-discovered opencode plugin (`.opencode/plugins/pre-tool-use.ts`) uses the stable `tool.execute.before` hook to inspect bash tool calls. Classification lives in a pure, exported, side-effect-free function `classifyCommand()` (the testable seam); the hook handler is thin glue around it. BLOCK = throw new Error(); WARN = client.app.log({level:"warn"}) + allow; PASS = no-op. The classifier fails open.

**Tech Stack:** TypeScript, @opencode-ai/plugin v1.18.3 (installed in .opencode/node_modules/), Node native test runner (node --import tsx --test), node:assert/strict. No new dependencies.

## Global constraints

- Issue: #140 (parent epic #127). Conventional-commit scope: hooks.
- File: .opencode/plugins/pre-tool-use.ts — TypeScript, 4-space indent, RCS header + vim modeline.
- No opencode.jsonc change — local plugins in .opencode/plugins/ are auto-discovered (that is the registration).
- Defense-in-depth: opencode.jsonc already denies git push* at the permission layer. The hook is harness-wide (all agents) plus covers rm -rf, git reset --hard, DROP, and WARN logging that permissions cannot express.
- Test gate: npm run test:plugin (= node --import tsx --test tests/Plugin/*.test.ts). /check does not cover TS plugins.
- Fail-open contract: classifyCommand never throws; the hook handler try/catches and defaults to PASS.

## File structure

| File | Responsibility |
|---|---|
| adr/0023-safety-hook-for-bash-tool-interception.md | Decision record (Nygard format per ADR-0004 et al.) |
| .opencode/plugins/pre-tool-use.ts | Pure classifyCommand() classifier + PreToolUse Plugin export + tool.execute.before hook handler |
| tests/Plugin/pre-tool-use.test.ts | Unit tests for classifier + integration tests for hook handler |

---

### Task 1: Write ADR-0023

**Files:**
- Create: adr/0023-safety-hook-for-bash-tool-interception.md

**Interfaces:** None (documentation).

- [ ] **Step 1: Load the adr skill** and follow the Nygard format + numbering conventions.

- [ ] **Step 2: Write the ADR**

Content (adapt header date/links to the adr skill's template):

```
# 0023. Safety Hook for Bash Tool Interception

Date: 2026-07-16

## Status

Accepted

## Context

The harness runs autonomous agents that can issue arbitrary bash. The
existing permission.bash rules in opencode.jsonc deny a small set of
patterns (e.g. git push*) per-agent, but they are allow/deny-only, are
not harness-wide (some agents omit them), and cannot warn on risky but
sometimes-legitimate commands. We need a single, harness-wide guardrail
that blocks clearly destructive operations and logs warnings for risky
ones, adapting the mattpocock/skills v1.1 safety-hook idea.

OpenCode exposes a stable, non-experimental tool.execute.before hook
(see @opencode-ai/plugin Hooks type) that fires before every tool
call. Throwing inside it aborts the call (canonical .env-protection
example in opencode docs). Local plugins under .opencode/plugins/ are
auto-discovered with no config registration (precedent: session-bootstrap.ts,
ADR-0008).

## Decision

Add .opencode/plugins/pre-tool-use.ts, an auto-discovered plugin that
registers a tool.execute.before hook. For input.tool === "bash" it
classifies output.args.command into one of:

- BLOCK → throw new Error(...) (command does not run):
  - rm -rf (recursive+force, any flag spelling) whose targets resolve
    OUTSIDE a safe-zone allowlist.
  - git push --force / git push -f (but NOT --force-with-lease).
- WARN → client.app.log({level:"warn"}), then ALLOW:
  - git push --delete; git reset --hard; DROP DATABASE|TABLE|SCHEMA.
- PASS → no-op.

Safe-zone allowlist for rm -rf (project-relative regenerable dirs
+ OS temp): node_modules/, .opencode/node_modules/, vendor/,
cdn/css/, cdn/javascript/, /tmp, /var/tmp, $TMPDIR (os.tmpdir()).
An unresolvable target (glob/command-substitution) on a detected rm -rf
is treated as BLOCK (we do not guess). If ANY target of a multi-target
rm -rf is outside the allowlist, BLOCK.

Fail-open posture: the classifier is a pure function that never
throws; the hook handler additionally try/catches and defaults to PASS.
A buggy safety hook must never brick the entire harness by blocking
all bash.

Testable seam: classification lives in an exported pure function
classifyCommand(command, { projectDir }); the hook is thin glue.

## Consequences

- Positive: single, harness-wide, testable guardrail; defense-in-depth
  alongside the per-agent permission rules; no config change to register.
- Negative: heuristic detection — a sufficiently obfuscated destructive
  command can evade it; rm -rf with globs is conservatively blocked
  (may produce false positives on legitimate globs inside safe zones —
  acceptable). The allowlist is hard-coded; extending it requires editing
  the plugin.
- The hook fires on every bash call across every agent; the fail-open
  contract bounds the blast radius of classifier bugs.

## Related

- ADR-0008 (experimental hook dependency precedent)
- GitHub issue #140 (parent epic #127)
```

- [ ] **Step 3: Commit**

```bash
git add adr/0023-safety-hook-for-bash-tool-interception.md
git commit -S -m "docs(adr): add ADR-0023 safety hook for bash interception

Plan-by: glm-5.2
Acked-by: <resolve from agent.build.model via conventional-commits skill>
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Pure classifier — WARN patterns, git push --force BLOCK, PASS baseline

**Files:**
- Create: .opencode/plugins/pre-tool-use.ts
- Test: tests/Plugin/pre-tool-use.test.ts

**Interfaces:**
- Produces: classifyCommand(command: string, opts: { projectDir: string }): { severity: "block"|"warn"|null; reason: string }, plus a no-op PreToolUse Plugin export (real hook added in Task 4).

- [ ] **Step 1: Write the failing test** (tests/Plugin/pre-tool-use.test.ts):

```typescript
// $KYAULabs: pre-tool-use.test.ts kyau@nova 2026/07/16 -0700 Exp $

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../.opencode/plugins/pre-tool-use.ts";

describe("classifyCommand — baseline", () => {
    const opts = { projectDir: "/home/user/project" };

    it("passes benign commands", () => {
        assert.deepEqual(classifyCommand("ls -la", opts), { severity: null, reason: "" });
        assert.deepEqual(classifyCommand("git status", opts), { severity: null, reason: "" });
    });

    it("warns on DROP DATABASE", () => {
        assert.equal(classifyCommand('mariadb -e "DROP DATABASE foo"', opts).severity, "warn");
    });

    it("warns on drop table case-insensitive", () => {
        assert.equal(classifyCommand("drop table users", opts).severity, "warn");
    });

    it("warns on git reset --hard", () => {
        assert.equal(classifyCommand("git reset --hard HEAD~1", opts).severity, "warn");
    });

    it("warns on git push --delete", () => {
        assert.equal(classifyCommand("git push origin --delete feature", opts).severity, "warn");
    });

    it("blocks git push --force", () => {
        assert.equal(classifyCommand("git push --force origin main", opts).severity, "block");
    });

    it("blocks git push -f", () => {
        assert.equal(classifyCommand("git push -f origin main", opts).severity, "block");
    });

    it("does not block git push --force-with-lease", () => {
        assert.equal(classifyCommand("git push --force-with-lease origin main", opts).severity, null);
    });

    it("passes empty command without throwing", () => {
        assert.deepEqual(classifyCommand("", opts), { severity: null, reason: "" });
    });
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: npm run test:plugin
Expected: FAIL — cannot resolve module / classifyCommand not exported.

- [ ] **Step 3: Write minimal implementation** (.opencode/plugins/pre-tool-use.ts):

```typescript
// $KYAULabs: pre-tool-use.ts kyau@nova 2026/07/16 -0700 Exp $

import type { Plugin, Hooks } from "@opencode-ai/plugin";

export type Severity = "block" | "warn" | null;

export interface Finding {
    severity: Severity;
    reason: string;
}

export interface ClassifyOptions {
    projectDir: string;
}

/**
 * Classify a bash command string for safety. Pure and side-effect free;
 * never throws (returns a PASS finding on any internal error so the
 * harness fails open). See ADR-0023.
 */
export function classifyCommand(command: string, opts: ClassifyOptions): Finding {
    if (typeof command !== "string" || command.length === 0) {
        return { severity: null, reason: "" };
    }
    const projectDir = opts.projectDir;

    try {
        // WARN: destructive SQL drops
        if (/\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i.test(command)) {
            return { severity: "warn", reason: "SQL DROP statement destroys data" };
        }
        // WARN: git reset --hard (discards uncommitted work)
        if (/\bgit\s+reset\s+--hard\b/.test(command)) {
            return { severity: "warn", reason: "git reset --hard discards uncommitted changes" };
        }
        // WARN: git push --delete (removes a remote ref)
        if (/\bgit\s+push\s+(?:[-\w]+\s+)*--delete\b/.test(command)) {
            return { severity: "warn", reason: "git push --delete removes a remote ref" };
        }
        // BLOCK: git push --force / -f (not --force-with-lease)
        if (/\bgit\s+push\b/.test(command) && !/--force-with-lease/.test(command)) {
            const tokens = command.split(/\s+/);
            if (tokens.includes("-f") || tokens.includes("--force")) {
                return { severity: "block", reason: "git push --force rewrites published history" };
            }
        }
        return { severity: null, reason: "" };
    } catch {
        return { severity: null, reason: "" };
    }
}

// No-op plugin shell; real hook wired in Task 4. Keeps the file a valid
// auto-discovered plugin throughout development.
export const PreToolUse: Plugin = async () => ({});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Run test to verify it passes**

Run: npm run test:plugin
Expected: PASS (all baseline cases).

- [ ] **Step 5: Commit**

```bash
git add .opencode/plugins/pre-tool-use.ts tests/Plugin/pre-tool-use.test.ts
git commit -S -m "feat(hooks): add bash command safety classifier

Plan-by: glm-5.2
Acked-by: <resolve from agent.build.model via conventional-commits skill>
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: rm -rf safe-zone blocking

**Files:**
- Modify: .opencode/plugins/pre-tool-use.ts
- Test: tests/Plugin/pre-tool-use.test.ts (append a describe block)

**Interfaces:**
- Consumes: classifyCommand, ClassifyOptions from Task 2.
- Produces: internal helpers parseRm, resolveTarget, isWithinSafeZone (not exported; exercised via classifyCommand).

- [ ] **Step 1: Write the failing tests** (append to the test file):

```typescript
describe("classifyCommand — rm -rf safe zones", () => {
    const opts = { projectDir: "/home/user/project" };

    it("allows rm -rf inside node_modules", () => {
        assert.equal(classifyCommand("rm -rf node_modules", opts).severity, null);
    });

    it("allows rm -rf inside vendor", () => {
        assert.equal(classifyCommand("rm -rf vendor", opts).severity, null);
    });

    it("allows rm -rf in /tmp", () => {
        assert.equal(classifyCommand("rm -rf /tmp/build-cache", opts).severity, null);
    });

    it("blocks rm -rf on project root (.)", () => {
        assert.equal(classifyCommand("rm -rf .", opts).severity, "block");
    });

    it("blocks rm -rf on src", () => {
        assert.equal(classifyCommand("rm -rf src", opts).severity, "block");
    });

    it("blocks rm -fr (combined flags)", () => {
        assert.equal(classifyCommand("rm -fr src", opts).severity, "block");
    });

    it("blocks rm --recursive --force", () => {
        assert.equal(classifyCommand("rm --recursive --force src", opts).severity, "block");
    });

    it("blocks when any target is unsafe among safe ones", () => {
        assert.equal(classifyCommand("rm -rf node_modules src", opts).severity, "block");
    });

    it("blocks unresolvable glob target", () => {
        assert.equal(classifyCommand("rm -rf *.log", opts).severity, "block");
    });

    it("blocks rm -rf in a piped segment", () => {
        assert.equal(classifyCommand("echo hi | rm -rf src", opts).severity, "block");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: npm run test:plugin
Expected: FAIL — rm cases return null instead of "block".

- [ ] **Step 3: Implement** — add the helpers + imports and the rm branch to classifyCommand.

Add imports at the top (after the existing import line):
```typescript
import { resolve as resolvePath, normalize } from "node:path";
import { tmpdir } from "node:os";
```

Add helpers (between ClassifyOptions and classifyCommand):
```typescript
/** Project-relative directories where rm -rf is permitted. */
const SAFE_REL_DIRS: readonly string[] = [
    "node_modules",
    ".opencode/node_modules",
    "vendor",
    "cdn/css",
    "cdn/javascript",
];

/** OS-level temp directories where rm -rf is permitted. */
const SAFE_ABS_DIRS: readonly string[] = [
    normalize("/tmp"),
    normalize("/var/tmp"),
    normalize(tmpdir()),
];

interface ParsedRm {
    recursive: boolean;
    force: boolean;
    operands: string[];
}

function parseRm(segment: string): ParsedRm | null {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    if (tokens[i] === "sudo") i++;
    if (tokens[i] !== "rm") return null;
    i++;
    let recursive = false;
    let force = false;
    const operands: string[] = [];
    let onlyOperands = false;
    for (; i < tokens.length; i++) {
        const t = tokens[i];
        if (!onlyOperands && t === "--") {
            onlyOperands = true;
            continue;
        }
        if (!onlyOperands && t.startsWith("-") && t.length > 1) {
            if (t.startsWith("--")) {
                if (t === "--recursive") recursive = true;
                else if (t === "--force") force = true;
            } else {
                const chars = t.slice(1);
                if (chars.includes("r") || chars.includes("R")) recursive = true;
                if (chars.includes("f")) force = true;
            }
            continue;
        }
        operands.push(t);
    }
    return { recursive, force, operands };
}

function resolveTarget(token: string, projectDir: string, home: string): string | null {
    let p = token.trim();
    if (
        (p.startsWith('"') && p.endsWith('"')) ||
        (p.startsWith("'") && p.endsWith("'"))
    ) {
        p = p.slice(1, -1);
    }
    if (p.startsWith("~")) {
        p = home + p.slice(1);
    }
    if (/[*?$`(<]/.test(p)) {
        return null;
    }
    return normalize(resolvePath(projectDir, p));
}

function isWithinSafeZone(absPath: string, projectDir: string): boolean {
    if (SAFE_ABS_DIRS.some((d) => absPath === d || absPath.startsWith(d + "/"))) {
        return true;
    }
    return SAFE_REL_DIRS.some((rel) => {
        const safeAbs = normalize(resolvePath(projectDir, rel));
        return absPath === safeAbs || absPath.startsWith(safeAbs + "/");
    });
}
```

Add this branch inside classifyCommand's try block, just before the catch's closing brace / before the final return PASS. Insert after the git push --force block and before `return { severity: null, reason: "" }`:
```typescript
        // BLOCK: rm -rf outside safe zones
        const home = process.env.HOME ?? "/";
        const segments = command.split(/[;&|\n]/);
        for (const segment of segments) {
            const parsed = parseRm(segment);
            if (!parsed || !(parsed.recursive && parsed.force)) continue;
            if (parsed.operands.length === 0) continue;
            for (const operand of parsed.operands) {
                const abs = resolveTarget(operand, projectDir, home);
                if (abs === null || !isWithinSafeZone(abs, projectDir)) {
                    return {
                        severity: "block",
                        reason: `rm -rf targets path outside safe zones: ${operand}`,
                    };
                }
            }
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: npm run test:plugin
Expected: PASS (all rm cases).

- [ ] **Step 5: Commit**

```bash
git add .opencode/plugins/pre-tool-use.ts tests/Plugin/pre-tool-use.test.ts
git commit -S -m "feat(hooks): block rm -rf outside safe zones

Plan-by: glm-5.2
Acked-by: <resolve from agent.build.model via conventional-commits skill>
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: Wire the tool.execute.before hook + integration tests

**Files:**
- Modify: .opencode/plugins/pre-tool-use.ts (replace the no-op PreToolUse with the real plugin; add the type guard)
- Test: tests/Plugin/pre-tool-use.test.ts (append integration describe)

**Interfaces:**
- Consumes: classifyCommand, ClassifyOptions, Finding from Tasks 2–3.
- Produces: PreToolUse: Plugin exporting a real tool.execute.before hook.

- [ ] **Step 1: Write the failing integration tests** (append to test file):

```typescript
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";

describe("PreToolUse plugin hook", () => {
    const load = async (client: any) => {
        const mod = await import("../../.opencode/plugins/pre-tool-use.ts");
        return mod.PreToolUse({ directory: await mkdtemp(join(tmpdir(), "ptu-")), client } as any);
    };
    const noopClient = { app: { log: async () => {} } };
    const capturingClient = () => {
        const logs: any[] = [];
        return { client: { app: { log: async (b: any) => { logs.push(b); } } }, logs };
    };

    it("returns a tool.execute.before hook", async () => {
        const hooks = await load(noopClient);
        assert.equal(typeof hooks["tool.execute.before"], "function");
    });

    it("blocks unsafe rm -rf by throwing", async () => {
        const hooks = await load(noopClient);
        const h = hooks["tool.execute.before"]!;
        await assert.rejects(
            () => h({ tool: "bash", sessionID: "s", callID: "c" }, { args: { command: "rm -rf src" } }),
            /BLOCKED/,
        );
    });

    it("warns (logs) but allows git reset --hard", async () => {
        const { client, logs } = capturingClient();
        const hooks = await load(client);
        await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s", callID: "c" }, { args: { command: "git reset --hard" } });
        assert.equal(logs.length, 1);
        assert.equal(logs[0].body.level, "warn");
    });

    it("ignores non-bash tools", async () => {
        const { client, logs } = capturingClient();
        const hooks = await load(client);
        await hooks["tool.execute.before"]!({ tool: "read", sessionID: "s", callID: "c" }, { args: { filePath: "x" } });
        assert.equal(logs.length, 0);
    });

    it("allows benign bash (no throw, no log)", async () => {
        const { client, logs } = capturingClient();
        const hooks = await load(client);
        await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s", callID: "c" }, { args: { command: "ls -la" } });
        assert.equal(logs.length, 0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: npm run test:plugin
Expected: FAIL — tool.execute.before is undefined (no-op plugin returns {}).

- [ ] **Step 3: Implement** — replace the no-op PreToolUse at the bottom of the file with the real plugin and type guard:

```typescript
// Compile-time guard: abort build if the SDK ever drops this hook key.
const _assertToolExecuteBeforeValid: "tool.execute.before" extends keyof Hooks
    ? true
    : never = true;
void _assertToolExecuteBeforeValid;

/**
 * PreToolUse safety hook plugin. Intercepts bash tool calls and blocks or
 * warns on destructive commands. Fails open: a classifier error never
 * blocks all bash. See ADR-0023.
 */
export const PreToolUse: Plugin = async ({ directory, client }) => {
    const hooks: Hooks = {
        "tool.execute.before": async (input, output) => {
            if (input.tool !== "bash") return;
            const command: string = output.args?.command ?? "";
            let finding: Finding;
            try {
                finding = classifyCommand(command, { projectDir: directory });
            } catch {
                return; // fail open
            }
            if (finding.severity === "block") {
                throw new Error(`[pre-tool-use] BLOCKED: ${finding.reason}`);
            }
            if (finding.severity === "warn") {
                // Best-effort log; fire-and-forget, suppress rejections.
                client.app
                    .log({
                        body: {
                            service: "pre-tool-use",
                            level: "warn",
                            message: `WARNING: ${finding.reason}`,
                        },
                    })
                    .catch(() => {});
            }
        },
    };
    return hooks;
};
```

Remove the old no-op:
```typescript
// No-op plugin shell; real hook wired in Task 4.
export const PreToolUse: Plugin = async () => ({});
```

- [ ] **Step 4: Run the full plugin suite to verify it passes**

Run: npm run test:plugin
Expected: PASS (all classifier + hook tests green).

- [ ] **Step 5: Commit (closes the issue)**

```bash
git add .opencode/plugins/pre-tool-use.ts tests/Plugin/pre-tool-use.test.ts
git commit -S -m "feat(hooks): wire pre-tool-use safety hook plugin

Fixes: #140
Plan-by: glm-5.2
Acked-by: <resolve from agent.build.model via conventional-commits skill>
Signed-off-by: kyau <git@kyaulabs.com>"
```
