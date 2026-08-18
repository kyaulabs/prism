// $KYAULabs: denial-circuit-breaker.ts kyau@aura.kyaulabs 2026/08/17 -0700 Exp $




/**
 * Pure state machine for the bounded-window denial circuit breaker
 * (ADR-0068, superseding ADR-0042's consecutive-denial semantics).
 *
 * Counts denials within a sliding window of the last `windowSize` bash tool
 * call outcomes per session and trips once the windowed count reaches the
 * threshold. The windowed policy closes the interleaving evasion: a blocked
 * command followed by a benign success no longer resets the count, so an
 * agent alternating `true` between blocked attempts still trips (security
 * audit L-3).
 *
 * Detection-agnostic: `observe()` is fed a boolean `denied` by the
 * integration layer (the extension wiring — index.ts). This module holds
 * no I/O, no logging, and no escalation side effect; it is a pure,
 * side-effect-free state machine with per-sessionID isolation so the
 * deterministic core can be unit-tested in isolation.
 */

export interface DenialCircuitBreakerOptions {
    /** Windowed denials required to trip. Defaults to 3 (matches upstream doom_loop). */
    threshold?: number;
    /** Sliding window of recent bash outcomes per session. Defaults to 10. */
    windowSize?: number;
}

/**
 * Outcome of one `observe()` call.
 *
 * @property count         Denials within the window after this observation.
 * @property tripped       `true` when `count >= threshold`.
 * @property transitioned  `true` ONLY on the threshold-1 -> threshold move
 *                         within the window (the trip transition). Fires
 *                         escalation exactly once per trip; subsequent
 *                         denials stay `tripped` but never re-report
 *                         `transitioned`.
 */
export interface DenialObservation {
    count: number;
    tripped: boolean;
    transitioned: boolean;
}

/** Default trip threshold — matches the upstream doom_loop identical-input guard. */
export const DEFAULT_THRESHOLD = 3;

/** Default window: the last 10 bash call outcomes (ADR-0068). */
export const WINDOW_SIZE = 10;

export class DenialCircuitBreaker {
    private readonly threshold: number;
    private readonly windowSize: number;
    /** Per-session ring buffer of recent bash outcomes (true = denied). */
    private readonly outcomes = new Map<string, boolean[]>();

    constructor(opts: DenialCircuitBreakerOptions = {}) {
        this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
        this.windowSize = opts.windowSize ?? WINDOW_SIZE;
    }

    /**
     * Record the outcome of one tool call for an agent invocation.
     *
     * A denial adds `true` to the session's window; a success adds `false`
     * (denials within the window persist). The oldest outcome is evicted
     * once the window is full. The returned `DenialObservation` reports the
     * windowed denial count, whether the breaker is tripped, and whether
     * this call was the trip transition (count moving from threshold-1 to
     * threshold within the window).
     *
     * @param  sessionID  Agent invocation identifier (per-session isolation key).
     * @param  denied     `true` if the tool call was denied, `false` if it succeeded.
     * @return The observation after applying this event.
     */
    observe(sessionID: string, denied: boolean): DenialObservation {
        let buf = this.outcomes.get(sessionID);
        if (buf === undefined) {
            buf = [];
            this.outcomes.set(sessionID, buf);
        }
        const prevCount = this.countIn(buf);
        buf.push(denied);
        if (buf.length > this.windowSize) buf.shift();
        const count = this.countIn(buf);
        return {
            count,
            tripped: count >= this.threshold,
            transitioned: denied && prevCount < this.threshold && count >= this.threshold,
        };
    }

    /**
     * Current windowed denial count for an agent invocation.
     *
     * Diagnostic accessor (e.g. for logging in the integration layer).
     *
     * @param  sessionID  Agent invocation identifier.
     * @return Denials within the window, or 0 for an unknown/unseen session.
     */
    count(sessionID: string): number {
        const buf = this.outcomes.get(sessionID);
        return buf === undefined ? 0 : this.countIn(buf);
    }

    /**
     * Whether the breaker is currently tripped for an invocation.
     *
     * Pure query — does not mutate state. Equivalent to
     * `count(sessionID) >= threshold` but expresses intent at call sites.
     *
     * @param  sessionID  Agent invocation identifier.
     * @return `true` when the windowed denial count is at or above the threshold.
     */
    isTripped(sessionID: string): boolean {
        return this.count(sessionID) >= this.threshold;
    }

    /**
     * Explicitly reset an invocation's window to empty.
     *
     * Used by the integration layer to clear the streak outside of an
     * `observe()` event (e.g. on `agent_end`). Removes the session's Map
     * entry, so a reset session is indistinguishable from one never seen.
     *
     * @param  sessionID  Agent invocation identifier.
     */
    reset(sessionID: string): void {
        this.outcomes.delete(sessionID);
    }

    /**
     * Clear all session state.
     *
     * Lifecycle cleanup (e.g. on extension shutdown). Every invocation's
     * window is dropped; the breaker returns to a never-seen state.
     */
    clearAll(): void {
        this.outcomes.clear();
    }

    /** Denials within one window buffer. */
    private countIn(buf: boolean[]): number {
        return buf.reduce((n, denied) => n + (denied ? 1 : 0), 0);
    }
}




// vim: ft=typescript sts=4 sw=4 ts=4 et :
