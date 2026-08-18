// $KYAULabs: safety-tool-call-handler.test.ts kyau@aura.kyaulabs 2026/08/17 -0700 Exp $




import { test } from "node:test";
import assert from "node:assert/strict";
import { DenialCircuitBreaker, DEFAULT_THRESHOLD } from "../../packages/prism-core/extensions/safety/denial-circuit-breaker.ts";
import { handleToolCall, type ToolCallDeps } from "../../packages/prism-core/extensions/safety/tool-call-handler.ts";

interface NotifyLog {
    msg: string;
    level: string;
}

function makeDeps(overrides: Partial<ToolCallDeps> = {}): { deps: ToolCallDeps; notifyLog: NotifyLog[] } {
    const notifyLog: NotifyLog[] = [];
    const deps: ToolCallDeps = {
        sid: "s1",
        cwd: "/repo",
        home: "/home/tester",
        safeRelDirs: [],
        extraPaths: [],
        breaker: new DenialCircuitBreaker({ threshold: DEFAULT_THRESHOLD }),
        notify: (msg, level) => { notifyLog.push({ msg, level }); },
        ...overrides,
    };
    return { deps, notifyLog };
}

function trippedBreaker(): DenialCircuitBreaker {
    const b = new DenialCircuitBreaker({ threshold: DEFAULT_THRESHOLD });
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    return b;
}

test("tripped breaker blocks every tool before policy", () => {
    const { deps } = makeDeps({ breaker: trippedBreaker() });
    assert.deepEqual(handleToolCall("read", { path: "/repo/ok.php" }, deps), {
        block: true,
        reason: "[prism safety] BLOCKED: session tripped (3 bash denials within the last 10 bash calls) — circuit breaker active per ADR-0068. Run /new to reset.",
    });
    assert.equal(handleToolCall("bash", { command: "echo hi" }, deps)?.block, true);
});

test("bash sensitive operand blocks and feeds the breaker", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("bash", { command: "cat ~/.ssh/id_rsa" }, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /sensitive-path policy/);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("bash malformed args blocks and feeds the breaker", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("bash", { command: 42 }, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /malformed bash args/);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("bash classifier block feeds the breaker", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("bash", { command: "rm -rf /" }, deps);
    assert.equal(result?.block, true);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("bash classifier warn notifies but allows", () => {
    const { deps, notifyLog } = makeDeps();
    const result = handleToolCall("bash", { command: "git reset --hard" }, deps);
    assert.equal(result, undefined);
    assert.equal(notifyLog.length, 1);
    assert.equal(notifyLog[0].level, "warning");
    assert.match(notifyLog[0].msg, /WARNING/);
    assert.equal(deps.breaker.count("s1"), 0);
});

test("clean bash passes without notify or breaker feed", () => {
    const { deps, notifyLog } = makeDeps();
    assert.equal(handleToolCall("bash", { command: "ls -la /repo" }, deps), undefined);
    assert.equal(notifyLog.length, 0);
    assert.equal(deps.breaker.count("s1"), 0);
});

test("read/ls/find sensitive paths block without feeding the breaker", () => {
    for (const toolName of ["read", "ls", "find"]) {
        const { deps } = makeDeps();
        const result = handleToolCall(toolName, { path: "~/.ssh/id_rsa" }, deps);
        assert.equal(result?.block, true, toolName);
        assert.match(result?.reason ?? "", /sensitive-path policy/);
        assert.equal(deps.breaker.count("s1"), 0, toolName);
    }
});

test("grep sensitive path and glob pattern block", () => {
    const { deps } = makeDeps();
    assert.equal(handleToolCall("grep", { path: "~/.ssh/id_rsa" }, deps)?.block, true);
    const pattern = handleToolCall("grep", { path: "/repo", glob: ".env" }, deps);
    assert.equal(pattern?.block, true);
    assert.match(pattern?.reason ?? "", /sensitive-path policy/);
});

test("find sensitive pattern block", () => {
    const { deps } = makeDeps();
    const result = handleToolCall("find", { path: "/repo", pattern: "**/.ssh/id_rsa" }, deps);
    assert.equal(result?.block, true);
});

test("unhandled tools pass through", () => {
    const { deps } = makeDeps();
    assert.equal(handleToolCall("edit", { path: "/repo/a.php", oldString: "x" }, deps), undefined);
    assert.equal(handleToolCall("write", { path: "/repo/b.php", content: "x" }, deps), undefined);
});

test("internal error fails closed with ADR-0036 reason", () => {
    const throwing = {
        isTripped: () => { throw new Error("boom"); },
    } as unknown as DenialCircuitBreaker;
    const { deps } = makeDeps({ breaker: throwing });
    const result = handleToolCall("bash", { command: "echo hi" }, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /failing closed per ADR-0036/);
    assert.match(result?.reason ?? "", /boom/);
});







// vim: ft=typescript sts=4 sw=4 ts=4 et :
