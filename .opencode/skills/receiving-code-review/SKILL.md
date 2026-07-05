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

For the user-facing summary after triage:

```
## Code Review Response

### Fixed (N)
- [finding description] — [brief note on the fix]

### Deferred (N)
- [finding description] — [one-line reason for deferral]

### Informational (N)
- [finding description] — acknowledged
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
