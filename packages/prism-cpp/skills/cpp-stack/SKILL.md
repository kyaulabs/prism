---
name: cpp-stack
description: Use for C++ design, implementation or review. Establish the project's standard, ownership, error, concurrency and allocation policies before choosing native tools.
compatibility: Conventional C++20 headers and translation units; native tooling is project-owned. Named language modules are outside the initial path.
---

# C++ stack

Apply C++ semantics without replacing the project's architecture or toolchain.

## Process

1. Read project AGENTS, relevant CONTEXT/ADRs and target configuration. Identify the exact language mode, supported compiler/standard library and exceptions/RTTI policy. C++20 is the initial package floor, not permission to upgrade an existing project.
2. Identify owners, borrowers, mutation and failure boundaries for the task. Prefer adequate standard-library facilities and existing dependencies; justify new dependencies.
3. Load only relevant references:
   - [Lifetime](references/lifetime.md): RAII, borrowing, moves, callbacks and shutdown.
   - [Strong types](references/strong-types.md): IDs, units, ranges and generations.
   - [Errors](references/errors.md): C++20 results and exception boundaries.
   - [Concurrency](references/concurrency.md): synchronization, capacity and worker lifetime.
   - [Performance](references/performance.md): allocation budgets and measurements.
   - [Build tooling](references/build-tooling.md): standards, ABI and native verification.
4. Implement or review against those contracts. Separate language rules from project policy and measured claims from assumptions.

## Rules

No blanket STL, exceptions or RTTI ban. No implicit C++23 dependency (including `std::expected`). No renderer, game architecture, global scheduler or fixed allocation budget. Project tools enforce configured checks; skills supply guidance, not enforcement.

Use `tdd-cpp` for behavior changes, `cpp-build` for build failures, `cpp-review` for review and `/check-cpp` for scoped checks. Core guidance remains optional context, not a runtime dependency or mandatory skill chain.

## Gotchas

- A raw pointer, reference, span or string_view does not prove its owner remains alive.
- An integer alias is not a distinct ID type; reserve is not a capacity limit.
- A Prism module is a Pi package, not a C++ named language module or engine plugin ABI.
