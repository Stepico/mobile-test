#!/bin/bash
set -euo pipefail

# ============================================================================
# Install iOS App on Simulator
# ============================================================================
# Встановлює iOS app на запущений simulator з retry логікою
# 
# Параметри:
#   $1 - UDID simulator (обов'язковий)
#   $2 - App path (опціонально, за замовчуванням ./ios-app/DiiaOpenSource.app)
#
# Вихід: 0 якщо success, 1 якщо failed після retries
# ============================================================================

UDID="${1:-}"
APP_PATH="${2:-./ios-app/DiiaOpenSource.app}"

if [ -z "$UDID" ]; then
  echo "❌ ПОМИЛКА: UDID не вказано"
  echo "Usage: install-app.sh <UDID> [APP_PATH]"
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "❌ App bundle не знайдено: $APP_PATH"
  exit 1
fi

echo "=== Встановлення iOS App на Simulator ==="
echo "Simulator UDID: $UDID"
echo "App Path: $APP_PATH"
echo ""

# ============================================================================
# КРОК 1: Перевірка стану simulator
# ============================================================================
echo "КРОК 1: Перевірка стану simulator..."

DEVICE_INFO=$(xcrun simctl list devices | grep "$UDID" || echo "")
if [ -z "$DEVICE_INFO" ]; then
  echo "❌ Simulator з UDID $UDID не знайдено"
  echo ""
  echo "Доступні simulators:"
  xcrun simctl list devices | grep "iPhone" | head -10
  exit 1
fi

echo "Simulator знайдено:"
echo "$DEVICE_INFO"

if ! echo "$DEVICE_INFO" | grep -q "Booted"; then
  echo "⚠️  Simulator не в статусі Booted"
  echo "Намагаємось запустити..."
  xcrun simctl boot "$UDID" || {
    echo "❌ Не вдалось запустити simulator"
    exit 1
  }
  sleep 3
fi

echo "✅ Simulator готовий (Booted)"
echo ""

# ============================================================================
# КРОК 2: Встановлення app (з retry)
# ============================================================================
echo "КРОК 2: Встановлення app на simulator..."

MAX_RETRIES=3
RETRY_DELAY=2

for attempt in $(seq 1 $MAX_RETRIES); do
  echo "Спроба $attempt/$MAX_RETRIES..."
  
  if xcrun simctl install "$UDID" "$APP_PATH" 2>&1; then
    echo "✅ App встановлено на simulator"
    break
  else
    if [ $attempt -eq $MAX_RETRIES ]; then
      echo "❌ Не вдалось встановити app після $MAX_RETRIES спроб"
      exit 1
    fi
    
    echo "⚠️  Спроба $attempt не вдалась, чекаємо ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
  fi
done

echo ""

# ============================================================================
# КРОК 3: Верифікація встановлення
# ============================================================================
echo "КРОК 3: Верифікація встановлення..."

# Даємо час simulator обробити встановлення
sleep 5

# Отримуємо Bundle ID з app
BUNDLE_ID=$(defaults read "$APP_PATH/Info.plist" CFBundleIdentifier 2>/dev/null || echo "")

if [ -z "$BUNDLE_ID" ]; then
  echo "⚠️  Не вдалось отримати Bundle ID з app"
else
  echo "Bundle ID: $BUNDLE_ID"
  
  # Перевіряємо що app встановлено
  if xcrun simctl listapps "$UDID" | grep -q "$BUNDLE_ID"; then
    echo "✅ App успішно встановлено та підтверджено"
  else
    echo "⚠️  App може бути не встановлено правильно"
    echo ""
    echo "Список apps на simulator:"
    xcrun simctl listapps "$UDID" | grep -i diia || echo "Diia apps не знайдено"
  fi
fi

echo ""
echo "=== ✅ Встановлення завершено ==="
