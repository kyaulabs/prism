# Concurrency and shutdown

Name each mutable state's owner, synchronization rule and ownership-transfer point.
Prefer clear scoped synchronization to clever lock-free code without a requirement.
Atomics need an explicit ordering/lifetime argument; atomic pointers do not retain
pointees. Shared ownership does not protect concurrent mutation.

Define work/queue capacity, backpressure or rejection, worker budget, cancellation
and shutdown. A stop request is cooperative; establish when work has completed and
borrowed captures are safe to destroy. Consider callbacks during teardown, lock
ordering, blocking while holding locks, reentrancy and error propagation from workers.

Use controlled public-behavior tests for cancellation, exhaustion and shutdown when
relevant. Avoid sleep-only tests that merely hope an interleaving occurs. Keep a
separate TSan build from ASan and record the supported runtime/platform, instrumentation
boundaries and workloads exercised.

TSan can detect races in observed executions. It does not prove all interleavings,
deadlock freedom, fairness, deterministic scheduling or bounded latency. Windows is
not a claimed TSan lane here. Project scheduler architecture and budgets remain local.

Reference: [Clang ThreadSanitizer](https://clang.llvm.org/docs/ThreadSanitizer.html).
