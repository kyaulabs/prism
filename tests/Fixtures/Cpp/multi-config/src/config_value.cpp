#include <iostream>
int main() {
#ifdef RELEASE_VARIANT
  std::cerr << "Release variant contract defect\n";
  return 1;
#else
  return 0;
#endif
}
