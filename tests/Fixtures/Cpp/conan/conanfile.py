from conan import ConanFile
from conan.tools.cmake import cmake_layout


class DependencyFixture(ConanFile):
    settings = "os", "compiler", "build_type", "arch"
    generators = "CMakeToolchain", "CMakeDeps"
    requires = "catch2/3.8.1"

    def layout(self):
        cmake_layout(self)
