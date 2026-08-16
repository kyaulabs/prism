// $KYAULabs: safety-classify.test.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../packages/prism-core/extensions/safety/pre-tool-use.ts";

const OPTS = { projectDir: "/repo" };
const CLEAN = { severity: null, reason: "" };

test("empty command passes open", () => {
    assert.deepEqual(classifyCommand("", OPTS), CLEAN);
});

test("rm -rf inside a safe zone passes", () => {
    assert.deepEqual(classifyCommand("rm -rf node_modules", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("rm -rf /tmp/xyz", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("cd /repo && rm -rf vendor/pkg", OPTS), CLEAN);
});

test("rm -rf outside safe zones blocks", () => {
    assert.equal(classifyCommand("rm -rf /", OPTS).severity, "block");
    assert.equal(classifyCommand("rm -rf .", OPTS).severity, "block");
    assert.equal(classifyCommand("rm -rf x", OPTS).severity, "block");
    assert.equal(classifyCommand("sudo rm -rf /etc", OPTS).severity, "block");
});

test("rm -rf with no operands at head passes; via xargs blocks", () => {
    assert.deepEqual(classifyCommand("rm -rf", OPTS), CLEAN);
    assert.equal(classifyCommand("xargs rm -rf", OPTS).severity, "block");
});

test("rm without -r is not blocked", () => {
    assert.deepEqual(classifyCommand("rm -f node_modules", OPTS), CLEAN);
});

test("rm -rf of a safe-zone path containing = stays allowed", () => {
    assert.deepEqual(classifyCommand("rm -rf node_modules/foo=bar", OPTS), CLEAN);
});

test("find -delete and find -exec rm block; other find -exec passes", () => {
    assert.equal(classifyCommand("find . -delete", OPTS).severity, "block");
    assert.equal(classifyCommand("find . -exec rm {} ;", OPTS).severity, "block");
    assert.deepEqual(classifyCommand("find . -exec echo {} ;", OPTS), CLEAN);
});

test("destructive SQL DROP warns", () => {
    assert.equal(classifyCommand("DROP TABLE users", OPTS).severity, "warn");
    assert.equal(classifyCommand("DROP DATABASE db", OPTS).severity, "warn");
});

test("git reset --hard warns", () => {
    assert.equal(classifyCommand("git reset --hard", OPTS).severity, "warn");
});

test("git push --delete warns", () => {
    assert.equal(classifyCommand("git push origin --delete feature/x", OPTS).severity, "warn");
});

test("git push --force variants block; --force-with-lease passes", () => {
    assert.equal(classifyCommand("git push -f", OPTS).severity, "block");
    assert.equal(classifyCommand("git push --force", OPTS).severity, "block");
    assert.equal(classifyCommand("git push -uf origin main", OPTS).severity, "block");
    assert.deepEqual(classifyCommand("git push --force-with-lease", OPTS), CLEAN);
});

test("git push -n is dry-run, not no-verify", () => {
    assert.deepEqual(classifyCommand("git push -n", OPTS), CLEAN);
});

test("git commit --no-verify and -n block", () => {
    assert.equal(classifyCommand("git commit --no-verify -m x", OPTS).severity, "block");
    assert.equal(classifyCommand("git commit -n -m x", OPTS).severity, "block");
});

test("git log -n 5 is max-count, not no-verify", () => {
    assert.deepEqual(classifyCommand("git log -n 5", OPTS), CLEAN);
});

test("git global options are consumed before the subcommand", () => {
    assert.deepEqual(classifyCommand("git -c core.hooksPath=/tmp/x commit -m y", OPTS), CLEAN);
});

test("wrapper unwrap: clean inner passes, destructive inner blocks", () => {
    assert.deepEqual(classifyCommand('bash -c "rm -rf /tmp/x"', OPTS), CLEAN);
    assert.equal(classifyCommand('bash -c "rm -rf /"', OPTS).severity, "block");
    assert.deepEqual(classifyCommand("env FOO=1 rm -rf node_modules", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("command rm -rf node_modules", OPTS), CLEAN);
});

test("unwrap depth guard blocks deeply nested clean wrappers", () => {
    assert.deepEqual(classifyCommand("eval eval echo hi", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("eval eval eval echo hi", OPTS), CLEAN);
    assert.equal(classifyCommand("eval eval eval eval echo hi", OPTS).severity, "block");
});

test("non-string command fails closed", () => {
    const f = classifyCommand(undefined as unknown as string, OPTS);
    assert.equal(f.severity, "block");
    assert.match(f.reason, /internal error/);
});


// vim: ft=typescript sts=4 sw=4 ts=4 et :
