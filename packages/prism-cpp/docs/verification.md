# Native C++ verification

Project instructions, existing tools and the requested scope take precedence.
Skills guide selection and interpretation; native tools enforce only their actual
checks. No launcher, graph service or persistent receipt is required.

## Select the configuration and affected code

Record source state/diff, working directory, compiler/stdlib/CRT, architecture,
standard/extensions, generator, preset, build directory/type, important macros,
sanitizer mode and dependency profiles/lock identity. Never reuse prior logs as
current evidence. Prepare dependencies and generate real headers/sources first.
Do not fabricate declarations or delete a user's build tree to silence diagnostics.

Start from implementation, header, template, generated, build and dependency changes.
Use native build/dependency metadata and target knowledge to find consuming TUs and
dependent targets/configurations. A compile database is a set of invocations, not a
complete include, link or dependency graph. CMake File API can help with target/source
scope but does not prove all header consumers or link dependencies.

Preserve multiple commands for one source when macros, flags, architecture or
configuration differ. Deduplicate only visibly equivalent invocations. A public
ABI change can require dependent targets and integration tests. When metadata is
insufficient, broaden to all owned TUs/targets in the relevant configured matrix.
Disclose exclusions or incomplete required scope instead of inventing a graph.

## Execute native checks

Use the project's native commands. For a Ninja CMake fixture, a typical sequence is:

```sh
cmake --preset debug
cmake --build --preset debug
ctest --preset debug --show-only=json-v1
ctest --preset debug --output-on-failure --no-tests=error
```

These example preset names must exist; they are not global defaults. Configure and
build necessary dependents; verify linking as well as compilation. Debug evidence
cannot establish Release or another feature variant.

- Run the pinned `clang-format --dry-run --Werror --style=file` on owned files with
  an existing style. Do not silently impose LLVM defaults. A mismatch must not edit
  source. Check version-specific options and incomplete-format diagnostics.
- Run `clang-tidy -p <build-directory> <TU>` with project-supported checks and current
  compile commands. Validate source paths, compiler arguments, build/configuration
  identity and generated prerequisites, not just JSON syntax. Missing/wrong/stale
  databases make usable AST analysis Unavailable and overall evidence incomplete;
  build, tests, formatting and source review may still pass independently. Do not
  synthesize include paths to claim complete coverage. Keep owned-header diagnostics
  visible; `clang-tidy-diff` filters output and is not full affected-code acceptance.
- Enumerate then execute the same CTest filter and configuration. Record selected,
  executed, disabled/skipped and failed counts. Zero required selected tests is
  Failed; listing alone is Not run. An all-skipped run cannot establish Passed.
- Use separate ASan/UBSan and TSan builds, supported flags/runtime and relevant
  workloads. Inspect reports as well as process status. Recovering UBSan may print
  `runtime error:` and exit zero: that is Failed. For Clang, a supported strict policy
  is `-fno-sanitize-recover=all` and/or `UBSAN_OPTIONS=halt_on_error=1`. Retain the report.
  A generic nonzero status alone does not prove the expected detector fired.
- Review ownership/borrowing, async shutdown, units/IDs/overflow, error boundaries,
  capacity/exhaustion and synchronization. Measure performance separately in an
  optimized build when relevant; sanitizers cannot prove timing, all lifetimes,
  race freedom, determinism or hardware behavior.

Use argument arrays or separately quoted native arguments with the intended cwd.
Compile commands are metadata, not arbitrary shell fragments. Respect paths with
spaces, Windows drive letters and separators. Never add a general shell decoder.

## Report

For each check use Passed, Failed, Unavailable, Not run or Not applicable, with
commands, versions, scope and material diagnostics. Incomplete qualifies scope or
overall evidence, not a sixth outcome. State the next concrete action for a missing
required check; continue useful independent checks. Check-only mode never fixes
source, updates dependencies or performs Git/delivery operations implicitly.

Repository fixture results and evaluator scenarios live in `tests/Fixtures/Cpp`
in the source checkout (not this npm archive). Detector-validation success means
an intentionally defective fixture was caught, not that its product code passed.
Only the executed tool/platform matrix in the package README is claimed. NGEN,
Windows, GPU and performance support require separate evidence.

References: [CTest](https://cmake.org/cmake/help/latest/manual/ctest.1.html),
[clang-tidy](https://clang.llvm.org/extra/clang-tidy/),
[UBSan](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html),
[ASan](https://clang.llvm.org/docs/AddressSanitizer.html),
[TSan](https://clang.llvm.org/docs/ThreadSanitizer.html).
