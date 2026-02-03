#!/bin/bash
set -euo pipefail

APP_PATH="${1:-./ios-app/DiiaOpenSource.app}"

if [ ! -d "$APP_PATH" ]; then
  echo "❌ App not found: $APP_PATH"
  [ -f "./ios-build/xcodebuild.log" ] && tail -50 ./ios-build/xcodebuild.log
  exit 1
fi

BUNDLE_ID=$(defaults read "$APP_PATH/Info.plist" CFBundleIdentifier 2>/dev/null || echo "unknown")
APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "app_size=$APP_SIZE" >> "$GITHUB_OUTPUT"
  echo "bundle_id=$BUNDLE_ID" >> "$GITHUB_OUTPUT"
fi

if [ -f "$APP_PATH/Info.plist" ]; then
  plutil -convert xml1 "$APP_PATH/Info.plist" -o /tmp/Info.plist.xml
  if grep -qi "api2oss\.diia\.gov\.ua" /tmp/Info.plist.xml; then
    echo "❌ api2oss found in Info.plist"
    exit 1
  fi
fi

APP_BINARY="$APP_PATH/DiiaOpenSource"

if [ ! -f "$APP_BINARY" ]; then
  echo "❌ Binary not found: $APP_BINARY"
  exit 1
fi

if strings "$APP_BINARY" | grep -qi "api2oss\.diia\.gov\.ua"; then
  echo "❌ api2oss found in binary"
  exit 1
fi

API2S_FOUND=0
strings "$APP_BINARY" | grep -qi "api2s\.diia\.gov\.ua" && API2S_FOUND=1
strings "$APP_BINARY" | grep -qi "api2s" && strings "$APP_BINARY" | grep -qi "diia" && API2S_FOUND=1

if [ "$API2S_FOUND" -eq 0 ]; then
  if grep -q "api2s\.diia\.gov\.ua" /tmp/Info.plist.xml 2>/dev/null; then
    :
  else
    echo "❌ api2s not found in binary or Info.plist"
    exit 1
  fi
fi

echo "✅ Verify app bundle OK (bundle: $BUNDLE_ID, size: $APP_SIZE)"
