# Architecture guidance

`architect` owns scoped architecture evaluation. Use the depth needed by the
question and actual project policy, not automatic document escalation.

## Interfaces and boundaries

Compare the current design with realistic alternatives. A deep module hides
meaningful complexity behind a small interface; a pass-through layer merely
moves it. Examine caller knowledge, state ownership, failures, trust boundaries,
migration, reversibility and operating cost. Do not introduce an abstraction
only to rename a dependency.

A useful diagram answers one question. Choose context, container or component
views as needed; name boundaries and label arrows with data/events. Mermaid or
ASCII is sufficient. No diagram is required per finding.

## Shared intent and duplication

Read candidate implementations and their callers, not just signatures or token
similarity. Ask whether they solve the same problem and should evolve together.
Shared intent may look different; similar syntax may encode independent policies.
Consider expected changes, invariants and error behavior before extracting.

Prefer a shared implementation when it concentrates complexity and reduces caller
knowledge. Avoid helpers that recreate both originals through mode flags or couple
unrelated policies. There is no arbitrary line-count or structural-similarity gate.
A small duplication may be cheaper than an abstraction; explain the actual cost.

This intent/caller guidance adapts obra/superpowers-lab (MIT, © Jesse Vincent).
See the shipped NOTICE for attribution and terms.

## Durable decisions and open proposals

Use `adr` for a useful settled decision or a project-required record. Use an RFC
when open alternatives need durable feedback; a short plan or PR discussion is
enough for local choices. Follow project approval requirements, not a universal
all-boundary-owner sign-off rule.

An RFC can record the problem, constraints, alternatives, interfaces, risks, open
questions, migration and rollback. Keep useful discussion/history and make the
accepted decision discoverable; no archive/delete ceremony is prescribed. A design
record does not itself authorize implementation.
