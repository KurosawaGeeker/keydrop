#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_root="$repo_root/build"
app_path="$build_root/KeyDrop.app"
binary_dir="$build_root/binaries"
dist_root="$repo_root/dist"

rm -rf "$build_root" "$dist_root"
mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources" "$binary_dir" "$dist_root"

for arch in arm64 x86_64; do
  xcrun swiftc \
    "$repo_root/Sources/KeyDrop.swift" \
    -parse-as-library \
    -target "${arch}-apple-macos13.0" \
    -o "$binary_dir/KeyDrop-${arch}" \
    -framework SwiftUI \
    -framework AppKit
done

lipo -create \
  "$binary_dir/KeyDrop-arm64" \
  "$binary_dir/KeyDrop-x86_64" \
  -output "$app_path/Contents/MacOS/KeyDrop"

cp "$repo_root/Resources/Info.plist" "$app_path/Contents/Info.plist"
codesign --force --deep --sign - "$app_path"
codesign --verify --deep --strict "$app_path"

ditto -c -k --sequesterRsrc --keepParent "$app_path" "$dist_root/KeyDrop-macOS.zip"

echo "Built: $app_path"
echo "Packaged: $dist_root/KeyDrop-macOS.zip"
