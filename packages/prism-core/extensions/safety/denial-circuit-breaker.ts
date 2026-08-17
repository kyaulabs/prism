// $KYAULabs: denial-circuit-breaker.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


/**
 * Pure state machine for the consecutive-bash-denial circuit breaker
 * (issue #274).
 *
 * Counts consecutive denied tool calls per agent invocation and trips once
 * the count reaches a bounded threshold. Unlike upstream doom_loop, which
 * keys on identical input, this breaker counts every distinct denied call —
 * so syntactic variations of the same intent (`gh issue view 274`, then
 * `gh issue view 274 --json body`, then `bash -c "gh issue view 274"`, ...)
 * all feed the same counter instead of evading detection.
 *
 * Detection-agnostic: `observe()` is fed a boolean `denied` by the
 * integration layer (the plugin's hook wiring — Task 3). This module holds
 * no I/O, no logging, and no escalation side effect; it is a pure,
 * side-effect-free state machine with per-sessionID isolation so the
 * deterministic core can be unit-tested in isolation.
 */

export interface DenialCircuitBreakerOptions {
    /** Consecutive denials required to trip. Defaults to 3 (matches upstream doom_loop). */
    threshold?: number;
}

/**
 * Outcome of one `observe()` call.
 *
 * @property count         Consecutive-denial count after this observation.
 * @property tripped       `true` when `count >= threshold`.
 * @property transitioned  `true` ONLY on the threshold-1 -> threshold move
 *                         (the trip transition). Fires escalation exactly
 *                         once per trip; subsequent denials stay `tripped`
 *                         but never re-report `transitioned`.
 */
export interface DenialObservation {
    count: number;
    tripped: boolean;
    transitioned: boolean;
}

/** Default trip threshold — matches the upstream doom_loop identical-input guard. */
export const DEFAULT_THRESHOLD = 3;

export class DenialCircuitBreaker {
    private readonly threshold: number;
    private readonly counts = new Map<string, number>();

    constructor(opts: DenialCircuitBreakerOptions = {}) {
        this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    }

    /**
     * Record the outcome of one tool call for an agent invocation.
     *
     * A denial increments the consecutive-denial counter for `sessionID`; a
     * success resets it to zero. The returned `DenialObservation` reports the
     * resulting count, whether the breaker is tripped, and whether this call
     * was the trip transition (count moving from threshold-1 to threshold).
     *
     * @param  sessionID  Agent invocation identifier (per-session isolation key).
     * @param  denied     `true` if the tool call was denied, `false` if it succeeded.
     * @return The observation after applying this event.
     */
    observe(sessionID: string, denied: boolean): DenialObservation {
        if (!denied) {
            this.counts.delete(sessionID);
            return { count: 0, tripped: false, transitioned: false };
        }
        const prev = this.current(sessionID);
        const next = prev + 1;
        this.counts.set(sessionID, next);
        return {
            count: next,
            tripped: next >= this.threshold,
            transitioned: next === this.threshold,
        };
    }

    /**
     * Current consecutive-denial count for an agent invocation.
     *
     * Diagnostic accessor (e.g. for logging in the integration layer).
     *
     * @param  sessionID  Agent invocation identifier.
     * @return Consecutive denial count, or 0 for an unknown/unseen session.
     */
    count(sessionID: string): number {
        return this.current(sessionID);
    }

    /**
     * Whether the breaker is currently tripped for an invocation.
     *
     * Pure query — does not mutate state. Equivalent to
     * `count(sessionID) >= threshold` but expresses intent at call sites.
     *
     * @param  sessionID  Agent invocation identifier.
     * @return `true` when the consecutive-denial count is at or above the threshold.
     */
    isTripped(sessionID: string): boolean {
        return this.current(sessionID) >= this.threshold;
    }

    /**
     * Explicitly reset an invocation's consecutive-denial count to zero.
     *
     * Used by the integration layer to clear the streak outside of an
     * `observe()` event (e.g. after a matching `tool.execute.after` settles
     * a tracked call). Removes the session's Map entry rather than holding a
     * zero-valued slot, so a reset session is indistinguishable from one that
     * was never seen.
     *
     * @param  sessionID  Agent invocation identifier.
     */
    reset(sessionID: string): void {
        this.counts.delete(sessionID);
    }

    /**
     * Clear all session state.
     *
     * Lifecycle cleanup (e.g. on plugin `dispose`). Every invocation's count
     * is dropped; the breaker returns to a never-seen state for all sessions.
     */
    clearAll(): void {
        this.counts.clear();
    }

    /**
     * Consecutive-denial count for an invocation, defaulting to 0 for an
     * unseen session. Centralizes the "unknown session = no denials" invariant.
     */
    private current(sessionID: string): number {
        return this.counts.get(sessionID) ?? 0;
    }
}








// vim: ft=typescript sts=4 sw=4 ts=4 et :
