#!/bin/bash
set -euo pipefail

IOS_SOURCE_DIR="${1:-.}"
cd "$IOS_SOURCE_DIR"

echo "=== Patch API Host: api2oss → api2s ==="

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
  echo "✅ api2oss not found in source"
  exit 0
fi

FILE_COUNT=$(echo "$FILES_WITH_OLD_URL" | wc -l | tr -d ' ')
[ "$FILE_COUNT" -gt 0 ] && echo "Files with api2oss: $FILE_COUNT"

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
  echo "❌ api2oss still present after patch"
  echo "$REMAINING" | head -10
  exit 1
fi
echo "✅ Patch API Host done"
