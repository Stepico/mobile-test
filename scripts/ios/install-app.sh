#!/bin/bash
set -euo pipefail

UDID="${1:-}"
APP_PATH="${2:-./ios-app/DiiaOpenSource.app}"

if [ -z "$UDID" ]; then
  echo "❌ ERROR: UDID not provided"
  echo "Usage: install-app.sh <UDID> [APP_PATH]"
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "❌ App bundle not found: $APP_PATH"
  exit 1
fi

echo "=== Install iOS App ==="

echo "Step 1: Verify simulator..."

DEVICE_INFO=$(xcrun simctl list devices | grep "$UDID" || echo "")
if [ -z "$DEVICE_INFO" ]; then
  echo "❌ Simulator with UDID $UDID not found"
  echo ""
  echo "Available simulators:"
  xcrun simctl list devices | grep "iPhone" | head -10
  exit 1
fi

if ! echo "$DEVICE_INFO" | grep -q "Booted"; then
  echo "⚠️  Simulator not Booted"
  echo "Attempting to start..."
  xcrun simctl boot "$UDID" || {
    echo "❌ Failed to start simulator"
    exit 1
  }
  sleep 3
fi

echo "Step 2: Install app..."

MAX_RETRIES=3
RETRY_DELAY=2

for attempt in $(seq 1 $MAX_RETRIES); do
  if xcrun simctl install "$UDID" "$APP_PATH" 2>&1; then
    echo "✅ App installed on simulator"
    break
  else
    if [ $attempt -eq $MAX_RETRIES ]; then
      echo "❌ Failed to install app after $MAX_RETRIES attempts"
      exit 1
    fi
    
    sleep $RETRY_DELAY
  fi
done

echo "Step 3: Verify..."

sleep 5

BUNDLE_ID=$(defaults read "$APP_PATH/Info.plist" CFBundleIdentifier 2>/dev/null || echo "")

if [ -z "$BUNDLE_ID" ]; then
  echo "⚠️  Failed to get Bundle ID from app"
else
  echo "Bundle ID: $BUNDLE_ID"

  if ! xcrun simctl listapps "$UDID" | grep -q "$BUNDLE_ID"; then
    echo "⚠️ App not found in listapps"
  fi
fi
echo "✅ Install complete"
