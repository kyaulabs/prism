---
name: setup-cpp
description: Use for selected C++ tooling setup. Inspect and adapt native CMake, Conan, diagnostics and CTest configuration without replacing adequate project tools.
compatibility: Initial path is C++20, CMake, Ninja and Conan 2; preserve an existing consumer's chosen tools.
---

# Set up C++ tooling

Configure only selected local features and distinguish configuration from execution.

## Process

1. Inspect instructions, manifests, presets, profiles, locks, style/analyzer policy, compiler inventory and existing test framework. Reuse adequate files and customized settings.
2. Honor the existing setup selection. Core `setup` owns template and GitHub choices; do not introduce a second feature interview or provision remote infrastructure. Ask only about unresolved conflicts.
3. For a selected CMake path, use target-scoped standards and warnings. Set `CXX_STANDARD_REQUIRED` to prevent decay and decide extensions explicitly. A `cxx_std_20` feature requests at least C++20, not an exact upper bound. Verify actual compile commands. Keep third-party warning policy separate from owned code.
4. Enable CTest and reuse one adequate framework, such as Catch2 or GoogleTest. Generate a compilation database for Ninja/Makefiles. Unity builds or other generators may need a separately authorized non-unity analysis preset.
5. If Conan 2 is selected, use explicit host/build profiles, exact requirements and the project's lock policy with CMakeToolchain/CMakeDeps. Record compiler, standard library/CRT, architecture, build type and options. Detection is a starting guess, not a reproducible profile; a lock does not prove ABI compatibility.
6. Configure/build/link/test the selected CPU target with native commands. Select supported formatter/analyzer versions and separate sanitizer presets only when requested or risk-relevant. Preserve resource limits.
7. Report exact files, versions, presets/profiles and commands; distinguish configured, actually tested and unresolved prerequisites. Continue independent useful checks if a tool is unavailable.

## Rules

Do not overwrite presets, profiles, style or locks with package defaults. No global install, compiler upgrade, destructive rebuild, warning suppression or exceptions/RTTI change without task authority. A blank-project smoke is not application verification.

See `cpp-build`, `tdd-cpp` and [verification](../../docs/verification.md).

## Gotchas

- Resolution success does not establish a dependency's compiler/stdlib/CRT compatibility.
- `CXX_STANDARD` alone can decay; an exported JSON database can still be stale.
- Installing two test frameworks increases setup without improving the tested contract.
