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
