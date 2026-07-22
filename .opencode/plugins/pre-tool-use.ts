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

/** Shell interpreters whose `-c` flag wraps a command string. */
const SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

/** Maximum recursion depth for wrapper unwrapping. */
const MAX_UNWRAP_DEPTH = 3;

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

/** Git global options that take a value (consume the next token). */
const GIT_VALUE_GLOBALS = new Set([
    "-C", "-c", "--git-dir", "--work-tree", "--namespace",
    "--super-prefix", "--config-env", "--exec-path",
]);

/** Git global options that do NOT take a value. */
const GIT_VALUELESS_GLOBALS = new Set([
    "--bare", "--no-replace-objects", "-p", "-P", "--paginate",
    "--no-pager", "-l", "--literal-pathspecs", "--no-literal-pathspecs",
    "--version", "--help",
]);

/**
 * Advance past `git` and any global options to find the subcommand.
 * Returns the subcommand and the remaining tokens (after the subcommand).
 */
function findGitSubcommand(tokens: string[]): { subcmd: string; rest: string[] } | null {
    let i = 0;
    if (tokens[i] !== "git") return null;
    i++; // skip "git"

    while (i < tokens.length) {
        const t = tokens[i];
        // Value-taking global: consume this token + next as value
        if (GIT_VALUE_GLOBALS.has(t)) {
            i += 2; // skip option + its value
            continue;
        }
        // Handle --opt=value form
        const eqIdx = t.indexOf("=");
        if (eqIdx > 0 && GIT_VALUE_GLOBALS.has(t.slice(0, eqIdx))) {
            i++; // value is inline, skip one token
            continue;
        }
        // Value-less global: consume only this token
        if (GIT_VALUELESS_GLOBALS.has(t)) {
            i++;
            continue;
        }
        // Not a recognized global option → this is the subcommand
        break;
    }

    if (i >= tokens.length) return null;
    return { subcmd: tokens[i], rest: tokens.slice(i + 1) };
}

/**
 * Expand short-flag bundles like `-uf` into individual flags.
 * Long flags (`--*`) pass through unchanged.
 */
function expandShortFlags(token: string): string[] {
    if (token.startsWith("--")) return [token];
    if (/^-[a-zA-Z]+$/.test(token)) {
        return token.slice(1).split("").map((c) => "-" + c);
    }
    return [token];
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
 * If `tokens` starts with a known wrapper, unwrap one layer and return
 * the inner command string. Returns null if the segment is not a wrapper.
 */
function tryUnwrapSegment(tokens: string[]): string | null {
    if (tokens.length === 0) return null;

    const head = tokens[0];

    // Shell -c wrapper: bash -c "..."
    if (SHELL_WRAPPERS.has(head) && tokens[1] === "-c" && tokens.length >= 3) {
        return tokens[2]; // the script string (quote-stripped by tokenizer)
    }

    // xargs is NOT unwrapped here — the rm detection in the main loop
    // already handles xargs + rm via findRmAnywhere with the xargs check
    // for unresolvable operands.

    // env: drop env and any NAME=VALUE leading tokens, join rest as command
    if (head === "env") {
        let i = 1;
        while (i < tokens.length && tokens[i].includes("=")) i++;
        if (i < tokens.length) {
            return tokens.slice(i).join(" ");
        }
        return null;
    }

    // command / exec: drop head, join rest as command
    if (head === "command" || head === "exec") {
        if (tokens.length > 1) {
            return tokens.slice(1).join(" ");
        }
        return null;
    }

    // eval: join all remaining tokens as the command string
    if (head === "eval") {
        if (tokens.length > 1) {
            return tokens.slice(1).join(" ");
        }
        return null;
    }

    return null;
}

/**
 * Classify a bash command string for safety. Pure and side-effect free;
 * never throws (returns a PASS finding on any internal error so the
 * harness fails open). See ADR-0023.
 */
export function classifyCommand(command: string, opts: ClassifyOptions): Finding {
    return classifyImpl(command, opts, 0);
}

function classifyImpl(command: string, opts: ClassifyOptions, depth: number): Finding {
    if (typeof command !== "string" || command.length === 0) {
        return { severity: null, reason: "" };
    }
    if (depth > MAX_UNWRAP_DEPTH) {
        return { severity: "block", reason: "nested wrapper depth exceeded — failing closed" };
    }
    const projectDir = opts.projectDir;

    try {
        // BLOCK: rm -rf outside safe zones
        const home = process.env.HOME || "/";
        const segments = command.split(/[;&|\n]/);
        for (const segment of segments) {
            const segTokens = tokenizeCommand(segment);
            if (segTokens.length === 0) continue;

            // Try wrapper unwrapping first
            const innerCmd = tryUnwrapSegment(segTokens);
            if (innerCmd !== null) {
                const innerFinding = classifyImpl(innerCmd, opts, depth + 1);
                if (innerFinding.severity !== null) return innerFinding;
                continue;
            }

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
        // BLOCK: find -delete / find -exec rm — unconditional block.
        // Inserted before warn-level checks so block wins over any warning.
        {
            const segments = command.split(/[;&|\n]/);
            for (const segment of segments) {
                const segTokens = tokenizeCommand(segment);
                if (segTokens.length === 0) continue;
                if (basename(segTokens[0]) !== "find") continue;

                for (let i = 0; i < segTokens.length; i++) {
                    const t = segTokens[i];
                    if (t === "-delete") {
                        return {
                            severity: "block",
                            reason: "find -delete removes files; destructive action blocked",
                        };
                    }
                    if ((t === "-exec" || t === "-execdir") && i + 1 < segTokens.length) {
                        if (basename(segTokens[i + 1]) === "rm") {
                            return {
                                severity: "block",
                                reason: "find -exec/-execdir rm removes files; destructive action blocked",
                            };
                        }
                    }
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
        // Uses findGitSubcommand to skip global options and expandShortFlags
        // to catch bundled flags like -uf. --force won't match --force-with-lease
        // because expandShortFlags leaves long flags intact.
        {
            const tokens = tokenizeCommand(command);
            const gitInfo = findGitSubcommand(tokens);
            if (gitInfo && gitInfo.subcmd === "push") {
                const expanded = gitInfo.rest.flatMap(expandShortFlags);
                if (expanded.includes("-f") || expanded.includes("--force")) {
                    return { severity: "block", reason: "git push --force rewrites published history" };
                }
            }
        }
        // BLOCK: --no-verify / scoped -n — prevents bypassing pre-commit,
        // commit-msg, and pre-push hooks. --no-verify is never legitimate for
        // agent work, so block it on any git command. -n means --no-verify ONLY
        // on `git commit` (on other commands -n is --dry-run/--no-commit/
        // max-count and must not be blocked). See ADR-0025.
        {
            const tokens = tokenizeCommand(command);
            const gitInfo = findGitSubcommand(tokens);
            if (gitInfo) {
                const expanded = gitInfo.rest.flatMap(expandShortFlags);
                if (
                    expanded.includes("--no-verify") ||
                    (gitInfo.subcmd === "commit" && expanded.includes("-n"))
                ) {
                    return {
                        severity: "block",
                        reason: "--no-verify bypasses commit/push hooks (pre-commit, commit-msg, pre-push); local CI-parity checks must run",
                    };
                }
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
