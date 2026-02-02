#!/bin/bash
set -euo pipefail

BOOTED_DEVICE=$(xcrun simctl list devices | grep "Booted" || true)

if [ -z "$BOOTED_DEVICE" ]; then
  echo "❌ Simulator not Booted"
  xcrun simctl list devices
  exit 1
fi

echo "✅ Simulator: $BOOTED_DEVICE"
