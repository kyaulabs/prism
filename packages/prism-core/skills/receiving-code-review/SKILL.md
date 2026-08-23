---
name: receiving-code-review
description: Use when code-review returns findings and you need to triage and respond before acting. Governs how to consume multi-axis review feedback without over-complying or thrashing.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Receiving Code Review

Consume review findings from `code-review` with discipline: triage each finding
by severity, fix what must be fixed, and push back on what doesn't apply. Do not
blindly apply every suggestion — and do not argue with security or correctness
findings.

**Announce at start:** "I'm using the receiving-code-review skill to triage
findings from `code-review`."

## Diff-causal triage

Normalize each finding to exactly one category: **Blocking** or **Advisory**.
A finding is Blocking only when all applicable conditions are established:

1. It was introduced or materially worsened by the reviewed delta.
2. It affects behavior or verification evidence changed by that delta.
3. It has a deterministic reproduction, violated invariant, or direct security or data-loss path.
4. It can make the changed runtime, build, setup, release, or verification flow incorrect.

If any condition is not established, classify the finding Advisory. A changed-test finding is Blocking only when it can falsely pass, falsely fail, or omit evidence for a changed acceptance criterion. Pre-existing, unrelated, tertiary,
maintainability-only, speculative, out-of-platform, and broader-hardening
observations are Advisory by default.

## Normalizing the 4 axes

`code-review` returns a **multi-axis report with 4 axes** — **tooling**,
**standards**, **spec**, **sast**. The axes use three different vocabularies.
Normalize every finding into Blocking or Advisory before applying the process.
Native severity is evidence, not the final gate.

| Axis | Native vocabulary | Receiving rule |
|---|---|---|
| **tooling** | Blocking / Suggested / Informational | Apply all four diff-causal conditions. |
| **standards** | Fowler smells | Advisory; structural smells alone do not demonstrate incorrect behavior. |
| **spec** | Covered / Omitted / Deliberately-omitted | Omitted blocks only when the reviewed delta was required to implement that criterion; otherwise Advisory. |
| **sast** | ERROR / WARNING / INFO | Apply causality and concrete reachable-path evidence; pre-existing or unrelated scanner output is Advisory. |

## Process

1. **Read all findings** before acting on any.
2. **Classify diff causality** and record the evidence for each Blocking decision.
3. **Fix Blocking** findings through TDD.
4. **Retain Advisory** findings for PR disclosure or an inert follow-up issue recommendation; do not implement them merely to clear review.
5. **Review only the continuous repair delta** from the prior reviewed HEAD,
   verify closure evidence for the Blocking finding, and append that evidence to
   the review chain.
6. **Present a summary** to the user: what was fixed and which Advisory findings remain visible.

## Response format

For the user-facing summary after triage. Every finding carries an `[axis]`
tag — `[tooling]`, `[standards]`, `[spec]`, `[sast]` — so the reviewer can trace
it back to the report section. The fix/defer decision is the same regardless
of which axis surfaced a finding, so the summary is one merged list (not four
separate per-axis lists).

```
## Code Review Response

### Fixed (N)
- [tooling] <finding> — <brief note on the fix>
- [spec] AC#2 omitted — <implemented the missing handler>
- [sast] ERROR <finding> — <moved secret to env var>

### Advisory (N)
- [standards] Long Method (Fowler) — maintainability observation with no demonstrated changed-flow defect
- [spec] deliberately omitted criterion — acknowledged as outside this delta
```

## Rules

- Never apply a suggestion without understanding why it is correct.
- Never push back on Blocking findings. Fix them.
- Do not defer review follow-up to `tdd`. Handle it in the current agent after
  `code-review` returns.
- The deferral reason must be substantive, not a dismissal. "Too risky given
  the timeline" is fine; "I don't agree" without reasoning is not.
- If causality, relevance, concreteness, or workflow impact is not proven,
  classify the finding Advisory.
- Advisory findings do not require waivers and do not block `/pr`.

## Cross-refs

- `code-review` skill — generates the findings you consume here.
- `verification-before-completion` skill — run after fixing Blocking items.
- `/check` command — pre-push gate; must be green after all fixes.
- `rcs-header` skill — fix missing RCS headers (common Blocking finding).

## Gotchas

- *Blindly applying every finding* — a review tool flags patterns, not bugs.
  Some findings are false positives or don't apply to this codebase. Triage
  them.
- *Arguing with Blocking findings* — a security finding is not a style
  preference. Fix it, then argue if you still disagree.
- *Deferring without a reason* — "deferred" without explanation reads as
  laziness. Every deferral gets a one-line reason.
- *Restarting full-branch review after a repair* — inspect the chain and review only the continuous repair delta; unchanged content retains its completed evidence.
