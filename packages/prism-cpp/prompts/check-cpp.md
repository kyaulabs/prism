---
description: Verify a scoped C++ change with project-native builds, analysis, tests and semantic review; report actual coverage and missing evidence.
argument-hint: "[scope: path, target, change range or description]"
---

Check C++ scope: $ARGUMENTS

Use the current task changes if scope is omitted. Treat scope as a description,
not shell code. Honor an explicit complete-project request.

1. Read project instructions and discover native presets, profiles, targets, tests,
   formatter/analyzer policy and generated prerequisites. Load `cpp-review` and
   the package's `docs/verification.md` when needed.
2. Resolve affected TUs, header consumers, dependents and configurations from native
   metadata. Keep distinct compile commands for the same source. If uncertain,
   broaden to all owned targets/TUs in the relevant configuration matrix; report
   remaining exclusions. A database is not a complete include/link graph.
3. Run applicable configure/build/link, non-mutating formatting, clang-tidy with a
   current database, selected CTest and risk-relevant supported sanitizer builds.
   Missing/stale metadata leaves AST analysis incomplete, not all checks blocked.
4. Enumerate and execute the same tests/configuration; zero selected tests fails.
   Report selected/executed/skipped counts. Inspect sanitizer diagnostics, including
   recovering UBSan with exit zero; use a supported fail-on-report policy. Keep
   ASan/UBSan and TSan builds separate.
5. Review relevant ownership/lifetime, error, strong-type, capacity and concurrency
   contracts; automated success does not prove these or hardware performance.
6. Report commands, versions, working directories, configurations/TUs/targets,
   findings and scope limits. Use Passed, Failed, Unavailable, Not run and Not
   applicable for individual checks. Describe incomplete evidence separately.

A check-only request does not authorize repairs, auto-formatting, dependency
upgrades or Git/remote actions. Continue independent useful checks. Use separately
quoted native arguments and the intended working directory, including Windows
paths; do not concatenate compile-database commands into a shell.
