#!/bin/bash
set -euo pipefail

# ============================================================================
# Verify iOS Simulator State
# ============================================================================
# Перевіряє що simulator запущений та в статусі Booted
# 
# Вихід: 0 якщо OK, 1 якщо simulator не готовий
# Outputs: simulator info
# ============================================================================

echo "=== Перевірка стану iOS Simulator ==="
echo ""

# Отримуємо список запущених simulators
BOOTED_DEVICE=$(xcrun simctl list devices | grep "Booted" || true)

if [ -z "$BOOTED_DEVICE" ]; then
  echo "❌ Simulator не запущено або не в статусі Booted"
  echo ""
  echo "=== Доступні пристрої ==="
  xcrun simctl list devices
  echo ""
  echo "РІШЕННЯ: Запустіть simulator через boot-sim.sh"
  exit 1
fi

echo "✅ Simulator запущено:"
echo "$BOOTED_DEVICE"
echo ""

# Додаткова інформація (якщо потрібно)
if [ -n "${VERBOSE:-}" ]; then
  echo "=== Детальна інформація ==="
  xcrun simctl list devices | grep -A 5 "Booted"
fi

echo "=== ✅ Simulator готовий для тестування ==="
