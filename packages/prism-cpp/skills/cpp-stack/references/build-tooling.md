# Native build boundaries

Record compiler, standard library, architecture, runtime/CRT and ABI options,
configuration, macros, generator, dependency graph/profiles/lock and sanitizer mode.
Use target-scoped standards/warnings. `CXX_STANDARD_REQUIRED` prevents standard
decay; `cxx_std_20` requires at least that mode. Verify actual commands, extensions
and public/interface propagation. C++23 library facilities are not C++20 evidence.

Conan 2's CMakeToolchain/CMakeDeps bridge explicit host/build profiles to native
imported targets. Record recipe revisions/options and lock coverage. A lock constrains
resolution, not binary compatibility or reproducible bytes. Do not change compilers,
exceptions/RTTI or third-party warning policy incidentally.

Compilation databases contain compiler invocations, not a full include/link graph.
Multiple entries per source may be meaningful. CMake export is supported by Ninja
and Makefiles with unity-build limitations. Generate prerequisites first; stale or
wrong-build metadata leaves AST analysis incomplete. Use native dependencies and
project knowledge for header consumers; broaden to owned targets/configurations if
unknown. CMake File API dependencies are not automatically a complete link/include graph.

Use project-pinned format/tidy versions. Preserve owned-header diagnostics and do
not accept changed-line filtering as full analysis. Enumerate and execute the same
CTest selection; reject zero tests and disclose disabled/skipped cases. Inspect
sanitizer diagnostics even on exit zero. See [verification](../../../docs/verification.md).

Named C++ language modules and plugin ABI design are outside the first tested path.

References: [CMake standards](https://cmake.org/cmake/help/latest/prop_tgt/CXX_STANDARD.html),
[compile commands](https://clang.llvm.org/docs/JSONCompilationDatabase.html),
[CMake export](https://cmake.org/cmake/help/latest/variable/CMAKE_EXPORT_COMPILE_COMMANDS.html),
[File API](https://cmake.org/cmake/help/latest/manual/cmake-file-api.7.html),
[Conan profiles](https://docs.conan.io/2/reference/config_files/profiles.html),
[CMakeToolchain](https://docs.conan.io/2/reference/tools/cmake/cmaketoolchain.html),
[CMakeDeps](https://docs.conan.io/2/reference/tools/cmake/cmakedeps.html).
