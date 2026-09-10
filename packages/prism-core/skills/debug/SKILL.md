---
name: debug
description: Use to reproduce a defect, test a causal hypothesis and fix the root cause through TDD.
---

# Debugging

Establish expected versus observed behavior. Read relevant code, logs and tests
without opening credentials or exposing secret values. Reproduce the smallest
useful failure and record the actual failing evidence.

Form a specific hypothesis, then test it with the smallest safe experiment.
Use temporary local instrumentation when useful and within task scope. Changes
to live production systems require appropriate authority; ordinary source edits
within an authorized task do not need repeated approval. Never log secrets.

Add a failing regression test at the highest practical public boundary. Fix the
cause, not merely the symptom; run the test and relevant broader checks. Remove
owned temporary instrumentation, preserving unrelated changes. Review non-trivial
fixes in the current session and commit verified work normally.

If evidence contradicts the hypothesis, revise it rather than stacking patches.
Ask for direction when progress stalls or consequences exceed the authorized
scope. Report uncertainties and tests that could not be run.
