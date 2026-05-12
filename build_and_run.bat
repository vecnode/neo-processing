@echo off
setlocal EnableDelayedExpansion

REM Always run from the repository root (the folder this script is in).
pushd "%~dp0"

REM ---------------------------------------------------------------------------
REM Locate Visual Studio via vswhere and initialise the MSVC build environment.
REM This sets up cmake, cl.exe, and the correct Windows SDK include paths,
REM which prevents MSVC from accidentally picking up MinGW/MSYS2 headers.
REM ---------------------------------------------------------------------------
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "%VSWHERE%" (
    echo [warn] vswhere.exe not found. Trying to use cmake from current PATH.
    goto :skip_vcvars
)

for /f "usebackq delims=" %%I in (
    `"%VSWHERE%" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`
) do set "VS_INSTALL_DIR=%%I"

if not defined VS_INSTALL_DIR (
    echo [warn] No VS installation found via vswhere. Trying current PATH.
    goto :skip_vcvars
)

set "VCVARS=%VS_INSTALL_DIR%\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" (
    echo [warn] vcvars64.bat not found at: %VCVARS%
    goto :skip_vcvars
)

echo [info] Initialising MSVC environment from: %VCVARS%
REM Clear include/path vars that MinGW may have pre-populated before vcvars runs.
REM vcvars64 only prepends — it won't remove existing MinGW entries.
set "INCLUDE="
set "LIB="
set "LIBPATH="
set "CPATH="
set "C_INCLUDE_PATH="
set "CPLUS_INCLUDE_PATH="
call "%VCVARS%" >nul 2>&1

:skip_vcvars

REM Always remove stale cache so cmake always picks the correct generator/platform.
REM Also clear FetchContent sub-build caches (_deps/*-build) — they cache the
REM generator/platform independently and cause the same mismatch error.
REM The *-src directories are kept so dependencies are not re-downloaded.
if exist "build\CMakeCache.txt" del /f /q build\CMakeCache.txt
if exist "build\CMakeFiles"     rd /s /q build\CMakeFiles
if exist "build\_deps" (
    for /d %%D in (build\_deps\*-build) do (
        if exist "%%D\CMakeCache.txt" del /f /q "%%D\CMakeCache.txt"
        if exist "%%D\CMakeFiles"     rd /s /q "%%D\CMakeFiles"
    )
    for /d %%D in (build\_deps\*-subbuild) do (
        if exist "%%D\CMakeCache.txt" del /f /q "%%D\CMakeCache.txt"
        if exist "%%D\CMakeFiles"     rd /s /q "%%D\CMakeFiles"
    )
)

echo [1/3] Configuring CMake
cmake -B build -G "Visual Studio 17 2022" -A x64
if errorlevel 1 goto :error

echo [2/3] Building neo-processing (Debug)
cmake --build build --target neo-processing -j --config Debug
if errorlevel 1 goto :error

echo [3/3] Running neo-processing
if exist ".\build\neo-processing.exe" (
	".\build\neo-processing.exe"
) else if exist ".\build\Debug\neo-processing.exe" (
	".\build\Debug\neo-processing.exe"
) else (
	echo ERROR: neo-processing executable not found in .\build or .\build\Debug.
	goto :error
)
if errorlevel 1 goto :error

echo.
echo Success.
goto :end

:error
echo.
echo Build or run failed.

:end
popd
echo.
pause
