---
name: brainstorming
description: Use to resolve consequential design choices and capture goals, behavior, acceptance criteria and useful test seams.
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Brainstorming

Turn uncertainty into a design that can be tested. Inspect relevant code and
project evidence before asking the user about discoverable facts.

Establish the goal, constraints, existing behavior, affected users and observable
acceptance criteria. Separate settled decisions from open choices. For each
consequential choice, explain realistic alternatives and recommend the simplest
one that meets the goal. Ask focused questions about human preferences, costs
and trade-offs, not for repeated confirmation of an approved design.

Sketch boundaries, data flow, failure cases and useful public test seams. Check
that the acceptance criteria distinguish success from a plausible but wrong
implementation. Identify assumptions that need evidence rather than treating a
confident explanation as proof.

Summarize at the useful level of detail: a brief plan for ordinary work; a durable
specification when requested or when it would resolve substantial ambiguity.
A specification records goals, constraints, behavior, exclusions, acceptance
criteria and unresolved decisions without prescribing every implementation line.
Reuse existing documents instead of duplicating them. Use `architect` for a
significant boundary choice and `writing-plans` for multi-step implementation.

Respect analysis-only and planning-only scope. A design discussion does not
authorize implementation or tracker creation. When implementation is already
authorized and requirements are clear, proceed without reopening settled choices.
