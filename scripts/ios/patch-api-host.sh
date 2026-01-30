#!/bin/bash
set -euo pipefail

# ============================================================================
# Патч API Host: api2oss → api2s
# ============================================================================
# Замінює старий тестовий хост api2oss на робочий api2s у source коді iOS app
# 
# Вхід: ios-diia directory (pwd або $1)
# Вихід: 0 якщо success, 1 якщо api2oss залишився після патчу
# ============================================================================

IOS_SOURCE_DIR="${1:-.}"
cd "$IOS_SOURCE_DIR"

echo "=== Патч API Host: api2oss.diia.gov.ua → api2s.diia.gov.ua ==="
echo "Source directory: $(pwd)"
echo ""

# ============================================================================
# КРОК 1: Discovery - знайти всі файли з api2oss
# ============================================================================
echo "КРОК 1: Пошук файлів з api2oss..."

# Шукаємо тільки в source коді, виключаючи .git, Pods, build, DerivedData
FILES_WITH_OLD_URL=$(grep -rl "api2oss" . \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  --include="*.xcconfig" \
  --include="*.plist" \
  --include="*.json" \
  --include="*.xml" \
  --exclude-dir=".git" \
  --exclude-dir="Pods" \
  --exclude-dir="build" \
  --exclude-dir="DerivedData" \
  --exclude-dir=".build" \
  2>/dev/null || echo "")

if [ -z "$FILES_WITH_OLD_URL" ]; then
  echo "✅ api2oss не знайдено в source коді"
  exit 0
fi

FILE_COUNT=$(echo "$FILES_WITH_OLD_URL" | wc -l | tr -d ' ')
echo "Знайдено $FILE_COUNT файлів з api2oss:"
echo "$FILES_WITH_OLD_URL" | head -10
if [ "$FILE_COUNT" -gt 10 ]; then
  echo "... та ще $((FILE_COUNT - 10)) файлів"
fi
echo ""

# ============================================================================
# КРОК 2: Патч source файлів
# ============================================================================
echo "КРОК 2: Патчимо source файли..."

# Патчимо всі форми api2oss:
# 1. api2oss.diia.gov.ua → api2s.diia.gov.ua
# 2. "api2oss" → "api2s" (string literals)
# 3. 'api2oss' → 'api2s' (char literals)
# 4. @"api2oss" → @"api2s" (ObjC)

find . \
  \( -name "*.swift" -o -name "*.m" -o -name "*.h" -o -name "*.xcconfig" -o -name "*.plist" -o -name "*.json" -o -name "*.xml" \) \
  -type f \
  -not -path "*/.git/*" \
  -not -path "*/Pods/*" \
  -not -path "*/build/*" \
  -not -path "*/DerivedData/*" \
  -not -path "*/.build/*" \
  -exec sed -i '' 's/api2oss\.diia\.gov\.ua/api2s.diia.gov.ua/g' {} + \
  -exec sed -i '' 's/"api2oss"/"api2s"/g' {} + \
  -exec sed -i '' "s/'api2oss'/'api2s'/g" {} + \
  -exec sed -i '' 's/@"api2oss"/@"api2s"/g' {} + 2>/dev/null || true

echo "✅ Патч застосовано"
echo ""

# ============================================================================
# КРОК 3: Верифікація
# ============================================================================
echo "КРОК 3: Верифікація - перевірка що api2oss відсутній..."

REMAINING=$(grep -r "api2oss" . \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  --include="*.xcconfig" \
  --include="*.plist" \
  --include="*.json" \
  --include="*.xml" \
  --exclude-dir=".git" \
  --exclude-dir="Pods" \
  --exclude-dir="build" \
  --exclude-dir="DerivedData" \
  --exclude-dir=".build" \
  2>/dev/null || echo "")

if [ -n "$REMAINING" ]; then
  echo "❌ FAIL: api2oss все ще знайдено після патчу:"
  echo "$REMAINING" | head -20
  echo ""
  echo "Можливі причини:"
  echo "1. sed не працює для деяких файлів (encoding, permissions)"
  echo "2. api2oss в бінарних файлах (які ми не патчимо)"
  echo "3. api2oss генерується динамічно"
  echo ""
  echo "Рекомендація: перевірте ці файли вручну"
  exit 1
fi

echo "✅ Верифікація пройдена - api2oss відсутній у source коді"
echo ""

# Показуємо приклади нового URL для підтвердження
NEW_URL_COUNT=$(grep -r "api2s" . \
  --include="*.swift" \
  --include="*.xcconfig" \
  --include="*.plist" \
  --exclude-dir=".git" \
  --exclude-dir="Pods" \
  --exclude-dir="build" \
  --exclude-dir="DerivedData" \
  2>/dev/null | wc -l | tr -d ' ')

echo "✅ Знайдено $NEW_URL_COUNT входжень нового URL (api2s)"
if [ "$NEW_URL_COUNT" -gt 0 ]; then
  echo "Приклади (перші 3):"
  grep -r "api2s" . \
    --include="*.swift" \
    --include="*.xcconfig" \
    --include="*.plist" \
    --exclude-dir=".git" \
    --exclude-dir="Pods" \
    --exclude-dir="build" \
    --exclude-dir="DerivedData" \
    2>/dev/null | head -3 || true
fi

echo ""
echo "=== Патч API Host завершено успішно ==="
