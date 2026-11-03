#pragma once
#include <optional>

namespace fixture {
// Expected failure is a value; addition is checked before signed arithmetic.
std::optional<int> checked_add(int left, int right);
} // namespace fixture
