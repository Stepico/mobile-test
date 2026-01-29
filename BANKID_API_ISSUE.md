# BankID API проблема в тестах

## Дата: 2026-01-29

## Проблема

При запуску iOS тестів в CI, BankID mock API повертає помилку **404 "NotFoundError"** після введення токену та кліку на кнопку SignIn.

### Симптоми

1. Тести проходять етап створення сесії успішно ✅
2. App встановлюється на симулятор ✅
3. Авторизація починається успішно (checkbox, BankID button, вибір банку) ✅
4. Токен вводиться успішно ✅
5. **Після кліку на SignIn - 404 помилка** ❌

### Помилка в WebView

```json
{
  "name": "NotFoundError",
  "message": "Not found",
  "code": 404,
  "type": "NOT_FOUND"
}
```

## Можливі причини

### 1. Тестовий API недоступний
- BankID mock service не запущений або недоступний
- API endpoint `api2s.diia.gov.ua` може не мати тестового BankID endpoint

### 2. Неправильний токен
- Токен `B7B5908CFBA2DBDA1BE9` може бути застарілим
- Токен може бути недійсним для test environment

### 3. Неправильний банк
- Банк "Банк НаДія" може не існувати в test environment
- Потрібно використати інший тестовий банк

### 4. API URL проблема
- Виправлення в workflow: `api2oss.diia.gov.ua` → `api2s.diia.gov.ua`
- Можливо потрібен інший endpoint для BankID

## Виправлення які зроблено

### 1. Додано розпізнавання WebView помилок

```javascript
// В detectScreen()
if (pageSource.includes('NotFoundError') || pageSource.includes('Not found')) {
    return SCREEN_STATE.WEBVIEW_ERROR;
}
```

### 2. Додано обробку помилок в authorize()

```javascript
// Після кліку на SignIn - перевіряємо помилки
const pageSourceAfterSignIn = await driver.getPageSource();
if (pageSourceAfterSignIn.includes('NotFoundError')) {
    // Click back, restart, throw error with details
    throw new Error('BankID API returned 404 error...');
}
```

### 3. Додано обробку в ensureAuthorized()

```javascript
// Якщо на WebView error screen - click back and restart
if (currentState === SCREEN_STATE.WEBVIEW_ERROR) {
    await backBtn.click();
    await restart();
}
```

### 4. Збільшено timeout для token input

```javascript
// Було: 1000ms
// Стало: 15000ms (15 секунд)
await tokenInput.waitForDisplayed({ timeout: 15000 });
```

## Рішення проблеми

### Варіант 1: Виправити тестове середовище (РЕКОМЕНДОВАНО)

1. **Перевірити що BankID mock service запущений**
   - Подивитися документацію Diia test environment
   - Переконатися що mock service доступний

2. **Отримати правильний тестовий токен**
   - Звернутися до команди Diia за актуальним токеном
   - Оновити токен в `helpers/helper-iOS.js`

3. **Використати правильний тестовий банк**
   - Можливо потрібен інший банк замість "Банк НаДія"
   - Оновити код для вибору іншого банку

### Варіант 2: Пропустити BankID тести тимчасово

Додати skip для тестів які потребують BankID:

```javascript
it.skip('user should be able to authorize in the app for the first time', async () => {
    // Skipped until BankID API fixed
});
```

### Варіант 3: Використати альтернативний метод авторизації

Якщо є інші методи авторизації (NFC, QR code тощо), використати їх замість BankID.

## Наступні кроки

1. ✅ Timeout проблема вирішена
2. ✅ WebView помилки обробляються
3. ❌ **Потрібно виправити BankID test environment**

### Що потрібно зробити

- [ ] Перевірити доступність BankID mock API
- [ ] Отримати правильний тестовий токен
- [ ] Оновити токен в коді якщо потрібно
- [ ] Перевірити чи правильний банк використовується
- [ ] Можливо налаштувати local mock BankID service

## Файли змінено

1. `helpers/helper-iOS.js` - додано обробку WebView помилок
2. `wdio.ios.conf.js` - збільшено timeout
3. `.github/workflows/ios-tests.yml` - оптимізовано CI

## Лог помилки

Повний лог доступний в CI artifacts:
- Run number: 55825395626
- File: `16_Запуск iOS E2E тестів.txt`
- Error appears around: 18:12:04 UTC

## Контакти для вирішення

Потрібно звернутися до команди Diia:
- Для отримання правильного тестового токену
- Для налаштування BankID mock service
- Для документації про test environment
