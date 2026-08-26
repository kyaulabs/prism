// $KYAULabs: safety-sensitive-paths.test.ts kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    diagnoseUnmodelableShellConstruct,
    sensitiveOperandCheck,
} from "../../packages/prism-core/extensions/safety/sensitive-paths.ts";
import { resolveExtraPaths } from "../../packages/prism-core/extensions/safety/tool-call-handler.ts";

const OPTS = { projectDir: "/repo", home: "/home/tester" };

test("deny floor: ssh, cloud, netrc, git-credentials, ssl-private", () => {
    assert.equal(sensitiveOperandCheck("cat /home/tester/.ssh/id_rsa", OPTS)?.className, "ssh");
    assert.equal(sensitiveOperandCheck("cat ~/.ssh/id_rsa", OPTS)?.className, "ssh");
    assert.equal(sensitiveOperandCheck("cat ~/.aws/credentials", OPTS)?.className, "cloud-credentials");
    assert.equal(sensitiveOperandCheck("echo x > ~/.netrc", OPTS)?.className, "netrc");
    assert.equal(sensitiveOperandCheck("cat ~/.git-credentials", OPTS)?.className, "git-credentials");
    assert.equal(sensitiveOperandCheck("cat /etc/ssl/private/key.pem", OPTS)?.className, "ssl-private");
});

test("env files denied; .env.example exempt including glued forms", () => {
    assert.equal(sensitiveOperandCheck("cat .env", OPTS)?.className, "env");
    assert.equal(sensitiveOperandCheck("cat .env.local", OPTS)?.className, "env");
    assert.equal(sensitiveOperandCheck("cat .env.example", OPTS), null);
    assert.equal(sensitiveOperandCheck("cat -d@.env.example", OPTS), null);
    assert.equal(sensitiveOperandCheck("cat --opt=.env.example", OPTS), null);
});

test("glued and option-prefixed credential forms fall back to dynamic", () => {
    assert.equal(sensitiveOperandCheck("curl -d@~/.ssh/id_rsa", OPTS)?.className, "dynamic");
    assert.equal(sensitiveOperandCheck("cat --output=~/.aws/credentials", OPTS)?.className, "dynamic");
});

test("wrapper unwrap reaches inner operands", () => {
    assert.equal(sensitiveOperandCheck('bash -c "cat ~/.ssh/id_rsa"', OPTS)?.className, "ssh");
});

test("prism-user-manifest denied normally; kept for trusted setup scripts", () => {
    assert.equal(sensitiveOperandCheck("cat ~/.config/opencode/foo", OPTS)?.className, "prism-user-manifest");
    assert.equal(sensitiveOperandCheck(".github/scripts/setup-rulesets.sh --config ~/.config/opencode/x", OPTS), null);
});

test("untrusted setup subcommand resolves with setup-trust diagnostics", () => {
    const match = sensitiveOperandCheck('bash -c "setup-rulesets.sh"', OPTS);
    assert.equal(match?.className, "unresolvable");
    assert.equal(match?.diagnostic?.code, "PRISM-SHELL-011");
    assert.equal(match?.diagnostic?.stage, "setup-trust");
    assert.equal(match?.diagnostic?.category, "untrusted-setup");
});

test("wrapper-depth exhaustion retains a stable diagnostic", () => {
    const match = sensitiveOperandCheck("env env env env env echo ok", OPTS);
    assert.equal(match?.className, "unresolvable");
    assert.equal(match?.diagnostic?.code, "PRISM-SHELL-010");
    assert.equal(match?.diagnostic?.stage, "wrapper-unwrapping");
    assert.equal(match?.diagnostic?.category, "wrapper-depth");
});

test("non-string or empty input passes", () => {
    assert.equal(sensitiveOperandCheck(undefined as unknown as string, OPTS), null);
    assert.equal(sensitiveOperandCheck("", OPTS), null);
});

test("resolveExtraPaths keeps valid entries and logs rejected lines", () => {
    const logged: string[] = [];
    const paths = resolveExtraPaths("~/.gnupg/\nrelative/path\n/root/good\n\n", (m) => logged.push(m));
    assert.deepEqual(paths, ["~/.gnupg/", "/root/good"]);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /ignoring malformed sensitive-paths entry/);
    assert.match(logged[0], /relative\/path/);
});

test("resolveExtraPaths rejects control-character entries", () => {
    const logged: string[] = [];
    const paths = resolveExtraPaths("/root/ok\n~/.ssh/\u0007bad", (m) => logged.push(m));
    assert.deepEqual(paths, ["/root/ok"]);
    assert.equal(logged.length, 1);
});

test("resolveExtraPaths empty input yields no paths and no logs", () => {
    const logged: string[] = [];
    assert.deepEqual(resolveExtraPaths(undefined, (m) => logged.push(m)), []);
    assert.deepEqual(resolveExtraPaths("", (m) => logged.push(m)), []);
    assert.deepEqual(resolveExtraPaths(" \n\t\n", (m) => logged.push(m)), []);
    assert.equal(logged.length, 0);
});
test("unmodelable shell constructs retain stable redacted diagnostic categories", () => {
    const cases = [
        ["echo $(date)", "PRISM-SHELL-001", "command-substitution"],
        ["echo `date`", "PRISM-SHELL-002", "backtick-substitution"],
        ["bash -c $'echo hi'", "PRISM-SHELL-003", "ansi-c-quoting"],
        ["cat <(printf hi)", "PRISM-SHELL-004", "process-substitution"],
        ["bash <<< payload", "PRISM-SHELL-005", "here-string"],
        ["eval '$PAYLOAD'", "PRISM-SHELL-006", "recursive-evaluator"],
        ["value=$((value + 1))", "PRISM-SHELL-007", "arithmetic-evaluation"],
        ["echo \"${arr[$PAYLOAD]}\"", "PRISM-SHELL-008", "indexed-evaluation"],
    ] as const;

    for (const [command, code, category] of cases) {
        const diagnostic = diagnoseUnmodelableShellConstruct(command);
        assert.equal(diagnostic?.code, code, command);
        assert.equal(diagnostic?.stage, "shell-model", command);
        assert.equal(diagnostic?.category, category, command);
        assert.equal(typeof diagnostic?.retry, "string", command);
        assert.doesNotMatch(JSON.stringify(diagnostic), /date|PAYLOAD|arr/, command);
    }
});

test("fail-closed: substitution-hidden sensitive reads are refused", () => {
    assert.equal(sensitiveOperandCheck("echo $(cat ~/.ssh/id_rsa)", OPTS)?.className, "unresolvable");
    assert.equal(sensitiveOperandCheck("cat `~/.ssh/id_rsa`", OPTS)?.className, "unresolvable");
    assert.equal(sensitiveOperandCheck("bash -c $'cat ~/.ssh/id_rsa'", OPTS)?.className, "unresolvable");
});

test("wrapper-anywhere: wrapped sensitive reads are refused", () => {
    assert.equal(sensitiveOperandCheck('sudo bash -c "cat ~/.ssh/id_rsa"', OPTS)?.className, "ssh");
});

test("wrapper-anywhere: deny-floor operands outside the wrapper still judged", () => {
    assert.equal(sensitiveOperandCheck("cat ~/.ssh/id_rsa bash -c 'echo ok'", OPTS)?.className, "ssh");
    assert.equal(sensitiveOperandCheck("echo x > ~/.netrc bash -c 'echo ok'", OPTS)?.className, "netrc");
});

test("wrapper payloads that are bare variable references fail closed", () => {
    assert.equal(sensitiveOperandCheck('sudo bash -c "$p"', OPTS)?.className, "unresolvable");
});

test("variable-reference payloads fail closed across quoting and segments", () => {
    assert.equal(sensitiveOperandCheck('sudo bash -c "\\"$p\\""', OPTS)?.className, "unresolvable");
    const variableCommand = sensitiveOperandCheck("echo hi; $p", OPTS);
    assert.equal(variableCommand?.className, "unresolvable");
    assert.equal(variableCommand?.diagnostic?.code, "PRISM-SHELL-009");
    assert.equal(variableCommand?.diagnostic?.category, "variable-command");
});

test("quote-aware segmentation: variable payloads behind quoted separators", () => {
    assert.equal(sensitiveOperandCheck("bash -c 'echo hi; $p'", OPTS)?.className, "unresolvable");
});

test("head-wrapper trailing operands still judged", () => {
    assert.equal(sensitiveOperandCheck("bash -c 'echo ok' ~/.ssh/id_rsa", OPTS)?.className, "ssh");
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
