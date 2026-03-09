cmake_minimum_required(VERSION 3.13)
project(controller)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find packages from React Native
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

# Pre-built Rust library - use IMPORTED and set SONAME explicitly
add_library(controller_uniffi SHARED IMPORTED)
set_target_properties(controller_uniffi PROPERTIES
    IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libcontroller_uniffi.so
    IMPORTED_SONAME "libcontroller_uniffi.so"
)

# Define the shared library for the JNI adapter
add_library(${CMAKE_PROJECT_NAME} SHARED
    cpp-adapter.cpp
    ../cpp/controller.cpp
    ../cpp/generated/controller.cpp
)

# Include directories from the module
target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE
    ../cpp
    ../cpp/generated
    ../cpp/includes
)

# Link libraries
target_link_libraries(${CMAKE_PROJECT_NAME}
    controller_uniffi
    ReactAndroid::jsi
    ReactAndroid::reactnative
    fbjni::fbjni
    android
    log
)
