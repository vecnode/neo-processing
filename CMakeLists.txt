cmake_minimum_required(VERSION 3.20)
project(webview-boost-app CXX)
set(CMAKE_CXX_STANDARD 20)

include(FetchContent)

# Lightweight HTTP server.
FetchContent_Declare(httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib
    GIT_TAG        master
)
FetchContent_MakeAvailable(httplib)

# Native desktop webview window.
FetchContent_Declare(webview
    GIT_REPOSITORY https://github.com/webview/webview
    GIT_TAG        master
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(webview)

# Boost — fetched as the official CMake-aware source tarball.
# Only the listed component libraries are configured/built; everything else is skipped.
set(BOOST_INCLUDE_LIBRARIES asio system)
set(BOOST_ENABLE_CMAKE ON)
FetchContent_Declare(Boost
    URL https://github.com/boostorg/boost/releases/download/boost-1.87.0/boost-1.87.0-cmake.tar.gz
)
FetchContent_MakeAvailable(Boost)

# Embed static frontend files into the binary.
FetchContent_Declare(cpp-embedlib
    GIT_REPOSITORY https://github.com/yhirose/cpp-embedlib
    GIT_TAG        main
)
FetchContent_MakeAvailable(cpp-embedlib)

cpp_embedlib_add(WebAssets
    FOLDER    ${CMAKE_CURRENT_SOURCE_DIR}/public
    NAMESPACE Web
)

add_executable(neo-processing src/main.cpp)

target_link_libraries(neo-processing PRIVATE
    httplib::httplib
    webview::core
    WebAssets
    cpp-embedlib-httplib
    Boost::asio
    Boost::system
)

if(APPLE)
    target_link_libraries(neo-processing PRIVATE
        "-framework CoreFoundation"
        "-framework Security"
    )
endif()

if(WIN32)
    add_custom_command(TARGET neo-processing POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory
            $<TARGET_FILE_DIR:neo-processing>/../bin/$<CONFIG>
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            $<TARGET_FILE_DIR:neo-processing>/../bin/$<CONFIG>
            $<TARGET_FILE_DIR:neo-processing>
        COMMAND ${CMAKE_COMMAND} -E make_directory
            $<TARGET_FILE_DIR:neo-processing>/icons
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            ${CMAKE_CURRENT_SOURCE_DIR}/icons/app_icon_small.ico
            $<TARGET_FILE_DIR:neo-processing>/icons/app_icon_small.ico
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            ${CMAKE_CURRENT_SOURCE_DIR}/icons/app_icon.ico
            $<TARGET_FILE_DIR:neo-processing>/icons/app_icon.ico
        COMMENT "Copying runtime files to executable directory"
    )
endif()
