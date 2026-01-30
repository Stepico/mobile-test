#!/bin/bash
set -euo pipefail

DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone 16 Pro}"
PLATFORM_VERSION="${IOS_PLATFORM_VERSION:-18.5}"
OPEN_SIMULATOR="${OPEN_SIMULATOR:-false}"

echo "=== Boot iOS Simulator ==="
echo "Шукаємо пристрій: $DEVICE_NAME (iOS $PLATFORM_VERSION)"

# Визначаємо runtime identifier (iOS-<major>-<minor>)
MAJOR_VERSION=$(echo "$PLATFORM_VERSION" | cut -d. -f1)
MINOR_VERSION=$(echo "$PLATFORM_VERSION" | cut -d. -f2)
RUNTIME_ID="iOS-${MAJOR_VERSION}-${MINOR_VERSION}"

echo "Шукаємо runtime: $RUNTIME_ID"

# Отримуємо список доступних runtimes
AVAILABLE_RUNTIMES=$(xcrun simctl list runtimes available -j 2>/dev/null || echo "{}")

# Перевіряємо чи потрібний runtime доступний
RUNTIME_AVAILABLE=$(echo "$AVAILABLE_RUNTIMES" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for runtime in data.get('runtimes', []):
        if runtime.get('identifier', '').startswith('$RUNTIME_ID'):
            print('true')
            sys.exit(0)
    print('false')
except:
    print('false')
" 2>/dev/null || echo "false")

# Отримуємо список доступних simulators
AVAILABLE_DEVICES=$(xcrun simctl list devices available -j 2>/dev/null || echo "{}")

# Шукаємо UDID для потрібного пристрою з точним runtime
DEVICE_UDID=$(echo "$AVAILABLE_DEVICES" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    target_name = '$DEVICE_NAME'
    target_runtime = '$RUNTIME_ID'
    
    # Спочатку шукаємо точний match
    for runtime_id, devices in data.get('devices', {}).items():
        if target_runtime in runtime_id:
            for device in devices:
                if device.get('name') == target_name and device.get('isAvailable', False):
                    print(device['udid'])
                    sys.exit(0)
    
    # Якщо не знайдено, виходимо без результату
    print('')
except Exception as e:
    print('')
" 2>/dev/null || echo "")

# Якщо не знайдено точний match, спробуємо створити device
if [ -z "$DEVICE_UDID" ]; then
    echo "⚠️  Device '$DEVICE_NAME' з iOS $PLATFORM_VERSION не знайдено"
    echo "Спробуємо створити новий device..."
    
    # Знаходимо точний runtime identifier
    RUNTIME_IDENTIFIER=$(xcrun simctl list runtimes available -j 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    target_id = 'com.apple.CoreSimulator.SimRuntime.iOS-$RUNTIME_ID'
    for runtime in data.get('runtimes', []):
        if '$RUNTIME_ID' in runtime.get('identifier', ''):
            print(runtime['identifier'])
            sys.exit(0)
    print('')
except:
    print('')
" 2>/dev/null || echo "")
    
    if [ -n "$RUNTIME_IDENTIFIER" ]; then
        echo "Створюємо device: $DEVICE_NAME з runtime $RUNTIME_IDENTIFIER"
        DEVICE_UDID=$(xcrun simctl create "$DEVICE_NAME" com.apple.CoreSimulator.SimDeviceType."$(echo "$DEVICE_NAME" | sed 's/ /-/g')" "$RUNTIME_IDENTIFIER" 2>/dev/null || echo "")
        
        if [ -n "$DEVICE_UDID" ]; then
            echo "✅ Device створено з UDID: $DEVICE_UDID"
        else
            echo "⚠️  Не вдалося створити device, використовуємо fallback..."
        fi
    fi
    
    # Якщо створення не вдалося, fallback на найближчий доступний iPhone
    if [ -z "$DEVICE_UDID" ]; then
        echo "Fallback: шукаємо найближчий доступний iPhone..."
        DEVICE_UDID=$(echo "$AVAILABLE_DEVICES" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    target_major = int('$MAJOR_VERSION')
    
    best_device = None
    best_diff = float('inf')
    
    for runtime_id, devices in data.get('devices', {}).items():
        try:
            runtime_parts = runtime_id.split('-')
            if len(runtime_parts) >= 2:
                runtime_major = int(runtime_parts[1])
                diff = abs(runtime_major - target_major)
                
                for device in devices:
                    if 'iPhone' in device.get('name', '') and device.get('isAvailable', False):
                        if diff < best_diff:
                            best_diff = diff
                            best_device = (device['udid'], device['name'], runtime_id)
        except:
            continue
    
    if best_device:
        print(best_device[0])
    else:
        print('')
except Exception:
    print('')
" 2>/dev/null || echo "")
        
        if [ -z "$DEVICE_UDID" ]; then
            echo "❌ Не знайдено жодного доступного iPhone simulator"
            echo "Доступні пристрої:"
            xcrun simctl list devices available | grep -i "iphone" | head -10
            exit 1
        fi
    fi
fi

echo "✅ Знайдено пристрій UDID: $DEVICE_UDID"

# Отримуємо поточний стан пристрою
DEVICE_INFO=$(xcrun simctl list devices -j 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    target_udid = '$DEVICE_UDID'
    for runtime_id, devices in data.get('devices', {}).items():
        for device in devices:
            if device.get('udid') == target_udid:
                state = device.get('state', 'unknown')
                name = device.get('name', 'unknown')
                print(f\"{name}: {state}\")
                sys.exit(0)
    print('unknown: unknown')
except:
    print('unknown: unknown')
" 2>/dev/null || echo "unknown: unknown")

echo "Поточний стан: $DEVICE_INFO"

# Зупиняємо всі вже запущені симулятори (опціонально, для детермінізму)
if [ "${SHUTDOWN_OTHER_SIMS:-false}" = "true" ]; then
    echo "Зупиняємо інші запущені симулятори..."
    xcrun simctl shutdown all 2>/dev/null || true
fi

# Boot пристрою
echo "Запускаємо simulator..."
xcrun simctl boot "$DEVICE_UDID" 2>/dev/null || true

# Відкриваємо Simulator.app якщо потрібно
if [ "$OPEN_SIMULATOR" = "true" ]; then
    echo "Відкриваємо Simulator.app..."
    open -a Simulator 2>/dev/null || true
fi

# Чекаємо поки simulator завантажиться
echo "Очікуємо завантаження simulator..."
xcrun simctl bootstatus "$DEVICE_UDID" -b || {
    echo "⚠️ bootstatus не завершився, але продовжуємо..."
}

# Перевіряємо фінальний статус
FINAL_STATE=$(xcrun simctl list devices | grep "$DEVICE_UDID" | grep -o "Booted" || echo "")
if [ -n "$FINAL_STATE" ]; then
    echo "✅ Simulator успішно запущено"
else
    echo "⚠️ Simulator може бути не повністю завантажений, але продовжуємо..."
fi

# Експортуємо UDID для використання в тестах
export IOS_DEVICE_UDID="$DEVICE_UDID"
echo "Експортовано: IOS_DEVICE_UDID=$DEVICE_UDID"

# У CI — записуємо UDID у GITHUB_OUTPUT, щоб тести використовували саме запущений симулятор
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "udid=$DEVICE_UDID" >> "$GITHUB_OUTPUT"
fi
