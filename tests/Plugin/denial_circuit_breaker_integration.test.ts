// $KYAULabs: denial_circuit_breaker_integration.test.ts kyau@cosmos.kyaulabs 2026/07/28 -0700 Exp $



import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DenialOutcomeTracker } from "../../.opencode/plugins/denial-circuit-breaker.ts";

/**
 * Integration coverage for issue #274 — the `DenialOutcomeTracker` that
 * correlates `message.part.updated` tool-part events with
 * `tool.execute.after` hooks and feeds the pure `DenialCircuitBreaker`.
 *
 * Detection follows the ADR-0042 Probe-3 structural predicate: a tracked bash
 * ToolPart reaching `state.status == "error"` with no matching
 * `tool.execute.after` is a denial. config-deny, safety-hook block, and ask
 * rejection all collapse to that signature and count identically; normal
 * execution (including nonzero exit) reaches `completed` + `after` and resets.
 */
describe("DenialOutcomeTracker — issue #274 correlation", () => {
    it("ignores non-bash tool parts (returns null, no state change)", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const readError = t.observePart({
            sessionID: "explore-1",
            callID: "call-a",
            tool: "read",
            status: "error",
        });
        assert.equal(readError, null);
        // A non-bash outcome does not seed, count, or trip anything.
        assert.equal(t.count("explore-1"), 0);
        assert.equal(t.isTripped("explore-1"), false);
    });

    it("records a denial on pending->error and trips once on the third", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const session = "explore-1";

        // Denial 1: pending seeds the call (null), error records the denial.
        assert.equal(t.observePart({ sessionID: session, callID: "c1", tool: "bash", status: "pending" }), null);
        let obs = t.observePart({ sessionID: session, callID: "c1", tool: "bash", status: "error" });
        assert.deepEqual(obs, { count: 1, tripped: false, transitioned: false });

        // Denial 2.
        t.observePart({ sessionID: session, callID: "c2", tool: "bash", status: "pending" });
        obs = t.observePart({ sessionID: session, callID: "c2", tool: "bash", status: "error" });
        assert.deepEqual(obs, { count: 2, tripped: false, transitioned: false });

        // Denial 3: the trip transition fires exactly once.
        t.observePart({ sessionID: session, callID: "c3", tool: "bash", status: "pending" });
        obs = t.observePart({ sessionID: session, callID: "c3", tool: "bash", status: "error" });
        assert.deepEqual(obs, { count: 3, tripped: true, transitioned: true });

        // Denial 4: stays tripped, transition does NOT repeat.
        t.observePart({ sessionID: session, callID: "c4", tool: "bash", status: "pending" });
        obs = t.observePart({ sessionID: session, callID: "c4", tool: "bash", status: "error" });
        assert.deepEqual(obs, { count: 4, tripped: true, transitioned: false });
    });

    it("resets the streak when a tracked bash call reaches completed", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const session = "explore-1";
        // Build up a streak of 2.
        t.observePart({ sessionID: session, callID: "d1", tool: "bash", status: "pending" });
        t.observePart({ sessionID: session, callID: "d1", tool: "bash", status: "error" });
        t.observePart({ sessionID: session, callID: "d2", tool: "bash", status: "pending" });
        t.observePart({ sessionID: session, callID: "d2", tool: "bash", status: "error" });
        assert.equal(t.count(session), 2);
        // A successful bash call (completed) resets the streak to zero-valued state.
        t.observePart({ sessionID: session, callID: "ok1", tool: "bash", status: "pending" });
        const obs = t.observePart({ sessionID: session, callID: "ok1", tool: "bash", status: "completed" });
        assert.deepEqual(obs, { count: 0, tripped: false, transitioned: false });
        assert.equal(t.count(session), 0);
        // The streak restarts from 1 after the reset.
        t.observePart({ sessionID: session, callID: "d3", tool: "bash", status: "pending" });
        const after = t.observePart({ sessionID: session, callID: "d3", tool: "bash", status: "error" });
        assert.equal(after?.count, 1);
    });

    it("observeAfter settles a tracked bash call and resets the streak", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const session = "explore-1";

        const deny = (callID: string) => {
            t.observePart({ sessionID: session, callID, tool: "bash", status: "pending" });
            t.observePart({ sessionID: session, callID, tool: "bash", status: "error" });
        };

        // Streak of 2, then a matching `after` (exit 0) resets.
        deny("d1");
        deny("d2");
        assert.equal(t.count(session), 2);
        t.observePart({ sessionID: session, callID: "a1", tool: "bash", status: "pending" });
        t.observeAfter(session, "a1", "bash");
        assert.equal(t.count(session), 0);

        // Streak of 2 again, then another `after` (nonzero exit / ask-approved) resets.
        deny("d3");
        deny("d4");
        assert.equal(t.count(session), 2);
        t.observePart({ sessionID: session, callID: "a2", tool: "bash", status: "pending" });
        t.observeAfter(session, "a2", "bash");
        assert.equal(t.count(session), 0);
        assert.equal(t.isTripped(session), false);

        // A non-bash `after` is ignored (no effect on the bash streak).
        t.observeAfter(session, "a3", "read");
        assert.equal(t.count(session), 0);
    });

    it("isolates denial counts per agent invocation", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const deny = (session: string, callID: string) => {
            t.observePart({ sessionID: session, callID, tool: "bash", status: "pending" });
            t.observePart({ sessionID: session, callID, tool: "bash", status: "error" });
        };
        deny("explore-1", "a1");
        deny("explore-1", "a2");
        deny("explore-1", "a3"); // explore-1 trips
        deny("explore-2", "b1"); // explore-2 only at 1
        assert.equal(t.isTripped("explore-1"), true);
        assert.equal(t.isTripped("explore-2"), false);
        assert.equal(t.count("explore-2"), 1);
    });

    it("keeps identical callIDs isolated across different sessions", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        // Both sessions reuse the SAME callID "shared" — they must not collide.
        t.observePart({ sessionID: "A", callID: "shared", tool: "bash", status: "pending" });
        t.observePart({ sessionID: "B", callID: "shared", tool: "bash", status: "pending" });
        // Error the call in A only.
        const obsA = t.observePart({ sessionID: "A", callID: "shared", tool: "bash", status: "error" });
        assert.equal(obsA?.count, 1);
        // B's identical callID is still outstanding and unaffected.
        assert.equal(t.count("B"), 0);
        // Settling A's call via `after` must not touch B's outstanding call.
        t.observeAfter("A", "shared", "bash");
        const obsB = t.observePart({ sessionID: "B", callID: "shared", tool: "bash", status: "error" });
        assert.equal(obsB?.count, 1);
    });

    it("does not cross-resolve concurrent outstanding calls in one session", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const session = "explore-1";
        // Two outstanding bash calls at once.
        t.observePart({ sessionID: session, callID: "A", tool: "bash", status: "pending" });
        t.observePart({ sessionID: session, callID: "B", tool: "bash", status: "pending" });
        // Settling A (via after) must not settle B.
        t.observeAfter(session, "A", "bash");
        assert.equal(t.count(session), 0);
        // B is still outstanding: erroring it records a real denial.
        const obsB = t.observePart({ sessionID: session, callID: "B", tool: "bash", status: "error" });
        assert.equal(obsB?.count, 1);
        assert.equal(obsB?.tripped, false);
        // A is settled: a late error for A is suppressed (not another denial).
        const lateA = t.observePart({ sessionID: session, callID: "A", tool: "bash", status: "error" });
        assert.equal(lateA, null);
        assert.equal(t.count(session), 1);
    });

    it("ignores duplicate (settled) and unknown error events", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const session = "explore-1";
        // Unknown callID (never seeded, never settled): error is a no-op.
        const unknown = t.observePart({ sessionID: session, callID: "ghost", tool: "bash", status: "error" });
        assert.equal(unknown, null);
        assert.equal(t.count(session), 0);

        // Seed + settle a real call.
        t.observePart({ sessionID: session, callID: "real", tool: "bash", status: "pending" });
        t.observeAfter(session, "real", "bash");
        // A duplicate error for the settled call is suppressed idempotently.
        const dup = t.observePart({ sessionID: session, callID: "real", tool: "bash", status: "error" });
        assert.equal(dup, null);
        assert.equal(t.count(session), 0);
    });

    it("clearSession removes one session's state; clearAll removes everything", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const deny = (session: string, callID: string) => {
            t.observePart({ sessionID: session, callID, tool: "bash", status: "pending" });
            t.observePart({ sessionID: session, callID, tool: "bash", status: "error" });
        };
        // Session A: count 2, one settled call, one outstanding call.
        deny("A", "a1");
        deny("A", "a2");
        t.observePart({ sessionID: "A", callID: "a3", tool: "bash", status: "pending" });
        t.observeAfter("A", "a2", "bash"); // settle a2, reset A to 0
        // Session B: count 1.
        deny("B", "b1");
        assert.equal(t.count("B"), 1);

        // clearSession wipes A's count, outstanding calls, AND settled cache.
        t.clearSession("A");
        assert.equal(t.count("A"), 0);
        // Re-seed + error the previously-settled a2: it now counts (settled cache cleared).
        t.observePart({ sessionID: "A", callID: "a2", tool: "bash", status: "pending" });
        const obs = t.observePart({ sessionID: "A", callID: "a2", tool: "bash", status: "error" });
        assert.equal(obs?.count, 1);
        // B is untouched by clearing A.
        assert.equal(t.count("B"), 1);

        // clearAll wipes the remainder.
        t.clearAll();
        assert.equal(t.count("A"), 0);
        assert.equal(t.count("B"), 0);
        assert.equal(t.isTripped("B"), false);
    });

    it("counts config-deny, safety-block, and ask-reject identically (all are status:error)", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const session = "explore-1";
        // Probe-3 (ADR-0042): all three non-execution outcomes emit the SAME
        // structural signature — pending/running then error, no `after`. The
        // tracker cannot (and must not) distinguish them.
        const signatures = [
            { cause: "config-deny", seed: "pending" as const },
            { cause: "safety-hook block", seed: "running" as const },
            { cause: "ask rejection", seed: "pending" as const },
        ];
        let transitionedSeen = false;
        for (const [i, sig] of signatures.entries()) {
            const callID = `denial-${i}`;
            t.observePart({ sessionID: session, callID, tool: "bash", status: sig.seed });
            const obs = t.observePart({ sessionID: session, callID, tool: "bash", status: "error" });
            assert.equal(obs?.count, i + 1, `${sig.cause} should advance the count`);
            if (i === 2) {
                assert.equal(obs?.transitioned, true);
                transitionedSeen = true;
            }
        }
        assert.equal(transitionedSeen, true);
        assert.equal(t.isTripped(session), true);
    });

    it("bounds the settled-call cache, evicting the oldest entries", () => {
        const t = new DenialOutcomeTracker({ threshold: 3 });
        const session = "explore-1";
        // Settle 60 distinct bash calls — exceeds the per-session settled cap,
        // so the oldest (c-0) is evicted while the newest (c-59) is retained.
        for (let i = 0; i < 60; i++) {
            const callID = `c-${i}`;
            t.observePart({ sessionID: session, callID, tool: "bash", status: "pending" });
            t.observeAfter(session, callID, "bash");
        }
        assert.equal(t.count(session), 0);
        // The evicted oldest call no longer suppresses a re-seeded duplicate:
        // re-seed + error now records a real denial. (Re-seed is the only
        // observable seam — a settled and an evicted call both return null for
        // a bare error; only a re-seeded error distinguishes them.)
        t.observePart({ sessionID: session, callID: "c-0", tool: "bash", status: "pending" });
        const oldObs = t.observePart({ sessionID: session, callID: "c-0", tool: "bash", status: "error" });
        assert.equal(oldObs?.count, 1);
        // A still-cached recent call keeps suppressing duplicates.
        t.observePart({ sessionID: session, callID: "c-59", tool: "bash", status: "pending" });
        const recentObs = t.observePart({ sessionID: session, callID: "c-59", tool: "bash", status: "error" });
        assert.equal(recentObs, null);
    });
});




// vim: ft=typescript sts=4 sw=4 ts=4 et :
