#!/bin/bash
set -euo pipefail

echo "=== Перевірка та встановлення Appium + XCUITest driver ==="

# Перехід до root директорії проекту
cd "$(dirname "$0")/../.."

# Виводимо версії Node.js та npm
echo "Node.js версія: $(node -v)"
echo "npm версія: $(npm -v)"

# Встановлюємо глобально Appium з детерміністичною версією
APPIUM_VERSION="3.1.2"
echo "Встановлюємо Appium глобально версія $APPIUM_VERSION..."

# Перевіряємо чи вже встановлено правильну версію
if command -v appium &> /dev/null; then
    INSTALLED_VERSION=$(appium --version 2>/dev/null || echo "")
    if [ "$INSTALLED_VERSION" = "$APPIUM_VERSION" ]; then
        echo "✅ Appium $APPIUM_VERSION вже встановлено"
    else
        echo "Оновлюємо Appium з $INSTALLED_VERSION до $APPIUM_VERSION..."
        npm install -g "appium@$APPIUM_VERSION"
    fi
else
    echo "Встановлюємо Appium..."
    npm install -g "appium@$APPIUM_VERSION"
fi

# Перевіряємо встановлення
APPIUM_VERSION_INSTALLED=$(appium --version 2>/dev/null || echo "невідомо")
echo "✅ Appium встановлено: $APPIUM_VERSION_INSTALLED"

# Встановлюємо/оновлюємо XCUITest driver
echo "Встановлюємо/оновлюємо XCUITest driver..."
# Спочатку перевіряємо чи вже встановлено
if appium driver list --installed 2>&1 | grep -qi "xcuitest"; then
    echo "XCUITest driver вже встановлено, оновлюємо..."
    appium driver update xcuitest || {
        echo "⚠️ Помилка оновлення driver, переmstановлюємо..."
        appium driver uninstall xcuitest
        appium driver install xcuitest
    }
else
    echo "XCUITest driver не встановлено, встановлюємо..."
    appium driver install xcuitest || {
        echo "⚠️ Помилка встановлення driver"
        exit 1
    }
fi

# Перевіряємо встановлені drivers
echo ""
echo "Встановлені Appium drivers:"
appium driver list --installed || echo "Не вдалося отримати список drivers"

# Перевіряємо чи xcuitest driver встановлено (вивід йде в stderr, тому 2>&1)
if appium driver list --installed 2>&1 | grep -qi "xcuitest"; then
    echo "✅ XCUITest driver встановлено"
else
    echo "❌ XCUITest driver не знайдено після встановлення"
    exit 1
fi

echo "✅ Appium та XCUITest driver готові до роботи"
