// $KYAULabs: safety-tool-call-handler.test.ts kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function markedBashBlock(source: string, start: string, end: string): string {
    const section = source.split(start)[1]?.split(end)[0] ?? "";
    const block = section.match(/```bash\n([\s\S]*?)\n```/);
    assert.notEqual(block, null, start);
    return block?.[1] ?? "";
}

test("tripped breaker blocks every tool before policy", () => {
    const { deps } = makeDeps({ breaker: trippedBreaker() });
    assert.deepEqual(handleToolCall("read", { path: "/repo/ok.php" }, deps), {
        block: true,
        reason: "[prism safety] BLOCKED: session tripped (3 bash denials within the last 10 bash calls) — circuit breaker active per ADR-0068. Run /reload to reset the safety extension without starting a new session.",
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

test("the check conflict-marker audit passes without feeding the breaker", () => {
    const { deps } = makeDeps();
    const command = [
        "if git grep -nE '^(<<<<<<< |=======|>>>>>>> )' -- . ':!adr/**' ':!docs/plans/**'; then",
        "    echo 'FAIL: unresolved conflict marker(s) found'",
        "else",
        "    echo 'PASS: no unresolved conflict markers'",
        "fi",
    ].join("\n");

    assert.equal(handleToolCall("bash", { command }, deps), undefined);
    assert.equal(deps.breaker.count("s1"), 0);
});

test("the exact pull request workflow blocks pass the safety boundary", () => {
    const source = readFileSync(
        new URL("../../packages/prism-core/prompts/pr.md", import.meta.url),
        "utf8",
    );
    const blocks = [
        markedBashBlock(source, "<!-- pr-preflight:start -->", "<!-- pr-preflight:end -->"),
        markedBashBlock(source, "<!-- pr-title-validation:start -->", "<!-- pr-title-validation:end -->"),
    ];

    for (const command of blocks) {
        const { deps } = makeDeps();
        assert.equal(handleToolCall("bash", { command }, deps), undefined);
        assert.equal(deps.breaker.count("s1"), 0);
    }
});

test("literal arithmetic passes while identifier and nested expansions block", () => {
    const { deps } = makeDeps();

    assert.equal(handleToolCall("bash", { command: "value=$((1 + 2))" }, deps), undefined);
    assert.equal(deps.breaker.count("s1"), 0);

    const identifier = handleToolCall("bash", { command: "attempts=$((attempts + 1))" }, deps);
    assert.equal(identifier?.block, true);
    assert.match(identifier?.reason ?? "", /sensitive-path policy/);
    assert.equal(deps.breaker.count("s1"), 1);

    const nested = handleToolCall("bash", { command: "value=$((1 + $(cat ~/.ssh/id_rsa)))" }, deps);
    assert.equal(nested?.block, true);
    assert.match(nested?.reason ?? "", /sensitive-path policy/);
    assert.equal(deps.breaker.count("s1"), 2);
});

test("delayed trap payloads fail closed", () => {
    const commands = [
        "trap 'cat <(touch /tmp/trap-canary)' EXIT",
        "trap 'bash <<< \"touch /tmp/trap-canary\"' EXIT",
    ];

    for (const command of commands) {
        const { deps } = makeDeps();
        const result = handleToolCall("bash", { command }, deps);

        assert.equal(result?.block, true, command);
        assert.match(result?.reason ?? "", /sensitive-path policy/, command);
        assert.equal(deps.breaker.count("s1"), 1, command);
    }
});

test("delayed and arithmetic builtin names remain inert in ordinary arguments", () => {
    const commands = [
        "echo trap",
        "printf '%s' let",
        "grep declare -i file",
        "echo 'item[name]=value'",
        "grep 'array[key]=text' file",
        "printf '%s' 'array[key]=text'",
    ];

    for (const command of commands) {
        const { deps } = makeDeps();

        assert.equal(handleToolCall("bash", { command }, deps), undefined, command);
        assert.equal(deps.breaker.count("s1"), 0, command);
    }
});

test("recursive evaluator wrappers fail closed on delayed destructive payloads", () => {
    const { deps } = makeDeps();
    const command = "builtin eval 'echo $((1)); rm -rf /home/tester/project'";
    const result = handleToolCall("bash", { command }, deps);

    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /sensitive-path policy/);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("grouped recursive evaluators fail closed on escaped substitution payloads", () => {
    const { deps } = makeDeps();
    const command = '{ eval "payload=\\$(id)"; }';
    const result = handleToolCall("bash", { command }, deps);

    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /sensitive-path policy/);
    assert.equal(deps.breaker.count("s1"), 1);
});

test("single-quoted command substitution syntax fails closed", () => {
    const commands = [
        "echo '$(date)'",
        "printf '%s\\n' '`date`'",
        "declare 'arr[$(touch /tmp/arithmetic-canary)]=x'",
        "unset 'arr[`touch /tmp/arithmetic-canary`]'",
    ];

    for (const command of commands) {
        const { deps } = makeDeps();
        const result = handleToolCall("bash", { command }, deps);

        assert.equal(result?.block, true, command);
        assert.match(result?.reason ?? "", /sensitive-path policy/, command);
        assert.equal(deps.breaker.count("s1"), 1, command);
    }
});

test("arithmetic commands block recursively evaluated identifiers", () => {
    const commands = [
        "value='arr[$(touch /tmp/arithmetic-canary)]'; ((value))",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; declare -i result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; typeset -i result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; local -i result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; command let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; command declare -i result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; builtin command let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; l'e't value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; \\let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; b'uiltin' c'ommand' l'e't value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; builtin \\-- let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; command -\\- let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; declare -'i' result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; ! let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; time let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; time -p let value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; local -I result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; declare -I result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; typeset -I result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; typeset -i10 result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; typeset -E result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; typeset -gF10 result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; integer result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; float result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; declare >/tmp/arithmetic-output -i result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; if let value; then :; fi",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; while declare -i result=value; do break; done",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; l\\" + "\n" + "et value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; declare -\\" + "\n" + "i result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; cmd=let; \"$cmd\" value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; cmd=let; \"\"$cmd value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; cmd=let; $cmd'' value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; part=c; de${part}lare -i result=value",
        "value='arr[$(touch /tmp/arithmetic-canary)]'; empty=; l${empty}et value",
        "payload='$(touch /tmp/arithmetic-canary)'; arr[$payload]=x",
        "payload='$(touch /tmp/arithmetic-canary)'; printf -v 'arr[$payload]' %s x",
    ];

    for (const command of commands) {
        const { deps } = makeDeps();
        const result = handleToolCall("bash", { command }, deps);

        assert.equal(result?.block, true, command);
        assert.match(result?.reason ?? "", /sensitive-path policy/, command);
        assert.equal(deps.breaker.count("s1"), 1, command);
    }
});

test("unsafe indexed assignments fail closed regardless of token position", () => {
    const commands = [
        "> /tmp/arithmetic-output arr[$payload]=x",
        "declare 'arr[$payload]=x'",
        "unset 'arr[$payload]'",
    ];

    for (const command of commands) {
        const { deps } = makeDeps();
        const result = handleToolCall("bash", { command }, deps);

        assert.equal(result?.block, true, command);
        assert.match(result?.reason ?? "", /sensitive-path policy/, command);
        assert.equal(deps.breaker.count("s1"), 1, command);
    }
});

test("non-arithmetic declaration forms do not block", () => {
    const { deps } = makeDeps();

    assert.equal(handleToolCall("bash", { command: "declare -- -i" }, deps), undefined);
    assert.equal(handleToolCall("bash", { command: "declare -F" }, deps), undefined);
    assert.equal(handleToolCall("bash", { command: "arr[1+2]=x" }, deps), undefined);
    assert.equal(handleToolCall("bash", { command: "printf -v 'arr[1+2]' %s x" }, deps), undefined);
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
