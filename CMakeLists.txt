cmake_minimum_required(VERSION 3.20)
project(webview-boost-app VERSION 0.1.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)

# ---------------------------------------------------------------------------
# Windows + MSVC: detect MinGW/MSYS2 header contamination early.
# If msys64 or mingw paths leak into the compiler's include search order,
# MSVC will pull MinGW-specific headers (corecrt.h, winnt.h) and fail.
# ---------------------------------------------------------------------------
if(WIN32 AND MSVC)
    set(_mingw_patterns "msys64" "msys2" "mingw64" "mingw32")
    set(_env_vars "INCLUDE" "CPATH" "C_INCLUDE_PATH" "CPLUS_INCLUDE_PATH")
    foreach(_var ${_env_vars})
        if(DEFINED ENV{${_var}})
            foreach(_pat ${_mingw_patterns})
                string(TOLOWER "$ENV{${_var}}" _val_lower)
                if(_val_lower MATCHES "${_pat}")
                    message(WARNING
                        "[neo-processing] Possible MinGW/MSYS2 header conflict detected!\n"
                        "  Environment variable ${_var} contains '${_pat}' paths.\n"
                        "  MSVC may pick up MinGW headers instead of Windows SDK headers.\n"
                        "  Fix: launch cmake from a plain Developer Command Prompt for VS,\n"
                        "  or temporarily remove MinGW/MSYS2 entries from ${_var}.")
                endif()
            endforeach()
        endif()
    endforeach()
    # Also check PATH for mingw bin dirs leaking include side-effects
    string(TOLOWER "$ENV{PATH}" _path_lower)
    foreach(_pat ${_mingw_patterns})
        if(_path_lower MATCHES "${_pat}")
            message(STATUS
                "[neo-processing] Note: PATH contains '${_pat}'. "
                "If you see corecrt.h / winnt.h errors, remove MinGW/MSYS2 from PATH "
                "and re-run cmake from a VS Developer Command Prompt.")
        endif()
    endforeach()
endif()

include(FetchContent)
if(POLICY CMP0135)
    cmake_policy(SET CMP0135 NEW)
endif()

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

if(WIN32)
    # Embeds icons/app_icon.ico as the PE resource icon, so Explorer/taskbar
    # show it as neo-processing.exe's own file icon (independent of the
    # runtime window icon main.cpp loads from icons/*.ico at startup).
    set(APP_ICON_RESOURCE ${CMAKE_CURRENT_SOURCE_DIR}/icons/app.rc)
endif()

add_executable(neo-processing src/main.cpp ${APP_ICON_RESOURCE})

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
    # ShellExecuteW, used to open the GitHub link in the user's default
    # browser (never navigate the app's own webview to an external site).
    target_link_libraries(neo-processing PRIVATE Shell32)
endif()

if(WIN32)
    # Build as a GUI app (Windows subsystem) so no console window pops up when
    # the executable is launched. Keep the standard int main() entry point by
    # pointing the linker at the CRT's main startup (MSVC); MinGW's -mwindows
    # (added by WIN32_EXECUTABLE) already wraps main().
    set_target_properties(neo-processing PROPERTIES WIN32_EXECUTABLE TRUE)
    if(MSVC)
        target_link_options(neo-processing PRIVATE /ENTRY:mainCRTStartup)
    endif()
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
