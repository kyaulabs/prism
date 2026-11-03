#include "checked_value.hpp"
#include <iostream>
#include <limits>

int main() {
  if (fixture::checked_add(20, 22) != 42 ||
      fixture::checked_add(std::numeric_limits<int>::max(), 1).has_value() ||
      fixture::checked_add(std::numeric_limits<int>::min(), -1).has_value() ||
      fixture::checked_add(-10, 10) != 0) {
    std::cerr << "checked_add public value/overflow contract failed\n";
    return 1;
  }
  return 0;
}
