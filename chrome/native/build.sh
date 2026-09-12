#!/bin/bash
set -euo pipefail
NATIVE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$NATIVE_DIR/../.." && pwd)"
mkdir -p "$NATIVE_DIR/build"
xcrun swiftc -O "$NATIVE_DIR/ClipboardCore.swift" "$NATIVE_DIR/NativeHost.swift" "$REPO_DIR/Sources/KeyCache.swift" "$REPO_DIR/Sources/KeyPayload.swift" -o "$NATIVE_DIR/build/keydrop-bridge"
codesign --force --sign - "$NATIVE_DIR/build/keydrop-bridge"
codesign --verify --strict "$NATIVE_DIR/build/keydrop-bridge"
