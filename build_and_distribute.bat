@echo off
setlocal EnableDelayedExpansion

REM ---------------------------------------------------------------------------
REM Builds neo-processing in Release and copies the resulting Release folder
REM (executable + icons + any runtime DLLs) to the current user's Desktop.
REM ---------------------------------------------------------------------------

pushd "%~dp0"

REM ---------------------------------------------------------------------------
REM Locate Visual Studio via vswhere and initialise the MSVC build environment
REM (same approach as build_and_run.bat), so cmake/cl/the Windows SDK resolve
REM correctly and MSVC does not pick up MinGW/MSYS2 headers.
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
set "INCLUDE="
set "LIB="
set "LIBPATH="
set "CPATH="
set "C_INCLUDE_PATH="
set "CPLUS_INCLUDE_PATH="
call "%VCVARS%" >nul 2>&1

:skip_vcvars

REM Remove stale cache so cmake always picks the correct generator/platform.
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

echo [2/3] Building neo-processing (Release)
cmake --build build --target neo-processing -j --config Release
if errorlevel 1 goto :error

REM Locate the Release output directory (Visual Studio generator -> build\Release).
set "RELEASE_DIR=build\Release"
if not exist "%RELEASE_DIR%\neo-processing.exe" (
    if exist "build\neo-processing.exe" set "RELEASE_DIR=build"
)
if not exist "%RELEASE_DIR%\neo-processing.exe" (
    echo ERROR: Release executable not found in build\Release or build.
    goto :error
)

set "DEST=%USERPROFILE%\Desktop\neo-processing"
echo [3/3] Copying "%RELEASE_DIR%" to "%DEST%"
if exist "%DEST%" rd /s /q "%DEST%"
robocopy "%RELEASE_DIR%" "%DEST%" /E /NFL /NDL /NJH /NJS /NC /NS >nul
REM robocopy returns 0-7 on success; 8+ indicates a real failure.
if errorlevel 8 goto :error

echo.
echo Success. Distributable copied to: %DEST%
goto :end

:error
echo.
echo Build or distribute failed.

:end
popd
echo.
pause
