// $KYAULabs: session-bootstrap.ts kyau@nova 2026/07/07 -0700 Exp $

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";

/**
 * Injects the rationalization red-flags bootstrap into the system prompt on
 * every LLM call and into the compaction context. This is structural
 * enforcement — the model cannot "forget" to load a skill because the
 * anti-drift text is pushed by the plugin, not chosen by the model.
 *
 * The bootstrap text lives in `.opencode/docs/session-bootstrap.md` so it
 * can be edited without touching plugin code.
 */

export const SessionBootstrap: Plugin = async ({ directory }) => {
    const bootstrapPath = join(
        directory,
        ".opencode",
        "docs",
        "session-bootstrap.md",
    );
    let bootstrap = "";
    try {
        bootstrap = readFileSync(bootstrapPath, "utf-8");
    } catch (err: unknown) {
        console.warn(
            `[session-bootstrap] could not read ${bootstrapPath}: ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `Anti-drift bootstrap disabled for this session.`
        );
        return {};
    }

    return {
        "experimental.chat.system.transform": async (_input, output) => {
            output.system.push(bootstrap);
        },
        "experimental.session.compacting": async (_input, output) => {
            output.context.push(bootstrap);
        },
    };
};

// vim: ft=typescript sts=4 sw=4 ts=4 et :
