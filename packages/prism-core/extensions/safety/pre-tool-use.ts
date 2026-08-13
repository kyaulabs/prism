// $KYAULabs: pre-tool-use.ts kyau@aura.kyaulabs 2026/08/12 -0700 Exp $













import { resolve as resolvePath, normalize } from "node:path";
import { tmpdir } from "node:os";
import { tokenizeCommand, tryUnwrapSegment } from "./sensitive-paths.ts";

// Re-export for tests.
export { tokenizeCommand } from "./sensitive-paths.ts";

export type Severity = "block" | "warn" | null;

export interface Finding {
    severity: Severity;
    reason: string;
}

export interface ClassifyOptions {
    projectDir: string;
    /**
     * Project-relative directories where `rm -rf` is permitted. Adapter-driven
     * (ADR-0056): the pi wrapper resolves this from the active adapter's
     * `safe-dirs.json` (core default otherwise). When omitted, the built-in
     * SAFE_REL_DIRS fallback applies. The classify algorithm itself is
     * unchanged from the opencode-era plugin.
     */
    safeRelDirs?: readonly string[];
}

/** Built-in fallback project-relative directories where rm -rf is permitted. */
const SAFE_REL_DIRS: readonly string[] = [
    "node_modules",
    ".pi/npm",
    ".pi/git",
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

function isWithinSafeZone(absPath: string, projectDir: string, safeRelDirs: readonly string[]): boolean {
    if (SAFE_ABS_DIRS.some((d) => absPath === d || absPath.startsWith(d + "/"))) {
        return true;
    }
    return safeRelDirs.some((rel) => {
        const safeAbs = normalize(resolvePath(projectDir, rel));
        return absPath === safeAbs || absPath.startsWith(safeAbs + "/");
    });
}

/**
 * Classify a bash command string for safety. Pure and side-effect free.
 * Fails closed on any internal error — returns a BLOCK finding when the
 * classifier cannot evaluate a command it was asked to evaluate.
 * See ADR-0023, ADR-0036.
 */
export function classifyCommand(command: string, opts: ClassifyOptions): Finding {
    // Empty command = nothing to evaluate (preserved from original fail-open contract)
    if (typeof command === "string" && command.length === 0) {
        return { severity: null, reason: "" };
    }
    try {
        return classifyCommandImpl(command, opts, 0);
    } catch {
        return { severity: "block", reason: "safety classifier internal error — failing closed per #178 / ADR-0036" };
    }
}

function classifyCommandImpl(command: string, opts: ClassifyOptions, depth: number): Finding {
    if (depth > MAX_UNWRAP_DEPTH) {
        return { severity: "block", reason: "nested wrapper depth exceeded — failing closed" };
    }
    const projectDir = opts.projectDir;
    const safeRelDirs = opts.safeRelDirs ?? SAFE_REL_DIRS;

    // BLOCK: rm -rf outside safe zones
        const home = process.env.HOME || "/";
        const segments = command.split(/[;&|\n]/);
        for (const segment of segments) {
            const segTokens = tokenizeCommand(segment);
            if (segTokens.length === 0) continue;

            // Try wrapper unwrapping first
            const innerCmd = tryUnwrapSegment(segTokens);
            if (innerCmd !== null) {
                const innerFinding = classifyCommandImpl(innerCmd, opts, depth + 1);
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
                if (abs === null || !isWithinSafeZone(abs, projectDir, safeRelDirs)) {
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
}


// vim: ft=typescript sts=4 sw=4 ts=4 et :
