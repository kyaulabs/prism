#include "checked_value.hpp"
#include "generated.hpp"
#include <limits>

std::optional<int> fixture::checked_add(int left, int right) {
  if ((right > 0 && left > std::numeric_limits<int>::max() - right) ||
      (right < 0 && left < std::numeric_limits<int>::min() - right)) {
    return std::nullopt;
  }
  return left + right;
}
