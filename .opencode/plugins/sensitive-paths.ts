// $KYAULabs: sensitive-paths.ts kyau@cosmos.kyaulabs 2026/08/02 -0700 Exp $





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
    "prism_manifest.php",
]);

const TRUSTED_PM_SUBCOMMANDS = new Set(["get", "validate"]);

const INTERPRETERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "php"]);

const SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

const MAX_UNWRAP_DEPTH = 3;

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
    const bare = token.replace(/^-[^=]*@?/, "").replace(/^@/, "");
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

function normalizeRaw(raw: string, home: string): string {
    const p = raw.startsWith("~/") ? home + "/" + raw.slice(2) : raw;
    return normalize(p).replace(/\/+$/, "");
}

function isEnvBasename(name: string): boolean {
    if (name === ".env.example") return false;
    return name === ".env" || name.startsWith(".env.");
}

export function canonicalizePath(p: string): string {
    let current = normalize(p);
    const tail: string[] = [];
    for (let i = 0; i < 64; i++) {
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
    const p = canonicalizePath(absPath);
    const name = basename(p);
    if (isEnvBasename(name)) return { className: "env" };
    if (name === "auth.json" || name === "mcp-auth.json") return { className: "opencode-auth-store" };
    for (const pattern of DEFAULT_PATTERNS) {
        const pat = canonicalizePath(normalizeRaw(pattern.raw, opts.home));
        if (p === pat || (pattern.dir && p.startsWith(pat + "/"))) return { className: pattern.className };
    }
    for (const raw of opts.extraPaths ?? []) {
        const pat = canonicalizePath(normalizeRaw(raw, opts.home));
        const dir = raw.endsWith("/");
        if (p === pat || (dir && p.startsWith(pat + "/"))) return { className: "additional" };
    }
    return null;
}

export function sensitivePatternCheck(pattern: unknown, base: string, opts: SensitivePathOptions): SensitiveMatch | null {
    if (pattern === undefined || pattern === "") return null;
    if (typeof pattern !== "string") return { className: "malformed" };
    const p = pattern.trim();
    if (p === "") return null;
    const expanded = p.startsWith("~") ? opts.home + p.slice(1) : p;
    const metaIdx = expanded.search(/[*?[{]/);
    const probe = metaIdx !== -1 && !expanded.startsWith("/") ? expanded.slice(0, metaIdx) : expanded;
    const abs = probe.startsWith("/") ? probe : resolvePath(base, probe);
    const match = sensitivePathMatch(abs, opts);
    if (match) return match;
    if (p.endsWith(".env.example")) return null;
    if (SENSITIVE_FALLBACK_RE.test(p)) return { className: "dynamic" };
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
        const t = tokens[i];
        if (t.startsWith("-") || t.includes("=")) continue;
        const name = basename(t);
        if (depth > 0) return SETUP_SCRIPTS.has(name) ? "untrusted-subcommand" : "none";
        if (!SETUP_SCRIPTS.has(name)) return "none";
        if (name === "prism_manifest.php") {
            let j = i + 1;
            while (j < tokens.length && (tokens[j].startsWith("-") || tokens[j].includes("="))) j++;
            if (j >= tokens.length || !TRUSTED_PM_SUBCOMMANDS.has(tokens[j])) return "untrusted-subcommand";
        }
        const resolved = t.startsWith("~") ? normalize(opts.home + t.slice(1)) : normalize(resolvePath(opts.projectDir, t));
        const scriptsDir = normalize(resolvePath(opts.projectDir, ".github/scripts"));
        return resolved.startsWith(scriptsDir + "/") ? "trusted" : "none";
    }
    return "none";
}

function resolveOperand(token: string, opts: SensitivePathOptions): string | null {
    let p = token.trim();
    if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
        p = p.slice(1, -1);
    }
    if (p.startsWith("~")) p = opts.home + p.slice(1);
    if (p.includes("=") || /[*?$`(<]/.test(p)) return null;
    return normalize(resolvePath(opts.projectDir, p));
}

export function sensitiveOperandCheck(command: string, opts: SensitivePathOptions): SensitiveMatch | null {
    if (typeof command !== "string" || command.length === 0) return null;
    try {
        return sensitiveOperandCheckImpl(command, opts, 0);
    } catch {
        return { className: "unresolvable" };
    }
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
            // Review follow-up (ADR-0048): the class-specific fallback runs
            // against tokens that resolve without a denied-class match (or
            // that are option-prefixed), so argv-prefix and glued-token
            // forms (-d@~/.ssh/id_rsa, @~/.ssh/id_rsa, user@host:~/.ssh/
            // id_rsa, --output=~/.aws/credentials) cannot bypass the deny
            // floor. .env.example references stay exempt (basename-scoped),
            // and a trusted-setup prism-user-manifest skip suppresses the
            // fallback so /setup scripts keep their narrow exception.
            const abs = token.startsWith("-") ? null : resolveOperand(token, opts);
            const match = abs === null ? null : sensitivePathMatch(abs, opts);
            if (match) {
                if (match.className === "prism-user-manifest" && trustedSetup) continue;
                return match;
            }
            if (!isEnvExampleRef(token) && SENSITIVE_FALLBACK_RE.test(token)) {
                return { className: "dynamic" };
            }
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
