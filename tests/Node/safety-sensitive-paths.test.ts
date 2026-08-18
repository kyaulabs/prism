// $KYAULabs: safety-sensitive-paths.test.ts kyau@aura.kyaulabs 2026/08/17 -0700 Exp $







import { test } from "node:test";
import assert from "node:assert/strict";
import { sensitiveOperandCheck } from "../../packages/prism-core/extensions/safety/sensitive-paths.ts";
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

test("untrusted setup subcommand resolves unresolvable", () => {
    assert.equal(sensitiveOperandCheck('bash -c "setup-rulesets.sh"', OPTS)?.className, "unresolvable");
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





// vim: ft=typescript sts=4 sw=4 ts=4 et :
