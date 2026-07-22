// $KYAULabs: pre-tool-use.ts kyau@nova 2026/07/21 -0700 Exp $




import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { resolve as resolvePath, normalize } from "node:path";
import { tmpdir } from "node:os";

/**
 * Tokenize a command segment on whitespace outside quotes.
 * Strips one layer of surrounding matching quotes from each token.
 * Returns [] for blank input.
 */
export function tokenizeCommand(segment: string): string[] {
    const trimmed = segment.trim();
    if (trimmed.length === 0) return [];

    const tokens: string[] = [];
    let i = 0;
    while (i < trimmed.length) {
        // Skip leading whitespace
        while (i < trimmed.length && /\s/.test(trimmed[i])) i++;
        if (i >= trimmed.length) break;

        let token = "";
        if (trimmed[i] === '"' || trimmed[i] === "'") {
            const quote = trimmed[i];
            i++; // consume opening quote
            while (i < trimmed.length && trimmed[i] !== quote) {
                if (trimmed[i] === "\\" && i + 1 < trimmed.length) {
                    // Consume escape + next char literally
                    token += trimmed[i + 1];
                    i += 2;
                } else {
                    token += trimmed[i];
                    i++;
                }
            }
            i++; // consume closing quote
        } else {
            while (i < trimmed.length && !/\s/.test(trimmed[i])) {
                token += trimmed[i];
                i++;
            }
        }
        tokens.push(token);
    }
    return tokens;
}

export type Severity = "block" | "warn" | null;

export interface Finding {
    severity: Severity;
    reason: string;
}

export interface ClassifyOptions {
    projectDir: string;
}

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

function basename(token: string): string {
    const lastSlash = token.lastIndexOf("/");
    return lastSlash === -1 ? token : token.slice(lastSlash + 1);
}

function parseRm(segment: string): ParsedRm | null {
    const tokens = tokenizeCommand(segment);
    return parseRmTokens(tokens, 0);
}

function parseRmTokens(tokens: string[], startIdx: number): ParsedRm | null {
    let i = startIdx;
    if (tokens[i] === "sudo") i++;
    if (i >= tokens.length || basename(tokens[i]) !== "rm") return null;
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

function findRmAnywhere(tokens: string[]): number {
    for (let i = 0; i < tokens.length; i++) {
        if (basename(tokens[i]) === "rm") return i;
    }
    return -1;
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
        // BLOCK: rm -rf outside safe zones
        const home = process.env.HOME || "/";
        const segments = command.split(/[;&|\n]/);
        for (const segment of segments) {
            const segTokens = tokenizeCommand(segment);
            if (segTokens.length === 0) continue;

            // Try rm at head (with basename matching, sudo skip)
            let parsed = parseRmTokens(segTokens, 0);

            // If not at head, scan anywhere in the token stream
            let foundIdx = -1;
            if (!parsed) {
                foundIdx = findRmAnywhere(segTokens);
                if (foundIdx > 0) {
                    parsed = parseRmTokens(segTokens, foundIdx);
                }
            }

            if (!parsed || !(parsed.recursive && parsed.force)) continue;

            // rm -rf with no operands: if rm was not at head (wrapper like xargs)
            // or the head is xargs, block conservatively (operands from stdin)
            if (parsed.operands.length === 0) {
                if (foundIdx > 0 || segTokens[0] === "xargs") {
                    return {
                        severity: "block",
                        reason: "rm -rf detected with unresolvable targets (likely piped/stdin input)",
                    };
                }
                continue;
            }
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
        // BLOCK: git push --force / -f
        // tokens.includes does exact matching, so --force won't match --force-with-lease
        if (/\bgit\s+push\b/.test(command)) {
            const tokens = tokenizeCommand(command);
            if (tokens.includes("-f") || tokens.includes("--force")) {
                return { severity: "block", reason: "git push --force rewrites published history" };
            }
        }
        // BLOCK: --no-verify / scoped -n — prevents bypassing pre-commit,
        // commit-msg, and pre-push hooks. --no-verify is never legitimate for
        // agent work, so block it on any git command. -n means --no-verify ONLY
        // on `git commit` (on other commands -n is --dry-run/--no-commit/
        // max-count and must not be blocked). See ADR-0025.
        {
            const gitMatch = command.match(/\bgit\s+([a-z-]+)/);
            const subcmd = gitMatch ? gitMatch[1] : "";
            const tokens = tokenizeCommand(command);
            if (tokens.includes("--no-verify") || (subcmd === "commit" && tokens.includes("-n"))) {
                return {
                    severity: "block",
                    reason: "--no-verify bypasses commit/push hooks (pre-commit, commit-msg, pre-push); local CI-parity checks must run",
                };
            }
        }
        return { severity: null, reason: "" };
    } catch {
        return { severity: null, reason: "" };
    }
}

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
            const command: string = output?.args?.command ?? "";
            let finding: Finding;
            try {
                finding = classifyCommand(command, { projectDir: directory });
            } catch {
                return; // fail open
            }
            if (finding.severity === "block") {
                throw new Error(
                    `[pre-tool-use] BLOCKED: ${finding.reason}`,
                );
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




// vim: ft=typescript sts=4 sw=4 ts=4 et :
