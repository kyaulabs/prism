// $KYAULabs: tool-call-handler.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $





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
    const path = pathArg.replace(/^@+/, "");
    if (path === "") return false;
    const abs = path.startsWith("~")
        ? normalize(opts.home + path.slice(1))
        : normalize(resolvePath(opts.projectDir, path));
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
 * Block when a path-shaped argument resolves into the sensitive deny
 * floor; `undefined` (allow) otherwise. Shared by the read/ls/grep/find
 * branches so the block idiom cannot drift between tools.
 */
function blockIfSensitive(pathArg: unknown, opts: SensitivePathOptions): ToolCallResult {
    if (sensitivePathBlocks(pathArg, opts)) {
        return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
    }
    return undefined;
}

/**
 * Block when a search pattern resolves into the sensitive deny floor;
 * `undefined` (allow) otherwise. Shared by the grep (glob) and find
 * (pattern) branches.
 */
function blockIfPatternSensitive(pattern: unknown, base: string, opts: SensitivePathOptions): ToolCallResult {
    if (sensitivePatternCheck(pattern, base, opts)) {
        return { block: true, reason: `[prism safety] BLOCKED: ${SENSITIVE_REASON}` };
    }
    return undefined;
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
            return blockIfSensitive((input as { path?: unknown }).path, opts);
        }
        if (toolName === "grep") {
            const pathArg = input as { path?: unknown };
            return blockIfSensitive(pathArg.path, opts)
                ?? blockIfPatternSensitive(
                    (input as { glob?: unknown }).glob,
                    typeof pathArg.path === "string" ? pathArg.path : deps.cwd,
                    opts,
                );
        }
        if (toolName === "find") {
            const pathArg = input as { path?: unknown };
            return blockIfSensitive(pathArg.path, opts)
                ?? blockIfPatternSensitive(
                    (input as { pattern?: unknown }).pattern,
                    typeof pathArg.path === "string" ? pathArg.path : deps.cwd,
                    opts,
                );
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








// vim: ft=typescript sts=4 sw=4 ts=4 et :
