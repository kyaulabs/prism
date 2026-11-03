#include <catch2/catch_test_macros.hpp>
#include <string>
TEST_CASE("public string value survives a copy and mutation") {
  const std::string original = "cpu";
  auto copy = original;
  copy += " fixture";
  REQUIRE(original == "cpu");
  REQUIRE(copy == "cpu fixture");
}
