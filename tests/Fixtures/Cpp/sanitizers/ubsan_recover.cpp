#include <limits>
int main() {
  volatile int value = std::numeric_limits<int>::max();
  volatile int overflow = value + 1;
  (void)overflow;
  return 0;
}
