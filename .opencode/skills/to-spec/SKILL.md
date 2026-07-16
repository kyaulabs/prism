---
name: to-spec
description: "Use when you need to turn the current conversation and codebase understanding into a spec WITHOUT interviewing the user — synthesis only. Produces a docs/specs/ file using CONTEXT.md vocabulary and relevant ADRs, sketches test seams for confirmation, then finalizes. Exit path for @consult, @from-issue, or any session where the design is already clear from discussion."
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# To-Spec: Synthesis-Only Spec Authoring

Turns the current conversation context and codebase understanding into a spec.
Does NOT interview the user — it synthesizes what is already known. This is the
no-interview counterpart to brainstorming: where brainstorming refines a rough
idea through grilling, to-spec captures a design that is already settled.

## When to use

Load this skill when:
- The design has emerged from a conversation (@consult, @from-issue,
  or an exploratory session) and you need to record it as a spec.
- The user says "write this up as a spec" / "turn this into a spec".
- You have enough context to write a spec and the user does NOT want another
  interview round.

Do NOT load this skill when:
- The design is still ambiguous — use the `brainstorming` skill (which
  interviews via `grilling`) instead.
- You need to create a GitHub issue — use `/issue`. to-spec writes a spec FILE,
  not a ticket.

## Process

1. **Explore** — read the codebase to understand the current state, if you
   haven't already. Use the domain vocabulary from `CONTEXT.md` throughout the
   spec, and cite any relevant ADRs in `adr/` that constrain the area you're
   touching.

2. **Sketch test seams** — identify the points at which the feature will be
   tested. State the seam you will test at:
   - Prefer existing seams over new ones.
   - Use the highest seam possible — the public boundary (a page entry point, a
     public class method, or a Feature/Integration test), not private internals.
   - The fewer seams across the codebase, the better; the ideal number is one.

   **Present the seam sketch to the user and confirm it before finalizing the
   spec.** This is the single confirmation gate — to-spec does not interview,
   but it gates on the seam choice because it shapes every test.

3. **Write the spec** using the template below. Save it to
   `docs/specs/YYYY-MM-DD-<topic>-spec.md`. Do NOT publish to the issue tracker
   — that is `/issue`'s job. to-spec produces the spec file; the user routes it
   to planning (`writing-plans`) or ticketing (`/issue`) afterwards.

4. **Suggest @architect for cross-cutting specs.** After finalizing the spec,
   if the change is non-trivial or cross-cutting (spans multiple modules,
   introduces a hard-to-reverse decision, or touches a system boundary),
   recommend running `@architect` before ticketing/planning. @architect emits
   an `ADR-required:` line that the ticketing skill (`/issue`) consumes before
   slicing. For localized, low-risk specs, skip straight to `writing-plans` or
   `/issue`.

## Spec template

```markdown
# Spec: <Title>

**Date:** YYYY-MM-DD
**Status:** Draft

## Problem Statement

The problem, from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

A numbered list of user stories, each in the form:
1. As an <actor>, I want <feature>, so that <benefit>.

Be extensive — cover all aspects of the feature.

## Implementation Decisions

The decisions that were made:
- Modules to build or modify, and their interfaces
- Architectural decisions and schema changes
- API contracts and key interactions

Do NOT include file paths or code snippets — they go stale fast. Exception: a
prototype snippet that encodes a decision more precisely than prose (state
machine, schema, type shape) — inline the decision-rich parts only.

## Testing Decisions

- What makes a good test here (external behavior, not implementation details)
- Which test layers apply (Unit / Feature / Integration / Browser — see tests/)
- Prior art: similar existing tests to model on

## Out of Scope

What is explicitly NOT covered by this spec.

## Further Notes

Anything else relevant.
```

## Rules

- **No interview.** Do not ask the user questions to gather requirements — that
  is `brainstorming` + `grilling`. to-spec synthesizes what is already known.
- **One gate only.** The seam sketch is the single confirmation point. Beyond
  that, write the spec directly.
- **Spec file, not a ticket.** Write to `docs/specs/`; do not create issues.
- **Use domain vocabulary.** Pull terms from `CONTEXT.md`; cite relevant ADRs.
- **No file paths or code in the spec body.** Record decisions and interfaces,
  not implementation.

## Cross-refs

- `brainstorming` skill — the interview-based alternative (loads `grilling`)
- `grilling` skill — interview primitive; NOT loaded by to-spec
- `writing-plans` skill — consumes the spec to-spec produces
- `domain-context` skill — `CONTEXT.md` vocabulary sourcing
- `@consult` agent — a consumer that exits via to-spec
- `@architect` agent — run for cross-cutting specs before ticketing

## Gotchas

Known failure modes. Add entries when this skill causes a preventable mistake.

- *Interviewing when you should synthesize* — if the design is unclear, you
  loaded the wrong skill. Switch to `brainstorming` (which uses `grilling`).
- *Publishing to the issue tracker* — to-spec writes a docs/specs/ file. Route
  to `/issue` for ticketing afterwards; do not create issues from to-spec.
- *Skipping the seam gate* — the seam sketch confirmation is mandatory; it
  shapes every test. Present it before finalizing.
- *Low-level seams* — testing private internals is a smell. Move up to the
  highest public boundary; prefer existing seams.
- *Stale code in the spec* — file paths and snippets rot. Record decisions and
  interfaces, not implementation. (Prototype decision-snippets are the
  exception.)
