// $KYAULabs: no_verify_block.test.ts kyau@nova 2026/07/21 -0700 Exp $



import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../.opencode/plugins/pre-tool-use.ts";

describe("classifyCommand — --no-verify block (ADR-0025)", () => {
    const opts = { projectDir: "/home/user/project" };

    it("blocks git commit --no-verify", () => {
        assert.equal(classifyCommand("git commit --no-verify -m x", opts).severity, "block");
    });

    it("blocks git commit -n (no-verify short form)", () => {
        assert.equal(classifyCommand("git commit -n -m x", opts).severity, "block");
    });

    it("blocks --no-verify on any git command", () => {
        assert.equal(classifyCommand("git push --no-verify", opts).severity, "block");
    });

    it("does NOT block git log -n 5 (max-count)", () => {
        assert.equal(classifyCommand("git log -n 5", opts).severity, null);
    });

    it("does NOT block git push -n (dry-run)", () => {
        assert.equal(classifyCommand("git push -n origin main", opts).severity, null);
    });

    it("does NOT block git cherry-pick -n (no-commit)", () => {
        assert.equal(classifyCommand("git cherry-pick -n ABC", opts).severity, null);
    });

    it("does NOT block a normal signed commit", () => {
        assert.equal(classifyCommand("git commit -S -m feat: x", opts).severity, null);
    });

    it("blocks git -C /tmp/x push --force (global -C skip)", () => {
        assert.equal(classifyCommand("git -C /tmp/x push --force", opts).severity, "block");
    });
    it("blocks git -c a=b commit -n (global -c skip, then -n on commit)", () => {
        assert.equal(classifyCommand("git -c a=b commit -n", opts).severity, "block");
    });
    it("does NOT block git -C ../other log -n 5 (log -n = max-count)", () => {
        assert.equal(classifyCommand("git -C ../other log -n 5", opts).severity, null);
    });
    it("does NOT block git -c user.email=x@y commit -m w (normal commit)", () => {
        assert.equal(classifyCommand("git -c user.email=x@y commit -m w", opts).severity, null);
    });
});



// vim: ft=typescript sts=4 sw=4 ts=4 et :
