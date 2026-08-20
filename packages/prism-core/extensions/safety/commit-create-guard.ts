// $KYAULabs: commit-create-guard.ts kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

import { basename } from "node:path";
import {
    hasUnmodelableShellConstruct,
    splitShellSegments,
    tokenizeCommand,
} from "./sensitive-paths.ts";

export type CommitCreateClassification = "NONE" | "STANDALONE" | "UNSAFE_ATTEMPT";

const TYPES = new Set([
    "build", "chore", "ci", "docs", "feat", "fix", "ignore", "patch", "perf",
    "refactor", "style", "test",
]);
const WRAPPERS = new Set([
    "bash", "sh", "zsh", "dash", "env", "command", "exec", "sudo", "timeout",
    "nice", "nohup", "setsid", "stdbuf", "xargs",
]);
const INTERPRETER_PATTERN = /^(?:python(?:\d+(?:\.\d+)*)?|node(?:js)?|perl|ruby|php(?:\d+(?:\.\d+)*)?)$/;
const PREFIX_PATTERN = /(?:^|[\s'"(`])(?:[^\s'"]*\/)?prism-tool\s+commit\s+create(?:\s|$)/;

function executableBasename(token: string): string {
    return basename(token);
}

function prefixIndex(tokens: readonly string[]): number {
    for (let index = 0; index + 2 < tokens.length; index += 1) {
        if (executableBasename(tokens[index]) === "prism-tool" &&
            tokens[index + 1] === "commit" && tokens[index + 2] === "create") {
            return index;
        }
    }
    return -1;
}

function shellShape(command: string): {control: boolean; valid: boolean} {
    let quote: "'" | '"' | null = null;
    for (let index = 0; index < command.length; index += 1) {
        const character = command[index];
        if (quote !== null) {
            if (character === "\\" && quote === '"' && index + 1 < command.length) {
                index += 1;
                continue;
            }
            if (character === quote) quote = null;
            continue;
        }
        if (character === "'" || character === '"') {
            quote = character;
            continue;
        }
        if (character === "\\" && index + 1 < command.length) {
            index += 1;
            continue;
        }
        if (character === ";" || character === "&" || character === "|" ||
            character === "<" || character === ">" || character === "\n") {
            return {control: true, valid: quote === null};
        }
    }
    return {control: false, valid: quote === null};
}

function hasDynamicShellSyntax(command: string): boolean {
    let quote: "'" | '"' | null = null;
    let wordStart = true;
    for (let index = 0; index < command.length; index += 1) {
        const character = command[index];
        if (quote === "'") {
            if (character === "'") quote = null;
            continue;
        }
        if (quote === '"') {
            if (character === "\\" && index + 1 < command.length) {
                index += 1;
                continue;
            }
            if (character === '"') quote = null;
            else if (character === "$" || character === "`") return true;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            wordStart = false;
            continue;
        }
        if (character === "\\" && index + 1 < command.length) {
            index += 1;
            wordStart = false;
            continue;
        }
        if (character === "$" || character === "`") return true;
        if (character === "#" && wordStart) return true;
        wordStart = /\s/.test(character);
    }
    return false;
}

function validStructuredArguments(tokens: readonly string[]): boolean {
    const rank = new Map([
        ["--type", 0], ["--scope", 1], ["--subject", 2], ["--body-file", 3],
        ["--fixes", 4], ["--refs", 4],
    ]);
    const parsed = new Map<string, string>();
    let previous = -1;
    for (let index = 3; index < tokens.length; index += 2) {
        const control = tokens[index];
        const value = tokens[index + 1];
        const current = rank.get(control);
        if (current === undefined || value === undefined || value === "" || value.startsWith("--") ||
            current < previous || parsed.has(control)) return false;
        if ((control === "--fixes" && parsed.has("--refs")) ||
            (control === "--refs" && parsed.has("--fixes"))) return false;
        parsed.set(control, value);
        previous = current;
    }
    if (!parsed.has("--type") || !parsed.has("--subject") || tokens.length % 2 === 0) return false;
    const type = parsed.get("--type") ?? "";
    const scope = parsed.get("--scope");
    const subject = parsed.get("--subject") ?? "";
    if (!TYPES.has(type) || subject === "" || [...subject].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code < 32 || code === 127;
    })) return false;
    if (scope !== undefined &&
        (!/^[a-z0-9][a-z0-9._/-]*$/.test(scope) || /[._/-]$/.test(scope) || /[._/-]{2}/.test(scope))) {
        return false;
    }
    for (const control of ["--fixes", "--refs"]) {
        const issue = parsed.get(control);
        if (issue !== undefined && !/^[1-9][0-9]*$/.test(issue)) return false;
    }
    const header = `${type}${scope === undefined ? "" : `(${scope})`}: ${subject}`;
    return header.length <= 100;
}

function wrapperAttempt(command: string, tokens: readonly string[]): boolean {
    const head = executableBasename(tokens[0] ?? "");
    if (!WRAPPERS.has(head) && !INTERPRETER_PATTERN.test(head) &&
        !/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0] ?? "")) return false;
    return prefixIndex(tokens) > 0 || PREFIX_PATTERN.test(command);
}

export function classifyCommitCreate(command: unknown): CommitCreateClassification {
    if (typeof command !== "string" || command.trim() === "") return "NONE";
    const segments = splitShellSegments(command);
    const tokenized = segments.map((segment) => tokenizeCommand(segment)).filter((tokens) => tokens.length > 0);
    const direct = tokenized.filter((tokens) => prefixIndex(tokens) === 0);
    const tokens = tokenizeCommand(command);
    const shape = shellShape(command);

    if (direct.length > 0) {
        if (direct.length !== 1 || tokenized.length !== 1 || shape.control || !shape.valid ||
            hasUnmodelableShellConstruct(command) || hasDynamicShellSyntax(command)) {
            return "UNSAFE_ATTEMPT";
        }
        return validStructuredArguments(direct[0]) ? "STANDALONE" : "UNSAFE_ATTEMPT";
    }
    if (wrapperAttempt(command, tokens)) return "UNSAFE_ATTEMPT";
    if (PREFIX_PATTERN.test(command) &&
        (hasUnmodelableShellConstruct(command) || hasDynamicShellSyntax(command))) {
        return "UNSAFE_ATTEMPT";
    }
    return "NONE";
}

interface ToolCallPart {
    type: "toolCall";
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validToolCall(value: unknown): value is ToolCallPart {
    if (!isRecord(value) || value.type !== "toolCall" || typeof value.id !== "string" ||
        typeof value.name !== "string" || !isRecord(value.arguments)) return false;
    return true;
}

export function countSiblingToolCalls(entries: unknown, toolCallId: string): number | null {
    if (!Array.isArray(entries) || typeof toolCallId !== "string" || toolCallId === "") return null;
    let found: number | null = null;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (!isRecord(entry) || typeof entry.type !== "string") return null;
        if (entry.type !== "message") continue;
        const message = entry.message;
        if (!isRecord(message) || typeof message.role !== "string") return null;
        if (message.role !== "assistant") continue;
        if (!Array.isArray(message.content)) return null;
        const calls: ToolCallPart[] = [];
        for (const part of message.content) {
            if (!isRecord(part) || typeof part.type !== "string") return null;
            if (part.type !== "toolCall") continue;
            if (!validToolCall(part)) return null;
            calls.push(part);
        }
        const matches = calls.filter(({id}) => id === toolCallId).length;
        if (matches === 0) continue;
        if (matches !== 1 || found !== null) return null;
        found = calls.length;
    }
    return found;
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
