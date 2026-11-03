# Strong types and conversions

`using UserId = uint32_t` and `using AssetId = uint32_t` are the same type. Use
distinct wrappers with explicit construction when accidental interchange is a
real risk. Test forbidden conversions at compile time and valid behavior at runtime.
Do not add arithmetic merely because the representation is numeric.

Separate stable IDs from generational handles. Define invalid values, index bounds,
generation comparison, reuse and generation exhaustion/wraparound. A generation
check is not a memory-lifetime guarantee without synchronized access to the table.

Units need explicit conversion, range and rounding rules; coordinate spaces may
also be distinct. Check narrowing, signed/unsigned mixing, multiplication/addition
overflow and serialization boundaries before performing operations. Avoid signed
intermediate overflow even when the final result would fit. Define policy for NaN,
infinity and precision loss when floating values cross a domain boundary.

Test boundaries and invalid external values through the public interface; do not
assume an explicit constructor validates its argument. Keep project ID formats,
physical units and wire representations in project policy.

Reference: [C++ Core Guidelines: interfaces](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-interfaces).
