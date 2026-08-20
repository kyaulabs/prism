// $KYAULabs: safety-fatal-commit-latch.test.ts kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

import { test } from "node:test";
import assert from "node:assert/strict";
import { FatalCommitLatch } from "../../packages/prism-core/extensions/safety/fatal-commit-latch.ts";
import {
    classifyCommitCreate,
    countSiblingToolCalls,
} from "../../packages/prism-core/extensions/safety/commit-create-guard.ts";

let entrySequence = 0;

test("fatal latch transitions once and isolates sessions", () => {
    const latch = new FatalCommitLatch();

    assert.equal(latch.isLatched("s1"), false);
    assert.equal(latch.trip("s1"), true);
    assert.equal(latch.trip("s1"), false);
    assert.equal(latch.isLatched("s1"), true);
    assert.equal(latch.isLatched("s2"), false);
});

test("tracked tool calls resolve to their session and complete once", () => {
    const latch = new FatalCommitLatch();

    latch.track("call-1", "s1");
    latch.track("call-2", "s2");
    assert.equal(latch.complete("call-2"), "s2");
    assert.equal(latch.complete("call-2"), undefined);
    assert.equal(latch.complete("call-1"), "s1");
});

test("clearAll removes fatal and pending state without command text", () => {
    const latch = new FatalCommitLatch();
    latch.trip("s1");
    latch.track("call-commit", "s1");

    assert.doesNotMatch(JSON.stringify(latch), /create signed commits/);
    latch.clearAll();

    assert.equal(latch.isLatched("s1"), false);
    assert.equal(latch.complete("call-commit"), undefined);
});

test("bare atomic commit commands are standalone", () => {
    for (const command of [
        'prism-tool commit create --type feat --subject "create signed commits"',
        "prism-tool commit create --type docs --subject 'keep ; and | inert' --body-file 'notes/body file.txt'",
        "prism-tool commit create --type docs --subject 'keep $ and # inert'",
    ]) {
        assert.equal(classifyCommitCreate(command), "STANDALONE", command);
    }
});

test("compound, redirected, wrapped, and malformed commit attempts are unsafe", () => {
    const commands = [
        'prism-tool commit create --type feat --subject "x" && echo done',
        'prism-tool commit create --type feat --subject "x" || true',
        'prism-tool commit create --type feat --subject "x"; echo done',
        'prism-tool commit create --type feat --subject "x" | tee /tmp/log',
        'prism-tool commit create --type feat --subject "x" > /tmp/log',
        'bash -c \'prism-tool commit create --type feat --subject "x"\'',
        'env TOKEN=value prism-tool commit create --type feat --subject "x"',
        'command prism-tool commit create --type feat --subject "x"',
        'python -c \'prism-tool commit create --type feat --subject "x"\'',
        'python3.13 -c \'prism-tool commit create --type feat --subject "x"\'',
        'node -e \'prism-tool commit create --type feat --subject "x"\'',
        'perl -e \'prism-tool commit create --type feat --subject "x"\'',
        'ruby -e \'prism-tool commit create --type feat --subject "x"\'',
        'php -r \'prism-tool commit create --type feat --subject "x"\'',
        'awk \'BEGIN { system("prism-tool commit create --type feat --subject x") }\'',
        'find . -exec prism-tool commit create --type feat --subject x \\;',
        'find . -execdir prism-tool commit create --type feat --subject x \\;',
        'custom-launcher prism-tool commit create --type feat --subject x',
        '/home/tester/.local/bin/prism-tool commit create --type fix --subject x',
        "'/opt/prism tools/prism-tool' commit create --type docs --subject x",
        'time prism-tool commit create --type feat --subject x',
        '! prism-tool commit create --type feat --subject x',
        "pri''sm-tool commit create --type feat --subject x",
        "pr'is'm-tool commit create --type feat --subject x",
        'prism-tool${suffix} commit create --type feat --subject x',
        '$TOOL commit create --type feat --subject x',
        'c --type feat --subject x',
        'prism-tool commit create',
        'prism-tool commit create --type feat --subject',
        'prism-tool commit create --subject "x" --type feat',
        'prism-tool commit create --type feat --subject "x" --approval=yes',
        'prism-tool commit create --type feat --subject "$(date)"',
    ];

    for (const command of commands) {
        assert.equal(classifyCommitCreate(command), "UNSAFE_ATTEMPT", command);
    }
});

test("parameter-expanded commit arguments are unsafe", () => {
    const command = 'prism-tool commit create --type feat --subject "$SUBJECT"';

    assert.equal(classifyCommitCreate(command), "UNSAFE_ATTEMPT");
});

test("trailing shell comments make commit attempts unsafe", () => {
    const command = 'prism-tool commit create --type feat --subject "x" # trailing';

    assert.equal(classifyCommitCreate(command), "UNSAFE_ATTEMPT");
});

test("command-substituted commit creation is an unsafe attempt", () => {
    for (const command of [
        'echo $(prism-tool commit create --type feat --subject "x")',
        'echo `prism-tool commit create --type feat --subject "x"`',
    ]) {
        assert.equal(classifyCommitCreate(command), "UNSAFE_ATTEMPT", command);
    }
});

test("ordinary commands and textual mentions are not commit attempts", () => {
    for (const command of [
        "echo 'prism-tool commit create --type feat --subject x'",
        "printf '%s' 'prism-tool commit create'",
        "grep 'prism-tool commit create' README.md",
        "prism-tool doctor --local-only",
        "git commit -S -m message",
    ]) {
        assert.equal(classifyCommitCreate(command), "NONE", command);
    }
});

function assistantEntry(...parts: unknown[]) {
    return {
        type: "message",
        id: `entry-${entrySequence += 1}`,
        parentId: null,
        timestamp: "2026-08-19T00:00:00.000Z",
        message: {
            role: "assistant",
            content: parts,
        },
    };
}

function toolCall(id: string, name = "bash") {
    return {type: "toolCall", id, name, arguments: {command: "echo inert"}};
}

test("sibling counting finds the current assistant message newest-first", () => {
    const entries = [
        assistantEntry({type: "text", text: "older"}, toolCall("older")),
        assistantEntry({type: "text", text: "current"}, toolCall("call-1")),
    ];
    assert.equal(countSiblingToolCalls(entries, "call-1"), 1);

    entries.push(assistantEntry(toolCall("call-2"), toolCall("call-3", "read")));
    assert.equal(countSiblingToolCalls(entries, "call-2"), 2);
});

test("missing, duplicate, and malformed current messages fail closed", () => {
    assert.equal(countSiblingToolCalls([], "missing"), null);
    assert.equal(countSiblingToolCalls([
        assistantEntry(toolCall("duplicate")),
        assistantEntry(toolCall("duplicate")),
    ], "duplicate"), null);
    assert.equal(countSiblingToolCalls([
        assistantEntry({type: "toolCall", id: "bad", name: "bash", arguments: null}),
    ], "bad"), null);
    assert.equal(countSiblingToolCalls({not: "entries"}, "bad"), null);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
