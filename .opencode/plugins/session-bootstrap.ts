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
    const bootstrap = readFileSync(bootstrapPath, "utf-8");

    return {
        "experimental.chat.system.transform": async (_input, output) => {
            output.system.push(bootstrap);
        },
        "experimental.session.compacting": async (_input, output) => {
            output.context.push(bootstrap);
        },
    };
};
