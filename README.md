# webview-boost-app

Desktop app with `webview`, local HTTP server, and embedded static assets.

## Reproduce

```sh
# Windows:
cmake -B build

cmake --build build --target neo-processing -j --config Debug
.\build\Debug\neo-processing.exe

cmake --build build --target neo-processing -j --config Release
.\build\Release\neo-processing.exe

# Windows helper script:
.\build_and_run.bat

# Linux:
cmake -B build

cmake --build build --target neo-processing -j --config Debug
./build/neo-processing

cmake --build build --target neo-processing -j --config Release
./build/neo-processing

# Linux helper script (same flow):
./build_and_run.sh
```


## Dependencies

Build/runtime prerequisites:

- CMake 3.20+
- C++20 compiler
	- Windows: Visual Studio 2022 Build Tools (MSVC)
	- Linux: GCC or Clang with C++20 support
- Git (required because CMake `FetchContent` downloads several dependencies from Git repositories)
- Internet access during initial configure/build (to download dependencies)
- Windows runtime:
	- Microsoft Edge WebView2 Runtime
- Linux runtime/build libs (webview GTK backend):
	- GTK 3 development files
	- WebKit2GTK development files

Downloaded automatically at configure/build time (`FetchContent`):

- `yhirose/cpp-httplib`
	- https://github.com/yhirose/cpp-httplib
- `webview/webview`
	- https://github.com/webview/webview
- `yhirose/cpp-embedlib`
	- https://github.com/yhirose/cpp-embedlib

Notes:

- These dependencies are fetched into the CMake build tree (`build/_deps/`) and are not committed to this repository.
- Frontend files in `public/` are embedded into the executable with `cpp-embedlib` and served through the app's local HTTP server.

