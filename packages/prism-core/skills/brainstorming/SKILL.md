---
name: brainstorming
description: Use to clarify a rough idea or compare meaningful design alternatives. Keep design proportional and proceed once the requested work is clear.
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Brainstorming

Turn uncertainty into a design that can be tested and implemented.

1. Inspect relevant code and project context. Establish the goal, constraints,
   existing behavior and observable acceptance criteria.
2. Use `grilling` for unresolved human decisions. Recommend the simplest approach
   that meets the goal; compare alternatives only where the trade-off matters.
3. Sketch boundaries, data flow, failure cases and test seams. For large work,
   identify coherent local slices rather than forcing a tracker workflow.
4. Summarize the design at the needed level of detail. Ask about material choices
   not already authorized, not for repeated approval of settled requirements.
5. Use a short plan for ordinary work. Write a spec when substantial ambiguity
   warrants durable detail, using `to-spec`. Record consequential architecture
   with `adr` when useful; architecture review is available, not a mandatory gate.
6. If implementation was requested, proceed through `tdd`, using `writing-plans`
   for multi-step work. If the user requested exploration only, stop at the design.

## Rules

No mandatory spec for a simple fix, classifier for a new project, or branch/seed
transaction before design can proceed. Keep useful design documents. Follow
project branch conventions when implementation starts, preserving unrelated work.

## Gotchas

- Design should reduce implementation uncertainty, not duplicate the code in prose.
- Do not reopen settled questions or force a fresh approval at every handoff.
