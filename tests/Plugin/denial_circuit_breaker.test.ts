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
 * ARCHITECTURE: The pure state machine is DETECTION-AGNOSTIC — `observe()` is
 * fed a boolean `denied` by the integration layer (the plugin's hook wiring),
 * which is a SEPARATE concern verified manually (see ADR-0042). H2 probe
 * confirmed `tool.execute.before` DOES fire for config-denied bash commands
 * (and `permission.ask` does NOT), so the breaker attaches at
 * `tool.execute.before`. How `denied` is determined (event-stream failure
 * counting via `session.next.tool.success`/`tool.failed`, or before/after
 * callID reconciliation) is the integration decision — locked by a second
 * micro-probe before the wiring task ships. These tests hold for EITHER.
 */
describe("DenialCircuitBreaker — issue #274 contract", () => {
    it("trips at the configured threshold of consecutive denials", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        assert.equal(b.observe("explore-1", true), false); // 1
        assert.equal(b.observe("explore-1", true), false); // 2
        assert.equal(b.observe("explore-1", true), true);  // 3 -> trip
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
            if (b.observe("explore-1", true)) tripped = true;
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
        assert.equal(b.observe("explore-1", true), false);
        assert.equal(b.observe("explore-1", true), false);
        assert.equal(b.observe("explore-1", true), true);
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
        assert.equal(b.observe("explore-1", true), false);
        assert.equal(b.observe("explore-1", true), false);
        assert.equal(b.observe("explore-1", true), true);
    });

    it("does not trip below the threshold", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        assert.equal(b.observe("explore-1", true), false);
        assert.equal(b.observe("explore-1", true), false);
        assert.equal(b.count("explore-1"), 2);
    });

    it("trips exactly once at threshold; further denials hold tripped state", () => {
        const b = new DenialCircuitBreaker({ threshold: 3 });
        b.observe("explore-1", true);
        b.observe("explore-1", true);
        assert.equal(b.observe("explore-1", true), true);
        // Stays tripped until a success resets.
        assert.equal(b.observe("explore-1", true), true);
        b.observe("explore-1", false); // reset
        assert.equal(b.observe("explore-1", true), false);
    });
});




// vim: ft=typescript sts=4 sw=4 ts=4 et :
