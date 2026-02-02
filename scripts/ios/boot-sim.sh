#!/bin/bash
set -euo pipefail

DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone 16 Pro}"
PLATFORM_VERSION="${IOS_PLATFORM_VERSION:-18.5}"
OPEN_SIMULATOR="${OPEN_SIMULATOR:-false}"

echo "=== Boot iOS Simulator ==="

MAJOR_VERSION=$(echo "$PLATFORM_VERSION" | cut -d. -f1)
MINOR_VERSION=$(echo "$PLATFORM_VERSION" | cut -d. -f2)
RUNTIME_ID="iOS-${MAJOR_VERSION}-${MINOR_VERSION}"

AVAILABLE_RUNTIMES=$(xcrun simctl list runtimes available -j 2>/dev/null || echo "{}")

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

AVAILABLE_DEVICES=$(xcrun simctl list devices available -j 2>/dev/null || echo "{}")

DEVICE_UDID=$(echo "$AVAILABLE_DEVICES" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    target_name = '$DEVICE_NAME'
    target_runtime = '$RUNTIME_ID'

    for runtime_id, devices in data.get('devices', {}).items():
        if target_runtime in runtime_id:
            for device in devices:
                if device.get('name') == target_name and device.get('isAvailable', False):
                    print(device['udid'])
                    sys.exit(0)

    print('')
except Exception as e:
    print('')
" 2>/dev/null || echo "")

if [ -z "$DEVICE_UDID" ]; then
    echo "⚠️  Device '$DEVICE_NAME' with iOS $PLATFORM_VERSION not found"
    echo "Trying to create new device..."

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
        echo "Creating device: $DEVICE_NAME with runtime $RUNTIME_IDENTIFIER"
        DEVICE_UDID=$(xcrun simctl create "$DEVICE_NAME" com.apple.CoreSimulator.SimDeviceType."$(echo "$DEVICE_NAME" | sed 's/ /-/g')" "$RUNTIME_IDENTIFIER" 2>/dev/null || echo "")
        
        if [ -n "$DEVICE_UDID" ]; then
            echo "✅ Device created with UDID: $DEVICE_UDID"
        else
            echo "⚠️  Failed to create device, using fallback..."
        fi
    fi

    if [ -z "$DEVICE_UDID" ]; then
        echo "Fallback: searching for nearest available iPhone..."
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
            echo "❌ No available iPhone simulator found"
            echo "Available devices:"
            xcrun simctl list devices available | grep -i "iphone" | head -10
            exit 1
        fi
    fi
fi

echo "✅ Found device UDID: $DEVICE_UDID"

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

if [ "${SHUTDOWN_OTHER_SIMS:-false}" = "true" ]; then
    echo "Shutting down other running simulators..."
    xcrun simctl shutdown all 2>/dev/null || true
fi

echo "Starting simulator..."
xcrun simctl boot "$DEVICE_UDID" 2>/dev/null || true

if [ "$OPEN_SIMULATOR" = "true" ]; then
    echo "Opening Simulator.app..."
    open -a Simulator 2>/dev/null || true
fi

echo "Waiting for simulator to boot..."
xcrun simctl bootstatus "$DEVICE_UDID" -b || {
    echo "⚠️ bootstatus did not complete, continuing..."
}

FINAL_STATE=$(xcrun simctl list devices | grep "$DEVICE_UDID" | grep -o "Booted" || echo "")
if [ -n "$FINAL_STATE" ]; then
    echo "✅ Simulator started successfully"
else
    echo "⚠️ Simulator may not be fully loaded, continuing..."
fi

export IOS_DEVICE_UDID="$DEVICE_UDID"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "udid=$DEVICE_UDID" >> "$GITHUB_OUTPUT"
fi
