#!/bin/bash
set -euo pipefail
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$TEST_DIR/.."
mkdir -p native/build
xcrun swiftc -D TESTING -O native/ClipboardCore.swift native/NativeHost.swift ../Sources/KeyCache.swift ../Sources/KeyPayload.swift -o native/build/keydrop-bridge-test
xcrun swiftc tests/probe.swift -o native/build/probe
xcrun swiftc tests/ClipboardGuard.swift -o native/build/clipboard-guard
xcrun swiftc tests/NativeTests.swift native/ClipboardCore.swift ../Sources/KeyCache.swift ../Sources/KeyPayload.swift -o native/build/native-tests
native/build/native-tests
node --test tests/protocol.test.js
npm test
npm run test:browser
