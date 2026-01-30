#!/bin/bash
set -euo pipefail

echo "=== Build iOS App для Simulator ==="

# Корінь репозиторію (тестів) — зберігаємо до будь-якого cd
REPO_ROOT="$(pwd)"

# Шлях до iOS source проекту
IOS_SOURCE_DIR="${IOS_SOURCE_DIR:-./ios-diia}"
BUILD_DIR="./ios-build"
OUTPUT_DIR="./ios-app"
OUTPUT_APP="$OUTPUT_DIR/DiiaOpenSource.app"

echo "iOS Source Dir: $IOS_SOURCE_DIR"

# Перевірка чи існує source директорія
if [ ! -d "$IOS_SOURCE_DIR" ]; then
    echo "❌ iOS source директорія не знайдена: $IOS_SOURCE_DIR"
    echo "Перевірте що iOS repo було checkout'нуто"
    exit 1
fi

# Перехід до source директорії для пошуку проекту
cd "$IOS_SOURCE_DIR"

# Автоматичне визначення workspace або project
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
    echo "Знайдені файли в $IOS_SOURCE_DIR:"
    ls -la
    exit 1
fi

# Автоматичне визначення scheme
echo "Визначаємо доступні schemes..."
if [ "$BUILD_TYPE" = "workspace" ]; then
    SCHEMES=$(xcodebuild -workspace "$BUILD_PATH" -list -json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    workspace = data.get('workspace', {})
    schemes = workspace.get('schemes', [])
    for scheme in schemes:
        print(scheme)
except:
    pass
" 2>/dev/null || xcodebuild -workspace "$BUILD_PATH" -list 2>/dev/null | grep -A 100 "Schemes:" | grep -v "Schemes:" | sed 's/^[[:space:]]*//' | head -20)
else
    SCHEMES=$(xcodebuild -project "$BUILD_PATH" -list -json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    project = data.get('project', {})
    schemes = project.get('schemes', [])
    for scheme in schemes:
        print(scheme)
except:
    pass
" 2>/dev/null || xcodebuild -project "$BUILD_PATH" -list 2>/dev/null | grep -A 100 "Schemes:" | grep -v "Schemes:" | sed 's/^[[:space:]]*//' | head -20)
fi

# Визначаємо scheme (пріоритет: DiiaOpenSource, потім OpenSource, потім Diia, потім перший доступний)
SCHEME=""
if [ -n "$SCHEMES" ]; then
    # Пріоритет 1: DiiaOpenSource (очікувана назва основного app)
    SCHEME=$(echo "$SCHEMES" | grep -iE "^DiiaOpenSource$|^DiiaOpenSource" | head -1 || echo "")
    
    # Пріоритет 2: Будь-яка схема з "OpenSource" в назві
    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | grep -i "opensource" | head -1 || echo "")
    fi
    
    # Пріоритет 3: Схема з "Diia" в назві (але не Authorization, бо це framework)
    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | grep -i "diia" | grep -v -i "authorization" | head -1 || echo "")
    fi
    
    # Пріоритет 4: Будь-яка схема з "Diia" в назві
    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | grep -i "diia" | head -1 || echo "")
    fi
    
    # Пріоритет 5: Перший доступний
    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | head -1)
    fi
fi

if [ -z "$SCHEME" ]; then
    echo "❌ Не вдалося визначити scheme"
    echo "Доступні schemes:"
    echo "$SCHEMES"
    exit 1
fi

echo "✅ Використовуємо scheme: $SCHEME"
echo "Доступні schemes:"
for s in $SCHEMES; do
    if [ "$s" = "$SCHEME" ]; then
        echo "  → $s (вибрано)"
    else
        echo "    $s"
    fi
done

# Повертаємося до root директорії проекту (скрипт міг бути викликаний з ios-diia)
cd "$REPO_ROOT"

# ============================================================================
# CRITICAL: СЕЛЕКТИВНЕ ОЧИЩЕННЯ (preserve SPM packages!)
# ============================================================================
echo "=== КРОК: Селективне очищення build кешів ==="

# 1. Видалити build artifacts але ЗБЕРЕГТИ SourcePackages (SPM)
if [ -d "$BUILD_DIR/DerivedData" ]; then
  echo "Очищаємо DerivedData build artifacts (зберігаючи SPM packages)..."
  
  # Зберігаємо SourcePackages якщо існує
  if [ -d "$BUILD_DIR/DerivedData/SourcePackages" ]; then
    echo "✅ SourcePackages знайдено - зберігаємо пропатчені SPM packages"
    mv "$BUILD_DIR/DerivedData/SourcePackages" "$BUILD_DIR/SourcePackages.backup" 2>/dev/null || true
  fi
  
  # Видаляємо DerivedData
  rm -rf "$BUILD_DIR/DerivedData"
  
  # Відновлюємо SourcePackages
  mkdir -p "$BUILD_DIR/DerivedData"
  if [ -d "$BUILD_DIR/SourcePackages.backup" ]; then
    mv "$BUILD_DIR/SourcePackages.backup" "$BUILD_DIR/DerivedData/SourcePackages"
    echo "✅ SPM packages відновлено (пропатчені)"
  else
    echo "⚠️  SPM packages не знайдено - build скачає fresh (unpатчені?)"
  fi
else
  mkdir -p "$BUILD_DIR/DerivedData"
  echo "✅ DerivedData створено (fresh)"
fi

# 2. Видалити output directory для чистого copy
if [ -d "$OUTPUT_DIR" ]; then
  echo "Видаляємо старий output..."
  rm -rf "$OUTPUT_DIR"
  echo "✅ Output директорія очищена"
fi

# 3. Створюємо output directory
mkdir -p "$OUTPUT_DIR"

echo "✅ Build directories готові (SPM packages збережено)"
echo ""

# Абсолютні шляхи (with validation - set -e doesn't work in command substitutions!)
if ! cd "$IOS_SOURCE_DIR" 2>/dev/null; then
  echo "❌ ПОМИЛКА: Не можу перейти в source директорію: $IOS_SOURCE_DIR"
  exit 1
fi
ABS_SOURCE_DIR=$(pwd)
cd - > /dev/null

if ! cd "$BUILD_DIR" 2>/dev/null; then
  echo "❌ ПОМИЛКА: Не можу перейти в build директорію: $BUILD_DIR"
  exit 1
fi
ABS_BUILD_DIR=$(pwd)
cd - > /dev/null

if ! cd "$OUTPUT_DIR" 2>/dev/null; then
  echo "❌ ПОМИЛКА: Не можу перейти в output директорію: $OUTPUT_DIR"
  exit 1
fi
ABS_OUTPUT_DIR=$(pwd)
cd - > /dev/null

echo "Building app для iOS Simulator..."
echo "Source: $ABS_SOURCE_DIR"
echo "Build: $ABS_BUILD_DIR"
echo "Output: $ABS_OUTPUT_DIR"

# Build для simulator
cd "$ABS_SOURCE_DIR"

# Визначаємо destination для детермінованого build
DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone 16 Pro}"
PLATFORM_VERSION="${IOS_PLATFORM_VERSION:-18.2}"

# Перевірка що runtime існує
echo "Перевірка iOS $PLATFORM_VERSION runtime..."
RUNTIME_AVAILABLE=$(xcrun simctl list runtimes available 2>/dev/null | grep -i "iOS $PLATFORM_VERSION" || echo "")
if [ -z "$RUNTIME_AVAILABLE" ]; then
    echo "⚠️  iOS $PLATFORM_VERSION runtime not found, using latest available"
    # Fallback: use latest iOS runtime
    PLATFORM_VERSION=$(xcrun simctl list runtimes available 2>/dev/null | grep -i "iOS" | tail -1 | grep -oE "[0-9]+\.[0-9]+" | head -1 || echo "18.2")
    echo "Using iOS $PLATFORM_VERSION"
fi

# Формуємо destination (детермінований)
DESTINATION="platform=iOS Simulator,name=${DEVICE_NAME},OS=${PLATFORM_VERSION}"
echo "Build destination: $DESTINATION"
echo ""

# ============================================================================
# CRITICAL: xcodebuild clean для видалення incremental build artifacts
# ============================================================================
echo "=== КРОК: xcodebuild clean (guaranteed fresh build) ==="

if [ "$BUILD_TYPE" = "workspace" ]; then
    xcodebuild clean \
        -workspace "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination "$DESTINATION" 2>&1 | head -20 || echo "Clean warning (ignoring)"
else
    xcodebuild clean \
        -project "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination "$DESTINATION" 2>&1 | head -20 || echo "Clean warning (ignoring)"
fi

echo "✅ xcodebuild clean завершено"
echo ""

# ============================================================================
# КРОК: xcodebuild build (clean build з isolated DerivedData)
# ============================================================================
echo "=== КРОК: xcodebuild build ==="

if [ "$BUILD_TYPE" = "workspace" ]; then
    # FIX Bug 2: Use PIPESTATUS to capture xcodebuild exit code with tee
    xcodebuild \
        -workspace "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination "$DESTINATION" \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        clean build \
        2>&1 | tee "$ABS_BUILD_DIR/xcodebuild.log"
    
    # Check xcodebuild exit code from pipe
    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
        echo "❌ Помилка build iOS app (exit code: ${PIPESTATUS[0]})"
        echo ""
        echo "=== Останні 100 рядків логу ==="
        tail -100 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    fi
else
    # FIX Bug 2: Use PIPESTATUS to capture xcodebuild exit code with tee
    xcodebuild \
        -project "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination "$DESTINATION" \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        clean build \
        2>&1 | tee "$ABS_BUILD_DIR/xcodebuild.log"
    
    # Check xcodebuild exit code from pipe
    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
        echo "❌ Помилка build iOS app (exit code: ${PIPESTATUS[0]})"
        echo ""
        echo "=== Останні 100 рядків логу ==="
        tail -100 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    fi
fi

# Перевіряємо, чи build дійсно завершився успішно
if [ -f "$ABS_BUILD_DIR/xcodebuild.log" ]; then
    if ! grep -q "BUILD SUCCEEDED" "$ABS_BUILD_DIR/xcodebuild.log"; then
        echo "❌ BUILD не завершився успішно (BUILD SUCCEEDED не знайдено в лозі)"
        echo "Останні 50 рядків логу:"
        tail -50 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    fi
    echo "✅ BUILD SUCCEEDED підтверджено в лозі"
    
    # Перевіряємо, чи в лозі є інформація про створення .app файлу
    if grep -E "(Touch|CodeSign).*\.app[[:space:]]" "$ABS_BUILD_DIR/xcodebuild.log" | grep -qv "\.bundle"; then
        echo "✅ В лозі знайдено інформацію про створення .app файлу"
    else
        echo "⚠️  В лозі не знайдено інформації про створення .app файлу (можливо, створено лише .bundle)"
    fi
fi

# Знаходимо зібраний app bundle
# xcodebuild може розмістити .app в різних місцях залежно від структури проекту
DERIVED_DATA_PATH="$ABS_BUILD_DIR/DerivedData"

echo "Шукаємо зібраний app bundle..."
echo "DerivedData: $DERIVED_DATA_PATH"

# Спочатку намагаємося отримати точний шлях через xcodebuild -showBuildSettings
# Важливо: виконуємо з source директорії, де знаходиться проект
BUILT_APP=""
echo "Отримуємо build settings для визначення точного шляху до продукту..."
cd "$ABS_SOURCE_DIR"
if [ "$BUILD_TYPE" = "workspace" ]; then
    BUILT_PRODUCTS_DIR=$(xcodebuild \
        -workspace "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        -showBuildSettings 2>/dev/null | grep -m 1 "BUILT_PRODUCTS_DIR" | sed 's/.*= *//' | xargs || echo "")
else
    BUILT_PRODUCTS_DIR=$(xcodebuild \
        -project "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        -showBuildSettings 2>/dev/null | grep -m 1 "BUILT_PRODUCTS_DIR" | sed 's/.*= *//' | xargs || echo "")
fi
cd "$REPO_ROOT"

if [ -n "$BUILT_PRODUCTS_DIR" ] && [ -d "$BUILT_PRODUCTS_DIR" ]; then
    echo "✅ Знайдено BUILT_PRODUCTS_DIR з build settings: $BUILT_PRODUCTS_DIR"
    BUILT_APP=$(find "$BUILT_PRODUCTS_DIR" -maxdepth 1 -name "*.app" -type d | head -1)
    if [ -n "$BUILT_APP" ]; then
        echo "✅ Знайдено app через BUILT_PRODUCTS_DIR: $BUILT_APP"
    else
        echo "⚠️  BUILT_PRODUCTS_DIR існує, але .app не знайдено безпосередньо в ньому"
        echo "Вміст BUILT_PRODUCTS_DIR:"
        ls -la "$BUILT_PRODUCTS_DIR" 2>/dev/null || echo "  Не вдалося перелічити"
    fi
fi

# Якщо не знайдено через build settings, перевіряємо стандартні місця
# xcodebuild з -derivedDataPath часто створює піддиректорію типу DerivedData/<ProjectName>-<Hash>/
if [ -z "$BUILT_APP" ]; then
    echo "Перевіряємо стандартні місця розташування..."
    
    # Спочатку перевіряємо прямий шлях DerivedData/Build/Products
    PRODUCTS_DEBUG="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator"
    PRODUCTS_RELEASE="$DERIVED_DATA_PATH/Build/Products/Release-iphonesimulator"
    
    if [ -d "$PRODUCTS_DEBUG" ]; then
        echo "Перевіряємо $PRODUCTS_DEBUG"
        echo "Вміст директорії:"
        ls -la "$PRODUCTS_DEBUG" 2>/dev/null | head -20 || echo "  Не вдалося перелічити"
        
        # Шукаємо .app безпосередньо в цій директорії
        BUILT_APP=$(find "$PRODUCTS_DEBUG" -maxdepth 1 -name "*.app" -type d | head -1)
        if [ -z "$BUILT_APP" ]; then
            # Шукаємо в піддиректоріях (можливо, є вкладені структури)
            BUILT_APP=$(find "$PRODUCTS_DEBUG" -name "*.app" -type d | head -1)
        fi
        if [ -n "$BUILT_APP" ]; then
            echo "✅ Знайдено в Debug: $BUILT_APP"
        fi
    fi
    
    if [ -z "$BUILT_APP" ] && [ -d "$PRODUCTS_RELEASE" ]; then
        echo "Перевіряємо $PRODUCTS_RELEASE"
        BUILT_APP=$(find "$PRODUCTS_RELEASE" -maxdepth 1 -name "*.app" -type d | head -1)
        if [ -z "$BUILT_APP" ]; then
            BUILT_APP=$(find "$PRODUCTS_RELEASE" -name "*.app" -type d | head -1)
        fi
        if [ -n "$BUILT_APP" ]; then
            echo "✅ Знайдено в Release: $BUILT_APP"
        fi
    fi
    
    # Якщо не знайдено, перевіряємо піддиректорії типу DerivedData/<ProjectName>-<Hash>/Build/Products
    if [ -z "$BUILT_APP" ]; then
        echo "Перевіряємо піддиректорії в DerivedData (xcodebuild може створити хешовані піддиректорії)..."
        for SUBDIR in "$DERIVED_DATA_PATH"/*/; do
            if [ -d "$SUBDIR" ] && [ -d "$SUBDIR/Build/Products" ]; then
                SUBDIR_DEBUG="$SUBDIR/Build/Products/Debug-iphonesimulator"
                SUBDIR_RELEASE="$SUBDIR/Build/Products/Release-iphonesimulator"
                
                if [ -d "$SUBDIR_DEBUG" ]; then
                    echo "Перевіряємо $SUBDIR_DEBUG"
                    BUILT_APP=$(find "$SUBDIR_DEBUG" -name "*.app" -type d | head -1)
                    if [ -n "$BUILT_APP" ]; then
                        echo "✅ Знайдено в піддиректорії Debug: $BUILT_APP"
                        break
                    fi
                fi
                
                if [ -z "$BUILT_APP" ] && [ -d "$SUBDIR_RELEASE" ]; then
                    echo "Перевіряємо $SUBDIR_RELEASE"
                    BUILT_APP=$(find "$SUBDIR_RELEASE" -name "*.app" -type d | head -1)
                    if [ -n "$BUILT_APP" ]; then
                        echo "✅ Знайдено в піддиректорії Release: $BUILT_APP"
                        break
                    fi
                fi
            fi
        done
    fi
fi

# Якщо все ще не знайдено, шукаємо по всьому DerivedData рекурсивно
if [ -z "$BUILT_APP" ]; then
    echo "Шукаємо по всьому DerivedData (рекурсивно)..."
    # Знаходимо всі можливі .app файли
    CANDIDATE_APPS=$(find "$DERIVED_DATA_PATH" -type d -name "*.app" 2>/dev/null | head -20)
    
    if [ -n "$CANDIDATE_APPS" ]; then
        echo "Знайдені можливі app bundles:"
        echo "$CANDIDATE_APPS" | while read -r app; do
            echo "  - $app"
        done
        
        # Пріоритет 1: App з назвою схеми (наприклад, DiiaAuthorization.app)
        SCHEME_APP_NAME="$SCHEME.app"
        for app in $CANDIDATE_APPS; do
            if [[ "$app" == *"/$SCHEME_APP_NAME" ]]; then
                BUILT_APP="$app"
                echo "✅ Знайдено app за назвою схеми ($SCHEME_APP_NAME): $BUILT_APP"
                break
            fi
        done
        
        # Пріоритет 2: DiiaOpenSource.app (очікувана назва)
        if [ -z "$BUILT_APP" ]; then
            for app in $CANDIDATE_APPS; do
                if [[ "$app" == *"/DiiaOpenSource.app" ]]; then
                    BUILT_APP="$app"
                    echo "✅ Знайдено app за очікуваною назвою (DiiaOpenSource.app): $BUILT_APP"
                    break
                fi
            done
        fi
        
        # Пріоритет 3: Будь-який .app в Build/Products/*-iphonesimulator
        if [ -z "$BUILT_APP" ]; then
            for app in $CANDIDATE_APPS; do
                if [[ "$app" == *"/Build/Products/"*"-iphonesimulator/"* ]]; then
                    BUILT_APP="$app"
                    echo "✅ Знайдено app в Build/Products/*-iphonesimulator: $BUILT_APP"
                    break
                fi
            done
        fi
        
        # Пріоритет 4: Перший знайдений .app
        if [ -z "$BUILT_APP" ]; then
            BUILT_APP=$(echo "$CANDIDATE_APPS" | head -1)
            echo "✅ Використовуємо перший знайдений app: $BUILT_APP"
        fi
    fi
fi

# Якщо все ще не знайдено, намагаємося витягнути шлях з build логу
if [ -z "$BUILT_APP" ] && [ -f "$ABS_BUILD_DIR/xcodebuild.log" ]; then
    echo "Намагаємося витягнути шлях до .app з build логу..."
    
    # Шукаємо рядки з Touch або CodeSign для .app файлів (не .bundle)
    LOG_APP_PATHS=$(grep -E "(Touch|CodeSign).*\.app[[:space:]]" "$ABS_BUILD_DIR/xcodebuild.log" | grep -v "\.bundle" | grep -oE "[^[:space:]]+\.app" | head -5 || echo "")
    
    if [ -n "$LOG_APP_PATHS" ]; then
        echo "Знайдені шляхи до .app в лозі:"
        for app_path in $LOG_APP_PATHS; do
            echo "  - $app_path"
            if [ -z "$BUILT_APP" ] && [ -d "$app_path" ]; then
                BUILT_APP="$app_path"
                echo "✅ Знайдено app з build логу: $BUILT_APP"
                break
            fi
        done
    fi
    
    # Якщо все ще не знайдено, шукаємо будь-які шляхи до .app в лозі
    if [ -z "$BUILT_APP" ]; then
        LOG_APP_PATH=$(grep -oE "[^[:space:]]+\.app" "$ABS_BUILD_DIR/xcodebuild.log" | grep -v "\.app\." | grep -v "\.bundle" | head -1 || echo "")
        if [ -n "$LOG_APP_PATH" ] && [ -d "$LOG_APP_PATH" ]; then
            BUILT_APP="$LOG_APP_PATH"
            echo "✅ Знайдено app з build логу (альтернативний метод): $BUILT_APP"
        fi
    fi
fi

# Якщо все ще не знайдено, перевіряємо схему-специфічні піддиректорії в DerivedData
if [ -z "$BUILT_APP" ]; then
    echo "Перевіряємо схему-специфічні піддиректорії в DerivedData..."
    # xcodebuild з -derivedDataPath може створити піддиректорію з хешем проекту
    # Шукаємо всі піддиректорії в DerivedData і перевіряємо їх Build/Products
    for SUBDIR in "$DERIVED_DATA_PATH"/*/; do
        if [ -d "$SUBDIR" ]; then
            SUBDIR_PRODUCTS="$SUBDIR/Build/Products"
            if [ -d "$SUBDIR_PRODUCTS" ]; then
                echo "Перевіряємо $SUBDIR_PRODUCTS"
                FOUND_APP=$(find "$SUBDIR_PRODUCTS" -name "*.app" -type d | head -1)
                if [ -n "$FOUND_APP" ]; then
                    BUILT_APP="$FOUND_APP"
                    echo "✅ Знайдено app в піддиректорії: $BUILT_APP"
                    break
                fi
            fi
        fi
    done
fi

# Перевіряємо, чи знайдений файл дійсно є app bundle
if [ -n "$BUILT_APP" ] && [ -d "$BUILT_APP" ]; then
    if [ ! -f "$BUILT_APP/Info.plist" ]; then
        echo "⚠️  Знайдена директорія $BUILT_APP не містить Info.plist, можливо це не app bundle"
        echo "Шукаємо альтернативні варіанти..."
        BUILT_APP=""
    else
        echo "✅ App зібрано: $BUILT_APP"
        echo "✅ Перевірка Info.plist: знайдено"
    fi
fi

# Якщо все ще не знайдено після всіх перевірок
if [ -z "$BUILT_APP" ] || [ ! -d "$BUILT_APP" ]; then
    echo "❌ Зібраний app bundle не знайдено або шлях не є директорією"
    echo ""
    echo "=== Детальна діагностика ==="
    echo ""
    echo "Використана схема: $SCHEME"
    echo "Можливо, схема '$SCHEME' не створює основний app bundle, а лише framework/module."
    echo "Спробуйте використати схему, яка створює основний app (наприклад, DiiaOpenSource)."
    echo ""
    echo "1. Структура DerivedData (перші 3 рівні):"
    if [ -d "$DERIVED_DATA_PATH" ]; then
        find "$DERIVED_DATA_PATH" -maxdepth 3 -type d | head -50
    else
        echo "  ❌ DerivedData директорія не існує!"
    fi
    echo ""
    echo "2. Структура Build/Products (якщо існує):"
    if [ -d "$DERIVED_DATA_PATH/Build/Products" ]; then
        ls -laR "$DERIVED_DATA_PATH/Build/Products" 2>/dev/null | head -100 || echo "  Не вдалося перелічити"
    else
        echo "  ❌ Build/Products не знайдено"
        echo "  Перевіряємо всі піддиректорії в DerivedData:"
        for SUBDIR in "$DERIVED_DATA_PATH"/*/; do
            if [ -d "$SUBDIR" ]; then
                echo "    - $SUBDIR"
                if [ -d "$SUBDIR/Build" ]; then
                    echo "      ✅ Містить Build/"
                    ls -la "$SUBDIR/Build" 2>/dev/null | head -10 || true
                fi
            fi
        done
    fi
    echo ""
    echo "3. Всі знайдені .app файли в DerivedData (рекурсивно):"
    find "$DERIVED_DATA_PATH" -name "*.app" -type d 2>/dev/null | head -20 || echo "  ❌ .app файли не знайдено"
    echo ""
    echo "4. Перевірка build логу на наявність шляхів до продуктів:"
    if [ -f "$ABS_BUILD_DIR/xcodebuild.log" ]; then
        echo "Шукаємо 'BUILT_PRODUCTS_DIR' або '.app' в лозі:"
        grep -iE "BUILT_PRODUCTS_DIR|\.app[[:space:]]|Touch.*\.app" "$ABS_BUILD_DIR/xcodebuild.log" | tail -30 || echo "  Не знайдено"
        echo ""
        echo "Останні 100 рядків build логу:"
        tail -100 "$ABS_BUILD_DIR/xcodebuild.log"
    else
        echo "  ❌ Build лог не знайдено"
    fi
    echo ""
    echo "5. Перевірка чи build дійсно завершився успішно:"
    if [ -f "$ABS_BUILD_DIR/xcodebuild.log" ]; then
        if grep -q "BUILD SUCCEEDED" "$ABS_BUILD_DIR/xcodebuild.log"; then
            echo "  ✅ BUILD SUCCEEDED знайдено в лозі"
        else
            echo "  ❌ BUILD SUCCEEDED НЕ знайдено в лозі"
        fi
    fi
    exit 1
fi

echo "✅ App зібрано: $BUILT_APP"

# Видаляємо старий app bundle якщо існує
if [ -d "$ABS_OUTPUT_DIR/DiiaOpenSource.app" ] || [ -L "$ABS_OUTPUT_DIR/DiiaOpenSource.app" ]; then
    echo "Видаляємо старий app bundle..."
    rm -rf "$ABS_OUTPUT_DIR/DiiaOpenSource.app"
fi

# Копіюємо app bundle до output директорії
echo "Копіюємо app bundle до $ABS_OUTPUT_DIR/DiiaOpenSource.app..."
cp -R "$BUILT_APP" "$ABS_OUTPUT_DIR/DiiaOpenSource.app"

echo "✅ App bundle готово: $ABS_OUTPUT_DIR/DiiaOpenSource.app"

# Перевірка bundleId
BUNDLE_ID=$(defaults read "$ABS_OUTPUT_DIR/DiiaOpenSource.app/Info.plist" CFBundleIdentifier 2>/dev/null || echo "невідомо")
echo "Bundle ID: $BUNDLE_ID"

# Перевірка розміру
APP_SIZE=$(du -sh "$ABS_OUTPUT_DIR/DiiaOpenSource.app" | cut -f1)
echo "Розмір app: $APP_SIZE"
