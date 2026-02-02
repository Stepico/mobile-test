#!/bin/bash
set -e

TARGET_APP_DIR="./ios-app"
TARGET_APP_PATH="$TARGET_APP_DIR/DiiaOpenSource.app"

if [ -d "$TARGET_APP_PATH" ]; then
    echo "✅ App already present: $TARGET_APP_PATH"
    exit 0
fi

if [ -z "$CI" ] && [ -n "$IOS_SOURCE_APP_PATH" ] && [ -d "$IOS_SOURCE_APP_PATH" ]; then
    mkdir -p "$TARGET_APP_DIR"
    rm -rf "$TARGET_APP_PATH"
    ln -s "$IOS_SOURCE_APP_PATH" "$TARGET_APP_PATH"
    echo "✅ App: $TARGET_APP_PATH (symlink)"
    exit 0
fi

echo "❌ iOS app not found"
if [ -n "$CI" ]; then
    exit 0
fi
echo "Set IOS_SOURCE_APP_PATH or run scripts/ios/build-app.sh"
exit 1
