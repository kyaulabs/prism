// $KYAULabs: pre-tool-use.ts kyau@aura.kyaulabs 2026/08/17 -0700 Exp $











import { resolve as resolvePath, normalize } from "node:path";
import { tmpdir } from "node:os";
import { tokenizeCommand, tryUnwrapSegment, findShellWrapperPayload, resolvePathToken, hasUnmodelableShellConstruct, BARE_VARIABLE_RE, stripSurroundingQuotes, MAX_UNWRAP_DEPTH } from "./sensitive-paths.ts";

// Re-export for tests.
export { tokenizeCommand } from "./sensitive-paths.ts";

export type Severity = "block" | "warn";

export interface Finding {
    severity: Severity;
    reason: string;
}

export interface ClassifyOptions {
    projectDir: string;
    /**
     * Project-relative directories where `rm -rf` is permitted. Adapter-driven
     * (ADR-0056): the pi wrapper resolves this from the active adapter's
     * `safe-dirs.json` (core default otherwise). When omitted, no
     * project-relative directories are safe (fail closed, ADR-0036). The
     * classify algorithm itself is unchanged from the opencode-era plugin.
     */
    safeRelDirs?: readonly string[];
}

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

function commandBasename(token: string): string {
    const lastSlash = token.lastIndexOf("/");
    return lastSlash === -1 ? token : token.slice(lastSlash + 1);
}

function parseRmTokens(tokens: string[], startIdx: number): ParsedRm | null {
    let i = startIdx;
    if (tokens[i] === "sudo") i++;
    if (i >= tokens.length || commandBasename(tokens[i]) !== "rm") return null;
    i++;
    let recursive = false;
    let force = false;
    const operands: string[] = [];
    let onlyOperands = false;
    for (; i < tokens.length; i++) {
        const token = tokens[i];
        if (!onlyOperands && token === "--") {
            onlyOperands = true;
            continue;
        }
        if (!onlyOperands && token.startsWith("-") && token.length > 1) {
            if (token.startsWith("--")) {
                if (token === "--recursive") recursive = true;
                else if (token === "--force") force = true;
            } else {
                const chars = token.slice(1);
                if (chars.includes("r") || chars.includes("R")) recursive = true;
                if (chars.includes("f")) force = true;
            }
            continue;
        }
        operands.push(token);
    }
    return { recursive, force, operands };
}

function findRmAnywhere(tokens: string[]): number {
    for (let i = 0; i < tokens.length; i++) {
        if (commandBasename(tokens[i]) === "rm") return i;
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
 * Tokens that make a following `git` word a command invocation rather than
 * a plain argument: shell separators (the tokenizer keeps the split
 * residue of `&&`/`||`/`&`/`|`/`(`) and exec wrappers that run git.
 */
const GIT_SEPARATORS = new Set(["&&", "||", "&", "|", "(", ";"]);
const GIT_INVOCATION_WRAPPERS = new Set([
    "sudo", "xargs", "env", "command", "exec", "eval",
    "timeout", "nice", "nohup", "setsid", "stdbuf",
]);

/**
 * True when the token at index `k` is a git-invocation prefix: a
 * separator, an exec wrapper in command position, or an option/assignment
 * chain hanging off one (sudo -u root git, timeout 10 git, env FOO=1 git).
 * A bare non-wrapper word (echo, man, cat, …) means git is a plain
 * argument and the context is false (OCR findings N3 / round-3 high).
 */
function isGitInvocationContext(tokens: string[], k: number): boolean {
    while (k >= 0) {
        const t = tokens[k];
        if (GIT_SEPARATORS.has(t)) return true;
        if (GIT_INVOCATION_WRAPPERS.has(t)) {
            const prev = tokens[k - 1];
            if (prev === undefined
                || GIT_SEPARATORS.has(prev)
                || isOptionToken(prev)
                || prev.includes("=")
                || GIT_INVOCATION_WRAPPERS.has(prev)) {
                return true;
            }
            // Wrapper used as a plain word (echo sudo git …) — keep walking
            // back in case it is part of a longer wrapper chain
            // (sudo -u root env FOO=1 git …) (OCR round 4).
            k--;
            continue;
        }
        if (isOptionToken(t) || t.includes("=")) {
            k--;
            continue;
        }
        // Bare word: a wrapper argument when it follows a wrapper, option,
        // or assignment (sudo -u root git, timeout 10 git); otherwise a
        // plain-argument context (echo 10 git …).
        const prev = tokens[k - 1];
        if (prev !== undefined
            && (GIT_INVOCATION_WRAPPERS.has(prev) || isOptionToken(prev) || prev.includes("="))) {
            k--;
            continue;
        }
        return false;
    }
    return true; // reached segment start
}

/**
 * Locate a `git` invocation at ANY command position (`cd /repo && git …`,
 * `echo ok; git …`, `sudo -u root git …`) and resolve its subcommand from
 * there. The git rules run per segment, so git need not be token 0.
 */
function findGitCommandAnywhere(tokens: string[]): { subcmd: string; rest: string[] } | null {
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] !== "git") continue;
        if (i === 0 || isGitInvocationContext(tokens, i - 1)) {
            const info = findGitSubcommand(tokens.slice(i));
            if (info !== null) return info;
        }
    }
    return null;
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

/** True when a token is option-shaped (starts with `-`). */
function isOptionToken(token: string): boolean {
    return token.startsWith("-") && token.length > 1;
}

function resolveTarget(token: string, projectDir: string, home: string): string | null {
    return resolvePathToken(token, projectDir, home);
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
export function classifyCommand(command: string, opts: ClassifyOptions): Finding | null {
    // Empty command = nothing to evaluate (preserved from original fail-open contract)
    if (typeof command === "string" && command.length === 0) {
        return null;
    }
    try {
        return classifyCommandImpl(command, opts, 0);
    } catch {
        return { severity: "block", reason: "safety classifier internal error — failing closed per #178 / ADR-0036" };
    }
}

interface RuleCtx {
    projectDir: string;
    home: string;
    safeRelDirs: readonly string[];
}

type SegmentRule = (tokens: string[], ctx: RuleCtx) => Finding | null;

type CommandRule = (command: string, tokens: string[], ctx: RuleCtx) => Finding | null;

// Segment-phase rules: block-level first (rm/find), then whole-command
// rules per segment. Within the array the first match wins; the rm/find
// blocks beat the git warns because they run earlier in the loop.
const SEGMENT_RULES: readonly SegmentRule[] = [rmRfRule, findDeleteRule];

// Per-segment command rules, run after the segment rules in statement
// order: warn-level rules first, then block-level rules.
const COMMAND_RULES: readonly CommandRule[] = [
    sqlDropWarn,
    gitResetWarn,
    gitPushDeleteWarn,
    gitForcePushBlock,
    gitNoVerifyBlock,
];

function classifyCommandImpl(command: string, opts: ClassifyOptions, depth: number): Finding | null {
    if (depth > MAX_UNWRAP_DEPTH) {
        return { severity: "block", reason: "nested wrapper depth exceeded — failing closed" };
    }
    if (hasUnmodelableShellConstruct(command)) {
        return {
            severity: "block",
            reason: "unmodelable shell construct (substitution/quoting/here-string) — failing closed per ADR-0036",
        };
    }
    const ctx: RuleCtx = {
        projectDir: opts.projectDir,
        home: process.env.HOME || "/",
        safeRelDirs: opts.safeRelDirs ?? [],
    };
    for (const segment of command.split(/[;&|\n]/)) {
        const tokens = tokenizeCommand(segment);
        if (tokens.length === 0) continue;
        // Per-segment: a command that IS a bare variable reference cannot be
        // analyzed (echo hi; $cmd, bash -c "$cmd") — fail closed (OCR rounds
        // 4-5). Quote-stripped so "$cmd" forms cannot hide the reference.
        if (BARE_VARIABLE_RE.test(stripSurroundingQuotes(segment))) {
            return {
                severity: "block",
                reason: "command is a variable reference whose value cannot be analyzed — failing closed per ADR-0036",
            };
        }

        const innerCmd = tryUnwrapSegment(tokens);
        if (innerCmd !== null) {
            const innerFinding = classifyCommandImpl(innerCmd, opts, depth + 1);
            if (innerFinding !== null) return innerFinding;
            continue;
        }
        const wrapped = findShellWrapperPayload(tokens);
        if (wrapped !== null) {
            const innerFinding = classifyCommandImpl(wrapped, opts, depth + 1);
            if (innerFinding !== null) return innerFinding;
            // Fall through: the payload was clean, but the segment's own
            // tokens (e.g. rm operands beside the wrapper) still need the
            // segment rules (OCR finding C3).
        }
        for (const rule of SEGMENT_RULES) {
            const finding = rule(tokens, ctx);
            if (finding !== null) return finding;
        }
        for (const rule of COMMAND_RULES) {
            const finding = rule(segment, tokens, ctx);
            if (finding !== null) return finding;
        }
    }
    return null;
}

/** BLOCK: rm -rf outside safe zones, including piped/xargs conservatism. */
function rmRfRule(tokens: string[], ctx: RuleCtx): Finding | null {
    let parsed = parseRmTokens(tokens, 0);
    let foundIdx = -1;
    if (!parsed) {
        foundIdx = findRmAnywhere(tokens);
        if (foundIdx > 0) {
            parsed = parseRmTokens(tokens, foundIdx);
        }
    }
    if (!parsed || !(parsed.recursive && parsed.force)) return null;

    // rm appeared behind a wrapper (xargs, timeout, …)
    const rmNotAtHead = foundIdx > 0;
    if (parsed.operands.length === 0) {
        if (rmNotAtHead || tokens[0] === "xargs") {
            return {
                severity: "block",
                reason: "rm -rf detected with unresolvable targets (likely piped/stdin input)",
            };
        }
        return null;
    }
    for (const operand of parsed.operands) {
        const abs = resolveTarget(operand, ctx.projectDir, ctx.home);
        if (abs === null || !isWithinSafeZone(abs, ctx.projectDir, ctx.safeRelDirs)) {
            return {
                severity: "block",
                reason: `rm -rf targets path outside safe zones: ${operand}`,
            };
        }
    }
    return null;
}

/** BLOCK: find -delete / find -exec/-execdir rm — unconditional. */
function findDeleteRule(tokens: string[], _ctx: RuleCtx): Finding | null {
    if (commandBasename(tokens[0]) !== "find") return null;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === "-delete") {
            return {
                severity: "block",
                reason: "find -delete removes files; destructive action blocked",
            };
        }
        if ((t === "-exec" || t === "-execdir") && i + 1 < tokens.length) {
            if (commandBasename(tokens[i + 1]) === "rm") {
                return {
                    severity: "block",
                    reason: "find -exec/-execdir rm removes files; destructive action blocked",
                };
            }
        }
    }
    return null;
}

/** WARN: destructive SQL drops. Best-effort raw-string regex by design: a
 *  faithful tokenized check would have to parse mysql -e / psql -c / heredoc
 *  payloads. WARN gates are advisory, not a security boundary (L-1). */
function sqlDropWarn(command: string, _tokens: string[], _ctx: RuleCtx): Finding | null {
    if (/\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i.test(command)) {
        return { severity: "warn", reason: "SQL DROP statement destroys data" };
    }
    return null;
}

/** WARN: git reset --hard (discards uncommitted work). Tokenized so global
 *  options (-c, -C, …) and interleaved flags cannot hide the subcommand. */
function gitResetWarn(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const git = expandedGitFlags(tokens);
    if (git && git.subcmd === "reset" && git.expanded.includes("--hard")) {
        return { severity: "warn", reason: "git reset --hard discards uncommitted changes" };
    }
    return null;
}

/** WARN: git push --delete / -d (removes a remote ref). */
function gitPushDeleteWarn(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const git = expandedGitFlags(tokens);
    if (git && git.subcmd === "push" && (git.expanded.includes("--delete") || git.expanded.includes("-d"))) {
        return { severity: "warn", reason: "git push --delete removes a remote ref" };
    }
    return null;
}

/**
 * Expand a git command's subcommand flags after skipping global options.
 * Returns null when no `git` invocation exists in the token stream.
 */
function expandedGitFlags(tokens: string[]): { subcmd: string; expanded: string[] } | null {
    const gitInfo = findGitCommandAnywhere(tokens);
    if (gitInfo === null) return null;
    return { subcmd: gitInfo.subcmd, expanded: gitInfo.rest.flatMap(expandShortFlags) };
}

/**
 * BLOCK: git push --force / -f.
 *
 * Catches bundled flags like -uf via expandShortFlags. --force-with-lease is
 * untouched because expandShortFlags leaves long flags intact.
 */
function gitForcePushBlock(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const git = expandedGitFlags(tokens);
    if (git && git.subcmd === "push") {
        if (git.expanded.includes("-f") || git.expanded.includes("--force")) {
            return { severity: "block", reason: "git push --force rewrites published history" };
        }
    }
    return null;
}

/**
 * BLOCK: --no-verify / scoped -n — prevents bypassing pre-commit, commit-msg,
 * and pre-push hooks. --no-verify is never legitimate for agent work, so it
 * blocks on any git command. -n means --no-verify ONLY on `git commit` (on
 * other commands -n is --dry-run/--no-commit/max-count and must not be
 * blocked). See ADR-0025.
 */
function gitNoVerifyBlock(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const git = expandedGitFlags(tokens);
    if (git) {
        if (git.expanded.includes("--no-verify") || (git.subcmd === "commit" && git.expanded.includes("-n"))) {
            return {
                severity: "block",
                reason: "--no-verify bypasses commit/push hooks (pre-commit, commit-msg, pre-push); local CI-parity checks must run",
            };
        }
    }
    return null;
}











// vim: ft=typescript sts=4 sw=4 ts=4 et :
