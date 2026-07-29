// $KYAULabs: pre-tool-use-breaker.test.ts kyau@cosmos.kyaulabs 2026/07/28 -0700 Exp $



import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";

/**
 * Issue #274 — wiring the `DenialOutcomeTracker` into the existing
 * PreToolUse plugin (Task 3). These tests drive the plugin's PUBLIC hook
 * interface only: they load the plugin with a capturing SDK client, feed
 * `message.part.updated` / `session.idle` events through the `event` hook,
 * and observe the two side effects the breaker may take at the system
 * boundary — `client.app.log` (redacted diagnostic) and
 * `client.session.abort` (fail-closed escalation). The pure state machine
 * and the tracker correlation logic are covered independently in
 * `denial_circuit_breaker.test.ts` and `denial_circuit_breaker_integration.test.ts`.
 */

/**
 * How the mocked `session.abort` should respond. The plugin's escalation
 * path must stay fail-closed for both non-success bodies and rejections
 * (ADR-0036), so each variant is exercised by a dedicated test.
 */
type AbortBehavior = "ok" | "fail" | "throw";

/** How the mocked `app.log` should respond. Logging is best-effort. */
type LogBehavior = "ok" | "throw";

interface CapturingClient {
    client: any;
    logs: any[];
    aborts: any[];
}

/**
 * Build a capturing SDK client that records every `app.log` and
 * `session.abort` invocation. The `abort`/`log` behaviors are configurable
 * so error-path tests can drive the fail-closed contract without touching
 * the plugin internals.
 */
const makeClient = (opts: { abort?: AbortBehavior; log?: LogBehavior } = {}): CapturingClient => {
    const logs: any[] = [];
    const aborts: any[] = [];
    const abort: AbortBehavior = opts.abort ?? "ok";
    const log: LogBehavior = opts.log ?? "ok";
    const client = {
        app: {
            log: async (b: any) => {
                if (log === "throw") throw new Error("log down");
                logs.push(b);
                return { data: true, error: undefined };
            },
        },
        session: {
            abort: async (o: any) => {
                aborts.push(o);
                if (abort === "ok") return { data: true, error: undefined };
                if (abort === "fail") return { data: undefined, error: { code: 500, message: "abort failed" } };
                throw new Error("abort network down");
            },
        },
    };
    return { client, logs, aborts };
};

/**
 * Load a fresh PreToolUse plugin instance. Each call constructs a new
 * `DenialOutcomeTracker` inside the factory, so tests are isolated from
 * one another with no cross-test breaker state leakage.
 */
const load = async (client: any) => {
    const mod = await import("../../.opencode/plugins/pre-tool-use.ts");
    return mod.PreToolUse({ directory: await mkdtemp(join(tmpdir(), "ptu-")), client } as any);
};

/** Build a `message.part.updated` event carrying a tool part. */
const toolPartEvent = (
    sessionID: string,
    callID: string,
    status: string,
    tool = "bash",
): any => ({
    type: "message.part.updated",
    properties: {
        part: {
            id: "p-" + callID,
            sessionID,
            messageID: "m-" + sessionID,
            type: "tool",
            callID,
            tool,
            state: { status },
        },
    },
});

/** Build a `session.idle` lifecycle event. */
const sessionIdleEvent = (sessionID: string): any => ({
    type: "session.idle",
    properties: { sessionID },
});

/** Build a `session.deleted` lifecycle event (`info.id` is the session id). */
const sessionDeletedEvent = (sessionID: string): any => ({
    type: "session.deleted",
    properties: { info: { id: sessionID } },
});

/** Feed one full bash denial (pending → error) through the event hook. */
const denyBash = async (eventHook: any, sessionID: string, callID: string) => {
    await eventHook({ event: toolPartEvent(sessionID, callID, "pending") });
    await eventHook({ event: toolPartEvent(sessionID, callID, "error") });
};

describe("PreToolUse breaker wiring — issue #274 enforcement", () => {
    it("trips on the third consecutive bash denial, escalating once (one log + one abort)", async () => {
        const { client, logs, aborts } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        // Two denials: below threshold — no escalation yet.
        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");
        assert.equal(aborts.length, 0, "no abort before threshold");
        assert.equal(logs.length, 0, "no log before threshold");

        // Third denial: the trip transition fires escalation exactly once.
        await denyBash(eventHook, session, "c3");

        assert.equal(aborts.length, 1, "abort called exactly once on trip");
        assert.deepEqual(
            aborts[0],
            { path: { id: session } },
            "abort targets the tripped session",
        );
        assert.equal(logs.length, 1, "log written exactly once on trip");
        assert.equal(logs[0].body.level, "error");
        assert.equal(logs[0].body.service, "denial-circuit-breaker");

        // A fourth denial keeps the session tripped but must NOT re-escalate
        // (the `transitioned` flag fires once per trip).
        await denyBash(eventHook, session, "c4");
        assert.equal(aborts.length, 1, "abort not repeated after the trip transition");
        assert.equal(logs.length, 1, "log not repeated after the trip transition");
    });

    it("blocks every tool call (even non-bash) once the session is tripped", async () => {
        const { client } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const before = hooks["tool.execute.before"]!;
        const session = "explore-1";

        // Not tripped: a read call passes through the hook without throwing.
        await assert.doesNotReject(() =>
            before({ tool: "read", sessionID: session, callID: "r0" }, { args: {} }),
        );

        // Trip the breaker with three consecutive bash denials.
        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");
        await denyBash(eventHook, session, "c3");

        // Once tripped, ANY tool call is blocked — even a read — because the
        // tripped guard runs at the top of tool.execute.before, ahead of the
        // non-bash early-return and the safety classifier.
        await assert.rejects(
            () => before({ tool: "read", sessionID: session, callID: "r1" }, { args: {} }),
            /circuit breaker active|tripped/,
        );
    });

    it("resets the streak when a matching bash tool.execute.after is observed", async () => {
        const { client, aborts, logs } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const after = hooks["tool.execute.after"]!;
        const session = "explore-1";

        // Build a streak of two denials.
        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");

        // A matching bash `after` (the call actually executed — exit 0,
        // nonzero, or ask-approved) settles the call and resets the streak.
        await eventHook({ event: toolPartEvent(session, "a1", "pending") });
        await after(
            { tool: "bash", sessionID: session, callID: "a1", args: { command: "ls" } },
            { title: "ls", output: "", metadata: {} },
        );

        // Two more denials after the reset land at 2 — below threshold, so the
        // breaker must NOT trip. Without the reset these four would trip.
        await denyBash(eventHook, session, "c3");
        await denyBash(eventHook, session, "c4");
        assert.equal(aborts.length, 0, "no trip — the matching after reset the streak");
        assert.equal(logs.length, 0);
    });

    it("ignores non-bash tool events — they do not count toward the streak", async () => {
        const { client, aborts } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        // Three read-tool errors must not preload the bash denial count.
        for (const callID of ["r1", "r2", "r3"]) {
            await eventHook({ event: toolPartEvent(session, callID, "pending", "read") });
            await eventHook({ event: toolPartEvent(session, callID, "error", "read") });
        }
        assert.equal(aborts.length, 0, "non-bash errors never escalate");

        // Two bash denials after the non-bash noise: below threshold.
        await denyBash(eventHook, session, "b1");
        await denyBash(eventHook, session, "b2");
        assert.equal(aborts.length, 0, "two bash denials alone do not trip");

        // A third bash denial trips — proving the count started at 0, not 3.
        await denyBash(eventHook, session, "b3");
        assert.equal(aborts.length, 1, "the third BASH denial trips; non-bash did not preload");
    });

    it("clears the session streak on session.idle (next streak starts fresh)", async () => {
        const { client, aborts } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        // Two denials, then session.idle must clear the streak.
        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");
        await eventHook({ event: sessionIdleEvent(session) });

        // After idle, two more denials land at 2 — not tripped. Without the
        // clear, the third call here would have tripped.
        await denyBash(eventHook, session, "c3");
        await denyBash(eventHook, session, "c4");
        assert.equal(aborts.length, 0, "session.idle cleared the streak");

        // A second idle, then a fresh streak needs the full threshold again.
        await eventHook({ event: sessionIdleEvent(session) });
        await denyBash(eventHook, session, "c5");
        await denyBash(eventHook, session, "c6");
        assert.equal(aborts.length, 0);
        await denyBash(eventHook, session, "c7");
        assert.equal(aborts.length, 1, "third denial after a fresh clear trips");
    });

    it("clears the session streak on session.deleted (info.id)", async () => {
        const { client, aborts } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        // Two denials, then session.deleted must clear the streak via info.id.
        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");
        await eventHook({ event: sessionDeletedEvent(session) });

        // Two more denials land at 2 — not tripped. Without the clear, the
        // very next call would have tripped.
        await denyBash(eventHook, session, "c3");
        await denyBash(eventHook, session, "c4");
        assert.equal(aborts.length, 0, "session.deleted cleared the streak");
    });

    it("never leaks command text, args, output, title, or metadata in the trip log", async () => {
        const { client, logs, aborts } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        // Build a streak of two clean denials.
        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");

        // The trip denial carries a full error state with sensitive material:
        // command text, a freeform error message, metadata, title, resources.
        // None of it may reach the escalation log (ADR-0042 redaction).
        await eventHook({ event: toolPartEvent(session, "c3", "pending") });
        await eventHook({
            event: {
                type: "message.part.updated",
                properties: {
                    part: {
                        id: "p-c3",
                        sessionID: session,
                        messageID: "m",
                        type: "tool",
                        callID: "c3",
                        tool: "bash",
                        state: {
                            status: "error",
                            input: { command: "SECRET-COMMAND-TEXT rm -rf /" },
                            error: "SECRET-ERROR-MESSAGE safety hook blocked",
                            metadata: { secret: "leak" },
                            time: { start: 1, end: 2 },
                        },
                        metadata: { title: "SECRET-TITLE", resources: ["x"] },
                    },
                },
            },
        });

        assert.equal(aborts.length, 1, "trip fired");
        assert.equal(logs.length, 1, "one redacted log written");

        const body = logs[0].body;
        const allowedTop = new Set(["service", "level", "message", "extra"]);
        for (const key of Object.keys(body)) {
            assert.ok(allowedTop.has(key), `unexpected top-level log key: ${key}`);
        }
        const allowedExtra = new Set(["event", "sessionID", "callID", "tool", "count", "threshold"]);
        for (const key of Object.keys(body.extra)) {
            assert.ok(allowedExtra.has(key), `unexpected extra log key: ${key}`);
        }

        // The serialized payload must not contain any of the sensitive
        // material that was present on the tool-part error state.
        const serialized = JSON.stringify(body);
        for (const forbidden of ["SECRET-COMMAND-TEXT", "SECRET-ERROR-MESSAGE", "SECRET-TITLE", "rm -rf"]) {
            assert.ok(!serialized.includes(forbidden), `redaction failed: log leaked "${forbidden}"`);
        }
    });

    it("stays fail-closed when session.abort returns an error body", async () => {
        const { client, aborts } = makeClient({ abort: "fail" });
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");

        // Third denial trips; abort returns { data: undefined, error } and the
        // escalation must propagate the failure (ADR-0036 fail-closed).
        await assert.rejects(
            () => denyBash(eventHook, session, "c3"),
            /abort failed|fail-closed/,
        );
        // The abort was still attempted before the failure surfaced.
        assert.equal(aborts.length, 1);
    });

    it("stays fail-closed when session.abort rejects (network down)", async () => {
        const { client, aborts } = makeClient({ abort: "throw" });
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");

        // Third denial trips; abort throws and the rejection propagates out
        // of the event hook (ADR-0036 fail-closed).
        await assert.rejects(
            () => denyBash(eventHook, session, "c3"),
            /abort network down|fail-closed/,
        );
        assert.equal(aborts.length, 1, "abort was attempted before rejecting");
    });

    it("still aborts when the best-effort log rejects", async () => {
        const { client, logs, aborts } = makeClient({ log: "throw" });
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");

        // Third denial trips; app.log rejects but is best-effort, so the abort
        // must still run and succeed.
        await denyBash(eventHook, session, "c3");
        assert.equal(aborts.length, 1, "abort ran despite the log rejection");
        assert.equal(logs.length, 0, "log mock did not record (it threw before pushing)");
    });

    it("clears all breaker state on dispose", async () => {
        const { client, aborts } = makeClient();
        const hooks = await load(client);
        const eventHook = hooks["event"]!;
        const session = "explore-1";

        // Build a streak of two (below threshold).
        await denyBash(eventHook, session, "c1");
        await denyBash(eventHook, session, "c2");

        // dispose must wipe every session's breaker state.
        await hooks.dispose!();

        // After dispose, two more denials land at 2 — not tripped. Without the
        // clear, the next call (3rd cumulative) would trip.
        await denyBash(eventHook, session, "c3");
        assert.equal(aborts.length, 0, "dispose cleared the streak");

        // A full fresh threshold is required to trip again.
        await denyBash(eventHook, session, "c4");
        await denyBash(eventHook, session, "c5");
        assert.equal(aborts.length, 1, "third denial after dispose trips from a fresh count");
    });
});




// vim: ft=typescript sts=4 sw=4 ts=4 et :
