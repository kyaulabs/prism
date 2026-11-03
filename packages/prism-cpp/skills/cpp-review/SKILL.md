---
name: cpp-review
description: Use for nontrivial C++ review or explicit verification. Cover affected translation units, header consumers and configurations, then examine semantic contracts tools cannot prove.
compatibility: Source review works without native tools; build, AST and runtime claims require actual configuration-specific evidence.
---

# Review C++ changes

Use same-session Core `code-review` principles with C++ scope and semantic checks.

## Process

1. Identify the task/change range, project instructions and surrounding contracts. Include relevant staged/unstaged work without requiring an unrelated clean tree.
2. Read [verification](../../docs/verification.md). Map changed implementations, headers, templates, generated/build inputs and ABI changes to consuming TUs, targets and configurations using native metadata. Preserve distinct commands for the same source with different macros/architecture/options. If metadata cannot narrow safely, check all owned targets/TUs in the relevant configuration matrix and disclose exclusions.
3. Run applicable native build/link, non-mutating format, clang-tidy, selected CTest and risk-relevant sanitizer checks. Missing/stale databases leave AST evidence incomplete; useful source review and other checks can continue.
4. Load only relevant `cpp-stack` references. Inspect owning/borrowed lifetimes, moves and invalidation, async capture and shutdown; error/noexcept/ABI boundaries; units/IDs and overflow; capacity/exhaustion; synchronization/cancellation and performance claims.
5. Report concrete defects with file/line, failure scenario and consequence. Separate task-related fixes from advisory cleanup. State exact commands, versions, TUs/configurations/tests and limitations; do not infer full safety or hardware performance from tool success.

## Rules

A source-only review remains useful, not complete build/AST/runtime verification. No mandatory separate reviewer, hosted service, receipt, fixed-axis protocol or forced skill chain. A review-only request does not authorize repairs or Git/remote operations.

Use `/check-cpp` for checks and `tdd-cpp` for authorized fixes.

## Gotchas

- Parsing a changed header alone misses consumer instantiations and macro variants.
- Changed-line filtering can hide a defect diagnosed outside the diff.
- Filename-only deduplication drops meaningful compile configurations.
