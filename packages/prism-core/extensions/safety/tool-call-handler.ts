// $KYAULabs: tool-call-handler.ts kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

import { resolve as resolvePath, normalize } from "node:path";
import {
    loadAdditionalSensitivePaths,
    sensitiveOperandCheck,
    sensitivePathMatch,
    sensitivePatternCheck,
    type SafetyDiagnostic,
    type SensitiveMatch,
    type SensitivePathOptions,
} from "./sensitive-paths.ts";

const SENSITIVE_REASON = "sensitive-path policy (ADR-0047)";
const MALFORMED_REASON = "malformed path or pattern argument — failing closed per ADR-0047";
const INTERNAL_DIAGNOSTIC: SafetyDiagnostic = {
    code: "PRISM-SHELL-012",
    stage: "classifier",
    category: "internal-classifier",
    retry: "Split the operation into separate simple literal commands and report this diagnostic code if it persists.",
};

function diagnosticReason(diagnostic: SafetyDiagnostic): string {
    return "command could not be analyzed for sensitive-path safety — " +
        `failing closed per ADR-0047; code=${diagnostic.code}; ` +
        `stage=${diagnostic.stage}; category=${diagnostic.category}; ` +
        `safe retry: ${diagnostic.retry}`;
}

function blockReasonFor(match: SensitiveMatch): string {
    if (match.className === "unresolvable") {
        return diagnosticReason(match.diagnostic ?? INTERNAL_DIAGNOSTIC);
    }
    if (match.className === "malformed") return MALFORMED_REASON;
    return SENSITIVE_REASON;
}

/**
 * Dependencies injected by the extension wiring (index.ts). Everything the
 * handler needs from the pi host is passed in so this module stays pure and
 * unit-testable without importing @earendil-works/pi-coding-agent.
 */
export interface ToolCallDeps {
    /** Project working directory. */
    cwd: string;
    /** User home directory for ~ expansion. */
    home: string;
    /** Extra deny-floor paths from PRISM_SENSITIVE_PATHS (F-2). */
    extraPaths: string[];
}

export type ToolCallResult = { block: true; reason: string; terminate?: true } | undefined;

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
    const lines = envValue.split("\n");
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (line.trim() === "") continue;
        try {
            paths.push(...loadAdditionalSensitivePaths(line));
        } catch {
            log(
                `[prism safety] ignoring malformed sensitive-paths entry at line ${index + 1} — ` +
                `invalid entry shape. Other entries and the core deny floor remain active (ADR-0047).`,
            );
        }
    }
    return paths;
}

/**
 * Resolve a path-shaped argument against the sensitive deny floor. A leading
 * `@` (pi/curl file-ref prefix) is stripped first. `undefined` means "no
 * path arg supplied" (allow, null); any other non-string shape is
 * present-but-malformed and fails closed (ADR-0036).
 */
function sensitivePathMatchArg(pathArg: unknown, opts: SensitivePathOptions): SensitiveMatch | null {
    if (pathArg === undefined) return null;
    if (typeof pathArg !== "string") return { className: "malformed" };
    if (pathArg === "") return null;
    const path = pathArg.replace(/^@+/, "");
    if (path === "") return null;
    const abs = path.startsWith("~")
        ? normalize(opts.home + path.slice(1))
        : normalize(resolvePath(opts.projectDir, path));
    return sensitivePathMatch(abs, opts);
}

/**
 * Block when a path-shaped argument resolves into the sensitive deny
 * floor; `undefined` (allow) otherwise. Shared by the read/ls/grep/find
 * branches so the block idiom cannot drift between tools.
 */
function blockIfSensitive(pathArg: unknown, opts: SensitivePathOptions): ToolCallResult {
    const match = sensitivePathMatchArg(pathArg, opts);
    if (match) {
        return { block: true, reason: `[prism safety] BLOCKED: ${blockReasonFor(match)}` };
    }
    return undefined;
}

/**
 * Block when a search pattern resolves into the sensitive deny floor;
 * `undefined` (allow) otherwise. Shared by the grep (glob) and find
 * (pattern) branches.
 */
function blockIfPatternSensitive(pattern: unknown, base: string, opts: SensitivePathOptions): ToolCallResult {
    const match = sensitivePatternCheck(pattern, base, opts);
    if (match) {
        return { block: true, reason: `[prism safety] BLOCKED: ${blockReasonFor(match)}` };
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
        const opts: SensitivePathOptions = { projectDir: deps.cwd, home: deps.home, extraPaths: deps.extraPaths };

        if (toolName === "bash") {
            const command: unknown = (input as { command?: unknown }).command;
            if (typeof command !== "string") {
                return {
                    block: true,
                    reason: `[prism safety] BLOCKED: malformed bash args — failing closed per ADR-0036`,
                };
            }
            const operandMatch = sensitiveOperandCheck(command, opts);
            if (operandMatch) {
                return { block: true, reason: `[prism safety] BLOCKED: ${blockReasonFor(operandMatch)}` };
            }
            return;
        }

        if (["read", "ls", "edit", "write"].includes(toolName)) {
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
    } catch {
        return {
            block: true,
            reason:
                `[prism safety] BLOCKED: safety handler internal error — failing closed per ADR-0036; ` +
                `code=${INTERNAL_DIAGNOSTIC.code}; stage=${INTERNAL_DIAGNOSTIC.stage}; ` +
                `category=${INTERNAL_DIAGNOSTIC.category}; safe retry: ${INTERNAL_DIAGNOSTIC.retry}`,
        };
    }
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
