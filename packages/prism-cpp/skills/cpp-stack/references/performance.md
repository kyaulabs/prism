# Capacity, allocation and measurement

Identify a real budget and workload before optimizing. Separate initialization and
warmup from constrained paths. Name capacity, maximum work, overflow/exhaustion
behavior and how allocation is measured. `vector::reserve` does not prevent later
growth. A memory resource needs an explicit upstream and exhaustion policy; it does
not establish zero allocation on its own. Do not ban standard-library facilities
where they fit the measured contract.

Test capacity boundaries and failure handling independently of timing. Count
allocations over the relevant workload if allocation is a requirement; a microbenchmark
that never hits exhaustion does not validate the policy.

Measure optimized native builds separately from sanitizer runs. Record source,
compiler/options, hardware, workload, warmup, sample method, distribution/tail metrics
and baseline. Benchmark results apply to those conditions, not every device or
production workload. Google Benchmark is a measurement library, not an alternative
name for the Catch2/GoogleTest behavior-test framework.

Profiling can guide a change; it cannot prove correctness. Hardware/GPU behavior and
engine frame budgets require project-owned experiments, not reusable package defaults.

Reference: [C++ Core Guidelines: performance](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-performance).
