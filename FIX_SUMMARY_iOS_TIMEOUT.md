# Виправлення проблем з iOS тестами в CI

## Дата: 2026-01-29

## Проблеми які було виправлено

### 1. Stale Element в функції authorize() (локально)
**Проблема:** Елемент `bankNadiia` створювався до зміни екрану, тому ставав недійсним.

**Виправлення в `helpers/helper-iOS.js`:**
- Спочатку чекаємо зміни екрану через page source
- Потім шукаємо свіжий елемент після зміни екрану

### 2. Timeout при створенні сесії Appium в CI
**Проблема:** App розміром 111MB занадто довго встановлюється і запускається на симуляторі (>5 хвилин).

## Всі зміни

### `wdio.ios.conf.js`

#### 1. Збільшені timeout для CI:
```javascript
// WebDriverAgent timeouts
'appium:wdaLaunchTimeout': process.env.CI ? 300000 : 120000, // 5 min CI, 2 min local
'appium:wdaConnectionTimeout': 180000, // 3 minutes to establish connection
'appium:wdaStartupRetries': 4,
'appium:wdaStartupRetryInterval': 20000,

// Connection timeout
connectionRetryTimeout: process.env.CI ? 600000 : 120000, // 10 min CI, 2 min local
connectionRetryCount: 3,
```

#### 2. Оптимізації для швидшого запуску:
```javascript
// Пропускаємо reinstall в CI якщо app вже встановлено
'appium:noReset': process.env.CI ? true : false,

// Пауза після встановлення
'appium:iosInstallPause': 8000, // 8 seconds

// Автоматично приймаємо alerts
'appium:autoAcceptAlerts': true,

// Не закриваємо app між тестами
'appium:shouldTerminateApp': false,
```

#### 3. Вимкнення verbose логів в CI:
```javascript
'appium:showXcodeLog': !process.env.CI,
'appium:skipLogCapture': process.env.CI,
```

### `.github/workflows/ios-tests.yml`

#### 1. Додано попереднє встановлення app на симулятор:
```yaml
- name: Попереднє встановлення app на Simulator
  run: |
    echo "Встановлюємо app на Simulator заздалегідь..."
    UDID="${{ steps.boot-sim.outputs.udid }}"
    APP_PATH="./ios-app/DiiaOpenSource.app"
    
    xcrun simctl install "$UDID" "$APP_PATH"
    sleep 5
```

#### 2. Збільшено timeout для кроку тестів:
```yaml
timeout-minutes: 60  # Було 45
```

#### 3. Додано debug логування:
- Виводить конфігурацію перед запуском
- Показує розмір та шлях до app

### `helpers/helper-iOS.js`

#### Виправлення stale element:
```javascript
// Спочатку чекаємо зміни екрану
await driver.waitUntil(async () => {
    const pageSource = await driver.getPageSource();
    return pageSource.includes('Банк НаДія') || pageSource.includes('Оберіть свій банк');
}, { timeout: 15000 });

// Тільки після зміни екрану шукаємо свіжий елемент
const bankNadiia = getElementByText('Банк НаДія');
await bankNadiia.waitForDisplayed({ timeout: 5000 });
await bankNadiia.click();
```

## Часові рамки (timeout)

### До виправлення:
- **WDA Launch**: 60 sec (1 хв)
- **Connection Retry**: 180 sec (3 хв)
- **Test step**: 45 min

### Після виправлення:
- **WDA Launch (CI)**: 300 sec (5 хв)
- **WDA Connection**: 180 sec (3 хв)
- **Connection Retry (CI)**: 600 sec (10 хв)
- **WDA Retries**: 4 спроби з інтервалом 20 sec
- **Test step**: 60 min

## Очікуваний результат

1. **Створення сесії**: До 10 хвилин (замість 5 хв timeout)
2. **Повторні запуски**: Швидші завдяки `noReset: true` (app не переустановлюється)
3. **Локальні тести**: Виправлено stale element, тести повинні проходити

## Як перевірити

### Локально:
```bash
npm run wdio:ios -- --spec ./test/specs/iOS/authentication.e2e.js
```

### В CI:
1. Пушніть зміни в репозиторій
2. Запустіть workflow "iOS App Tests" вручну або через PR
3. Перевірте логи - app повинно встановитися до запуску тестів
4. Тести повинні запуститися протягом 10 хвилин

## Додаткові оптимізації (якщо все ще буде timeout)

Якщо навіть після цих змін будуть timeout, можна:

1. **Збільшити timeout до 15 хвилин**:
   ```javascript
   connectionRetryTimeout: process.env.CI ? 900000 : 120000, // 15 min
   ```

2. **Використати кешування встановленого app**:
   - Зберігати UDID симулятора між запусками
   - Використовувати той самий симулятор

3. **Запускати тільки 1 spec файл за раз**:
   ```javascript
   maxInstances: 1, // Вже встановлено
   ```

4. **Оптимізувати розмір app**:
   - Використати Release build замість Debug
   - Видалити непотрібні символи та ресурси

## Файли які змінено

1. `wdio.ios.conf.js` - основна конфігурація
2. `.github/workflows/ios-tests.yml` - CI workflow
3. `helpers/helper-iOS.js` - виправлення stale element
