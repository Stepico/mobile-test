#!/bin/bash
set -euo pipefail

# ============================================================================
# Patch Swift Package Manager Dependencies: api2oss → api2s
# ============================================================================
# Патчить downloaded SPM packages після resolve, але ПЕРЕД build
# Гарантує що всі SPM dependencies (ios-network, ios-authorization, etc.)
# використовують правильний API URL
# ============================================================================

IOS_SOURCE_DIR="${1:-.}"
BUILD_DIR="${2:-../ios-build}"

cd "$IOS_SOURCE_DIR"

echo "=== Патч Swift Package Dependencies: api2oss → api2s ==="
echo "iOS Source: $(pwd)"
echo "Build Dir: $BUILD_DIR"
echo ""

# ============================================================================
# КРОК 1: Resolve SPM dependencies
# ============================================================================
echo "КРОК 1: Resolve SPM dependencies (download з GitHub)..."

xcodebuild -resolvePackageDependencies \
  -workspace DiiaOpenSource.xcworkspace \
  -scheme DiiaOpenSource \
  -configuration Debug 2>&1 | tee /tmp/resolve.log || {
    echo "❌ Package resolve failed"
    tail -50 /tmp/resolve.log
    exit 1
  }

echo "✅ SPM dependencies resolved"
echo ""

# ============================================================================
# КРОК 2: Пошук downloaded SPM packages
# ============================================================================
echo "КРОК 2: Пошук downloaded SPM packages..."

# Primary: isolated DerivedData в build директорії
SPM_CHECKOUTS="$BUILD_DIR/DerivedData/SourcePackages/checkouts"

if [ ! -d "$SPM_CHECKOUTS" ]; then
  echo "⚠️  SPM checkouts не знайдено в isolated build dir: $SPM_CHECKOUTS"
  echo "Перевіряємо system DerivedData..."
  
  # Fallback: system DerivedData
  SYSTEM_DD=$(find ~/Library/Developer/Xcode/DerivedData -type d -name "SourcePackages" -maxdepth 2 2>/dev/null | head -1 || echo "")
  
  if [ -n "$SYSTEM_DD" ]; then
    SPM_CHECKOUTS="$SYSTEM_DD/checkouts"
    echo "✅ Знайдено в system DerivedData: $SPM_CHECKOUTS"
  else
    echo "❌ SPM packages не знайдено - можливо проект не використовує SPM"
    echo "Пропускаємо патч"
    exit 0
  fi
else
  echo "✅ SPM packages знайдено: $SPM_CHECKOUTS"
fi

echo ""

# ============================================================================
# КРОК 3: Підрахунок api2oss ПЕРЕД патчем
# ============================================================================
echo "КРОК 3: Аналіз api2oss в SPM packages (перед патчем)..."

PKG_OLD_COUNT=$(grep -r "api2oss" "$SPM_CHECKOUTS" \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  --include="*.xcconfig" \
  2>/dev/null | wc -l | tr -d ' ' || echo "0")

echo "Знайдено $PKG_OLD_COUNT входжень api2oss"

if [ "$PKG_OLD_COUNT" -eq 0 ]; then
  echo "✅ SPM packages вже чисті - api2oss відсутній"
  echo "Патч не потрібен"
  exit 0
fi

echo ""
echo "Файли з api2oss (перші 5):"
grep -rl "api2oss" "$SPM_CHECKOUTS" \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  2>/dev/null | head -5 || true
echo ""

# ============================================================================
# КРОК 4: Патч api2oss → api2s
# ============================================================================
echo "КРОК 4: Патчимо api2oss → api2s в SPM packages..."

# Патчимо всі форми api2oss:
# 1. api2oss.diia.gov.ua → api2s.diia.gov.ua (full URL)
# 2. "api2oss" → "api2s" (string literals)
# 3. 'api2oss' → 'api2s' (char literals)

find "$SPM_CHECKOUTS" \
  \( -name "*.swift" -o -name "*.m" -o -name "*.h" -o -name "*.xcconfig" \) \
  -type f \
  -exec sed -i '' 's/api2oss\.diia\.gov\.ua/api2s.diia.gov.ua/g' {} + \
  -exec sed -i '' 's/"api2oss"/"api2s"/g' {} + \
  -exec sed -i '' "s/'api2oss'/'api2s'/g" {} + 2>/dev/null || true

echo "✅ Патч застосовано"
echo ""

# ============================================================================
# КРОК 5: Верифікація (КРИТИЧНО)
# ============================================================================
echo "КРОК 5: Верифікація - перевірка що api2oss відсутній..."

PKG_OLD_AFTER=$(grep -r "api2oss" "$SPM_CHECKOUTS" \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  --include="*.xcconfig" \
  2>/dev/null | wc -l | tr -d ' ' || echo "0")

if [ "$PKG_OLD_AFTER" -gt 0 ]; then
  echo "❌ КРИТИЧНА ПОМИЛКА: api2oss залишився після патчу!"
  echo "Залишилось $PKG_OLD_AFTER входжень:"
  echo ""
  grep -r "api2oss" "$SPM_CHECKOUTS" \
    --include="*.swift" \
    --include="*.m" \
    --include="*.h" \
    2>/dev/null | head -10 || true
  echo ""
  echo "⚠️  App зберется з НЕПРАВИЛЬНИМ API URL!"
  echo "⚠️  BankID авторизація НЕ ПРАЦЮВАТИМЕ!"
  exit 1
fi

echo "✅ Верифікація пройдена - api2oss відсутній у SPM packages"
echo ""

# ============================================================================
# КРОК 6: Підтвердження нового URL
# ============================================================================
echo "КРОК 6: Підтвердження - перевірка api2s..."

PKG_NEW_COUNT=$(grep -r "api2s" "$SPM_CHECKOUTS" \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  2>/dev/null | wc -l | tr -d ' ' || echo "0")

echo "✅ Знайдено $PKG_NEW_COUNT входжень api2s в SPM packages"

if [ "$PKG_NEW_COUNT" -gt 0 ]; then
  echo "Приклади (перші 3):"
  grep -r "api2s" "$SPM_CHECKOUTS" \
    --include="*.swift" \
    2>/dev/null | head -3 || true
fi

echo ""
echo "=== ✅ SPM Dependencies пропатчено успішно ==="
echo "App зберется з правильним API URL: api2s.diia.gov.ua"
