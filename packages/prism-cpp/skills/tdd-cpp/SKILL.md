---
name: tdd-cpp
description: Use for C++ behavior changes, regressions and consequential refactors. Test public contracts with the existing framework and native CTest integration.
compatibility: C++20; reuse the project's adequate test framework and build configuration.
---

# C++ behavior tests

Use Core `tdd` for Red → Green → Refactor, with native C++ evidence.

## Process

1. Inspect the public contract, existing tests and CTest registrations. Reuse one adequate framework; do not require module installation to run project-native tests.
2. Write one meaningful failing behavior/regression test. Run it in the affected configuration and verify it fails for the intended defect, not missing generated inputs or bad setup.
3. Implement the smallest fix, run the selected tests, then refactor while green. Test relevant failure paths, invalid/range values, overflow, lifetime, capacity/exhaustion and cancellation rather than private layout.
4. Use compile-fail/type checks where the public contract is about forbidden conversions, but do not treat compilation alone as runtime behavior evidence. Use explicit failure reporting rather than assertions compiled out by NDEBUG.
5. Enumerate and execute the same CTest selection/configuration. Reject zero selected tests; disclose disabled/skipped cases. Apply separate supported sanitizer builds when risk-relevant, inspecting diagnostics as well as exit status.
6. Report Red/Green commands and results, selected/executed/skipped counts, targets/configurations and remaining gaps. Add concurrency/fault tests only when they address the change.

## Rules

No universal coverage percentage, second framework, private implementation mirror or mocked internal ownership model. Mock system boundaries only. Sanitizer success is exercised-path evidence, not proof of every lifetime or interleaving.

See [verification](../../docs/verification.md), `cpp-stack` and `cpp-review`.

## Gotchas

- CTest listing is not test execution, and an empty selection is not a pass.
- UBSan can report a defect and exit zero in recovery mode.
- Tests based only on `assert` may disappear in a Release build.
