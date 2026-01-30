# Налаштування інфраструктури для iOS тестування

Цей документ описує кроки для налаштування всієї необхідної інфраструктури для написання автотестів на iOS.

## ✅ Вже встановлено

- ✅ Node.js та npm
- ✅ npm залежності проекту (webdriverio, appium, тощо)
- ✅ Appium XCUITest driver для iOS
- ✅ Xcode (знайдено в /Applications/Xcode.app)

## 🔧 Кроки налаштування

### 1. Налаштування Xcode Command Line Tools

Потрібно налаштувати Xcode Command Line Tools, щоб вони вказували на повний Xcode замість окремих Command Line Tools:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

**Примітка:** Ця команда потребує пароль адміністратора.

### 2. Прийняття ліцензії Xcode

Після налаштування xcode-select, прийміть ліцензію Xcode:

```bash
sudo xcodebuild -license accept
```

### 3. Встановлення CocoaPods (опціонально, для iOS проекту)

CocoaPods використовується для управління залежностями в iOS проекті:

```bash
sudo gem install cocoapods
```

Або через Homebrew (рекомендовано):
```bash
brew install cocoapods
```

### 4. Перевірка налаштування

Перевірте, що все налаштовано правильно:

```bash
# Перевірка версії Xcode
xcodebuild -version

# Перевірка доступних iOS симуляторів
xcrun simctl list devices available

# Перевірка встановлених Appium драйверів
npx appium driver list
```

### 5. Підготовка iOS додатку для тестування

Для тестування iOS додатку потрібно:

1. Відкрити iOS проект в Xcode:
   ```bash
   cd /path/to/ios-diia
   open DiiaOpenSource.xcodeproj
   ```

2. Збудувати додаток для симулятора:
   - В Xcode виберіть симулятор (наприклад, iPhone 15)
   - Натисніть Product → Build (⌘B)
   - Або використайте команду:
     ```bash
     xcodebuild -project DiiaOpenSource.xcodeproj \
                -scheme DiiaDev \
                -sdk iphonesimulator \
                -configuration Debug \
                -derivedDataPath ./build
     ```

3. Шлях до зібраного .app файлу:
   - Після збірки, .app файл буде в `./build/Build/Products/Debug-iphonesimulator/DiiaOpenSource.app`
   - Використовуйте повний шлях до цього файлу в `wdio.conf.js`

### 6. Налаштування wdio.conf.js для iOS

У файлі `wdio.conf.js` додано приклад iOS capability (закоментований). Розкоментуйте та налаштуйте його:

```javascript
capabilities: [{
    platformName: 'iOS',
    'appium:deviceName': 'iPhone 15', // або інший симулятор
    'appium:platformVersion': '17.0', // версія iOS
    'appium:automationName': 'XCUITest',
    'appium:app': path.resolve('/шлях/до/DiiaOpenSource.app'),
    'appium:noReset': false,
    'appium:fullReset': false
}],
```

### 7. Запуск тестів

Перед запуском тестів переконайтесь, що:

1. iOS симулятор запущений (або запуститься автоматично)
2. Appium сервер запущений:
   ```bash
   npx appium
   ```
   Або через wdio (якщо використовується сервіс 'appium' в конфігурації)

3. Запуск тестів:
   ```bash
   npm run wdio
   ```

## 📝 Додаткова інформація

### Bundle ID iOS додатку
Згідно з конфігурацією: `ua.gov.diia.opensource.app`

### Корисні команди

- Список доступних симуляторів:
  ```bash
  xcrun simctl list devices available
  ```

- Запуск симулятора:
  ```bash
  xcrun simctl boot "iPhone 15"
  ```

- Відкриття симулятора:
  ```bash
  open -a Simulator
  ```

- Очищення зібраних файлів:
  ```bash
  xcodebuild clean -project DiiaOpenSource.xcodeproj -scheme DiiaDev
  ```

## ⚠️ Відомі проблеми

1. **xcode-select помилка**: Якщо після встановлення Xcode все ще з'являється помилка про Command Line Tools, переконайтесь, що виконано крок 1.

2. **Ліцензія Xcode**: При першому використанні Xcode може потребувати прийняття ліцензії (крок 2).

3. **iOS симулятори**: Переконайтесь, що встановлено потрібні версії iOS симуляторів через Xcode → Settings → Platforms.

## 🔗 Корисні посилання

- [Appium XCUITest Driver Documentation](https://github.com/appium/appium-xcuitest-driver)
- [WebdriverIO iOS Testing](https://webdriver.io/docs/desktop-testing/ios)
- [Xcode Command Line Tools](https://developer.apple.com/xcode/)
