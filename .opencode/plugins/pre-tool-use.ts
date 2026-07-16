// $KYAULabs: pre-tool-use.ts kyau@nova 2026/07/16 -0700 Exp $

import type { Plugin, Hooks } from "@opencode-ai/plugin";

export type Severity = "block" | "warn" | null;

export interface Finding {
    severity: Severity;
    reason: string;
}

export interface ClassifyOptions {
    projectDir: string;
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
        // BLOCK: git push --force / -f (not --force-with-lease)
        if (/\bgit\s+push\b/.test(command) && !/--force-with-lease/.test(command)) {
            const tokens = command.split(/\s+/);
            if (tokens.includes("-f") || tokens.includes("--force")) {
                return { severity: "block", reason: "git push --force rewrites published history" };
            }
        }
        return { severity: null, reason: "" };
    } catch {
        return { severity: null, reason: "" };
    }
}

// No-op plugin shell; real hook wired in Task 4. Keeps the file a valid
// auto-discovered plugin throughout development.
export const PreToolUse: Plugin = async () => ({});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
