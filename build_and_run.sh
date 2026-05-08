#!/usr/bin/env bash
set -euo pipefail

# Always run from the repository root (the folder this script is in).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/3] Configuring CMake"
cmake -B build

echo "[2/3] Building neo-processing (Debug)"
cmake --build build --target neo-processing -j --config Debug

echo "[3/3] Running neo-processing"
if [[ -x "./build/neo-processing" ]]; then
	./build/neo-processing
elif [[ -x "./build/Debug/neo-processing" ]]; then
	./build/Debug/neo-processing
else
	echo "ERROR: neo-processing executable not found in ./build or ./build/Debug."
	exit 1
fi

echo
echo "Success."
