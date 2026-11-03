# C++ native fixtures

Small standalone CPU programs, not engine code and not included in npm packages.
Run `npm run test:cpp` from the repository root. The Node runner copies sources
into disposable directories containing spaces and invokes native tools with argument
arrays; it never installs tools. Missing prerequisites are explicit skips in an
ordinary checkout. `PRISM_CPP_REQUIRED=1` makes missing native tools fail.

Required: Clang C++/format/tidy, CMake >=3.25, Ninja and Node. The initial executed
lane uses Linux x86_64, Clang/LLVM 23.1.4 with libstdc++, CMake 4.4.5 and Ninja
1.13.2. The proposed CI lane selects Clang 18 on Ubuntu 24.04, not a claim of a
completed hosted run. Native Windows/macOS/GCC/TSan are not verified.

Conan acceptance is explicit because it resolves/builds a dependency from the
registry. Supply Conan **2.34.0**, an isolated cache and the profile matching the
actual compiler, then run:

```sh
PRISM_CPP_REQUIRED=1 PRISM_CPP_CONAN=1 \
PRISM_CONAN=/path/to/conan CONAN_HOME=/path/to/isolated-fixture-cache \
PRISM_CPP_LOG_DIR=/path/to/new-evidence-directory npm run test:cpp
```

Do not point the cache at user credentials/settings. The default profile records
Clang 23/libstdc++11/x86_64/C++20/Debug; `PRISM_CPP_PROFILE=linux-clang-18` selects
the proposed CI profile. Profiles are fixture choices, not consumer defaults.
Conan 2.22.1 rejected compiler 23; 2.34.0 resolved the recorded Catch2 3.8.1 recipe.
`conan.lock` records actual recipe revisions (including its CMake build requirement),
not guaranteed binary compatibility. No lock or dependency update occurs in tests.
A mismatched libstdc++ ABI deliberately fails the native link after successful resolution.

Optional `PRISM_CPP_LOG_DIR` retains native command arguments, cwd, status and
output in `native.jsonl`; absent it, temporary copies are removed. These are plain
test logs, not a workflow receipt. The seven native acceptance cases label expected defects as detector
validation, including a real alternate-build compilation database and a CTest
skip that exits zero without executing behavior assertions. See [scenarios](scenarios.md) for interpretation and review limits.
