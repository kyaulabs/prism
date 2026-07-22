// $KYAULabs: pre-tool-use-bypass.test.ts kyau@nova 2026/07/21 -0700 Exp $



import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenizeCommand, classifyCommand } from "../../.opencode/plugins/pre-tool-use.ts";

describe("tokenizeCommand", () => {
    it("splits plain whitespace tokens", () => {
        assert.deepEqual(tokenizeCommand("rm -rf src"), ["rm", "-rf", "src"]);
    });
    it("keeps a double-quoted span as one token, strips quotes", () => {
        assert.deepEqual(tokenizeCommand('bash -c "rm -rf /etc"'), ["bash", "-c", "rm -rf /etc"]);
    });
    it("keeps a single-quoted span as one token, strips quotes", () => {
        assert.deepEqual(tokenizeCommand("sh -c 'git push -f'"), ["sh", "-c", "git push -f"]);
    });
    it("preserves spaces inside quotes", () => {
        assert.deepEqual(tokenizeCommand("rm -rf 'my dir'"), ["rm", "-rf", "my dir"]);
    });
    it("returns [] for blank input", () => {
        assert.deepEqual(tokenizeCommand("   "), []);
    });
});

describe("classifyCommand — rm basename + scan-anywhere", () => {
    const opts = { projectDir: "/home/user/project" };

    it("blocks /bin/rm -rf (basename match)", () => {
        assert.equal(classifyCommand("/bin/rm -rf /etc", opts).severity, "block");
    });
    it("blocks sudo /usr/bin/rm -rf (basename + sudo-strip)", () => {
        assert.equal(classifyCommand("sudo /usr/bin/rm -rf src", opts).severity, "block");
    });
    it("blocks xargs rm -rf (rm not at head)", () => {
        assert.equal(classifyCommand("xargs rm -rf", opts).severity, "block");
    });
    it("blocks rm -rf appearing after a pipe in one segment via wrapper", () => {
        assert.equal(classifyCommand("echo hi | xargs rm -rf", opts).severity, "block");
    });
});

describe("classifyCommand — wrapper unwrapping", () => {
    const opts = { projectDir: "/home/user/project" };

    it('blocks bash -c "rm -rf /etc"', () => {
        assert.equal(classifyCommand('bash -c "rm -rf /etc"', opts).severity, "block");
    });
    it('blocks sh -c "git push --force origin main"', () => {
        assert.equal(classifyCommand('sh -c "git push --force origin main"', opts).severity, "block");
    });
    it("blocks env rm -rf /etc", () => {
        assert.equal(classifyCommand("env rm -rf /etc", opts).severity, "block");
    });
    it('blocks eval "git push -f"', () => {
        assert.equal(classifyCommand('eval "git push -f"', opts).severity, "block");
    });
    it("blocks command git push --force", () => {
        assert.equal(classifyCommand("command git push --force", opts).severity, "block");
    });
    it("blocks deeply nested wrappers past depth cap", () => {
        // command chaining: each "command" prefix strips one layer.
        // 4 levels > MAX_UNWRAP_DEPTH (3) → BLOCK
        assert.equal(classifyCommand("command command command command rm -rf /etc", opts).severity, "block");
    });
});



// vim: ft=typescript sts=4 sw=4 ts=4 et :
