#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

bash scripts/ios/ensure-appium.sh
bash scripts/ios/setup-app.sh
bash scripts/ios/boot-sim.sh

echo "=== Run iOS tests ==="
npx wdio run wdio.ios.conf.js "$@"
