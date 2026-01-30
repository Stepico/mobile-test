# iOS Scripts для CI/CD

Збірка скриптів для автоматизації iOS E2E тестування в GitHub Actions.

## 📁 Структура

```
scripts/ios/
├── boot-sim.sh              # Запуск iOS Simulator
├── build-app.sh             # Збірка iOS app для Simulator
├── ensure-appium.sh         # Встановлення Appium + XCUITest driver
├── install-app.sh           # Встановлення app на Simulator
├── patch-api-host.sh        # Патч main source code (api2oss → api2s)
├── patch-spm-dependencies.sh # Патч SPM packages (api2oss → api2s)
├── verify-app-bundle.sh     # Верифікація зібраного app
└── verify-simulator.sh      # Перевірка стану Simulator
```

---

## 🔧 Скрипти

### 1. `boot-sim.sh`

**Призначення:** Запуск iOS Simulator для тестування

**Використання:**
```bash
export IOS_DEVICE_NAME="iPhone 16 Pro"
export IOS_PLATFORM_VERSION="18.5"
bash scripts/ios/boot-sim.sh
```

**Що робить:**
- Створює simulator якщо не існує
- Bootує simulator
- Виводить UDID в GITHUB_OUTPUT

**Outputs:**
- `udid` - UDID запущеного simulator

---

### 2. `build-app.sh`

**Призначення:** Збірка iOS app для Simulator

**Використання:**
```bash
export IOS_SOURCE_DIR="./ios-diia"
export IOS_DEVICE_NAME="iPhone 16 Pro"
export IOS_PLATFORM_VERSION="18.5"
bash scripts/ios/build-app.sh
```

**Що робить:**
- Знаходить workspace та scheme
- Перевіряє iOS runtime
- Збирає app через xcodebuild
- Копіює зібраний .app в ios-app/

**Вихід:**
- `./ios-app/DiiaOpenSource.app` - готовий app bundle

**Важливо:**
- Використовує isolated DerivedData в `ios-build/DerivedData`
- Explicit `-destination` для determinism
- Логує в `ios-build/xcodebuild.log`

---

### 3. `ensure-appium.sh`

**Призначення:** Встановлення Appium та XCUITest driver

**Використання:**
```bash
bash scripts/ios/ensure-appium.sh
```

**Що робить:**
- Перевіряє чи Appium вже встановлено
- Встановлює fixed versions (Appium 2.11.5, XCUITest 7.26.2)
- Idempotent - безпечно запускати кілька разів

**Детермінізм:**
- Fixed versions (не latest)
- Перевіряє існуючу версію перед reinstall

---

### 4. `patch-api-host.sh`

**Призначення:** Патч main source code (api2oss → api2s)

**Використання:**
```bash
cd ios-diia
bash ../scripts/ios/patch-api-host.sh
```

**Що робить:**
- Знаходить всі файли з `api2oss` в source коді
- Замінює `api2oss.diia.gov.ua` → `api2s.diia.gov.ua`
- Патчить .swift, .m, .h, .xcconfig, .plist, .json, .xml
- Verify що api2oss відсутній після патчу

**Критично:**
- Exit 1 якщо api2oss залишився після патчу
- Виключає .git, Pods, build, DerivedData

**Коли викликати:**
- ПІСЛЯ checkout ios-diia
- ПЕРЕД build

---

### 5. `patch-spm-dependencies.sh` ⚠️ КРИТИЧНИЙ

**Призначення:** Патч Swift Package Manager dependencies (api2oss → api2s)

**Використання:**
```bash
bash scripts/ios/patch-spm-dependencies.sh ios-diia ios-build
```

**Параметри:**
- `$1` - iOS source директорія (default: `.`)
- `$2` - Build директорія (default: `../ios-build`)

**Що робить:**
1. **Resolve SPM packages** - завантажує з GitHub:
   - ios-network
   - ios-authorization ← Contains BankID code!
   - ios-documents
   - ios-commonservices
   - ios-publicservices

2. **Знаходить checkouts:**
   - Primary: `ios-build/DerivedData/SourcePackages/checkouts`
   - Fallback: `~/Library/Developer/Xcode/DerivedData/.../SourcePackages`

3. **Патчить api2oss → api2s** в усіх SPM packages:
   - `api2oss.diia.gov.ua` → `api2s.diia.gov.ua`
   - `"api2oss"` → `"api2s"`
   - `'api2oss'` → `'api2s'`

4. **Verify** - exit 1 якщо api2oss залишився

**Чому критичний:**
- SPM packages містять захардкожений `api2oss`
- Без цього патчу BankID авторизація НЕ ПРАЦЮЄ
- App binary матиме старий URL → 404 errors

**Коли викликати:**
- ПІСЛЯ patch-api-host.sh
- ПІСЛЯ очищення build cache
- ПЕРЕД build-app.sh

**Regression note:**
Цей крок був видалений під час refactoring → CI tests failed.
Повернено для виправлення BankID авторизації.

---

### 6. `verify-app-bundle.sh`

**Призначення:** Верифікація зібраного iOS app bundle

**Використання:**
```bash
bash scripts/ios/verify-app-bundle.sh ./ios-app/DiiaOpenSource.app
```

**Що робить:**
1. Перевіряє існування app bundle
2. Отримує Bundle ID та розмір
3. **КРИТИЧНО:** Перевіряє API URL в binary:
   - ✅ api2s.diia.gov.ua має бути присутній
   - ❌ api2oss.diia.gov.ua має бути відсутній

**Outputs:**
- `app_size` → GITHUB_OUTPUT
- `bundle_id` → GITHUB_OUTPUT

**Fail conditions:**
- App bundle не існує → exit 1
- Старий URL (api2oss) знайдено в binary → exit 1
- Новий URL (api2s) відсутній в binary → exit 1

**Гарантія:**
Workflow НЕ запустить тести якщо app має неправильний API URL.

---

### 7. `install-app.sh`

**Призначення:** Встановлення app на iOS Simulator

**Використання:**
```bash
UDID="38606A79-C4CB-465E-83F3-D09A50714AAE"
bash scripts/ios/install-app.sh "$UDID" ./ios-app/DiiaOpenSource.app
```

**Параметри:**
- `$1` - Simulator UDID (обов'язковий)
- `$2` - App path (опціонально, default: `./ios-app/DiiaOpenSource.app`)

**Що робить:**
- Перевіряє стан simulator (має бути Booted)
- Встановлює app з retry логікою (3 спроби, 2s delay)
- Verify що app встановлено через `listapps`

**Robust:**
- Auto-retry на transient failures
- Verification після install

---

### 8. `verify-simulator.sh`

**Призначення:** Перевірка що simulator запущений

**Використання:**
```bash
bash scripts/ios/verify-simulator.sh
```

**Що робить:**
- Перевіряє що є simulator в статусі "Booted"
- Виводить інформацію про запущений simulator
- Exit 1 якщо simulator не готовий

**Коли викликати:**
- Після boot-sim.sh
- Перед install-app.sh або run tests

---

## 🔄 Workflow Order (Правильна послідовність)

```yaml
# 1. Підготовка
checkout → setup node → select xcode → install npm deps → cache appium → install appium

# 2. Checkout iOS source
checkout ios-diia

# 3. Патч source code
patch-api-host.sh                # Main source (api2oss → api2s)
  ↓
clean build cache                # rm DerivedData, build/
  ↓
patch-spm-dependencies.sh        # SPM packages (api2oss → api2s) ← CRITICAL!
  ↓
build-app.sh                     # Збірка з пропатченим кодом
  ↓
verify-app-bundle.sh             # Strict verify: NO api2oss in binary!

# 4. Simulator
boot-sim.sh                      # Запуск simulator
  ↓
verify-simulator.sh              # Перевірка статусу
  ↓
install-app.sh                   # Встановлення app

# 5. Тести
npm run test:ios:ci              # E2E tests з BankID
```

---

## ⚠️ КРИТИЧНІ МОМЕНТИ

### 1. Патч SPM Dependencies (patch-spm-dependencies.sh)

**ОБОВ'ЯЗКОВО** викликати перед build!

**Чому:**
- SPM packages (ios-authorization, ios-network) містять захардкожений `api2oss`
- Без патчу app матиме старий URL в binary
- BankID авторизація не працюватиме (404 errors)

**Було (CI failed):**
```
Main source patch → Build → App має api2oss + api2s → Tests FAIL
```

**Стало (CI pass):**
```
Main source patch → SPM patch → Build → App має ТІЛЬКИ api2s → Tests PASS
```

### 2. Верифікація App Bundle (verify-app-bundle.sh)

**Fail-fast protection:**
- Якщо api2oss знайдено в binary → workflow ЗУПИНЯЄТЬСЯ
- Не дозволяє запускати тести з неправильним app

**Гарантія:**
```bash
if strings binary | grep "api2oss"; then
  exit 1  # ← Зупиняє весь workflow!
fi
```

### 3. Install App (install-app.sh)

**Retry logic:**
- 3 спроби з 2s delay
- Важливо для transient simulator issues

---

## 📊 Метрики

### Workflow Size:
- **Було:** 602 рядки (monolithic)
- **Стало:** 366 рядків (-39%)
- **Scripts:** 8 модульних скриптів

### Maintainability:
- ✅ Кожен скрипт має 1 чітку responsibility
- ✅ Легко тестувати локально
- ✅ Легко debug (окремі логи)
- ✅ Reusable в інших workflows

### Determinism:
- ✅ Fixed Appium versions
- ✅ Isolated DerivedData
- ✅ Explicit xcodebuild destinations
- ✅ SPM patch before build
- ✅ Strict app verification

---

## 🧪 Тестування локально

```bash
# 1. Boot simulator
export IOS_DEVICE_NAME="iPhone 16 Pro"
export IOS_PLATFORM_VERSION="18.5"
bash scripts/ios/boot-sim.sh

# 2. Patch і build
cd ios-diia
bash ../scripts/ios/patch-api-host.sh
bash ../scripts/ios/patch-spm-dependencies.sh . ../ios-build
cd ..
bash scripts/ios/build-app.sh

# 3. Verify
bash scripts/ios/verify-app-bundle.sh

# 4. Install & test
UDID=$(xcrun simctl list devices | grep "Booted" | grep -oE '[A-F0-9-]{36}')
bash scripts/ios/install-app.sh "$UDID"
npm run test:ios:ci
```

---

## 🐛 Troubleshooting

### BankID не працює в CI

**Symptom:**
```
[iOS] authorize FAILED | element TextField not displayed
[iOS] authorize FAILED | Token was not entered
```

**Причина:**
App binary містить `api2oss` → BankID calls fail з 404

**Рішення:**
1. Перевірте що `patch-spm-dependencies.sh` виконався ПЕРЕД build
2. Перевірте логи: "SPM packages повністю пропатчено - api2oss відсутній"
3. Перевірте `verify-app-bundle.sh`: має бути "Старий URL НЕ знайдено"

### App bundle verification fails

**Symptom:**
```
❌ КРИТИЧНА ПОМИЛКА: СТАРИЙ URL знайдено в binary!
```

**Причина:**
SPM patch не спрацював або не викликався

**Рішення:**
1. Додайте крок `patch-spm-dependencies.sh` перед build
2. Очистіть build cache перед SPM patch
3. Перевірте що xcodebuild -resolvePackageDependencies не failed

---

## 📝 Changelog

### 2026-01-30: Major refactoring + SPM patch fix

**Added:**
- `patch-spm-dependencies.sh` - Патч SPM packages (CRITICAL для BankID)
- `verify-app-bundle.sh` - Strict app verification з exit 1
- `install-app.sh` - Robust app install з retry
- `verify-simulator.sh` - Simulator state check

**Updated:**
- `build-app.sh` - Explicit xcodebuild destination
- `boot-sim.sh` - Auto-create simulator якщо не існує

**Impact:**
- Workflow: 602 → 366 lines (-39%)
- Maintainability: ↑↑↑ (модульні скрипти)
- Reliability: ↑↑ (fail-fast verification)
- **BankID в CI: BROKEN → FIXED** ✅

---

## 🎯 Best Practices

1. **Завжди патчіть SPM перед build:**
   ```yaml
   patch-api-host.sh → patch-spm-dependencies.sh → build-app.sh
   ```

2. **Завжди verify app перед тестами:**
   ```yaml
   build-app.sh → verify-app-bundle.sh → тести
   ```

3. **Використовуйте strict verification:**
   - Scripts повертають exit 1 на критичні помилки
   - Workflow зупиняється якщо app неправильний

4. **Isolated build:**
   - Завжди вказуйте `IOS_SOURCE_DIR` та build dir
   - Не покладайтесь на system DerivedData

5. **Determinism:**
   - Fixed versions (Appium, XCUITest, iOS app tag)
   - Explicit destinations
   - Clean cache перед критичними кроками
