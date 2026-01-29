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

# Визначаємо scheme (пріоритет: Diia в назві, потім перший доступний)
SCHEME=""
if [ -n "$SCHEMES" ]; then
    # Шукаємо scheme з "Diia" в назві
    SCHEME=$(echo "$SCHEMES" | grep -i "diia" | head -1 || echo "")
    
    # Якщо не знайдено, беремо перший доступний
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

# Повертаємося до root директорії проекту (скрипт міг бути викликаний з ios-diia)
cd "$REPO_ROOT"

# Створюємо директорії для build
mkdir -p "$BUILD_DIR/DerivedData"
mkdir -p "$OUTPUT_DIR"

# Абсолютні шляхи
ABS_SOURCE_DIR=$(cd "$IOS_SOURCE_DIR" && pwd)
ABS_BUILD_DIR=$(cd "$BUILD_DIR" && pwd)
ABS_OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd)

echo "Building app для iOS Simulator..."
echo "Source: $ABS_SOURCE_DIR"
echo "Build: $ABS_BUILD_DIR"
echo "Output: $ABS_OUTPUT_DIR"

# Build для simulator
cd "$ABS_SOURCE_DIR"

if [ "$BUILD_TYPE" = "workspace" ]; then
    xcodebuild \
        -workspace "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        clean build \
        2>&1 | tee "$ABS_BUILD_DIR/xcodebuild.log" || {
        echo "❌ Помилка build iOS app"
        echo "Останні 100 рядків логу:"
        tail -100 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    }
else
    xcodebuild \
        -project "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        clean build \
        2>&1 | tee "$ABS_BUILD_DIR/xcodebuild.log" || {
        echo "❌ Помилка build iOS app"
        echo "Останні 100 рядків логу:"
        tail -100 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    }
fi

# Знаходимо зібраний app bundle
# xcodebuild може розмістити .app в різних місцях залежно від структури проекту
DERIVED_DATA_PATH="$ABS_BUILD_DIR/DerivedData"
PRODUCTS_DEBUG="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator"
PRODUCTS_RELEASE="$DERIVED_DATA_PATH/Build/Products/Release-iphonesimulator"

echo "Шукаємо зібраний app bundle..."
echo "DerivedData: $DERIVED_DATA_PATH"

# Спочатку перевіряємо стандартні місця (без обмеження maxdepth)
BUILT_APP=""
if [ -d "$PRODUCTS_DEBUG" ]; then
    echo "Перевіряємо $PRODUCTS_DEBUG"
    BUILT_APP=$(find "$PRODUCTS_DEBUG" -name "*.app" -type d | head -1)
    if [ -n "$BUILT_APP" ]; then
        echo "✅ Знайдено в Debug: $BUILT_APP"
    fi
fi

if [ -z "$BUILT_APP" ] && [ -d "$PRODUCTS_RELEASE" ]; then
    echo "Перевіряємо $PRODUCTS_RELEASE"
    BUILT_APP=$(find "$PRODUCTS_RELEASE" -name "*.app" -type d | head -1)
    if [ -n "$BUILT_APP" ]; then
        echo "✅ Знайдено в Release: $BUILT_APP"
    fi
fi

# Якщо не знайдено, шукаємо по всьому DerivedData (рекурсивно, але з обмеженням глибини)
if [ -z "$BUILT_APP" ]; then
    echo "Шукаємо по всьому DerivedData..."
    # Знаходимо всі можливі .app файли
    CANDIDATE_APPS=$(find "$DERIVED_DATA_PATH" -type d -name "*.app" 2>/dev/null)
    
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

# Якщо все ще не знайдено, виводимо детальну інформацію для діагностики
if [ -z "$BUILT_APP" ] || [ ! -d "$BUILT_APP" ]; then
    echo "❌ Зібраний app bundle не знайдено або шлях не є директорією"
    echo ""
    echo "Структура DerivedData:"
    if [ -d "$DERIVED_DATA_PATH" ]; then
        find "$DERIVED_DATA_PATH" -maxdepth 3 -type d | head -30
    else
        echo "  DerivedData директорія не існує!"
    fi
    echo ""
    echo "Структура Build/Products (якщо існує):"
    ls -la "$DERIVED_DATA_PATH/Build/Products" 2>/dev/null || echo "  Build/Products не знайдено"
    echo ""
    echo "Всі знайдені .app файли в DerivedData:"
    find "$DERIVED_DATA_PATH" -name "*.app" -type d 2>/dev/null || echo "  .app файли не знайдено"
    echo ""
    echo "Останні 50 рядків build логу:"
    tail -50 "$ABS_BUILD_DIR/xcodebuild.log"
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
