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

# ============================================================================
# FIX Bug 1: Convert BUILD_DIR to absolute path BEFORE cd
# ============================================================================
# Якщо BUILD_DIR відносний, конвертуємо в absolute path
if [[ "$BUILD_DIR" != /* ]]; then
  # Extract parent and base separately for validation
  PARENT_DIR="$(dirname "$BUILD_DIR")"
  BASE_NAME="$(basename "$BUILD_DIR")"
  
  # Validate parent directory exists (set -e doesn't work in command substitutions!)
  if [ ! -e "$PARENT_DIR" ]; then
    echo "❌ ПОМИЛКА: Parent directory не існує: $PARENT_DIR"
    echo "BUILD_DIR було: $BUILD_DIR"
    echo "Current directory: $(pwd)"
    exit 1
  fi
  
  # Convert to absolute (now safe because we validated)
  if ! cd "$PARENT_DIR" 2>/dev/null; then
    echo "❌ ПОМИЛКА: Не можу перейти в директорію: $PARENT_DIR"
    exit 1
  fi
  
  BUILD_DIR="$(pwd)/$BASE_NAME"
  cd - > /dev/null  # Return to original directory
  
  echo "✅ BUILD_DIR converted to absolute: $BUILD_DIR"
fi

cd "$IOS_SOURCE_DIR"

echo "=== Патч Swift Package Dependencies: api2oss → api2s ==="
echo "iOS Source: $(pwd)"
echo "Build Dir (absolute): $BUILD_DIR"
echo ""

# ============================================================================
# Auto-detect workspace or project
# ============================================================================
echo "Пошук iOS workspace/project..."

WORKSPACE_FILE=$(find . -maxdepth 2 -name "*.xcworkspace" -type d | head -1)
PROJECT_FILE=$(find . -maxdepth 2 -name "*.xcodeproj" -type d | head -1)

if [ -n "$WORKSPACE_FILE" ]; then
    echo "✅ Знайдено workspace: $WORKSPACE_FILE"
    BUILD_TYPE="workspace"
    BUILD_PATH="$WORKSPACE_FILE"
elif [ -n "$PROJECT_FILE" ]; then
    echo "✅ Знайдено project: $PROJECT_FILE"
    BUILD_TYPE="project"
    BUILD_PATH="$PROJECT_FILE"
else
    echo "❌ Не знайдено .xcworkspace або .xcodeproj файлів"
    echo "Знайдені файли в $(pwd):"
    ls -la
    exit 1
fi

# Auto-detect scheme
echo "Визначаємо доступні schemes..."
if [ "$BUILD_TYPE" = "workspace" ]; then
    SCHEMES=$(xcodebuild -workspace "$BUILD_PATH" -list -json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
schemes = data.get('workspace', {}).get('schemes', [])
print('\n'.join(schemes))
" || echo "")
else
    SCHEMES=$(xcodebuild -project "$BUILD_PATH" -list -json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
schemes = data.get('project', {}).get('schemes', [])
print('\n'.join(schemes))
" || echo "")
fi

if [ -z "$SCHEMES" ]; then
    echo "⚠️  Не вдалось визначити schemes, використовуємо перший доступний"
    SCHEME=""
else
    # Беремо перший scheme (зазвичай це main scheme)
    SCHEME=$(echo "$SCHEMES" | head -1)
    echo "✅ Використовуємо scheme: $SCHEME"
fi

# Якщо scheme не визначено, спробуємо без нього
if [ -z "$SCHEME" ]; then
    echo "⚠️  Scheme не визначено, xcodebuild може не спрацювати"
fi

echo ""

# ============================================================================
# КРОК 1: Resolve SPM dependencies
# ============================================================================
echo "КРОК 1: Resolve SPM dependencies (download з GitHub)..."

# FIX Bug 2: Use PIPESTATUS to capture xcodebuild exit code with tee
if [ "$BUILD_TYPE" = "workspace" ]; then
    if [ -n "$SCHEME" ]; then
        xcodebuild -resolvePackageDependencies \
          -workspace "$BUILD_PATH" \
          -scheme "$SCHEME" \
          -configuration Debug 2>&1 | tee /tmp/resolve.log
    else
        xcodebuild -resolvePackageDependencies \
          -workspace "$BUILD_PATH" \
          -configuration Debug 2>&1 | tee /tmp/resolve.log
    fi
else
    if [ -n "$SCHEME" ]; then
        xcodebuild -resolvePackageDependencies \
          -project "$BUILD_PATH" \
          -scheme "$SCHEME" \
          -configuration Debug 2>&1 | tee /tmp/resolve.log
    else
        xcodebuild -resolvePackageDependencies \
          -project "$BUILD_PATH" \
          -configuration Debug 2>&1 | tee /tmp/resolve.log
    fi
fi
  
# Check xcodebuild exit code (pipe status)
if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo "❌ Package resolve failed (exit code: ${PIPESTATUS[0]})"
  echo ""
  echo "=== Останні 50 рядків логу ==="
  tail -50 /tmp/resolve.log
  exit 1
fi

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
