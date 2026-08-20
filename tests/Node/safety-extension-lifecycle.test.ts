// $KYAULabs: safety-extension-lifecycle.test.ts kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

import { test } from "node:test";
import assert from "node:assert/strict";
import safetyExtension from "../../packages/prism-core/extensions/safety/index.ts";

const COMMIT = 'prism-tool commit create --type feat --scope safety --subject "create atomically"';

interface Fixture {
    abortCalls: number;
    branch: unknown[];
    ctx: Record<string, unknown>;
    handlers: Record<string, (event: Record<string, unknown>, context: Record<string, unknown>) => unknown>;
    notifications: Array<{message: string; level: string}>;
}

function assistantEntry(...content: unknown[]) {
    return {
        type: "message",
        id: "assistant-entry",
        parentId: null,
        timestamp: "2026-08-19T00:00:00.000Z",
        message: {role: "assistant", content},
    };
}

function toolCall(id: string, name: string, argumentsValue: Record<string, unknown>) {
    return {type: "toolCall", id, name, arguments: argumentsValue};
}

async function fixture(): Promise<Fixture> {
    const handlers: Fixture["handlers"] = {};
    const notifications: Fixture["notifications"] = [];
    const branch: unknown[] = [];
    let abortCalls = 0;
    safetyExtension({
        on(event: string, handler: Fixture["handlers"][string]) {
            handlers[event] = handler;
        },
    } as never);
    const ctx = {
        cwd: "/repo",
        hasUI: true,
        ui: {
            notify(message: string, level: string) {
                notifications.push({message, level});
            },
        },
        abort() {
            abortCalls += 1;
        },
        sessionManager: {
            getSessionFile() { return "/tmp/prism-session.jsonl"; },
            getBranch() { return branch; },
        },
    };
    await handlers.session_start({type: "session_start"}, ctx);
    return {
        get abortCalls() { return abortCalls; },
        branch,
        ctx,
        handlers,
        notifications,
    };
}

function bashEvent(id: string, command: string) {
    return {type: "tool_call", toolCallId: id, toolName: "bash", input: {command}};
}

function readEvent(id = "read-1") {
    return {type: "tool_call", toolCallId: id, toolName: "read", input: {path: "/repo/README.md"}};
}

function endEvent(id: string, isError: boolean, result: unknown = {}) {
    return {type: "tool_execution_end", toolCallId: id, toolName: "bash", isError, result};
}

test("failed exclusive commit aborts and remains latched across agent_end until teardown", async () => {
    const target = await fixture();
    target.branch.push(assistantEntry(toolCall("commit-1", "bash", {command: COMMIT})));

    assert.equal(await target.handlers.tool_call(bashEvent("commit-1", COMMIT), target.ctx), undefined);
    await target.handlers.tool_execution_end(endEvent("commit-1", true), target.ctx);
    assert.equal(target.abortCalls, 1);
    assert.equal((await target.handlers.tool_call(readEvent(), target.ctx) as {block?: boolean})?.block, true);

    await target.handlers.agent_end({type: "agent_end"}, target.ctx);
    assert.equal((await target.handlers.tool_call(readEvent("read-2"), target.ctx) as {block?: boolean})?.block, true);

    await target.handlers.session_shutdown({type: "session_shutdown"}, target.ctx);
    await target.handlers.session_start({type: "session_start"}, target.ctx);
    assert.equal(await target.handlers.tool_call(readEvent("read-3"), target.ctx), undefined);
});

test("successful exclusive commit clears pending state without latching", async () => {
    const target = await fixture();
    target.branch.push(assistantEntry(toolCall("commit-ok", "bash", {command: COMMIT})));

    assert.equal(await target.handlers.tool_call(bashEvent("commit-ok", COMMIT), target.ctx), undefined);
    await target.handlers.tool_execution_end(endEvent("commit-ok", false), target.ctx);

    assert.equal(target.abortCalls, 0);
    assert.equal(await target.handlers.tool_call(readEvent(), target.ctx), undefined);
});

test("unrelated failed Bash execution does not trip the fatal latch", async () => {
    const target = await fixture();
    target.branch.push(assistantEntry(toolCall("bash-1", "bash", {command: "false"})));

    assert.equal(await target.handlers.tool_call(bashEvent("bash-1", "false"), target.ctx), undefined);
    await target.handlers.tool_execution_end(endEvent("bash-1", true), target.ctx);

    assert.equal(target.abortCalls, 0);
    assert.equal(await target.handlers.tool_call(readEvent(), target.ctx), undefined);
});

test("sibling commit preflight trips, aborts, and blocks execution", async () => {
    const target = await fixture();
    target.branch.push(assistantEntry(
        toolCall("commit-sibling", "bash", {command: COMMIT}),
        toolCall("read-sibling", "read", {path: "/repo/README.md"}),
    ));

    const result = await target.handlers.tool_call(bashEvent("commit-sibling", COMMIT), target.ctx) as {
        block?: boolean;
        reason?: string;
        terminate?: boolean;
    };

    assert.equal(result.block, true);
    assert.equal(result.terminate, true);
    assert.match(result.reason ?? "", /fatal commit safeguard/);
    assert.equal(target.abortCalls, 1);
    assert.equal((await target.handlers.tool_call(readEvent(), target.ctx) as {block?: boolean})?.block, true);
});

test("unsafe compound commit attempt trips before execution", async () => {
    const target = await fixture();
    const command = `${COMMIT} && echo CANARY-COMMAND`;
    target.branch.push(assistantEntry(toolCall("commit-unsafe", "bash", {command})));

    const result = await target.handlers.tool_call(bashEvent("commit-unsafe", command), target.ctx) as {
        block?: boolean;
        terminate?: boolean;
    };

    assert.equal(result.block, true);
    assert.equal(result.terminate, true);
    assert.equal(target.abortCalls, 1);
});

test("a tracked commit blocked by the existing policy becomes fatal", async () => {
    const target = await fixture();
    const command = `${COMMIT} --body-file ~/.ssh/id_rsa`;
    target.branch.push(assistantEntry(toolCall("commit-sensitive", "bash", {command})));

    const result = await target.handlers.tool_call(bashEvent("commit-sensitive", command), target.ctx) as {
        block?: boolean;
        terminate?: boolean;
    };

    assert.equal(result.block, true);
    assert.equal(result.terminate, true);
    assert.equal(target.abortCalls, 1);
});

test("fatal notifications redact command, output, path, branch, and provider data", async () => {
    const target = await fixture();
    const command = 'prism-tool commit create --type feat --subject "CANARY-COMMAND"';
    target.branch.push(assistantEntry(toolCall("commit-redacted", "bash", {command})));

    await target.handlers.tool_call(bashEvent("commit-redacted", command), target.ctx);
    await target.handlers.tool_execution_end(endEvent("commit-redacted", true, {
        stdout: "CANARY-OUTPUT",
        branch: "CANARY-BRANCH",
        provider: "CANARY-PROVIDER",
        path: "/CANARY-PATH",
    }), target.ctx);

    assert.equal(target.notifications.length, 1);
    const rendered = JSON.stringify(target.notifications);
    assert.doesNotMatch(rendered, /CANARY|prism-session|\/repo/);
    assert.match(rendered, /reload/);
});

test("ordinary denial-breaker behavior remains independent", async () => {
    const target = await fixture();
    for (let index = 1; index <= 3; index += 1) {
        const id = `denied-${index}`;
        target.branch.push(assistantEntry(toolCall(id, "bash", {command: "rm -rf /"})));
        const result = await target.handlers.tool_call(bashEvent(id, "rm -rf /"), target.ctx) as {block?: boolean};
        assert.equal(result.block, true);
    }

    assert.equal(target.abortCalls, 0);
    assert.equal((await target.handlers.tool_call(readEvent(), target.ctx) as {block?: boolean})?.block, true);
    assert.equal(target.notifications.some(({message}) => /circuit breaker tripped/.test(message)), true);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
