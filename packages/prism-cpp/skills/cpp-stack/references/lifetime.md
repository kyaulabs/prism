# Ownership and lifetime

Identify the resource owner, borrowers, transfer points and retirement condition.
Use RAII for files, memory, locks and native handles; prefer unique ownership until
shared ownership is required. A shared_ptr does not synchronize mutable state.

A pointer, reference, span or string_view borrows storage. Check owner lifetime,
container reallocation/erase, temporary destruction, move operations and callbacks
that retain views. A returned view into a local string dangles even if it compiles.
Document moved-from invariants and avoid using invalidated iterators/references.

Async work must not outlive captured state. Capturing `this` is borrowing; a
cancellation request is not completion. Define join/drain ordering, callback
unregistration and resource retirement before destruction. Avoid cycles in shared
ownership and weak_ptr check/use races with external state.

Review constructor failure cleanup, custom deleter correctness, destruction order
and thread-affine cleanup. Test the relevant shutdown/error paths. ASan observes
exercised memory errors; it does not prove all lifetime contracts.

Reference: [C++ Core Guidelines: resource management](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-resource).
