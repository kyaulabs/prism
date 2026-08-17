// $KYAULabs: sensitive-paths.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


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
    if (head === "command" || head === "exec") {
        if (tokens.length > 1) return tokens.slice(1).join(" ");
        return null;
    }
    if (head === "eval") {
        if (tokens.length > 1) return tokens.slice(1).join(" ");
        return null;
    }
    return null;
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
    const segments = command.split(/[;&|\n]/);
    for (const segment of segments) {
        const tokens = tokenizeCommand(segment);
        if (tokens.length === 0) continue;
        const inner = tryUnwrapSegment(tokens);
        if (inner !== null) {
            const match = sensitiveOperandCheckImpl(inner, opts, depth + 1);
            if (match) return match;
            continue;
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
