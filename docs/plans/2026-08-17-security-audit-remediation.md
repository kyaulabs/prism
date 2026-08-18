# Security Audit Remediation Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remediate the four live findings of the 2026-08-16 external security
audit — fail-closed guards for unmodelable shell constructs (M-1, expanded to
cover the I-2 bypasses), tokenized git WARN gates (L-1), bounded `load_env()`
(L-2), and the windowed circuit breaker (L-3).

**Architecture:** Two shared guards in `sensitive-paths.ts` (character-based
fail-closed construct check, and wrapper-anywhere payload finder) applied in
both safety gates so they cannot drift; the two git WARN rules move to the
token stream machinery the block rules already use; `DenialCircuitBreaker`
moves from a consecutive counter to a per-session ring buffer of the last 10
bash outcomes; `load_env()` gains size and line caps; docs/ADR record the new
contracts (ADR-0068 supersedes ADR-0042's reset-on-success wording by
reference).

**Tech Stack:** TypeScript (node:test), PHP 8.5 + Pest 5, bash, ADR (Nygard).

## Global constraints

- Signed commits (`git commit -S`) in Conventional Commits format with
  `Authored-by:` → `Implemented-by:` → `Tested-by:` → `Signed-off-by:`
  footers (ADR-0040). `Signed-off-by:` resolves via
  `bash packages/prism-core/scripts/resolve-identity.sh`.
- Every modified source file keeps its existing RCS header and vim modeline;
  no header churn. New files get the standard header per the `rcs-header`
  skill.
- PHP edits must pass php-cs-fixer and Pest coverage ≥ 80% on changed files
  (`/check-php` gate at the end).
- TS edits must pass `npx tsc --noEmit` and the node test suite
  (`npm run test:node`).
- No new dependencies.
- ADRs: never edit an Accepted ADR body — supersede via a new ADR
  (`adr` skill). ADR-0042 (opencode-era) is frozen; ADR-0068 records the
  pi-era windowed semantics.

---

### Task 1: Fail-closed guard for unmodelable shell constructs (classifier gate)

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts` (shared helper)
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts` (Guard A in `classifyCommandImpl`)
- Test: `tests/Node/safety-classify.test.ts`

**Interfaces:**
- Produces: `hasUnmodelableShellConstruct(command: string): boolean` —
  exported from `sensitive-paths.ts`, consumed by `classifyCommandImpl`
  (this task) and `sensitiveOperandCheckImpl` (Task 2).

- [x] **Step 1: Write the failing test**

Append to `tests/Node/safety-classify.test.ts`, before the final modeline:

```ts
test("fail-closed: substitution/ANSI-C/here-string constructs block", () => {
    assert.equal(classifyCommand("echo $(rm -rf /home/u/x)", OPTS)?.severity, "block");
    assert.equal(classifyCommand("echo `rm -rf /home/u/x`", OPTS)?.severity, "block");
    assert.equal(classifyCommand("cat <(rm -rf /home/u/x)", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash -c $'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("eval $'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash <<< 'rm -rf /home/u/x'", OPTS)?.severity, "block");
});

test("fail-closed: benign substitution also blocks (accepted cost)", () => {
    assert.equal(classifyCommand("echo $(date)", OPTS)?.severity, "block");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: FAIL — all six construct assertions return `null` (not blocked),
proving the bypass.

- [x] **Step 3: Write minimal implementation**

In `sensitive-paths.ts`, after the `MAX_UNWRAP_DEPTH` export:

```ts
/** Shell constructs the flat tokenizer cannot model — command/process
 *  substitution, backticks, ANSI-C quoting, here-strings. Any of them
 *  hides command boundaries from the tokenizer, so the gates fail closed
 *  (ADR-0036; security audit M-1/I-2). */
const UNMODELABLE_CONSTRUCT_RE = /\$\(|`|<\(|>\(|\$'|<<</;

/** True when a command contains a construct the flat tokenizer cannot model. */
export function hasUnmodelableShellConstruct(command: string): boolean {
    return UNMODELABLE_CONSTRUCT_RE.test(command);
}
```

In `pre-tool-use.ts`: add `hasUnmodelableShellConstruct` to the import from
`./sensitive-paths.ts`, and add Guard A at the top of `classifyCommandImpl`
(after the depth check, before `const ctx`):

```ts
    if (hasUnmodelableShellConstruct(command)) {
        return {
            severity: "block",
            reason: "unmodelable shell construct (substitution/quoting/here-string) — failing closed per ADR-0036",
        };
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: PASS — all new and existing assertions green.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts packages/prism-core/extensions/safety/pre-tool-use.ts tests/Node/safety-classify.test.ts
git commit -S -m $'fix(safety): fail closed on unmodelable shell constructs in classifier\n\nCommand/process substitution, backticks, ANSI-C quoting, and here-strings\ndefeat the flat tokenizer (security audit M-1, expanded by I-2 probe):\nrm -rf hidden in $(...) / backticks / <(...) / $\'...\' / <<< passed\nunblocked. A shared hasUnmodelableShellConstruct guard now blocks any such\nconstruct in classifyCommandImpl (ADR-0036 fail-closed contract).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: Fail-closed guard in the sensitive-operand gate

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts` (Guard A in `sensitiveOperandCheckImpl`)
- Test: `tests/Node/safety-sensitive-paths.test.ts`

**Interfaces:**
- Consumes: `hasUnmodelableShellConstruct` (Task 1).
- Produces: substitution-hidden sensitive reads refused with className
  `"unresolvable"` (any non-null match blocks in `handleToolCall`).

- [x] **Step 1: Write the failing test**

Append to `tests/Node/safety-sensitive-paths.test.ts`, before the final modeline:

```ts
test("fail-closed: substitution-hidden sensitive reads are refused", () => {
    assert.equal(sensitiveOperandCheck("echo $(cat ~/.ssh/id_rsa)", OPTS)?.className, "unresolvable");
    assert.equal(sensitiveOperandCheck("cat `~/.ssh/id_rsa`", OPTS)?.className, "unresolvable");
    assert.equal(sensitiveOperandCheck("bash -c $'cat ~/.ssh/id_rsa'", OPTS)?.className, "unresolvable");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts`
Expected: FAIL — first two assertions currently pass via the fallback regex
but return `"dynamic"` not `"unresolvable"` (third returns `null`); the
`"unresolvable"` expectations fail.

- [x] **Step 3: Write minimal implementation**

In `sensitive-paths.ts`, at the top of `sensitiveOperandCheckImpl` (after the
depth check):

```ts
    if (hasUnmodelableShellConstruct(command)) {
        return { className: "unresolvable" };
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts tests/Node/safety-sensitive-paths.test.ts
git commit -S -m $'fix(safety): fail closed on unmodelable shell constructs in sensitive gate\n\nDefense in depth (audit M-1): sensitive-path reads hidden in command\nsubstitution, backticks, or ANSI-C quoting are refused with the\nunresolvable class instead of relying on the fallback regex. Both safety\ngates now share the same guard (ADR-0047 deny floor, ADR-0036).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: Shell-wrapper-anywhere unwrap (classifier gate)

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts` (shared helper)
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts` (Guard B in `classifyCommandImpl`)
- Test: `tests/Node/safety-classify.test.ts`

**Interfaces:**
- Produces: `findShellWrapperPayload(tokens: string[]): string | null` —
  exported from `sensitive-paths.ts`; returns the payload token of the first
  `bash|sh|zsh|dash|ksh -c` found at any token position (null when none).

- [x] **Step 1: Write the failing test**

Append to `tests/Node/safety-classify.test.ts`:

```ts
test("wrapper-anywhere: sudo/timeout/xargs/find-wrapped payloads reclassify", () => {
    assert.equal(classifyCommand('sudo bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('sudo -u root bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('timeout 10 bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('xargs bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('find . -exec bash -c "rm -rf /home/u/x" \\;', OPTS)?.severity, "block");
});

test("wrapper-anywhere: safe-zone payloads stay allowed", () => {
    assert.equal(classifyCommand('sudo bash -c "rm -rf /tmp/x"', OPTS), null);
    assert.equal(classifyCommand('timeout 10 bash -c "rm -rf node_modules"', OPTS), null);
});

test("wrapper-anywhere: quoted wrapper-shaped literals pass", () => {
    assert.equal(classifyCommand('echo \'bash -c "rm -rf /tmp/x"\'', OPTS), null);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: FAIL — the five wrapped-`rm` cases return `null`.

- [x] **Step 3: Write minimal implementation**

In `sensitive-paths.ts`, after `tryUnwrapSegment`:

```ts
/**
 * Find a shell wrapper (`bash -c`, `sh -c`, …) at ANY token position and
 * return its payload token for recursive reclassification. Catches wrapper
 * chains the head-only unwrap misses (`sudo bash -c …`, `timeout 10
 * bash -c …`, `find -exec bash -c …`). Quoted payloads arrive already
 * quote-stripped from tokenizeCommand, so recursion re-tokenizes them.
 */
export function findShellWrapperPayload(tokens: string[]): string | null {
    for (let i = 0; i + 1 < tokens.length; i++) {
        if (SHELL_WRAPPERS.has(tokens[i]) && tokens[i + 1] === "-c") {
            return tokens[i + 2] ?? null;
        }
    }
    return null;
}
```

In `pre-tool-use.ts`: add `findShellWrapperPayload` to the import, and insert
Guard B in `classifyCommandImpl`'s segment loop, immediately after the
`tryUnwrapSegment` block:

```ts
        const wrapped = findShellWrapperPayload(tokens);
        if (wrapped !== null) {
            const innerFinding = classifyCommandImpl(wrapped, opts, depth + 1);
            if (innerFinding !== null) return innerFinding;
            continue;
        }
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts packages/prism-core/extensions/safety/pre-tool-use.ts tests/Node/safety-classify.test.ts
git commit -S -m $'fix(safety): reclassify shell-wrapper payloads at any token position\n\nsudo/timeout/xargs/find -exec bash -c "rm -rf …" slipped past the\nhead-only unwrap (security audit I-2 probe). findShellWrapperPayload\nlocates bash|sh|zsh|dash|ksh -c anywhere in a segment and recursively\nreclassifies the payload, bounded by MAX_UNWRAP_DEPTH.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: Shell-wrapper-anywhere unwrap (sensitive gate)

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts` (Guard B in `sensitiveOperandCheckImpl`)
- Test: `tests/Node/safety-sensitive-paths.test.ts`

**Interfaces:**
- Consumes: `findShellWrapperPayload` (Task 3).

- [x] **Step 1: Write the failing test**

Append to `tests/Node/safety-sensitive-paths.test.ts`:

```ts
test("wrapper-anywhere: wrapped sensitive reads are refused", () => {
    assert.equal(sensitiveOperandCheck('sudo bash -c "cat ~/.ssh/id_rsa"', OPTS)?.className, "ssh");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts`
Expected: FAIL — currently `null` (the wrapped payload is never reached).

- [x] **Step 3: Write minimal implementation**

In `sensitive-paths.ts`, in `sensitiveOperandCheckImpl`'s segment loop,
immediately after the `tryUnwrapSegment` block:

```ts
        const wrapped = findShellWrapperPayload(tokens);
        if (wrapped !== null) {
            const match = sensitiveOperandCheckImpl(wrapped, opts, depth + 1);
            if (match) return match;
            continue;
        }
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts tests/Node/safety-sensitive-paths.test.ts
git commit -S -m $'fix(safety): reclassify wrapper payloads in the sensitive gate\n\nMirrors the classifier-side wrapper fix: sudo bash -c "cat ~/.ssh/…"\nnow unwraps and resolves into the deny floor (ADR-0047).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: Tokenized git WARN gates (L-1)

**Files:**
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts`
- Test: `tests/Node/safety-classify.test.ts`

**Interfaces:**
- Consumes: `expandedGitFlags` (existing) — `{ subcmd, expanded }` where
  `expanded` is the subcommand's rest with short-flag bundles expanded.

- [x] **Step 1: Write the failing test**

Append to `tests/Node/safety-classify.test.ts`:

```ts
test("git reset --hard warns across globals, flags, and whitespace", () => {
    assert.equal(classifyCommand("git   reset   --hard HEAD~1", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("git -c core.hooksPath=/tmp/x reset --hard", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("git reset -q --hard", OPTS)?.severity, "warn");
});

test("git push --delete warns; short -d form now warns too", () => {
    assert.equal(classifyCommand("git push -d origin main", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("git push -u origin --delete feature/x", OPTS)?.severity, "warn");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: FAIL — `git -c … reset --hard`, `git reset -q --hard`, and
`git push -d origin main` return `null` (the raw-string regexes miss them).

- [x] **Step 3: Write minimal implementation**

In `pre-tool-use.ts`, replace the two regex bodies:

```ts
/** WARN: git reset --hard (discards uncommitted work). Tokenized so global
 *  options (-c, -C, …) and interleaved flags cannot hide the subcommand. */
function gitResetWarn(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const git = expandedGitFlags(tokens);
    if (git && git.subcmd === "reset" && git.expanded.includes("--hard")) {
        return { severity: "warn", reason: "git reset --hard discards uncommitted changes" };
    }
    return null;
}

/** WARN: git push --delete / -d (removes a remote ref). */
function gitPushDeleteWarn(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const git = expandedGitFlags(tokens);
    if (git && git.subcmd === "push" && (git.expanded.includes("--delete") || git.expanded.includes("-d"))) {
        return { severity: "warn", reason: "git push --delete removes a remote ref" };
    }
    return null;
}
```

Update `sqlDropWarn`'s docblock to record the best-effort contract:

```ts
/** WARN: destructive SQL drops. Best-effort raw-string regex by design: a
 *  faithful tokenized check would have to parse mysql -e / psql -c / heredoc
 *  payloads. WARN gates are advisory, not a security boundary (L-1). */
function sqlDropWarn(command: string, _tokens: string[], _ctx: RuleCtx): Finding | null {
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: PASS — existing git tests (`git reset --hard`, `git push origin
--delete feature/x`, `git -c … commit -m y` → null) stay green.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/pre-tool-use.ts tests/Node/safety-classify.test.ts
git commit -S -m $'fix(safety): tokenize git WARN gates (audit L-1)\n\ngitResetWarn/gitPushDeleteWarn now run on the expanded token stream via\nthe block rules\' expandedGitFlags path: global options (-c core.hooksPath),\ninterleaved flags (-q), and the short push -d form are no longer missed.\nsqlDropWarn stays a best-effort regex, documented as advisory only.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: Windowed circuit breaker (L-3)

**Files:**
- Modify: `packages/prism-core/extensions/safety/denial-circuit-breaker.ts`
- Test: `tests/Node/safety-circuit-breaker.test.ts`

**Interfaces:**
- Produces: `WINDOW_SIZE = 10` (exported const); `DenialCircuitBreaker` keeps
  the same public API — `observe(sessionID, denied)` →
  `{ count, tripped, transitioned }` where `count` now means denials within
  the last `windowSize` bash outcomes; `count(sessionID)`, `isTripped(sessionID)`,
  `reset(sessionID)`, `clearAll()` unchanged in shape. Constructor gains
  optional `windowSize` (defaults to `WINDOW_SIZE`).

- [x] **Step 1: Rewrite the tests (Red first — replace the "success resets" test, add window tests)**

Replace the entire content between the header and the modeline in
`tests/Node/safety-circuit-breaker.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DenialCircuitBreaker, DEFAULT_THRESHOLD, WINDOW_SIZE } from "../../packages/prism-core/extensions/safety/denial-circuit-breaker.ts";

test("trips at the default threshold of 3", () => {
    const b = new DenialCircuitBreaker();
    assert.equal(b.observe("s1", true).count, 1);
    assert.equal(b.isTripped("s1"), false);
    assert.equal(b.observe("s1", true).count, 2);
    assert.equal(b.isTripped("s1"), false);
    const third = b.observe("s1", true);
    assert.equal(third.count, 3);
    assert.equal(third.tripped, true);
    assert.equal(third.transitioned, true);
    assert.equal(b.isTripped("s1"), true);
});

test("denials keep counting past the threshold but stay tripped", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    const fourth = b.observe("s1", true);
    assert.equal(fourth.count, 4);
    assert.equal(fourth.tripped, true);
    assert.equal(fourth.transitioned, false);
});

test("a success does not erase denials within the window", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    const obs = b.observe("s1", false);
    assert.deepEqual(obs, { count: 2, tripped: false, transitioned: false });
    assert.equal(b.isTripped("s1"), false);
    const third = b.observe("s1", true);
    assert.equal(third.count, 3);
    assert.equal(third.tripped, true);
    assert.equal(third.transitioned, true);
});

test("interleaved successes cannot prevent the trip", () => {
    const b = new DenialCircuitBreaker();
    assert.equal(b.observe("s1", true).count, 1);
    assert.equal(b.observe("s1", false).count, 1);
    assert.equal(b.observe("s1", true).count, 2);
    assert.equal(b.observe("s1", false).count, 2);
    const fifth = b.observe("s1", true);
    assert.equal(fifth.count, 3);
    assert.equal(fifth.tripped, true);
    assert.equal(fifth.transitioned, true);
});

test("successes age the window out", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    assert.equal(b.isTripped("s1"), true);
    for (let i = 0; i < WINDOW_SIZE; i++) b.observe("s1", false);
    assert.equal(b.count("s1"), 0);
    assert.equal(b.isTripped("s1"), false);
});

test("sessions are isolated", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    assert.equal(b.isTripped("s1"), true);
    assert.equal(b.isTripped("s2"), false);
    assert.equal(b.count("s2"), 0);
});

test("custom threshold", () => {
    const b = new DenialCircuitBreaker({ threshold: 2 });
    assert.equal(b.observe("s1", true).tripped, false);
    const second = b.observe("s1", true);
    assert.equal(second.tripped, true);
    assert.equal(second.transitioned, true);
});

test("reset and clearAll return to never-seen state", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    b.reset("s1");
    assert.equal(b.count("s1"), 0);
    assert.equal(b.isTripped("s1"), false);
    b.observe("s2", true);
    b.clearAll();
    assert.equal(b.count("s2"), 0);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-circuit-breaker.test.ts`
Expected: FAIL — the interleaving and aging tests fail against the
consecutive counter (`observe(false)` zeroes the count).

- [x] **Step 3: Rewrite the implementation**

Replace `denial-circuit-breaker.ts` entirely (header/modeline preserved):

```ts
// $KYAULabs: denial-circuit-breaker.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


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
        buf.push(denied);
        if (buf.length > this.windowSize) buf.shift();
        const count = this.countIn(buf);
        const prevCount = count - (denied ? 1 : 0);
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-circuit-breaker.test.ts`
Expected: PASS. Then `npm run test:node` to confirm no other suite broke.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/denial-circuit-breaker.ts tests/Node/safety-circuit-breaker.test.ts
git commit -S -m $'fix(safety): windowed circuit breaker (audit L-3)\n\nConsecutive counting let an agent alternate benign successes between\nblocked attempts and never trip (3 denials within the last 10 bash calls\nreplaces 3 strictly consecutive). Successes age the window instead of\nresetting it; observe/count/isTripped/reset/clearAll API unchanged.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 7: Breaker wording + ADR references in the wrapper

**Files:**
- Modify: `packages/prism-core/extensions/safety/tool-call-handler.ts`
- Modify: `packages/prism-core/extensions/safety/index.ts`
- Test: `tests/Node/safety-tool-call-handler.test.ts`

**Interfaces:**
- Consumes: `WINDOW_SIZE` (Task 6).

- [x] **Step 1: Write the failing test (update the pinned assertion)**

In `tests/Node/safety-tool-call-handler.test.ts`, replace the tripped-reason
assertion:

```ts
        reason: "[prism safety] BLOCKED: session tripped (3 bash denials within the last 10 bash calls) — circuit breaker active per ADR-0068. Run /new to reset.",
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/Node/safety-tool-call-handler.test.ts`
Expected: FAIL — the old wording is still emitted.

- [x] **Step 3: Implement the wording + reference changes**

In `tool-call-handler.ts`:
- Import: `import { DenialCircuitBreaker, WINDOW_SIZE } from "./denial-circuit-breaker.ts";` (add `WINDOW_SIZE`).
- `ToolCallDeps` docblock: `Per-session windowed-bash-denial circuit breaker (ADR-0068).`
- `noteBashDenial` redacted message:

```ts
    const redacted =
        `[prism safety] circuit breaker tripped: ${obs.count} bash denials within ` +
        `the last ${WINDOW_SIZE} bash calls in this session. All tools blocked until /new. (ADR-0068/ADR-0036)`;
```

- Tripped reason in `handleToolCall`:

```ts
                reason:
                    `[prism safety] BLOCKED: session tripped (${deps.breaker.count(deps.sid)} ` +
                    `bash denials within the last ${WINDOW_SIZE} bash calls) — circuit breaker active per ADR-0068. ` +
                    `Run /new to reset.`,
```

In `index.ts`:
- Header doc comment: replace the breaker paragraph —

```ts
 * ADR-0042 simplification: in pi, returning `{ block: true, reason }` from a
 * `tool_call` handler IS the denial — there is no need to correlate
 * `message.part.updated` tool-part states with `tool.execute.after` (the
 * opencode Probe-3 dance). So the wrapper drives the pure
 * `DenialCircuitBreaker` directly: a bash `tool_call` that returns blocked
 * increments the streak; a bash `tool_execution_end` (the call actually ran)
 * resets it. Three consecutive bash denials trip the breaker; once tripped,
 * every subsequent `tool_call` in the session is blocked (fail closed,
 * ADR-0036) and the user is notified to `/new`.
```

with:

```ts
 * ADR-0042 simplification: in pi, returning `{ block: true, reason }` from a
 * `tool_call` handler IS the denial — there is no need to correlate
 * `message.part.updated` tool-part states with `tool.execute.after` (the
 * opencode Probe-3 dance). So the wrapper drives the pure
 * `DenialCircuitBreaker` directly: a bash `tool_call` that returns blocked
 * feeds a denial into the session's window; a bash `tool_execution_end`
 * (the call actually ran) feeds a success. Three denials within the last
 * ten bash calls trip the breaker (ADR-0068); once tripped, every
 * subsequent `tool_call` in the session is blocked (fail closed,
 * ADR-0036) and the user is notified to `/new`.
```

- Breaker field docblock: `/** Per-session windowed-bash-denial circuit breaker (ADR-0068). */`
- `tool_execution_end` comment: `// A bash that actually executed (exit 0, nonzero exit, or ask-approved) is not a denial — feed a success into the window (denials persist; ADR-0068).`

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/Node/safety-tool-call-handler.test.ts` then
`npm run test:node`.
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/extensions/safety/tool-call-handler.ts packages/prism-core/extensions/safety/index.ts tests/Node/safety-tool-call-handler.test.ts
git commit -S -m $'fix(safety): update breaker wording and ADR references\n\nEscalation and tripped-reason messages now describe the windowed policy\n(N bash denials within the last 10 bash calls) and cite ADR-0068; the\nindex.ts header documents the threat model the audit asked for. Redacted\nmessage discipline unchanged — no command text.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 8: Bounded `load_env()` (L-2)

**Files:**
- Modify: `backend/env.php`
- Test: `tests/Unit/LoadEnvTest.php`

**Interfaces:**
- Consumes: existing `load_env(string $path): void` contract — never throws.
- Produces: files > 1 MiB or > 10,000 lines are a logged fail-safe no-op.

- [x] **Step 1: Write the failing tests**

Append to `tests/Unit/LoadEnvTest.php`, before the final modeline:

```php
test('load_env no-ops on a .env larger than 1 MiB', function () {
    $path = sys_get_temp_dir() . '/test_env_oversize.env';
    file_put_contents(
        $path,
        str_repeat("A=" . str_repeat("0", 68) . "\n", 15000), // ~1.07 MiB
    );

    load_env($path);

    expect($_ENV)->not->toHaveKey('A');
    expect(getenv('A'))->toBeFalse();

    unlink($path);
});

test('load_env no-ops on a .env with more than 10000 lines', function () {
    $path = sys_get_temp_dir() . '/test_env_too_many_lines.env';
    file_put_contents($path, str_repeat("FOO=bar\n", 20000));

    load_env($path);

    expect($_ENV)->not->toHaveKey('FOO');
    expect(getenv('FOO'))->toBeFalse();

    unlink($path);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: FAIL — both files currently load and populate the keys.

- [x] **Step 3: Write minimal implementation**

In `backend/env.php`, after the `is_readable` block and before
`$lines = @file(...)`:

```php
    // Bound input before reading: a .env larger than 1 MiB is implausible
    // (security audit L-2; fail-safe no-op like absent files).
    if (filesize($path) > 1048576) {
        error_log("load_env: {$path} exceeds the 1 MiB size cap; using defaults");

        return;
    }
```

After the `$lines === false` block (before the BOM strip):

```php
    // Refuse implausibly many lines (belt-and-braces behind the size cap).
    if (count($lines) > 10000) {
        error_log("load_env: {$path} exceeds the 10000-line cap; using defaults");

        return;
    }
```

In the function docblock, after the file-existence sentence, add:

```
 * Files larger than 1 MiB or with more than 10,000 lines are refused as
 * implausible (fail-safe no-op, logged) — bounded input (security audit
 * L-2).
```

- [x] **Step 4: Run test to verify it passes**

Run: `vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: PASS (existing 20+ tests stay green).

- [x] **Step 5: Commit**

```bash
git add backend/env.php tests/Unit/LoadEnvTest.php
git commit -S -m $'fix(env): bound load_env input (audit L-2)\n\nA filesize cap (>1 MiB, checked before file()) and a line-count cap\n(>10000) turn an implausibly large .env into a logged fail-safe no-op,\nclosing the theoretical bootstrap resource-exhaustion path.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 9: Extension README — fail-closed guard, WARN contract, known limits

**Files:**
- Modify: `packages/prism-core/extensions/safety/README.md`

**Interfaces:** none (documentation only).

- [x] **Step 1: Update the enforcement list**

In "What it enforces" §2, after the existing classifier sentence, add:

```markdown
   Commands containing constructs the flat tokenizer cannot model —
   command/process substitution (`$(...)`, backticks, `<(...)`), ANSI-C
   quoting (`$'…'`), here-strings (`<<<`) — **fail closed** (blocked), as do
   shell-wrapper payloads (`bash -c …` at any token position, e.g. under
   `sudo`/`timeout`). Benign substitution (`echo $(date)`) is blocked too —
   an accepted fail-closed cost (ADR-0036). The WARN gates (`DROP …`,
   `git reset --hard`, `git push --delete`) are **best-effort nudges, not a
   security boundary**: deliberate obfuscation (e.g. `git reset$IFS--hard`)
   can skip them.
```

- [x] **Step 2: Update the breaker section**

In "What it enforces" §3, replace:

```markdown
3. **Consecutive-bash-denial circuit breaker (ADR-0042).** Three consecutive
   blocked bash calls in one session trip the breaker.
```

with:

```markdown
3. **Windowed-bash-denial circuit breaker (ADR-0068).** Three blocked bash
   calls within the last ten bash calls in one session trip the breaker.
```

In the "ADR-0042 simplification" table, replace the
`tool_execution_end` row action:

```markdown
| `tool_execution_end` (bash executed) | `breaker.observe(sid, false)` — feed a success into the window (denials within the window persist; ADR-0068) |
```

Add after the table:

```markdown
Windowed semantics supersede ADR-0042's reset-on-success wording
(ADR-0068): interleaved benign commands no longer erase the denial count.
```

- [x] **Step 3: Add the Known limits section**

Before "## Fail-closed invariants (ADR-0036)", add:

```markdown
## Known limits (documented threat model)

- **Remote/container executors** (`ssh host "rm …"`, `docker exec`,
  `kubectl exec`, `nsenter`, `chroot`, `systemd-run`) are not modeled:
  their payloads execute in a different trust domain than the local
  safe-zone model, and enumerating executors is unbounded. They are
  deliberately out of scope.
- **WARN gates are advisory.** See the enforcement list above.
- **Benign command substitution is blocked** by the fail-closed guard —
  the agent computes such values in separate steps.
```

- [x] **Step 4: Update the file-table port note**

In the `denial-circuit-breaker.ts` row, append:

```markdown
   The 2026-08-17 security audit remediation replaced consecutive counting
   with the bounded-window policy (ADR-0068).
```

- [x] **Step 5: Verify and commit**

Run: `git diff --stat` (docs only); `npm run test:node` still green.

```bash
git add packages/prism-core/extensions/safety/README.md
git commit -S -m $'docs(safety): record fail-closed guard, WARN contract, known limits\n\nREADME now documents the unmodelable-construct fail-closed guard, the\nadvisory-only WARN contract (audit L-1), the windowed breaker (ADR-0068),\nand the remote/container-executor known limit (audit M-1 non-goal).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 10: ADR-0068 + CONTEXT.md glossary/invariant

**Files:**
- Create: `adr/0068-windowed-denial-circuit-breaker.md`
- Modify: `CONTEXT.md`

**Interfaces:** none (documentation only).

- [x] **Step 1: Write ADR-0068**

Create `adr/0068-windowed-denial-circuit-breaker.md`:

```markdown
# 0068. Windowed Denial Circuit Breaker

Date: 2026-08-17

## Status

Accepted

Supersedes the circuit-breaker reset semantics of ADR-0042 (opencode-era,
as ported by ADR-0056): the pi-era breaker counts denials within a sliding
window of the last ten bash tool calls instead of resetting on any
successful command.

## Context

Issue #274 (opencode era) motivated a consecutive-denial breaker: an agent
denied a bash command retries with syntactic variations, burning turns
indefinitely. ADR-0042 fixed the consecutive case with reset-on-success —
any executed bash command cleared the count.

The 2026-08-16 external security audit (finding L-3) showed the
reset-on-success semantics defeat the loop-detection intent: an agent (or a
prompt-injected instruction) alternating one benign command (`true`) between
blocked attempts never reaches the three-in-a-row threshold, so the runaway
loop is never tripped. The harness's core safety posture is fail-closed
(ADR-0036); the breaker is the backstop for exactly this adversarial loop.

## Decision

1. **Windowed counting.** `DenialCircuitBreaker` keeps a per-session ring
   buffer of the last 10 bash call outcomes (denied/success). It trips when
   3 denials occur within the window. `observe(sid, denied)` keeps its
   `{ count, tripped, transitioned }` shape; `count` now means "denials in
   window".
2. **Successes age, they do not reset.** A successful bash call adds a
   success to the window; denials within the window persist until evicted
   by age. Evasion now requires 10+ benign bash calls between every pair of
   denials — a mostly-benign agent.
3. **Lifecycle unchanged.** `reset(sid)` on `agent_end` and `clearAll()` on
   session shutdown; the trip blocks every subsequent tool call until the
   user runs `/new` (fail closed, ADR-0036).
4. **Redaction preserved.** Escalation messages carry only identity and
   counts — never command text (ADR-0042 discipline).
5. **Threat-model documentation.** The window size (10) and threshold (3)
   are exported constants (`WINDOW_SIZE`, `DEFAULT_THRESHOLD`) and the
   policy is documented in the extension README.

## Consequences

**Positive:**
- The interleaving evasion is closed while preserving false-trip tolerance:
  3 denied commands within 10 bash calls is rare for legitimate work, and
  the window ages out over long healthy sessions.
- API shape of `DenialCircuitBreaker` is unchanged — only semantics.

**Negative:**
- A legitimate agent making 3 denied attempts within a 10-call span is
  stopped (the same false-trip risk ADR-0042 accepted at threshold 3, now
  spread over a window). Recovery is `/new`, unchanged.

**Neutral:**
- ADR-0042 remains a frozen opencode-era record; ADR-0056's port note
  remains historical. This ADR is the pi-era authority for breaker
  semantics.

## Alternatives Considered

- **Keep consecutive counting and document the limit.** Rejected: leaves
  the evasion the audit flagged as the thing to *decide*, not accept.
- **Reset only on `agent_end` (any 3 denials in a run trip).** Rejected:
  ADR-0042 explicitly avoided this shape — long legitimate runs with 3
  isolated denied attempts would hard-stop.
- **Decaying counter (multiply down on success).** Rejected: fiddly to
  tune; the ring-buffer window is simpler and directly expressible as
  "3 in the last 10".

- [x] **Step 2: Update CONTEXT.md**

Replace the glossary "safety extension" row's tail (CONTEXT.md line 49):

```markdown
| safety extension | Prism core's sole Pi extension. It enforces the sensitive-path deny floor, destructive-command policy, safe-directory contract, bypass prohibition, and bounded-window denial circuit breaker (three denials within the last ten bash calls). |
```

Replace the "External Data" invariant bullet (CONTEXT.md line 133):

```markdown
- Three blocked bash calls within a window of ten terminate the retry loop
  for that Pi session.
```

- [x] **Step 3: Commit**

```bash
git add adr/0068-windowed-denial-circuit-breaker.md CONTEXT.md
git commit -S -m $'docs(adr): record windowed circuit breaker semantics (ADR-0068)\n\nPi-era authority for breaker semantics, superseding ADR-0042\'s\nreset-on-success wording by reference (0042 is frozen). CONTEXT.md\nglossary and the safety invariant now describe the windowed policy.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

## Final verification

Run before declaring the branch complete:

1. `npm run test:node` — full node suite green.
2. `vendor/bin/pest tests/Unit/LoadEnvTest.php` — green.
3. `npx tsc --noEmit` — clean.
4. `/check-php` — php-cs-fixer, stylelint, eslint, Pest coverage ≥ 80% on
   changed files.

## Plan self-review (completed)

- **Spec coverage:** M-1 → Tasks 1–4 (Guard A + Guard B, both gates);
  I-2 probe cases → Tasks 1, 3 fixtures; L-1 → Tasks 5, 9 (README WARN
  contract); L-2 → Task 8; L-3 → Tasks 6, 7, 9, 10; docs/ADR-required →
  Tasks 9, 10; non-goals (L-4, remote executors, fuzz suite) → documented,
  no tasks. ✓
- **Placeholders:** none — every step carries complete code and commands. ✓
- **Type consistency:** `hasUnmodelableShellConstruct(command: string):
  boolean` (Task 1) consumed in Tasks 1–2; `findShellWrapperPayload(tokens:
  string[]): string | null` (Task 3) consumed in Tasks 3–4;
  `WINDOW_SIZE = 10` (Task 6) consumed in Task 7; `expandedGitFlags` reused
  as-is in Task 5; `DenialObservation` shape unchanged. ✓
