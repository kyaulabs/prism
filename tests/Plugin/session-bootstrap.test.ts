// $KYAULabs: session-bootstrap.test.ts kyau@nova 2026/07/07 -0700 Exp $

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let warnCalls: string[] = [];
const originalWarn = console.warn;

describe("SessionBootstrap plugin", () => {
    let tempDir: string;

    beforeEach(() => {
        warnCalls = [];
        console.warn = (...args: unknown[]) => {
            warnCalls.push(args.map(a => String(a)).join(" "));
        };
        tempDir = mkdtempSync(join(tmpdir(), "session-bootstrap-test-"));
    });

    afterEach(() => {
        console.warn = originalWarn;
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns empty hooks and warns when session-bootstrap.md is missing", async () => {
        // Do NOT create the .opencode/docs/session-bootstrap.md file
        const mod = await import("../../.opencode/plugins/session-bootstrap.ts");
        const result = await mod.SessionBootstrap({ directory: tempDir });

        assert.deepStrictEqual(result, {});
        assert.ok(
            warnCalls.some(msg =>
                msg.includes("session-bootstrap.md") &&
                msg.includes("could not read")
            ),
            `Expected warning about missing bootstrap doc, got: ${JSON.stringify(warnCalls)}`
        );
    });

    it("returns hooks that push bootstrap text when file exists", async () => {
        const docsDir = join(tempDir, ".opencode", "docs");
        mkdirSync(docsDir, { recursive: true });
        writeFileSync(join(docsDir, "session-bootstrap.md"), "# Test bootstrap content", "utf-8");

        const mod = await import("../../.opencode/plugins/session-bootstrap.ts");
        const result = await mod.SessionBootstrap({ directory: tempDir });

        assert.ok(result["experimental.chat.system.transform"], "should have system.transform hook");
        assert.ok(result["experimental.session.compacting"], "should have session.compacting hook");

        const outputSystem: unknown[] = [];
        await result["experimental.chat.system.transform"](
            {},
            { system: outputSystem },
        );
        assert.strictEqual(outputSystem.length, 1);
        assert.strictEqual(outputSystem[0], "# Test bootstrap content");

        const outputContext: unknown[] = [];
        await result["experimental.session.compacting"](
            {},
            { context: outputContext },
        );
        assert.strictEqual(outputContext.length, 1);
        assert.strictEqual(outputContext[0], "# Test bootstrap content");
    });
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
