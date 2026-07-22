// $KYAULabs: fail_closed_contract.test.ts kyau@nova 2026/07/21 -0700 Exp $



import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../.opencode/plugins/pre-tool-use.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const opts = { projectDir: "/home/user/project" };

describe("classifyCommand — fail-closed posture (ADR-0036)", () => {
    it("classifyCommand fails CLOSED on internal error (block, not pass)", () => {
        // Passing an object that makes impl throw; the public wrapper must surface block.
        const result = classifyCommand({} as unknown as string, opts);
        assert.equal(result.severity, "block");
    });
});

describe("ADR-0036 contract", () => {
    it("adr/0036 exists and is Accepted", () => {
        const adrPath = resolve(import.meta.dirname!, "../../adr/0036-safety-hook-fail-closed-block-rules.md");
        let content: string;
        try {
            content = readFileSync(adrPath, "utf8");
        } catch {
            assert.fail("ADR-0036 file not found at " + adrPath);
        }
        assert.match(content, /^# 0036\./m, "ADR-0036 must have a title line starting with # 0036.");
        assert.match(content, /\nAccepted\n/, "ADR-0036 must be Accepted.");
    });
});



// vim: ft=typescript sts=4 sw=4 ts=4 et :
