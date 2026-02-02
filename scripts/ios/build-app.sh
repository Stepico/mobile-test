#!/bin/bash
set -euo pipefail

echo "=== Build iOS App for Simulator ==="

REPO_ROOT="$(pwd)"

IOS_SOURCE_DIR="${IOS_SOURCE_DIR:-./ios-diia}"
BUILD_DIR="./ios-build"
OUTPUT_DIR="./ios-app"
OUTPUT_APP="$OUTPUT_DIR/DiiaOpenSource.app"

echo "iOS Source Dir: $IOS_SOURCE_DIR"

if [ ! -d "$IOS_SOURCE_DIR" ]; then
    echo "❌ iOS source directory not found: $IOS_SOURCE_DIR"
    echo "Ensure iOS repo was checked out"
    exit 1
fi

cd "$IOS_SOURCE_DIR"

WORKSPACE_FILE=$(find . -maxdepth 2 -name "*.xcworkspace" -type d | head -1)
PROJECT_FILE=$(find . -maxdepth 2 -name "*.xcodeproj" -type d | head -1)

if [ -n "$WORKSPACE_FILE" ]; then
    echo "✅ Found workspace: $WORKSPACE_FILE"
    BUILD_TYPE="workspace"
    BUILD_PATH="$WORKSPACE_FILE"
elif [ -n "$PROJECT_FILE" ]; then
    echo "✅ Found project: $PROJECT_FILE"
    BUILD_TYPE="project"
    BUILD_PATH="$PROJECT_FILE"
else
    echo "❌ No .xcworkspace or .xcodeproj found"
    echo "Files in $IOS_SOURCE_DIR:"
    ls -la
    exit 1
fi

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

SCHEME=""
if [ -n "$SCHEMES" ]; then

    SCHEME=$(echo "$SCHEMES" | grep -iE "^DiiaOpenSource$|^DiiaOpenSource" | head -1 || echo "")

    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | grep -i "opensource" | head -1 || echo "")
    fi

    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | grep -i "diia" | grep -v -i "authorization" | head -1 || echo "")
    fi

    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | grep -i "diia" | head -1 || echo "")
    fi

    if [ -z "$SCHEME" ]; then
        SCHEME=$(echo "$SCHEMES" | head -1)
    fi
fi

if [ -z "$SCHEME" ]; then
    echo "❌ Could not determine scheme"
    echo "Available schemes:"
    echo "$SCHEMES"
    exit 1
fi

echo "✅ Scheme: $SCHEME"

cd "$REPO_ROOT"

if [ -d "$BUILD_DIR/DerivedData" ]; then
  echo "Clearing DerivedData build artifacts (keeping SPM packages)..."

  if [ -d "$BUILD_DIR/DerivedData/SourcePackages" ]; then
    mv "$BUILD_DIR/DerivedData/SourcePackages" "$BUILD_DIR/SourcePackages.backup" 2>/dev/null || true
  fi
  rm -rf "$BUILD_DIR/DerivedData"
  mkdir -p "$BUILD_DIR/DerivedData"
  if [ -d "$BUILD_DIR/SourcePackages.backup" ]; then
    mv "$BUILD_DIR/SourcePackages.backup" "$BUILD_DIR/DerivedData/SourcePackages"
  fi
else
  mkdir -p "$BUILD_DIR/DerivedData"
fi

if [ -d "$OUTPUT_DIR" ]; then
  rm -rf "$OUTPUT_DIR"
fi
mkdir -p "$OUTPUT_DIR"

if ! cd "$IOS_SOURCE_DIR" 2>/dev/null; then
  echo "❌ ERROR: Cannot cd to source directory: $IOS_SOURCE_DIR"
  exit 1
fi
ABS_SOURCE_DIR=$(pwd)
cd - > /dev/null

if ! cd "$BUILD_DIR" 2>/dev/null; then
  echo "❌ ERROR: Cannot cd to build directory: $BUILD_DIR"
  exit 1
fi
ABS_BUILD_DIR=$(pwd)
cd - > /dev/null

if ! cd "$OUTPUT_DIR" 2>/dev/null; then
  echo "❌ ERROR: Cannot cd to output directory: $OUTPUT_DIR"
  exit 1
fi
ABS_OUTPUT_DIR=$(pwd)
cd - > /dev/null

cd "$ABS_SOURCE_DIR"

DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone 16 Pro}"
PLATFORM_VERSION="${IOS_PLATFORM_VERSION:-18.2}"

RUNTIME_AVAILABLE=$(xcrun simctl list runtimes available 2>/dev/null | grep -i "iOS $PLATFORM_VERSION" || echo "")
if [ -z "$RUNTIME_AVAILABLE" ]; then
    PLATFORM_VERSION=$(xcrun simctl list runtimes available 2>/dev/null | grep -i "iOS" | tail -1 | grep -oE "[0-9]+\.[0-9]+" | head -1 || echo "18.2")
fi

DESTINATION="platform=iOS Simulator,name=${DEVICE_NAME},OS=${PLATFORM_VERSION}"

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

if [ "$BUILD_TYPE" = "workspace" ]; then

    xcodebuild \
        -workspace "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination "$DESTINATION" \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        clean build \
        2>&1 | tee "$ABS_BUILD_DIR/xcodebuild.log"

    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
        echo "❌ Build failed (exit ${PIPESTATUS[0]})"
        tail -100 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    fi
else

    xcodebuild \
        -project "$BUILD_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination "$DESTINATION" \
        -derivedDataPath "$ABS_BUILD_DIR/DerivedData" \
        clean build \
        2>&1 | tee "$ABS_BUILD_DIR/xcodebuild.log"

    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
        echo "❌ Build failed (exit ${PIPESTATUS[0]})"
        tail -100 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    fi
fi

if [ -f "$ABS_BUILD_DIR/xcodebuild.log" ]; then
    if ! grep -q "BUILD SUCCEEDED" "$ABS_BUILD_DIR/xcodebuild.log"; then
        echo "❌ Build did not succeed (BUILD SUCCEEDED not found in log)"
        echo "Last 50 lines of log:"
        tail -50 "$ABS_BUILD_DIR/xcodebuild.log"
        exit 1
    fi
fi

DERIVED_DATA_PATH="$ABS_BUILD_DIR/DerivedData"

BUILT_APP=""
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
    BUILT_APP=$(find "$BUILT_PRODUCTS_DIR" -maxdepth 1 -name "*.app" -type d | head -1)
fi

if [ -z "$BUILT_APP" ]; then
    PRODUCTS_DEBUG="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator"
    PRODUCTS_RELEASE="$DERIVED_DATA_PATH/Build/Products/Release-iphonesimulator"
    if [ -d "$PRODUCTS_DEBUG" ]; then
        BUILT_APP=$(find "$PRODUCTS_DEBUG" -maxdepth 1 -name "*.app" -type d | head -1)
        [ -z "$BUILT_APP" ] && BUILT_APP=$(find "$PRODUCTS_DEBUG" -name "*.app" -type d | head -1)
    fi
    if [ -z "$BUILT_APP" ] && [ -d "$PRODUCTS_RELEASE" ]; then
        BUILT_APP=$(find "$PRODUCTS_RELEASE" -maxdepth 1 -name "*.app" -type d | head -1)
        [ -z "$BUILT_APP" ] && BUILT_APP=$(find "$PRODUCTS_RELEASE" -name "*.app" -type d | head -1)
    fi
    if [ -z "$BUILT_APP" ]; then
        for SUBDIR in "$DERIVED_DATA_PATH"/*/; do
            [ -d "$SUBDIR" ] && [ -d "$SUBDIR/Build/Products" ] || continue
            SUBDIR_DEBUG="$SUBDIR/Build/Products/Debug-iphonesimulator"
            SUBDIR_RELEASE="$SUBDIR/Build/Products/Release-iphonesimulator"
            if [ -d "$SUBDIR_DEBUG" ]; then
                BUILT_APP=$(find "$SUBDIR_DEBUG" -name "*.app" -type d | head -1)
                [ -n "$BUILT_APP" ] && break
            fi
            if [ -z "$BUILT_APP" ] && [ -d "$SUBDIR_RELEASE" ]; then
                BUILT_APP=$(find "$SUBDIR_RELEASE" -name "*.app" -type d | head -1)
                [ -n "$BUILT_APP" ] && break
            fi
        done
    fi
fi

if [ -z "$BUILT_APP" ]; then
    CANDIDATE_APPS=$(find "$DERIVED_DATA_PATH" -type d -name "*.app" 2>/dev/null | head -20)
    if [ -n "$CANDIDATE_APPS" ]; then
        SCHEME_APP_NAME="$SCHEME.app"
        for app in $CANDIDATE_APPS; do
            if [[ "$app" == *"/$SCHEME_APP_NAME" ]]; then BUILT_APP="$app"; break; fi
        done
        if [ -z "$BUILT_APP" ]; then
            for app in $CANDIDATE_APPS; do
                if [[ "$app" == *"/DiiaOpenSource.app" ]]; then BUILT_APP="$app"; break; fi
            done
        fi
        if [ -z "$BUILT_APP" ]; then
            for app in $CANDIDATE_APPS; do
                if [[ "$app" == *"/Build/Products/"*"-iphonesimulator/"* ]]; then BUILT_APP="$app"; break; fi
            done
        fi
        [ -z "$BUILT_APP" ] && BUILT_APP=$(echo "$CANDIDATE_APPS" | head -1)
    fi
fi

if [ -z "$BUILT_APP" ] && [ -f "$ABS_BUILD_DIR/xcodebuild.log" ]; then
    LOG_APP_PATHS=$(grep -E "(Touch|CodeSign).*\.app[[:space:]]" "$ABS_BUILD_DIR/xcodebuild.log" | grep -v "\.bundle" | grep -oE "[^[:space:]]+\.app" | head -5 || echo "")
    for app_path in $LOG_APP_PATHS; do
        if [ -d "$app_path" ]; then BUILT_APP="$app_path"; break; fi
    done
    if [ -z "$BUILT_APP" ]; then
        LOG_APP_PATH=$(grep -oE "[^[:space:]]+\.app" "$ABS_BUILD_DIR/xcodebuild.log" | grep -v "\.app\." | grep -v "\.bundle" | head -1 || echo "")
        [ -n "$LOG_APP_PATH" ] && [ -d "$LOG_APP_PATH" ] && BUILT_APP="$LOG_APP_PATH"
    fi
fi

if [ -z "$BUILT_APP" ]; then
    for SUBDIR in "$DERIVED_DATA_PATH"/*/; do
        [ -d "$SUBDIR" ] || continue
        SUBDIR_PRODUCTS="$SUBDIR/Build/Products"
        if [ -d "$SUBDIR_PRODUCTS" ]; then
            FOUND_APP=$(find "$SUBDIR_PRODUCTS" -name "*.app" -type d | head -1)
            if [ -n "$FOUND_APP" ]; then BUILT_APP="$FOUND_APP"; break; fi
        fi
    done
fi

if [ -n "$BUILT_APP" ] && [ -d "$BUILT_APP" ]; then
    [ ! -f "$BUILT_APP/Info.plist" ] && BUILT_APP=""
fi

if [ -z "$BUILT_APP" ] || [ ! -d "$BUILT_APP" ]; then
    echo "❌ App bundle not found (scheme: $SCHEME)"
    [ -f "$ABS_BUILD_DIR/xcodebuild.log" ] && tail -80 "$ABS_BUILD_DIR/xcodebuild.log"
    exit 1
fi

rm -rf "$ABS_OUTPUT_DIR/DiiaOpenSource.app"
cp -R "$BUILT_APP" "$ABS_OUTPUT_DIR/DiiaOpenSource.app"
echo "✅ App: $ABS_OUTPUT_DIR/DiiaOpenSource.app"
