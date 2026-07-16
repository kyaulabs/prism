---
name: receiving-code-review
description: Use when @code-review returns findings and you need to triage and respond to them — before acting on anything. Governs how to consume review feedback without over-complying or thrashing.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Receiving Code Review

Consume review findings from `@code-review` with discipline: triage each finding
by severity, fix what must be fixed, and push back on what doesn't apply. Do not
blindly apply every suggestion — and do not argue with security or correctness
findings.

**Announce at start:** "I'm using the receiving-code-review skill to triage
findings from `@code-review`."

## Triage matrix

Classify each finding — exactly one category:

| Severity | Action required | Example |
|---|---|---|
| **Blocking** | Must fix before proceeding. Do not push back. | SQL injection, XSS, secret exposure, missing RCS header, logic error, hard-boundary violation |
| **Suggested** | Fix if clean and low-risk; otherwise defer with a one-line reason. | Style drift not caught by linters, missing test coverage for new logic, unclear naming |
| **Informational** | Acknowledge and move on. No action needed. | Minor style preferences, future refactor suggestions, "consider" notes |

If you cannot articulate the bug or regression a finding would prevent,
it is at most **Suggested** — not Blocking.

## Normalizing the 4 axes

`@code-review` now returns a **multi-axis report with 4 axes** — **ocr**,
**standards**, **spec**, **sast**. The axes use three different vocabularies.
Normalize every finding into the single Blocking / Suggested / Informational
triage **before** applying the process below.

| Axis | Native vocabulary | → Receiving triage |
|---|---|---|
| **ocr** | Blocking / Suggested / Informational | unchanged — pass through |
| **standards** (`@standards-review`, Fowler smells) | Blocking / Suggested / Informational | **cap at Suggested — never Blocking.** Structural smells are maintainability, not correctness bugs. |
| **spec** (`@spec-review`) | Covered / Omitted / Deliberately-omitted | **Omitted → Blocking** (a missing requirement ships an incomplete feature); Deliberately-omitted → Informational; "no spec found" → Informational |
| **sast** (`@semgrep`) | ERROR / WARNING / INFO | **ERROR → Blocking**; WARNING → Suggested; INFO → Informational |

> **Why standards is capped at Suggested:** if you cannot articulate the bug or
> regression a finding prevents, it is at most Suggested (rule above). Fowler
> design smells describe maintainability risk, not correctness bugs, so they
> never clear the Blocking bar at consumption time — regardless of what
> `@standards-review` reported.
>
> _Deferred cleanup (out of scope here): `@standards-review` still emits
> Blocking for three smells. Aligning the producer with this consumer rule is
> tracked separately; until then this skill caps them._

## Process

1. **Read all findings** before acting on any. Group by severity.
2. **Fix Blocking** first — security, correctness, hard boundaries, missing
   RCS headers on new files.
3. **Review Suggested** one by one:
   - If the fix is clean and low-risk (under 5 lines, obvious correctness) →
     apply it.
   - If the fix is risky, introduces new surface area, or doesn't map to a bug →
     defer with a one-line reason.
4. **Acknowledge Informational** — read them, then move on. Do not implement.
5. **Re-run `@code-review`** after fixes to confirm Blocking is resolved.
6. **Present a summary** to the user: what was fixed, what was deferred and why.

## Response format

For the user-facing summary after triage. Every finding carries an `[axis]`
tag — `[ocr]`, `[standards]`, `[spec]`, `[sast]` — so the reviewer can trace
it back to the report section. The fix/defer decision is the same regardless
of which axis surfaced a finding, so the summary is one merged list (not four
separate per-axis lists).

```
## Code Review Response

### Fixed (N)
- [ocr] <finding> — <brief note on the fix>
- [spec] AC#2 omitted — <implemented the missing handler>
- [sast] ERROR <finding> — <moved secret to env var>

### Deferred (N)
- [standards] Long Method (Fowler) — <one-line reason for deferral>

### Informational (N)
- [spec] 1 deliberately-omitted (out of scope) — acknowledged
- [sast] INFO <finding> — acknowledged
```

## Rules

- Never apply a suggestion without understanding why it is correct.
- Never push back on Blocking findings. Fix them.
- Do not delegate review-follow-up to `@tdd`. This skill runs in the build
  agent after `@code-review` returns.
- The deferral reason must be substantive, not a dismissal. "Too risky given
  the timeline" is fine; "I don't agree" without reasoning is not.
- If a finding falls between categories, err toward the lower severity —
  deferring a Suggested finding is fine; deferring a Blocking finding is not.

## Cross-refs

- `@code-review` agent — generates the findings you consume here.
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
- *Forgetting to re-run @code-review* — after fixing Blocking items, run it
  again. A fix can introduce a new finding.
