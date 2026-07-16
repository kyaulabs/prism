// $KYAULabs: pre-tool-use.test.ts kyau@nova 2026/07/16 -0700 Exp $

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../.opencode/plugins/pre-tool-use.ts";

describe("classifyCommand — baseline", () => {
    const opts = { projectDir: "/home/user/project" };

    it("passes benign commands", () => {
        assert.deepEqual(classifyCommand("ls -la", opts), { severity: null, reason: "" });
        assert.deepEqual(classifyCommand("git status", opts), { severity: null, reason: "" });
    });

    it("warns on DROP DATABASE", () => {
        assert.equal(classifyCommand('mariadb -e "DROP DATABASE foo"', opts).severity, "warn");
    });

    it("warns on drop table case-insensitive", () => {
        assert.equal(classifyCommand("drop table users", opts).severity, "warn");
    });

    it("warns on git reset --hard", () => {
        assert.equal(classifyCommand("git reset --hard HEAD~1", opts).severity, "warn");
    });

    it("warns on git push --delete", () => {
        assert.equal(classifyCommand("git push origin --delete feature", opts).severity, "warn");
    });

    it("blocks git push --force", () => {
        assert.equal(classifyCommand("git push --force origin main", opts).severity, "block");
    });

    it("blocks git push -f", () => {
        assert.equal(classifyCommand("git push -f origin main", opts).severity, "block");
    });

    it("does not block git push --force-with-lease", () => {
        assert.equal(classifyCommand("git push --force-with-lease origin main", opts).severity, null);
    });

    it("passes empty command without throwing", () => {
        assert.deepEqual(classifyCommand("", opts), { severity: null, reason: "" });
    });
});

describe("classifyCommand — rm -rf safe zones", () => {
    const opts = { projectDir: "/home/user/project" };

    it("allows rm -rf inside node_modules", () => {
        assert.equal(classifyCommand("rm -rf node_modules", opts).severity, null);
    });

    it("allows rm -rf inside vendor", () => {
        assert.equal(classifyCommand("rm -rf vendor", opts).severity, null);
    });

    it("allows rm -rf in /tmp", () => {
        assert.equal(classifyCommand("rm -rf /tmp/build-cache", opts).severity, null);
    });

    it("blocks rm -rf on project root (.)", () => {
        assert.equal(classifyCommand("rm -rf .", opts).severity, "block");
    });

    it("blocks rm -rf on src", () => {
        assert.equal(classifyCommand("rm -rf src", opts).severity, "block");
    });

    it("blocks rm -fr (combined flags)", () => {
        assert.equal(classifyCommand("rm -fr src", opts).severity, "block");
    });

    it("blocks rm --recursive --force", () => {
        assert.equal(classifyCommand("rm --recursive --force src", opts).severity, "block");
    });

    it("blocks when any target is unsafe among safe ones", () => {
        assert.equal(classifyCommand("rm -rf node_modules src", opts).severity, "block");
    });

    it("blocks unresolvable glob target", () => {
        assert.equal(classifyCommand("rm -rf *.log", opts).severity, "block");
    });

    it("blocks rm -rf in a piped segment", () => {
        assert.equal(classifyCommand("echo hi | rm -rf src", opts).severity, "block");
    });
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
