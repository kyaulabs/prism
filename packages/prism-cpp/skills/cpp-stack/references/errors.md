# Error boundaries

Use the project's adequate C++20 value/error abstraction for expected failure.
`std::expected` is C++23, not a portable C++20 choice. Do not silently bump the
standard or add a new dependency to obtain it. An optional value alone cannot
explain failure when callers need an error category or recovery action.

Define recoverable failures, invariant violations, error ownership and partial
side effects. Do not ignore results or translate all errors into success-shaped
empty values. Preserve useful context without leaking secrets.

Exceptions and RTTI are project-owned policies. Review dependency compatibility,
thread entry points, callbacks and C ABI boundaries; contain exceptions where the
contract prohibits escape. `noexcept` does not prove failure impossible: an escaping
exception terminates. Allocation, logging and user callbacks can throw too.

Review cleanup and state after failure, move guarantees and destructor behavior.
Test rejected input, exhaustion and relevant dependency failure at public boundaries.
A compiler-clean error path can still violate transactional or retry semantics.

References: [libc++ C++23 status](https://libcxx.llvm.org/Status/Cxx23.html),
[C++ Core Guidelines: errors](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-errors).
