// $KYAULabs: index.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


/**
 * prism-core safety extension — the single retained extension (ADR-0056).
 *
 * Ports the opencode-era safety stack (`sensitive-paths` + `pre-tool-use` +
 * `denial-circuit-breaker` plugins) to a pi extension wired to the
 * `tool_call` event. The pure logic files (`sensitive-paths.ts`,
 * `denial-circuit-breaker.ts`) and the classifier (`pre-tool-use.ts` →
 * `classifyCommand`) are copied verbatim; this file is the new wrapper.
 *
 * ADR-0042 simplification: in pi, returning `{ block: true, reason }` from a
 * `tool_call` handler IS the denial — there is no need to correlate
 * `message.part.updated` tool-part states with `tool.execute.after` (the
 * opencode Probe-3 dance). So the wrapper drives the pure
 * `DenialCircuitBreaker` directly: a bash `tool_call` that returns blocked
 * increments the streak; a bash `tool_execution_end` (the call actually ran)
 * resets it. Three consecutive bash denials trip the breaker; once tripped,
 * every subsequent `tool_call` in the session is blocked (fail closed,
 * ADR-0036) and the user is notified to `/new`.
 *
 * Fail-closed invariants preserved verbatim from the opencode plugins:
 *   - any handler internal error → BLOCK (ADR-0036 — the whole policy
 *     body in `handleToolCall` is wrapped, not just `classifyCommand`)
 *   - present-but-malformed tool args → BLOCK
 *   - sensitive-path deny floor never bypassed (ADR-0047/ADR-0048)
 *
 * See `README.md` in this directory for the port notes, the adapter
 * `safe-dirs.json` contract, and the fail-closed guarantee.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DenialCircuitBreaker, DEFAULT_THRESHOLD } from "./denial-circuit-breaker.ts";
import { handleToolCall, resolveExtraPaths } from "./tool-call-handler.ts";

interface SafeDirsFile {
    safe_rm_dirs?: unknown;
}

/** Session key for the breaker — stable per session file, falls back to cwd. */
function sessionId(ctx: ExtensionContext): string {
    return ctx.sessionManager.getSessionFile() ?? ctx.cwd ?? "ephemeral";
}

function readJsonSync(path: string): unknown {
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
        return null;
    }
}

function extractSafeDirs(data: unknown): readonly string[] | null {
    if (!data || typeof data !== "object") return null;
    const arr = (data as SafeDirsFile).safe_rm_dirs;
    if (!Array.isArray(arr)) return null;
    const dirs = arr.filter((d): d is string => typeof d === "string");
    return dirs.length > 0 ? dirs : null;
}

/**
 * Resolve the project-relative `rm -rf` safe zones for a session (ADR-0056
 * step 5). Resolution order:
 *   1. Project-local adapter drop point `<cwd>/.pi/safe-dirs.json` — when a
 *      stack adapter (e.g. prism-php-web) is installed project-locally it
 *      ships/links its safe-dirs here. Present → used (replaces core default).
 *   2. Core default `safe-dirs.json` bundled next to this extension.
 *   3. Fail-closed: empty (every `rm -rf` is blocked) when neither JSON
 *      source resolves.
 *
 * OS temp dirs (`/tmp`, `/var/tmp`, `os.tmpdir()`) are already hardcoded in
 * `pre-tool-use.ts` (SAFE_ABS_DIRS) and are not adapter-driven.
 */
function resolveSafeRelDirs(cwd: string): readonly string[] {
    const project = extractSafeDirs(readJsonSync(resolvePath(cwd, ".pi", "safe-dirs.json")));
    if (project) return project;
    const corePath = fileURLToPath(new URL("../../safe-dirs.json", import.meta.url));
    const core = extractSafeDirs(readJsonSync(corePath));
    if (core) return core;
    return [];
}

export default function (pi: ExtensionAPI) {
    /** Per-session consecutive-bash-denial circuit breaker (ADR-0042). */
    const breaker = new DenialCircuitBreaker({ threshold: DEFAULT_THRESHOLD });

    /** Fail-closed until session_start resolves the safe zones. */
    let safeRelDirs: readonly string[] = [];
    let extraPaths: string[] = [];
    const homeDir = homedir();

    pi.on("session_start", async (_event, ctx) => {
        safeRelDirs = resolveSafeRelDirs(ctx.cwd);
        extraPaths = resolveExtraPaths(process.env.PRISM_SENSITIVE_PATHS);
    });

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

    // A bash that actually executed (exit 0, nonzero exit, or ask-approved)
    // is not a denial — settle it and reset the streak. Blocked calls never
    // reach tool_execution_end, so only successful resets happen here.
    pi.on("tool_execution_end", async (event, ctx) => {
        if (event.toolName !== "bash") return;
        breaker.observe(sessionId(ctx), false);
    });

    // Agent run finished — drop the session streak so a later re-run starts
    // fresh (was `session.idle` in opencode).
    pi.on("agent_end", async (_event, ctx) => {
        breaker.reset(sessionId(ctx));
    });

    // Session teardown: drop every session's breaker state.
    pi.on("session_shutdown", async () => {
        breaker.clearAll();
    });
}


// vim: ft=typescript sts=4 sw=4 ts=4 et :
