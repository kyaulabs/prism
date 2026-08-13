// $KYAULabs: index.ts kyau@aura.kyaulabs 2026/08/12 -0700 Exp $



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
 *   - classifier internal error → BLOCK (ADR-0036, in `classifyCommand`)
 *   - present-but-malformed tool args → BLOCK
 *   - sensitive-path deny floor never bypassed (ADR-0047/ADR-0048)
 *
 * See `README.md` in this directory for the port notes, the adapter
 * `safe-dirs.json` contract, and the fail-closed guarantee.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { resolve as resolvePath, normalize } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyCommand } from "./pre-tool-use.ts";
import {
    loadAdditionalSensitivePaths,
    sensitiveOperandCheck,
    sensitivePathMatch,
    sensitivePatternCheck,
    type SensitivePathOptions,
} from "./sensitive-paths.ts";
import { DenialCircuitBreaker } from "./denial-circuit-breaker.ts";

/**
 * Consecutive bash denials required to trip the circuit breaker (ADR-0042 /
 * issue #274). Matches the upstream doom_loop identical-input threshold and
 * the opencode-era constant. Kept as a single module-level constant so the
 * breaker config and the redacted escalation always report the same value.
 */
const TRIP_THRESHOLD = 3;

const SENSITIVE_REASON = "sensitive-path policy (ADR-0047)";

/** Fallback safe `rm -rf` dirs when neither adapter nor core safe-dirs resolve. */
const FALLBACK_SAFE_REL_DIRS: readonly string[] = ["node_modules", ".pi/npm", ".pi/git"];

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
 *   3. Hardcoded fallback (never empty).
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
    return FALLBACK_SAFE_REL_DIRS;
}

/**
 * Resolve the deny-floor extension surface. `PRISM_SENSITIVE_PATHS` is a
 * newline-joined list of `~/`-prefixed or absolute paths appended to the
 * core deny floor. `loadAdditionalSensitivePaths` throws on a malformed
 * entry to fail closed (ADR-0047); we surface it loudly and keep the core
 * DEFAULT_PATTERNS deny floor in effect rather than aborting every session
 * over a bad env var.
 */
function resolveExtraPaths(): string[] {
    const paths: string[] = [];
    const envValue = process.env.PRISM_SENSITIVE_PATHS;
    if (envValue !== undefined && envValue !== "") {
        try {
            paths.push(...loadAdditionalSensitivePaths(envValue));
        } catch (err) {
            console.error(
                `[prism safety] ignoring malformed sensitive-paths env entry — ` +
                `${err instanceof Error ? err.message : String(err)}. ` +
                `Core deny floor still active (ADR-0047).`,
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

export default function (pi: ExtensionAPI) {
    /** Per-session consecutive-bash-denial circuit breaker (ADR-0042). */
    const breaker = new DenialCircuitBreaker({ threshold: TRIP_THRESHOLD });

    /** Resolved per session (session_start). Defaults keep the gate usable
     *  even before the first session_start fires. */
    let safeRelDirs: readonly string[] = FALLBACK_SAFE_REL_DIRS;
    let extraPaths: string[] = [];
    const homeDir = homedir();

    /**
     * Record a bash denial. On the trip transition (count === threshold),
     * emit the redacted escalation (ADR-0042: no command text, args, output,
     * or metadata — only identity + count). Once tripped, `breaker.isTripped`
     * blocks all subsequent tool calls for the session (fail-closed,
     * ADR-0036); there is no `client.session.abort` in pi, so the user must
     * `/new` to reset.
     */
    function noteBashDenial(sid: string, ctx: ExtensionContext): void {
        const obs = breaker.observe(sid, true);
        if (!obs.transitioned) return;
        const redacted =
            `[prism safety] circuit breaker tripped: ${obs.count} consecutive bash ` +
            `denials in this session. All tools blocked until /new. (ADR-0042/ADR-0036)`;
        if (ctx.hasUI) {
            ctx.ui.notify(redacted, "error");
        } else {
            console.error(`${redacted} (session ${sid})`);
        }
    }

    pi.on("session_start", async (_event, ctx) => {
        safeRelDirs = resolveSafeRelDirs(ctx.cwd);
        extraPaths = resolveExtraPaths();
    });

    pi.on("tool_call", async (event, ctx) => {
        const sid = sessionId(ctx);

        // 1. Circuit-breaker tripped (ADR-0042): block ALL tools while the
        //    session is tripped, before the classifier runs. Does not feed
        //    the breaker again (already tripped).
        if (breaker.isTripped(sid)) {
            return {
                block: true,
                reason:
                    `[prism safety] BLOCKED: session tripped (${breaker.count(sid)} ` +
                    `consecutive bash denials) — circuit breaker active per ADR-0042. ` +
                    `Run /new to reset.`,
            };
        }

        const opts: SensitivePathOptions = { projectDir: ctx.cwd, home: homeDir, extraPaths };

        // 2. bash: sensitive operands first (ADR-0047/ADR-0048 §5), then the
        //    destructive classifier (ADR-0023, ADR-0036). A blocked bash
        //    feeds the breaker; a warn is surfaced via notify.
        if (isToolCallEventType("bash", event)) {
            const command: unknown = event.input.command;
            if (typeof command !== "string") {
                noteBashDenial(sid, ctx);
                return {
                    block: true,
                    reason: `[prism safety] BLOCKED: malformed bash args — failing closed per ADR-0036`,
                };
            }
            const operandMatch = sensitiveOperandCheck(command, opts);
            if (operandMatch) {
                noteBashDenial(sid, ctx);
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            const finding = classifyCommand(command, { projectDir: ctx.cwd, safeRelDirs });
            if (finding.severity === "block") {
                noteBashDenial(sid, ctx);
                return { block: true, reason: `[prism safety] BLOCKED: ${finding.reason}` };
            }
            if (finding.severity === "warn" && ctx.hasUI) {
                ctx.ui.notify(`[prism safety] WARNING: ${finding.reason}`, "warning");
            }
            return;
        }

        // 3. read/grep/find/ls: sensitive-path deny floor (ADR-0047/ADR-0048
        //    §5). Non-bash blocks do NOT feed the bash-only breaker.
        if (isToolCallEventType("read", event)) {
            if (sensitivePathBlocks(event.input.path, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            return;
        }
        if (isToolCallEventType("ls", event)) {
            if (sensitivePathBlocks(event.input.path, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            return;
        }
        if (isToolCallEventType("grep", event)) {
            if (sensitivePathBlocks(event.input.path, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            const base = typeof event.input.path === "string" ? event.input.path : ctx.cwd;
            if (sensitivePatternCheck(event.input.glob, base, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            return;
        }
        if (isToolCallEventType("find", event)) {
            if (sensitivePathBlocks(event.input.path, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            const base = typeof event.input.path === "string" ? event.input.path : ctx.cwd;
            if (sensitivePatternCheck(event.input.pattern, base, opts)) {
                return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
            }
            return;
        }
    });

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
