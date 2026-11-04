---
name: prototype
description: Use only for an expressly requested isolated disposable experiment to answer a bounded technical viability question.
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Disposable experiment

Core permits recorded experiment evidence instead of TDD only for an expressly
requested, isolated disposable prototype. Do not relabel ordinary development
as experimentation. If the request does not authorize this exception, use `tdd`.

State the question, expected discriminating observation and resource bounds:
time, dependencies, data, network/service use and cleanup. Choose the smallest
logic, UI or real-boundary experiment that can answer it. Keep files, processes
and persistence isolated from production inputs. Reuse native tools and real
boundary protocols when that is the question; a mock cannot establish real
integration behavior. Tests may help an experiment but no blanket “no tests”
rule applies.

Record the actual command, observations, relevant cases, limitations and result.
Sanitize output before retaining it: never record secrets, private payloads or
unsafe raw responses. Separate a demonstrated result from a hypothesis and note
what the experiment did not test. For UI work follow applicable module visual
and accessibility requirements; a prototype does not waive them.

Preserve the useful evidence and decision before deleting owned scratch files,
processes and resources. Do not remove unrelated work or leave an experiment
quietly wired into production. Report inconclusive outcomes honestly.

Production promotion is a new implementation step through normal TDD and project
checks. Reimplement or incorporate validated ideas only after meaningful failing
behavior tests; the experiment itself is not production verification.
