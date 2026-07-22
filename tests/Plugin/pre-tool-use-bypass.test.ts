// $KYAULabs: pre-tool-use-bypass.test.ts kyau@nova 2026/07/21 -0700 Exp $



import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenizeCommand } from "../../.opencode/plugins/pre-tool-use.ts";

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



// vim: ft=typescript sts=4 sw=4 ts=4 et :
