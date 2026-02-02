#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

APPIUM_VERSION="2.11.5"

if command -v appium &> /dev/null; then
    INSTALLED_VERSION=$(appium --version 2>/dev/null || echo "")
    if [ "$INSTALLED_VERSION" = "$APPIUM_VERSION" ]; then
        echo "✅ Appium $APPIUM_VERSION already installed"
    else
        echo "Updating Appium from $INSTALLED_VERSION to $APPIUM_VERSION..."
        npm install -g "appium@$APPIUM_VERSION"
    fi
else
    echo "Installing Appium..."
    npm install -g "appium@$APPIUM_VERSION"
fi

echo "✅ Appium: $(appium --version 2>/dev/null || echo "?")"

XCUITEST_VERSION="7.26.2"

if appium driver list --installed 2>&1 | grep -qi "xcuitest"; then
    appium driver uninstall xcuitest || true
fi

appium driver install xcuitest@$XCUITEST_VERSION || {
    echo "⚠️ Driver install failed"
    exit 1
}

if ! appium driver list --installed 2>&1 | grep -qi "xcuitest"; then
    echo "❌ XCUITest driver not installed"
    exit 1
fi
echo "✅ Appium + XCUITest ready"
