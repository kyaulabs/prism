#include <cstdint>
#include <functional>
#include <vector>

using UserId = std::uint32_t;
using AssetId = std::uint32_t;

std::function<int()> borrowed_callback() {
  int state = 42;
  return [&state] { return state; };
}

void accept_user(UserId) {}
void swapped_id(AssetId asset) { accept_user(asset); }

void assumed_bounded(std::vector<int> &values) {
  values.reserve(8);
  for (int i = 0; i < 9; ++i) {
    values.push_back(i);
  }
}
