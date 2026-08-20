// $KYAULabs: sensitive-paths.ts kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

import { resolve as resolvePath, normalize, basename, dirname } from "node:path";
import { realpathSync } from "node:fs";

export interface SensitivePathOptions {
    projectDir: string;
    home: string;
    extraPaths?: readonly string[];
}

export interface SensitiveMatch {
    className: string;
}

interface RawPattern {
    raw: string;
    className: string;
    dir: boolean;
}

const DEFAULT_PATTERNS: readonly RawPattern[] = [
    { raw: "~/.local/share/opencode/", className: "opencode-auth-store", dir: true },
    { raw: "~/.opencodereview/", className: "review-config", dir: true },
    { raw: "~/intelephense/license.txt", className: "intelephense-license", dir: false },
    { raw: "~/intelephense/licence.txt", className: "intelephense-license", dir: false },
    { raw: "~/.config/opencode/", className: "prism-user-manifest", dir: true },
    { raw: "~/.ssh/", className: "ssh", dir: true },
    { raw: "~/.aws/", className: "cloud-credentials", dir: true },
    { raw: "~/.netrc", className: "netrc", dir: false },
    { raw: "~/.git-credentials", className: "git-credentials", dir: false },
    { raw: "/etc/ssl/private/", className: "ssl-private", dir: true },
];

const SETUP_SCRIPTS = new Set([
    "migrate-setup.sh",
    "setup-write-user-config.sh",
    "setup-write-project-config.sh",
    "setup-substitute.sh",
    "setup-scaffold.sh",
    "setup-rulesets.sh",
    "check-setup-secrets.sh",
]);

const INTERPRETERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "php"]);

const SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

export const MAX_UNWRAP_DEPTH = 3;

/** A command that is exactly a shell variable reference (value unknown). */
export const BARE_VARIABLE_RE = /^\$(\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])$/;

/**
 * A variable reference at the START of a segment in command position:
 * followed by whitespace or end-of-segment (`$cmd -rf x`, `$cmd`), but
 * NOT a path prefix (`$HOME/bin/x` — the shell resolves the path, the
 * command itself is the file). Fail closed on the former (OCR round 8).
 */
export const VARIABLE_COMMAND_POSITION_RE = /^(?:""|'')*"?\$(\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])"?(?:""|'')*(?=\s|$)/;

/** Strip one layer of surrounding matching quotes (OCR round 5). */
export function stripSurroundingQuotes(s: string): string {
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
    }
    return t;
}

/**
 * Split a command on shell separators (`;` `&` `|` newline) only OUTSIDE
 * quotes, so quoted payloads survive intact (OCR round 6 — the raw
 * split mangled `bash -c 'echo hi; $p'` and defeated the per-segment
 * variable guard). Backslash escapes are honored inside double quotes
 * and outside quotes.
 */
export function splitShellSegments(command: string): string[] {
    const segments: string[] = [];
    let cur = "";
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (quote !== null) {
            cur += ch;
            if (ch === "\\" && quote === '"' && i + 1 < command.length) {
                cur += command[++i];
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            cur += ch;
            continue;
        }
        if (ch === "\\" && i + 1 < command.length) {
            cur += ch + command[++i];
            continue;
        }
        if (ch === ";" || ch === "&" || ch === "|" || ch === "\n") {
            segments.push(cur);
            cur = "";
            continue;
        }
        // A `#` at word start begins a comment: skip to end of line
        // without splitting on separators inside it (OCR round 7).
        if (ch === "#" && (cur === "" || /\s$/.test(cur))) {
            while (i + 1 < command.length && command[i + 1] !== "\n") i++;
            continue;
        }
        // An `&` that is part of a redirection operator (2>&1, &>, >&) is
        // not a separator (OCR round 8).
        if (ch === "&" && (command[i - 1] === ">" || command[i + 1] === ">")) {
            cur += ch;
            continue;
        }
        cur += ch;
    }
    segments.push(cur);
    return segments;
}

/** Return the first index after a numeric-literal arithmetic expansion. */
function safeArithmeticExpansionEnd(command: string, start: number): number | null {
    if (!command.startsWith("$((", start)) return null;
    let depth = 0;
    for (let i = start + 3; i < command.length; i++) {
        const ch = command[i];
        if (ch === "(") {
            depth++;
            continue;
        }
        if (ch === ")") {
            if (depth === 0 && command[i + 1] === ")") return i + 2;
            if (depth === 0) return null;
            depth--;
            continue;
        }
        if (!/[0-9\s+\-*\/%<>=!&|^~?:,]/.test(ch)) return null;
    }
    return null;
}

function hasUnsafeIndexedParameterExpansion(command: string, start: number): boolean {
    if (!command.startsWith("${", start)) return false;
    const reference = command.slice(start + 2).match(/^[A-Za-z_][A-Za-z0-9_]*\[/);
    if (reference === null) return false;
    const subscriptStart = start + 2 + reference[0].length;
    let depth = 1;
    for (let i = subscriptStart; i < command.length; i++) {
        if (command[i] === "[") {
            depth++;
        } else if (command[i] === "]") {
            depth--;
            if (depth === 0) {
                const subscript = command.slice(subscriptStart, i);
                return !/^[0-9\s+\-*\/%<>=!&|^~?:,]+$/.test(subscript);
            }
        } else if (command[i] === "}" && depth === 1) {
            return true;
        }
    }
    return true;
}

const ARITHMETIC_DECLARATION_BUILTINS = new Set(["declare", "typeset", "local", "integer", "float"]);
const ARITHMETIC_BUILTINS = new Set(["let", ...ARITHMETIC_DECLARATION_BUILTINS]);

function normalizeShellCommandWord(word: string): string {
    let normalized = "";
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        if (quote !== null) {
            if (ch === quote) {
                quote = null;
            } else if (ch === "\\" && quote === '"' && i + 1 < word.length) {
                normalized += word[++i];
            } else {
                normalized += ch;
            }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === "\\" && i + 1 < word.length) {
            normalized += word[++i];
        } else {
            normalized += ch;
        }
    }
    return normalized;
}

function couldResolveToBuiltin(word: string, builtins: ReadonlySet<string>): boolean {
    let expanded = false;
    const fixed = basename(word).replace(/\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/g, () => {
        expanded = true;
        return "";
    });
    if (!expanded || fixed === "") return false;
    for (const builtin of builtins) {
        let i = 0;
        for (const ch of builtin) {
            if (ch === fixed[i]) i++;
        }
        if (i === fixed.length) return true;
    }
    return false;
}

function isUnsafeIndexedReference(token: string, assignment: boolean): boolean {
    const suffix = assignment ? "(?:\\+)?=" : "$";
    const reference = token.match(
        new RegExp(`^[A-Za-z_][A-Za-z0-9_]*\\[([^\\]]+)\\]${suffix}`),
    );
    return reference !== null && !/^[0-9\s+\-*\/%<>=!&|^~?:,]+$/.test(reference[1]);
}

function hasUnsafeIndexedAssignment(segment: string): boolean {
    const tokens = tokenizeCommand(segment).map(normalizeShellCommandWord);
    const position = effectiveCommandPosition(tokens);
    if (position === null) return false;
    if (isUnsafeIndexedReference(tokens[position], true)) return true;
    const head = basename(tokens[position]);
    if (ARITHMETIC_DECLARATION_BUILTINS.has(head) || head === "export" || head === "readonly") {
        return tokens.slice(position + 1).some((token) => isUnsafeIndexedReference(token, true));
    }
    if (head === "unset") {
        return tokens.slice(position + 1).some((token) => isUnsafeIndexedReference(token, false));
    }
    return false;
}

const COMMAND_PREFIXES = new Set(["!", "{", "(", "if", "then", "elif", "while", "until", "do", "else"]);
const COMMAND_WRAPPERS = new Set(["builtin", "command", "exec"]);
const DELAYED_EVALUATION_BUILTINS = new Set(["eval", "trap"]);

function effectiveCommandPosition(tokens: string[]): number | null {
    let i = 0;
    while (i < tokens.length) {
        const token = basename(tokens[i]);
        if (/^(?:[0-9]+)?(?:<|>|>>|<>|<&|>&|&>|&>>)$/.test(tokens[i])) {
            i += 2;
            continue;
        }
        if (/^(?:[0-9]+)?(?:<|>|>>|<>|<&|>&|&>|&>>).+/.test(tokens[i])) {
            i++;
            continue;
        }
        if (COMMAND_PREFIXES.has(token) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
            i++;
            continue;
        }
        if (token === "time") {
            i++;
            while (i < tokens.length && tokens[i].startsWith("-")) i++;
            continue;
        }
        break;
    }
    while (i < tokens.length && COMMAND_WRAPPERS.has(basename(tokens[i]))) {
        const wrapper = basename(tokens[i++]);
        if (wrapper === "command" && (tokens[i] === "-v" || tokens[i] === "-V")) return null;
        while (i < tokens.length && tokens[i].startsWith("-")) i++;
    }
    return i < tokens.length ? i : null;
}

function hasDelayedEvaluationBuiltin(command: string): boolean {
    const normalizedCommand = command.replace(/\\\r?\n/g, "");
    return splitShellSegments(normalizedCommand).some((segment) => {
        const tokens = tokenizeCommand(segment).map(normalizeShellCommandWord);
        const position = effectiveCommandPosition(tokens);
        return position !== null
            && (DELAYED_EVALUATION_BUILTINS.has(basename(tokens[position]))
                || couldResolveToBuiltin(tokens[position], DELAYED_EVALUATION_BUILTINS));
    });
}

/** True when a segment invokes a recursively evaluated arithmetic context. */
function hasArithmeticBuiltin(command: string): boolean {
    const normalizedCommand = command.replace(/\\\r?\n/g, "");
    for (const segment of splitShellSegments(normalizedCommand)) {
        if (hasUnsafeIndexedAssignment(segment)) return true;
        const tokens = tokenizeCommand(segment).map(normalizeShellCommandWord);
        const position = effectiveCommandPosition(tokens);
        if (position === null) continue;
        if (couldResolveToBuiltin(tokens[position], ARITHMETIC_BUILTINS)) return true;
        const head = basename(tokens[position]);
        if (head === "printf") {
            const destination = tokens.indexOf("-v", position + 1);
            if (destination !== -1
                && isUnsafeIndexedReference(tokens[destination + 1] ?? "", false)) return true;
        }
        if (head === "let" || head === "integer" || head === "float") return true;
        if (!ARITHMETIC_DECLARATION_BUILTINS.has(head)) continue;
        for (const token of tokens.slice(position + 1)) {
            if (token === "--") break;
            if (/^-[A-Za-z]*[iI](?:[0-9]+)?[A-Za-z]*$/.test(token)
                || (head === "typeset" && /^-[A-Za-z]*[EF](?:[0-9]+)?[A-Za-z]*$/.test(token))) return true;
        }
    }
    return false;
}

/**
 * Detect shell constructs the flat tokenizer cannot model. Command-substitution
 * spellings block even inside single quotes because shell builtins can evaluate
 * them recursively. Numeric-only arithmetic expansion is accepted; identifiers
 * and arithmetic commands block.
 */
export function hasUnmodelableShellConstruct(command: string): boolean {
    if (hasDelayedEvaluationBuiltin(command) || hasArithmeticBuiltin(command)) return true;
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (quote === "'") {
            if (ch === "'") {
                quote = null;
                continue;
            }
            if (ch === "$" && command[i + 1] === "(") {
                const end = safeArithmeticExpansionEnd(command, i);
                if (end === null) return true;
                i = end - 1;
                continue;
            }
            if (ch === "`") return true;
            continue;
        }
        if (quote === '"') {
            if (ch === "\\") {
                i++;
                continue;
            }
            if (ch === '"') {
                quote = null;
                continue;
            }
            if (ch === "$" && command[i + 1] === "(") {
                const end = safeArithmeticExpansionEnd(command, i);
                if (end === null) return true;
                i = end - 1;
                continue;
            }
            if (ch === "$" && hasUnsafeIndexedParameterExpansion(command, i)) return true;
            if (ch === "`") return true;
            continue;
        }
        if (ch === "\\") {
            i++;
            continue;
        }
        if (ch === "'") {
            quote = "'";
            continue;
        }
        if (ch === '"') {
            quote = '"';
            continue;
        }
        if (ch === "$" && command[i + 1] === "(") {
            const end = safeArithmeticExpansionEnd(command, i);
            if (end === null) return true;
            i = end - 1;
            continue;
        }
        if (ch === "$" && hasUnsafeIndexedParameterExpansion(command, i)) return true;
        if (ch === "`" || command.startsWith("$'", i)) return true;
        if (command.startsWith("((", i)
            || command.startsWith("<(", i)
            || command.startsWith(">(", i)
            || command.startsWith("<<<", i)) return true;
    }
    return false;
}

const SENSITIVE_FALLBACK_RE =
    /\.env(\.|$)|\bauth\.json\b|mcp-auth\.json|intelephense|opencodereview|\.config\/opencode|\.ssh\/|\.aws\/|\.netrc|git-credentials|\/etc\/ssl\//;

/**
 * True when a token references the sole env-class exception, .env.example,
 * as its final path segment. Option prefixes (-d@, -d, --opt=) and a
 * leading @ (curl's @file) are stripped first so glued forms like
 * -d@.env.example stay readable, while -d@~/.ssh/id_rsa.env.example
 * remains denied. Mirrors the basename exemption in sensitivePathMatch.
 */
function isEnvExampleRef(token: string): boolean {
    const bare = token.replace(/^-{1,2}[^=@]*[=@]/, "").replace(/^@/, "");
    return (bare.split("/").pop() ?? "") === ".env.example";
}

export function tokenizeCommand(segment: string): string[] {
    const trimmed = segment.trim();
    if (trimmed.length === 0) return [];
    const tokens: string[] = [];
    let i = 0;
    while (i < trimmed.length) {
        while (i < trimmed.length && /\s/.test(trimmed[i])) i++;
        if (i >= trimmed.length) break;
        let token = "";
        if (trimmed[i] === '"' || trimmed[i] === "'") {
            const quote = trimmed[i];
            i++;
            while (i < trimmed.length && trimmed[i] !== quote) {
                if (trimmed[i] === "\\" && i + 1 < trimmed.length) {
                    token += trimmed[i + 1];
                    i += 2;
                } else {
                    token += trimmed[i];
                    i++;
                }
            }
            i++;
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

export function tryUnwrapSegment(tokens: string[]): string | null {
    if (tokens.length === 0) return null;
    const head = tokens[0];
    if (SHELL_WRAPPERS.has(head) && tokens[1] === "-c" && tokens.length >= 3) {
        return tokens[2];
    }
    if (head === "env") {
        let i = 1;
        while (i < tokens.length && tokens[i].includes("=")) i++;
        if (i < tokens.length) return tokens.slice(i).join(" ");
        return null;
    }
    if (head === "command" || head === "exec" || head === "builtin") {
        if (tokens.length > 1) return tokens.slice(1).join(" ");
        return null;
    }
    if (head === "eval") {
        if (tokens.length > 1) return tokens.slice(1).join(" ");
        return null;
    }
    return null;
}

/** Shell wrapper long options that consume a value (bash --rcfile f …). */
const SHELL_VALUE_OPTIONS = new Set(["--rcfile", "--init-file", "--rc"]);

/**
 * Find a shell wrapper (`bash -c`, `sh -c`, …) at ANY token position and
 * return its payload token for recursive reclassification. Catches wrapper
 * chains the head-only unwrap misses (`sudo bash -c …`, `timeout 10
 * bash -c …`, `find -exec bash -c …`), combined short flags (`-lc`), and
 * options between the wrapper and the command flag (`bash -e -c …`,
 * `bash --rcfile /dev/null -c …`). Quoted payloads arrive already
 * quote-stripped from tokenizeCommand, so recursion re-tokenizes them.
 */
export function findShellWrapperPayload(tokens: string[]): string | null {
    for (let i = 0; i < tokens.length; i++) {
        if (!SHELL_WRAPPERS.has(basename(tokens[i]))) continue;
        let j = i + 1;
        while (j < tokens.length) {
            const t = tokens[j];
            if (isOptionToken(t)) {
                if (isShortCommandFlag(t)) return tokens[j + 1] ?? null;
                if (SHELL_VALUE_OPTIONS.has(t) && j + 1 < tokens.length) {
                    j += 2; // long option + its value
                    continue;
                }
                j++;
                continue;
            }
            break; // non-option before the command flag — not a -c invocation
        }
    }
    return null;
}

/** True for short flags that carry the shell's command (`-c`, `-lc`, …). */
function isShortCommandFlag(token: string): boolean {
    return token.startsWith("-") && !token.startsWith("--") && token.includes("c");
}

/** True when a token is option-prefixed or assignment-shaped (shared shape guard). */
function isOptionToken(token: string): boolean {
    return token.startsWith("-") || token.includes("=");
}

function normalizeRaw(raw: string, home: string): string {
    const expanded = raw.startsWith("~/") ? home + "/" + raw.slice(2) : raw;
    return normalize(expanded).replace(/\/+$/, "");
}

function isEnvBasename(name: string): boolean {
    if (name === ".env.example") return false;
    return name === ".env" || name.startsWith(".env.");
}

/** Max ancestor hops when walking up to an existing realpath-able prefix. */
const MAX_CANONICALIZE_STEPS = 64;

export function canonicalizePath(p: string): string {
    let current = normalize(p);
    const tail: string[] = [];
    for (let i = 0; i < MAX_CANONICALIZE_STEPS; i++) {
        try {
            const real = realpathSync(current);
            if (tail.length === 0) return normalize(real);
            return normalize(real + "/" + tail.reverse().join("/"));
        } catch {
            const parent = dirname(current);
            if (parent === current) return normalize(p);
            tail.push(basename(current));
            current = parent;
        }
    }
    return normalize(p);
}

export function sensitivePathMatch(absPath: string, opts: SensitivePathOptions): SensitiveMatch | null {
    const canonical = canonicalizePath(absPath);
    const name = basename(canonical);
    if (isEnvBasename(name)) return { className: "env" };
    if (name === "auth.json" || name === "mcp-auth.json") return { className: "opencode-auth-store" };
    for (const pattern of DEFAULT_PATTERNS) {
        const patternPath = canonicalizePath(normalizeRaw(pattern.raw, opts.home));
        if (canonical === patternPath || (pattern.dir && canonical.startsWith(patternPath + "/"))) return { className: pattern.className };
    }
    for (const raw of opts.extraPaths ?? []) {
        const patternPath = canonicalizePath(normalizeRaw(raw, opts.home));
        const dir = raw.endsWith("/");
        if (canonical === patternPath || (dir && canonical.startsWith(patternPath + "/"))) return { className: "additional" };
    }
    return null;
}

export function sensitivePatternCheck(pattern: unknown, base: string, opts: SensitivePathOptions): SensitiveMatch | null {
    if (pattern === undefined || pattern === "") return null;
    if (typeof pattern !== "string") return { className: "malformed" };
    const trimmed = pattern.trim();
    if (trimmed === "") return null;
    const expanded = trimmed.startsWith("~") ? opts.home + trimmed.slice(1) : trimmed;
    const metaIdx = expanded.search(/[*?[{]/);
    const probe = metaIdx !== -1 && !expanded.startsWith("/") ? expanded.slice(0, metaIdx) : expanded;
    const abs = probe.startsWith("/") ? probe : resolvePath(base, probe);
    const match = sensitivePathMatch(abs, opts);
    if (match) return match;
    if (trimmed.endsWith(".env.example")) return null;
    if (SENSITIVE_FALLBACK_RE.test(trimmed)) return { className: "dynamic" };
    return null;
}

type SetupTrust = "trusted" | "untrusted-subcommand" | "none";

function setupScriptTrust(tokens: string[], opts: SensitivePathOptions, depth: number): SetupTrust {
    let i = 0;
    if (INTERPRETERS.has(tokens[0])) {
        if (tokens[1] === "-c") return "none";
        i = 1;
    }
    for (; i < tokens.length; i++) {
        const token = tokens[i];
        if (isOptionToken(token)) continue;
        const name = basename(token);
        if (depth > 0) return SETUP_SCRIPTS.has(name) ? "untrusted-subcommand" : "none";
        if (!SETUP_SCRIPTS.has(name)) return "none";
        const resolved = token.startsWith("~") ? normalize(opts.home + token.slice(1)) : normalize(resolvePath(opts.projectDir, token));
        const scriptsDir = normalize(resolvePath(opts.projectDir, ".github/scripts"));
        return resolved.startsWith(scriptsDir + "/") ? "trusted" : "none";
    }
    return "none";
}

/**
 * Resolve one command token to an absolute path, or null when it cannot be
 * resolved safely (metacharacters, or `=`-assignments when rejected).
 *
 * Shared by the bash classifier (pre-tool-use.ts) and the sensitive-path
 * check so quote-strip / ~-expand / bail semantics cannot drift between the
 * two gates (audit finding 5). `rejectAssignments` preserves resolveOperand's
 * historical `=` bail; the classifier's rm-operand path intentionally stays
 * `=`-tolerant.
 */
export function resolvePathToken(token: string, projectDir: string, home: string,
                                 opts: { rejectAssignments?: boolean } = {}): string | null {
    let path = token.trim();
    if (
        (path.startsWith('"') && path.endsWith('"')) ||
        (path.startsWith("'") && path.endsWith("'"))
    ) {
        path = path.slice(1, -1);
    }
    if (path.startsWith("~")) path = home + path.slice(1);
    if (opts.rejectAssignments && path.includes("=")) return null;
    if (/[*?$`(<]/.test(path)) return null;
    return normalize(resolvePath(projectDir, path));
}

function resolveOperand(token: string, opts: SensitivePathOptions): string | null {
    return resolvePathToken(token, opts.projectDir, opts.home, { rejectAssignments: true });
}

export function sensitiveOperandCheck(command: string, opts: SensitivePathOptions): SensitiveMatch | null {
    if (typeof command !== "string" || command.length === 0) return null;
    try {
        return sensitiveOperandCheckImpl(command, opts, 0);
    } catch {
        return { className: "unresolvable" };
    }
}

/**
 * Judge one command token against the deny floor (ADR-0047/0048 §5).
 *
 * Review follow-up (ADR-0048): the class-specific fallback runs against
 * tokens that resolve without a denied-class match (or that are
 * option-prefixed), so argv-prefix and glued-token forms
 * (-d@~/.ssh/id_rsa, @~/.ssh/id_rsa, user@host:~/.ssh/id_rsa,
 * --output=~/.aws/credentials) cannot bypass the deny floor.
 * .env.example references stay exempt (basename-scoped), and a
 * trusted-setup prism-user-manifest skip suppresses the fallback so
 * /setup scripts keep their narrow exception.
 */
function judgeToken(token: string, trustedSetup: boolean, opts: SensitivePathOptions): SensitiveMatch | null {
    const abs = token.startsWith("-") ? null : resolveOperand(token, opts);
    const match = abs === null ? null : sensitivePathMatch(abs, opts);
    if (match) {
        if (match.className === "prism-user-manifest" && trustedSetup) return null;
        return match;
    }
    if (!isEnvExampleRef(token) && SENSITIVE_FALLBACK_RE.test(token)) {
        return { className: "dynamic" };
    }
    return null;
}

function sensitiveOperandCheckImpl(command: string, opts: SensitivePathOptions, depth: number): SensitiveMatch | null {
    if (depth > MAX_UNWRAP_DEPTH) return { className: "unresolvable" };
    if (hasUnmodelableShellConstruct(command)) return { className: "unresolvable" };
    const segments = splitShellSegments(command);
    for (const segment of segments) {
        const tokens = tokenizeCommand(segment);
        if (tokens.length === 0) continue;
        // Per-segment: a command that IS a bare variable reference cannot be
        // analyzed (echo hi; $p, bash -c "$p") — fail closed (OCR rounds 4-5).
        if (BARE_VARIABLE_RE.test(stripSurroundingQuotes(segment))) return { className: "unresolvable" };
        if (VARIABLE_COMMAND_POSITION_RE.test(stripSurroundingQuotes(segment))) return { className: "unresolvable" };
        const inner = tryUnwrapSegment(tokens);
        if (inner !== null) {
            const match = sensitiveOperandCheckImpl(inner, opts, depth + 1);
            if (match) return match;
            // Fall through: the payload was clean, but trailing operands
            // after a head wrapper (bash -c 'echo ok' ~/.ssh/…) still need
            // judging (OCR round 6).
        }
        const wrapped = findShellWrapperPayload(tokens);
        if (wrapped !== null) {
            const match = sensitiveOperandCheckImpl(wrapped, opts, depth + 1);
            if (match) return match;
            // Fall through: the payload was clean, but the segment's own
            // tokens (deny-floor operands beside the wrapper) still need
            // judging (OCR finding C3).
        }
        const trust = setupScriptTrust(tokens, opts, depth);
        if (trust === "untrusted-subcommand") return { className: "unresolvable" };
        const trustedSetup = trust === "trusted";
        for (const token of tokens) {
            const match = judgeToken(token, trustedSetup, opts);
            if (match) return match;
        }
    }
    return null;
}

export function loadAdditionalSensitivePaths(envValue: string | undefined): string[] {
    if (envValue === undefined || envValue === "") return [];
    const paths: string[] = [];
    for (const line of envValue.split("\n")) {
        const entry = line.trim();
        if (entry === "") continue;
        if (!entry.startsWith("~/") && !entry.startsWith("/")) {
            throw new Error("sensitive-paths: manifest entry must be absolute or ~/-prefixed — fail closed (ADR-0047)");
        }
        if (/[\u0000-\u001f\u007f]/.test(entry)) {
            throw new Error("sensitive-paths: manifest entry contains control characters — fail closed (ADR-0047)");
        }
        paths.push(entry);
    }
    return paths;
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
