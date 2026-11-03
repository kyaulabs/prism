---
name: cpp-build
description: Use to configure or build a declared C++ target, or diagnose configure, compile and link failures through the project's actual native commands.
compatibility: C++20 CMake/Ninja is the initial path; use consumer presets and toolchains rather than assuming a platform.
---

# Build and diagnose C++

Reproduce the requested configuration before changing flags or dependencies.

## Process

1. Read project instructions and native build entry points. Name working directory, target, preset, build directory, configuration, compiler/stdlib/CRT/architecture, feature macros and sanitizer mode. Record profiles/lock identity where relevant.
2. Reproduce the exact configure command and first useful diagnostic. Check toolchain discovery, dependency preparation and generated headers/sources before compilation-aware analysis.
3. Build the selected targets and necessary dependents. Separate configuration, compilation and linking failures; inspect include paths/macros for compilation and library order, symbols, ABI/runtime/options for linking.
4. Check Conan host/build alignment and generated CMakeToolchain/CMakeDeps when used. Do not silently rewrite locks, bump standards, suppress warnings or downgrade dependencies.
5. After a fix, repeat the failing command and relevant CTest selection; use `tdd-cpp` for behavioral defects. Verify the actual compiler command, not only the cache's desired setting.
6. Report successful targets/configurations or the concrete blocker and next action, with commands and versions. State missing tools as Unavailable and unexecuted applicable checks as Not run.

## Rules

Use quoted arguments and the intended working directory, including paths with spaces. Never concatenate compile-database commands into shell code. Do not delete user build trees or trigger an unrelated full rebuild as a shortcut. Continue independent checks.

Read [verification](../../docs/verification.md) for scope and `cpp-review` for semantic findings.

## Gotchas

- A Debug link does not prove Release or feature-variant compatibility.
- A generated declaration stub hides missing prerequisites rather than repairing them.
- A lock constrains resolution, not binary ABI or byte-identical output.
