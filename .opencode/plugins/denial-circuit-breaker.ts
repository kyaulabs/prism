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

/**
 * Snapshot of one tool-call lifecycle event fed to the tracker.
 *
 * @property sessionID  Agent invocation the call belongs to.
 * @property callID     Correlation key shared between `message.part.updated`
 *                      tool parts and the matching `tool.execute.after`.
 * @property tool       Tool name (e.g. "bash", "read"). Only "bash" is tracked.
 * @property status     Tool-part lifecycle status.
 */
export interface ToolCallSnapshot {
    sessionID: string;
    callID: string;
    tool: string;
    status: "pending" | "running" | "completed" | "error";
}

/** Options shared by the breaker and the tracker. */
export interface DenialOutcomeTrackerOptions {
    /** Consecutive denials required to trip. Defaults to 3 (matches upstream doom_loop). */
    threshold?: number;
}

/**
 * Correlates `message.part.updated` tool-part events with
 * `tool.execute.after` hooks by `(sessionID, callID)` and feeds the pure
 * `DenialCircuitBreaker`.
 *
 * Detection follows the ADR-0042 Probe-3 structural predicate: a tracked bash
 * ToolPart reaching `state.status == "error"` with no matching `after` is a
 * denial. Normal execution (including nonzero exit) reaches `completed` +
 * `after` and resets the streak. Non-bash outcomes are ignored. The tracker
 * supports multiple outstanding calls per session and a bounded settled-call
 * cache for duplicate suppression.
 */
export class DenialOutcomeTracker {
    private readonly breaker: DenialCircuitBreaker;
    /** sessionID -> set of outstanding (pending/running, not yet settled) callIDs. */
    private readonly outstanding = new Map<string, Set<string>>();
    /** sessionID -> bounded cache of callIDs whose matching `after` was observed. */
    private readonly settled = new Map<string, Set<string>>();
    /** Per-session cap on retained settled callIDs (memory hygiene). */
    private static readonly SETTLED_CACHE_MAX = 50;

    constructor(opts: DenialOutcomeTrackerOptions = {}) {
        this.breaker = new DenialCircuitBreaker({ threshold: opts.threshold });
    }

    /**
     * Observe one tool-part lifecycle event.
     *
     * Non-bash parts are ignored (`null`). For bash parts:
     * `pending`/`running` seed the call as outstanding (`null`); `completed`
     * settles + resets the session; `error` records a denial (when the call is
     * outstanding and no matching `after` was seen) and returns the resulting
     * observation. Already-settled or unknown error callIDs are ignored
     * idempotently (`null`).
     *
     * @param  part  The tool-call snapshot to observe.
     * @return The denial observation, or `null` when the event is a no-op.
     */
    observePart(part: ToolCallSnapshot): DenialObservation | null {
        if (part.tool !== "bash") {
            return null;
        }
        switch (part.status) {
            case "pending":
            case "running":
                this.seed(part.sessionID, part.callID);
                return null;
            case "error":
                return this.recordError(part.sessionID, part.callID);
            case "completed":
                return this.settleAndReset(part.sessionID, part.callID);
            default:
                return null;
        }
    }

    /**
     * Current consecutive-denial count for an agent invocation.
     *
     * @param  sessionID  Agent invocation identifier.
     * @return Consecutive denial count, or 0 for an unknown/unseen session.
     */
    count(sessionID: string): number {
        return this.breaker.count(sessionID);
    }

    /**
     * Whether the breaker is currently tripped for an invocation.
     *
     * @param  sessionID  Agent invocation identifier.
     * @return `true` when the consecutive-denial count is at or above the threshold.
     */
    isTripped(sessionID: string): boolean {
        return this.breaker.isTripped(sessionID);
    }

    /**
     * Observe a `tool.execute.after` hook for a call.
     *
     * Non-bash calls are ignored. A bash `after` settles the call (removes it
     * from outstanding, records it in the settled cache) and resets the
     * session streak. Exit 0, nonzero exit, and ask-approval all share this
     * path — any observed `after` means the call executed and is not a denial.
     *
     * @param  sessionID  Agent invocation identifier.
     * @param  callID     The call being settled.
     * @param  tool       Tool name; only "bash" is tracked.
     */
    observeAfter(sessionID: string, callID: string, tool: string): void {
        if (tool !== "bash") {
            return;
        }
        this.outstanding.get(sessionID)?.delete(callID);
        this.markSettled(sessionID, callID);
        this.breaker.observe(sessionID, false);
    }

    /**
     * Remove all state for one invocation: its denial count, outstanding
     * calls, and settled-call cache. Called on `session.idle`,
     * `session.deleted`, and plugin `dispose`.
     *
     * @param  sessionID  Agent invocation identifier.
     */
    clearSession(sessionID: string): void {
        this.breaker.reset(sessionID);
        this.outstanding.delete(sessionID);
        this.settled.delete(sessionID);
    }

    /**
     * Remove all state for every invocation. Lifecycle cleanup.
     */
    clearAll(): void {
        this.breaker.clearAll();
        this.outstanding.clear();
        this.settled.clear();
    }

    /**
     * Seed a call as outstanding (idempotent). Re-seeding the same callID is
     * a no-op.
     */
    private seed(sessionID: string, callID: string): void {
        this.setFor(this.outstanding, sessionID).add(callID);
    }

    /**
     * Record a callID in the settled cache (idempotent). Bounded per session:
     * once the cache reaches `SETTLED_CACHE_MAX`, the oldest entry (FIFO) is
     * evicted before the new one is added.
     */
    private markSettled(sessionID: string, callID: string): void {
        const set = this.setFor(this.settled, sessionID);
        if (set.has(callID)) {
            return;
        }
        if (set.size >= DenialOutcomeTracker.SETTLED_CACHE_MAX) {
            const oldest = set.values().next().value;
            if (oldest !== undefined) {
                set.delete(oldest);
            }
        }
        set.add(callID);
    }

    /**
     * Record a bash `error` outcome.
     *
     * If the call is outstanding and was not already settled by a matching
     * `after`, it is a denial: the breaker observes it, the call is removed
     * from outstanding, and the resulting observation is returned. Already-
     * settled or unknown callIDs are ignored idempotently (`null`).
     */
    private recordError(sessionID: string, callID: string): DenialObservation | null {
        if (this.isSettled(sessionID, callID)) {
            return null;
        }
        const outstanding = this.outstanding.get(sessionID);
        if (outstanding === undefined || !outstanding.has(callID)) {
            return null;
        }
        outstanding.delete(callID);
        return this.breaker.observe(sessionID, true);
    }

    /**
     * Settle a bash call that reached `completed`: remove it from the
     * outstanding set and reset the session streak. Returns the reset
     * observation (count 0). A `completed` call is not added to the settled
     * cache — a later `error` for it is ignored via the "unknown" path.
     */
    private settleAndReset(sessionID: string, callID: string): DenialObservation {
        this.outstanding.get(sessionID)?.delete(callID);
        return this.breaker.observe(sessionID, false);
    }

    /**
     * Whether a callID has been settled by a matching `after` for a session.
     */
    private isSettled(sessionID: string, callID: string): boolean {
        return this.settled.get(sessionID)?.has(callID) ?? false;
    }

    /**
     * Get (or create) the Set for a session key in a `Map<string, Set<string>>`.
     * Centralizes the get-or-create pattern shared by the outstanding and
     * settled maps.
     */
    private setFor(map: Map<string, Set<string>>, sessionID: string): Set<string> {
        let set = map.get(sessionID);
        if (set === undefined) {
            set = new Set();
            map.set(sessionID, set);
        }
        return set;
    }
}



// vim: ft=typescript sts=4 sw=4 ts=4 et :
