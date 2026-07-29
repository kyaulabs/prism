// $KYAULabs: denial-circuit-breaker.ts kyau@cosmos.kyaulabs 2026/07/28 -0700 Exp $


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
 * integration layer (the plugin's hook wiring — Task 2). This module holds
 * no I/O, no logging, and no escalation side effect; it is a pure,
 * side-effect-free state machine with per-sessionID isolation so the
 * deterministic core can be unit-tested in isolation.
 */

export interface DenialCircuitBreakerOptions {
    /** Consecutive denials required to trip. Defaults to 3 (matches upstream doom_loop). */
    threshold?: number;
}

/** Default trip threshold — matches the upstream doom_loop identical-input guard. */
const DEFAULT_THRESHOLD = 3;

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
     * success resets it to zero. Returns `true` once the counter reaches the
     * threshold (and continues to return `true` on every subsequent denial
     * until a success resets it).
     *
     * @param  sessionID  Agent invocation identifier (per-session isolation key).
     * @param  denied     `true` if the tool call was denied, `false` if it succeeded.
     * @return `true` when the consecutive-denial count is at or above the threshold.
     */
    observe(sessionID: string, denied: boolean): boolean {
        const next = denied ? this.current(sessionID) + 1 : 0;
        this.counts.set(sessionID, next);
        return next >= this.threshold;
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
     * Consecutive-denial count for an invocation, defaulting to 0 for an
     * unseen session. Centralizes the "unknown session = no denials" invariant.
     */
    private current(sessionID: string): number {
        return this.counts.get(sessionID) ?? 0;
    }
}


// vim: ft=typescript sts=4 sw=4 ts=4 et :
