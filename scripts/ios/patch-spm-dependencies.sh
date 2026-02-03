#!/bin/bash
set -euo pipefail

IOS_SOURCE_DIR="${1:-.}"
BUILD_DIR="${2:-../ios-build}"

if [[ "$BUILD_DIR" != /* ]]; then

  PARENT_DIR="$(dirname "$BUILD_DIR")"
  BASE_NAME="$(basename "$BUILD_DIR")"

  if [ ! -e "$PARENT_DIR" ]; then
    echo "❌ ERROR: Parent directory does not exist: $PARENT_DIR"
    echo "BUILD_DIR was: $BUILD_DIR"
    echo "Current directory: $(pwd)"
    exit 1
  fi

  if ! cd "$PARENT_DIR" 2>/dev/null; then
    echo "❌ ERROR: Cannot cd to directory: $PARENT_DIR"
    exit 1
  fi
  
  BUILD_DIR="$(pwd)/$BASE_NAME"
  cd - > /dev/null
fi

cd "$IOS_SOURCE_DIR"

echo "=== Patch SPM: api2oss → api2s ==="

WORKSPACE_FILE=$(find . -maxdepth 2 -name "*.xcworkspace" -type d | head -1)
PROJECT_FILE=$(find . -maxdepth 2 -name "*.xcodeproj" -type d | head -1)

if [ -n "$WORKSPACE_FILE" ]; then
    BUILD_TYPE="workspace"
    BUILD_PATH="$WORKSPACE_FILE"
elif [ -n "$PROJECT_FILE" ]; then
    BUILD_TYPE="project"
    BUILD_PATH="$PROJECT_FILE"
else
    echo "❌ No .xcworkspace or .xcodeproj found"
    echo "Files in $(pwd):"
    ls -la
    exit 1
fi

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

SCHEME=$(echo "$SCHEMES" | head -1)

echo "Step 1: Resolve SPM..."

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

if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo "❌ Package resolve failed"
  tail -50 /tmp/resolve.log
  exit 1
fi

echo "Step 2: Find SPM packages..."

SPM_CHECKOUTS="$BUILD_DIR/DerivedData/SourcePackages/checkouts"

if [ ! -d "$SPM_CHECKOUTS" ]; then
  SYSTEM_DD=$(find ~/Library/Developer/Xcode/DerivedData -type d -name "SourcePackages" -maxdepth 2 2>/dev/null | head -1 || echo "")
  if [ -n "$SYSTEM_DD" ]; then
    SPM_CHECKOUTS="$SYSTEM_DD/checkouts"
  else
    exit 0
  fi
fi

echo "Step 3: Analyze api2oss..."

PKG_OLD_COUNT=$(grep -r "api2oss" "$SPM_CHECKOUTS" \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  --include="*.xcconfig" \
  2>/dev/null | wc -l | tr -d ' \n' || echo "0")
PKG_OLD_COUNT=${PKG_OLD_COUNT:-0}

if [ "$PKG_OLD_COUNT" -eq 0 ]; then
  exit 0
fi

echo "Step 4: Patch SPM..."

find "$SPM_CHECKOUTS" \
  \( -name "*.swift" -o -name "*.m" -o -name "*.h" -o -name "*.xcconfig" \) \
  -type f \
  -exec sed -i '' 's/api2oss\.diia\.gov\.ua/api2s.diia.gov.ua/g' {} + \
  -exec sed -i '' 's/"api2oss"/"api2s"/g' {} + \
  -exec sed -i '' "s/'api2oss'/'api2s'/g" {} + 2>/dev/null || true

echo "Step 5: Verify..."

PKG_OLD_AFTER=$(grep -r "api2oss" "$SPM_CHECKOUTS" \
  --include="*.swift" \
  --include="*.m" \
  --include="*.h" \
  --include="*.xcconfig" \
  2>/dev/null | wc -l | tr -d ' \n' || echo "0")
PKG_OLD_AFTER=${PKG_OLD_AFTER:-0}  # Default to 0 if empty

if [ "$PKG_OLD_AFTER" -gt 0 ]; then
  echo "❌ CRITICAL: api2oss still present after patch!"
  echo "Remaining $PKG_OLD_AFTER occurrences:"
  echo ""
  grep -r "api2oss" "$SPM_CHECKOUTS" \
    --include="*.swift" \
    --include="*.m" \
    --include="*.h" \
    2>/dev/null | head -10 || true
  echo ""
  echo "⚠️  App will build with WRONG API URL!"
  echo "⚠️  BankID authorization will NOT work!"
  exit 1
fi

echo "✅ Verification passed - api2oss absent in SPM packages"
echo ""

echo "✅ SPM patch done"
