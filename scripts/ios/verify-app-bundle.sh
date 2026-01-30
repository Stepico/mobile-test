#!/bin/bash
set -euo pipefail

# ============================================================================
# Verify iOS App Bundle
# ============================================================================
# Перевіряє зібраний iOS app bundle:
# 1. Існування app bundle
# 2. Bundle ID та розмір
# 3. КРИТИЧНО: API URL в binary (має бути тільки api2s, NO api2oss)
#
# Вихід: 0 якщо OK, 1 якщо критичні помилки
# Outputs: app_size, bundle_id (для GITHUB_OUTPUT)
# ============================================================================

APP_PATH="${1:-./ios-app/DiiaOpenSource.app}"

echo "=== Верифікація iOS App Bundle ==="
echo "App Path: $APP_PATH"
echo ""

# ============================================================================
# КРОК 1: Перевірка існування app bundle
# ============================================================================
if [ ! -d "$APP_PATH" ]; then
  echo "❌ App bundle не знайдено в $APP_PATH"
  echo ""
  echo "=== Діагностика ==="
  echo "Структура ios-app директорії:"
  ls -la ./ios-app/ 2>/dev/null || echo "Директорія ios-app не існує"
  echo ""
  echo "Останні 100 рядків build логу:"
  if [ -f "./ios-build/xcodebuild.log" ]; then
    tail -100 ./ios-build/xcodebuild.log
  else
    echo "Build лог не знайдено"
  fi
  exit 1
fi

echo "✅ App bundle знайдено: $APP_PATH"
echo ""

# ============================================================================
# КРОК 2: Інформація про app bundle
# ============================================================================
echo "=== Інформація про app bundle ==="
ls -lh "$APP_PATH"
echo ""

# Bundle ID
BUNDLE_ID=$(defaults read "$APP_PATH/Info.plist" CFBundleIdentifier 2>/dev/null || echo "невідомо")
echo "Bundle ID: $BUNDLE_ID"

# Розмір
APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
echo "Розмір: $APP_SIZE"
echo ""

# Зберігаємо для GITHUB_OUTPUT якщо потрібно
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "app_size=$APP_SIZE" >> "$GITHUB_OUTPUT"
  echo "bundle_id=$BUNDLE_ID" >> "$GITHUB_OUTPUT"
fi

# ============================================================================
# КРОК 3: КРИТИЧНА ВЕРИФІКАЦІЯ - API URL в Info.plist
# ============================================================================
echo "=== ✅ КРИТИЧНО: Перевірка API URL ==="
echo ""

if [ -f "$APP_PATH/Info.plist" ]; then
  echo "📄 Info.plist:"
  # Конвертуємо в XML для читабельності
  plutil -convert xml1 "$APP_PATH/Info.plist" -o /tmp/Info.plist.xml
  
  # Шукаємо будь-які API URLs
  if grep -i "api.*diia.*gov" /tmp/Info.plist.xml; then
    echo "✅ Знайдено API URL в Info.plist"
  else
    echo "⚠️  API URL не знайдено в Info.plist (можливо нормально)"
  fi
  
  # Перевіряємо старий URL (має бути відсутній)
  if grep -i "api2oss\.diia\.gov\.ua" /tmp/Info.plist.xml; then
    echo ""
    echo "❌ КРИТИЧНА ПОМИЛКА: Знайдено СТАРИЙ URL api2oss в Info.plist!"
    echo "Патч НЕ СПРАЦЮВАВ для Info.plist"
    echo "App НЕ МОЖНА використовувати для тестів!"
    exit 1
  fi
  
  # Перевіряємо новий URL (має бути присутній)
  if grep -i "api2s\.diia\.gov\.ua" /tmp/Info.plist.xml; then
    echo "✅ Знайдено НОВИЙ URL api2s в Info.plist"
  else
    echo "⚠️  Новий URL api2s не знайдено в Info.plist"
  fi
  
  echo ""
fi

# ============================================================================
# КРОК 4: КРИТИЧНА ВЕРИФІКАЦІЯ - API URL в app binary
# ============================================================================
echo "🔍 Перевірка API URL в app binary (КРИТИЧНО для BankID)..."
APP_BINARY="$APP_PATH/DiiaOpenSource"

if [ ! -f "$APP_BINARY" ]; then
  echo "❌ App binary не знайдено: $APP_BINARY"
  exit 1
fi

# Перевірка СТАРОГО URL (має бути відсутній)
echo ""
echo "Старий URL (api2oss):"
if strings "$APP_BINARY" | grep -i "api2oss\.diia\.gov\.ua" | head -3; then
  echo ""
  echo "❌ КРИТИЧНА ПОМИЛКА: СТАРИЙ URL знайдено в binary!"
  echo ""
  echo "Це означає що:"
  echo "  1. SPM dependencies не пропатчені"
  echo "  2. Або app зібрався з cache з старим конфігом"
  echo ""
  echo "НАСЛІДОК: BankID авторизація НЕ ПРАЦЮВАТИМЕ!"
  echo "App спробує звернутись до api2oss.diia.gov.ua (404 error)"
  echo ""
  echo "РІШЕННЯ:"
  echo "  - Перевірте що 'patch-spm-dependencies.sh' запустився перед build"
  echo "  - Перевірте що build cache очищено"
  echo "  - Перевірте логи SPM patch кроку"
  exit 1
else
  echo "✅ Старий URL НЕ знайдено в binary"
fi

# Перевірка НОВОГО URL (має бути присутній)
echo ""
echo "Новий URL (api2s):"
if strings "$APP_BINARY" | grep -i "api2s\.diia\.gov\.ua" | head -3; then
  echo "✅ Новий URL знайдено в binary - патч спрацював!"
else
  echo ""
  echo "❌ КРИТИЧНА ПОМИЛКА: НОВИЙ URL НЕ знайдено в binary!"
  echo ""
  echo "Це означає що:"
  echo "  1. Патч НЕ СПРАЦЮВАВ"
  echo "  2. Або app зібрався з старого cache"
  echo ""
  echo "НАСЛІДОК: BankID авторизація НЕ ПРАЦЮВАТИМЕ!"
  echo ""
  echo "РІШЕННЯ:"
  echo "  - Перевірте що патч source code та SPM виконались"
  echo "  - Виконайте clean build"
  exit 1
fi

echo ""
echo "=== ✅ Верифікація App Bundle ПРОЙДЕНА ==="
echo ""
echo "Результат:"
echo "  ✅ Bundle ID: $BUNDLE_ID"
echo "  ✅ Розмір: $APP_SIZE"
echo "  ✅ API URL: api2s.diia.gov.ua (правильний)"
echo "  ✅ Старий URL: відсутній"
echo ""
echo "App готовий для тестування з BankID ✅"
