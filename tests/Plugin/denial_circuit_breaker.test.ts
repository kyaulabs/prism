// $KYAULabs: denial_circuit_breaker.test.ts kyau@cosmos.kyaulabs 2026/07/28 -0700 Exp $





import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DenialCircuitBreaker } from "../../.opencode/plugins/denial-circuit-breaker.ts";

/**
 * Regression coverage for issue #274 — consecutive-bash-denial circuit breaker.
 *
 * These tests lock down the pure state-machine contract of the breaker:
 * count consecutive denials per agent invocation, reset on any successful
 * tool use, trip at a bounded threshold, isolate per session, and treat each
 * distinct command string as a separate denial (catching syntactic variations
 * that upstream doom_loop's identical-input keying misses).
 *
 * ARCHITECTURE: The pure state machine is DETECTION-AGNOSTIC — observe() is
 * fed a boolean `denied` by the integration layer (the plugin's hook wiring),
 * which is a SEPARATE concern verified manually (see ADR-0042). Probe-3
 * confirmed the structural predicate: a tracked bash ToolPart reaching
 * state.status == "error" with NO matching tool.execute.after reliably
 * identifies every non-execution outcome (config-deny, safety-hook block,
 * ask rejection). Detection is therefore Option 3a (structural outcome
 * inference); Option 4a (event-stream failure counting) is eliminated
 * because the plugin event hook sees v1 events only, and permission.ask
 * never fires in any scenario. These tests hold for the breaker contract
 * regardless of how the wiring determines `denied`.
 */
describe("DenialCircuitBreaker — issue #274 contract", () => {
    it("trips at the configured threshold of consecutive denials", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        assert.equal(b.observe("explore-1", true).tripped, false); // 1
        assert.equal(b.observe("explore-1", true).tripped, false); // 2
        assert.equal(b.observe("explore-1", true).tripped, true);  // 3 -> trip
    });

    it("catches syntactic variations (the doom_loop gap)", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        // Five different input strings — upstream doom_loop (identical-input)
        // would never trip; the breaker counts denials regardless of input.
        const variations = [
            "gh issue view 274",
            "gh issue view 274 --json body",
            'bash -c "gh issue view 274"',
            "gh issue view 274 | grep title",
        ];
        let tripped = false;
        for (const _cmd of variations) {
            if (b.observe("explore-1", true).tripped) tripped = true;
        }
        assert.equal(tripped, true);
    });

    it("resets the counter on a successful tool use", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        assert.equal(b.count("explore-1"), 2);
        b.observe("explore-1", false); // successful `ls` resets
        assert.equal(b.count("explore-1"), 0);
        // After reset, the full threshold is required again.
        assert.equal(b.observe("explore-1", true).tripped, false);
        assert.equal(b.observe("explore-1", true).tripped, false);
        assert.equal(b.observe("explore-1", true).tripped, true);
    });

    it("isolates denial counts per agent invocation (sessionID)", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        b.observe("explore-2", true);
        assert.equal(b.count("explore-1"), 2);
        assert.equal(b.count("explore-2"), 1);
    });

    it("also catches identical-input retry (superset of doom_loop)", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        assert.equal(b.observe("explore-1", true).tripped, false);
        assert.equal(b.observe("explore-1", true).tripped, false);
        assert.equal(b.observe("explore-1", true).tripped, true);
    });

    it("does not trip below the threshold", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        assert.equal(b.observe("explore-1", true).tripped, false);
        assert.equal(b.observe("explore-1", true).tripped, false);
        assert.equal(b.count("explore-1"), 2);
    });

    it("isTripped() reports trip state as a pure query without mutating", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        assert.equal(b.isTripped("explore-1"), false); // unseen session
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        assert.equal(b.isTripped("explore-1"), false); // below threshold
        b.observe("explore-1", true);
        assert.equal(b.isTripped("explore-1"), true);  // at threshold
        // Querying must not change the counter.
        assert.equal(b.count("explore-1"), 3);
        assert.equal(b.isTripped("explore-1"), true);
        assert.equal(b.count("explore-1"), 3);
    });

    it("reset() explicitly clears the counter back to a fresh state", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        assert.equal(b.isTripped("explore-1"), true);
        b.reset("explore-1");
        assert.equal(b.count("explore-1"), 0);
        assert.equal(b.isTripped("explore-1"), false);
        // After reset the full threshold is required again.
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        assert.equal(b.isTripped("explore-1"), false);
    });

    it("clearAll() removes every session's state", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        b.observe("explore-2", true);
        b.observe("explore-2", true);
        b.observe("explore-2", true);
        assert.equal(b.isTripped("explore-2"), true);
        b.clearAll();
        assert.equal(b.count("explore-1"), 0);
        assert.equal(b.count("explore-2"), 0);
        assert.equal(b.isTripped("explore-2"), false);
        // A denial after clearAll starts a fresh count at 1.
        assert.equal(b.observe("explore-2", true).count, 1);
    });

    it("trips exactly once at threshold; the transition flag fires once", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        const trip = b.observe("explore-1", true); // 2 -> 3: the trip transition
        assert.equal(trip.tripped, true);
        assert.equal(trip.transitioned, true);
        assert.equal(trip.count, 3);
        // Stays tripped until a success resets; transition does NOT repeat.
        const again = b.observe("explore-1", true);
        assert.equal(again.tripped, true);
        assert.equal(again.transitioned, false);
        b.observe("explore-1", false); // reset
        const reclaim = b.observe("explore-1", true);
        assert.equal(reclaim.tripped, false);
        assert.equal(reclaim.transitioned, false);
    });
});




// vim: ft=typescript sts=4 sw=4 ts=4 et :
