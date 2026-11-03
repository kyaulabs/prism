int main() {
  auto *value = new int(42);
  delete value;
  volatile int observed = *value;
  (void)observed;
  return 0;
}
