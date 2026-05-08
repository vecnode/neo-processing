@echo off
setlocal

REM Always run from the repository root (the folder this script is in).
pushd "%~dp0"

echo [1/3] Configuring CMake
cmake -B build
if errorlevel 1 goto :error

echo [2/3] Building neo-processing (Debug)
cmake --build build --target neo-processing -j --config Debug
if errorlevel 1 goto :error

echo [3/3] Running neo-processing
if not exist ".\build\Debug\neo-processing.exe" (
	echo ERROR: .\build\Debug\neo-processing.exe not found.
	goto :error
)

".\build\Debug\neo-processing.exe"
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
