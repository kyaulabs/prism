# Prism C++

Project-local C++ engineering guidance for Pi: `cpp-stack`, `cpp-build`,
`tdd-cpp`, `cpp-review` and `/check-cpp [scope]`: **4 skills and 1 prompt**.

This is an ordinary skills/prompts-only Pi package. It has no runtime dependency,
extension, launcher or build engine. Core supplies optional shared workflow guidance;
the consumer owns standards, tools, architecture, budgets and delivery authority.

## Install and discover

The coordinated 1.2.1 GitHub release does not imply registry publication. To use this checkout:

```sh
pi install --local /absolute/path/to/prism/packages/prism-cpp
```

After an actual coordinated release, use an exact released npm version with
`pi install --local npm:@kyaulabs/prism-cpp@<released-version>` (replace the placeholder).
Review project packages before granting trust. `/reload` discovers changed resources;
`/skill:cpp-stack` forces skill loading. Pi package filters remain authoritative.
Core can remain global and PHP/web can coexist in a mixed project.

## Scope

C++20 conventional headers/TUs are the initial floor, not a forced upgrade of an
older consumer. Exact target standards and existing adequate tooling take precedence.
The first native path is Clang/Linux, CMake/Ninja, Conan 2 and CTest. Do not introduce
C++23 `std::expected` into a C++20 target. Named language modules, plugin ABI,
renderers and engine implementation are outside this package.

Read [verification](docs/verification.md) for affected-TU/configuration selection,
format/tidy/build/test/sanitizer commands and truthful results. Missing usable compile
metadata leaves AST evidence incomplete; empty required tests fail; sanitizer reports
fail even with exit zero. Compiler/analyzer/test success is not complete ownership,
concurrency, benchmark or hardware proof. No universal coverage percentage, STL ban,
exceptions/RTTI ban or engine budget is imposed.

| Executed lane | Scope |
| --- | --- |
| Linux x86_64, Clang/format/tidy 23.1.4, libstdc++ 16.2.1, CMake 4.4.5, Ninja 1.13.2 | CPU build/link/CTest, format/tidy, generated inputs, header/configuration failures, ASan/UBSan and negative detectors. |
| Conan 2.34.0, Catch2 3.8.1, C++20/Debug/libstdc++11 profile | Locked dependency builds/links and executes CTest; a changed libstdc++ ABI fails linking. |
| Pi 1.5.0 on Linux | Packed Core/CPP/PHP discovery, filters/reload, explicit skill and prompt commands. |
| Windows/macOS native C++, GCC, TSan | Unavailable or not run; no native support claim. |

The repository's local implementation report records commands and remaining limits.
The proposed CI Clang 18 lane is not an executed platform claim. NGEN adoption is a
later separately authorized task. Package discovery alone does not establish native
support. Publication remains a later user action.
