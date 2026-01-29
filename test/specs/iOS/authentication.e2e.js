const { expect, driver } = require('@wdio/globals');
const path = require('path');

const { 
    getElementByText,
    getElementByAccessibilityId,
    getElementByClassChain,
    getElementByPredicate,
    detectScreen,
    getMenuButton,
    ensureState,
    ensureOnMainScreen,
    ensureOnPinLoginScreen,
    signOut,
    setupTestState,
    SCREEN_STATE,
    authorize,
    forgotCode,
    login,
    assertGreeting,
    assertPopup,
    restart,
    enterPinCode,
    waitForLoadingToComplete
} = require(path.resolve(__dirname, '../../../helpers/helper-iOS.js'));

describe('Auth test suite', () => {
    // Track if we should skip restart in beforeEach
    let shouldSkipRestart = null; // null = not determined yet
    let skipRestartDetermined = false;
    let isFirstTest = true; // Track if this is the first test (after session creation)
    const TOTAL_TESTS_IN_FILE = 9; // Total number of tests in this file

    beforeEach(async function() {
        // Determine skip restart logic on first call
        if (!skipRestartDetermined) {
            // Check if grep is used in command line arguments
            const hasGrep = process.argv.some(arg => 
                arg.includes('--mochaOpts.grep') || arg.includes('--grep')
            );
            
            // Skip restart in two cases:
            // 1. When grep is used (single or filtered test execution)
            // 2. When all tests are running without grep (full file execution)
            // We can't easily count tests at this point, so we assume:
            // - If grep is used, it's likely a single/filtered test
            // - If no grep, we'll check by counting test executions
            if (hasGrep) {
                shouldSkipRestart = true;
                console.log(`[INFO] Skipping restart: grep filter detected (single/filtered test execution)`);
            } else {
                // No grep - might be all tests, we'll determine based on test count
                // For now, assume all tests if no grep
                shouldSkipRestart = true;
                console.log(`[INFO] Skipping restart: no grep filter (assuming all tests)`);
            }
            skipRestartDetermined = true;
        }
        
        // Skip restart if determined to skip
        if (shouldSkipRestart) {
            console.log('[INFO] Skipping restart in beforeEach');
            
            // If this is the first test after session creation, wait for app to load
            if (isFirstTest) {
                console.log('[INFO] First test - waiting for app to load after session creation');
                await driver.pause(2000); // Give app time to fully load after WebDriver session creation
                isFirstTest = false;
            } else {
                // For subsequent tests, just a small stabilization delay
                await driver.pause(300);
            }
            return;
        }
        
        // Ensure clean state before each test - just restart
        // Each test will set up its required state
        await restart();
        // Wait a bit for app to stabilize
        await driver.pause(300);
    });

    it('user should be able to authorize in the app for the first time', async () => {
        // Setup: start from AUTH screen
        await setupTestState(SCREEN_STATE.AUTH);
        
        // Test logic
        await authorize('0');
        await assertGreeting();
    });

    it('user should be able to log in to the app', async () => {
        // Setup: start from PIN_LOGIN screen with PIN '0' set
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '0' });
        
        // Test logic
        await login('0');
        await assertGreeting();
    });

    it('user should be able to use "Forgot code" feature', async function() {
        this.timeout(900000); // 15 minutes for double BankID flow (forgotCode + authorize)
        
        // Setup: start from PIN_LOGIN screen with PIN '0' set
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '0' });
        
        // Test logic
        // forgotCode() now ensures we're on AUTH screen at the end
        await forgotCode();
        // Small delay to ensure UI is stable before authorizing
        await driver.pause(1000);
        await authorize('1');
        await assertGreeting();
    });

    it('user should be able to log in with new code after changing it (via "Forgot code" feature)', async () => {
        // Setup: start from PIN_LOGIN screen with PIN '1' set (after forgotCode in previous test)
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '1' });
        
        // Test logic
        // Verify we're on PIN login screen before login
        const currentState = await detectScreen();
        if (currentState !== SCREEN_STATE.PIN_LOGIN) {
            // If not on PIN login, ensure we are
            await ensureOnPinLoginScreen(15000);
        }
        await login('1');
        await assertGreeting();
    });

    it('user should be able to change pin code (via Settings)', async () => {
        // Setup: start from MAIN screen with PIN '1' set (from previous forgot code test)
        await setupTestState(SCREEN_STATE.MAIN, { pinCode: '1' });

        const menuBtn = getMenuButton();
        await menuBtn.waitForDisplayed({ timeout: 5000 });
        await menuBtn.click();

        // Wait for menu to open before looking for settings
        await driver.waitUntil(
            async () => {
                try {
                    const settingsBtn = getElementByPredicate(
                        'type == "XCUIElementTypeButton" AND (name CONTAINS "Налаштування" OR label CONTAINS "Налаштування")'
                    );
                    return await settingsBtn.isDisplayed();
                } catch (e) {
                    return false;
                }
            },
            { timeout: 3000, timeoutMsg: 'Menu did not open - settings button not found' }
        );

        const settingsBtn = getElementByPredicate(
            'type == "XCUIElementTypeButton" AND (name CONTAINS "Налаштування" OR label CONTAINS "Налаштування")'
        );
        await settingsBtn.waitForDisplayed({ timeout: 3000 });
        await settingsBtn.click();

        const changePinBtn = getElementByAccessibilityId('Змінити код для входу');
        await changePinBtn.waitForDisplayed({ timeout: 5000 });
        await changePinBtn.click();

        // Wait for repeat old PIN screen (using Predicate to handle newline)
        const repeatCodeScreenHeader = getElementByPredicate('label CONTAINS "Повторіть" AND label CONTAINS "код з 4 цифр"');
        await repeatCodeScreenHeader.waitForDisplayed({ timeout: 10000 });
        await expect(repeatCodeScreenHeader).toBeDisplayed();

        await enterPinCode('1');

        // Wait for new PIN screen
        const codeScreenHeader = getElementByAccessibilityId('Новий код з 4 цифр');
        await codeScreenHeader.waitForDisplayed({ timeout: 10000 });
        await expect(codeScreenHeader).toBeDisplayed();

        await enterPinCode('2');

        // Wait for repeat new PIN screen (using Predicate to handle newline)
        const repeatnewCodeScreenHeader = getElementByPredicate('label CONTAINS "Повторіть" AND label CONTAINS "код з 4 цифр"');
        await repeatnewCodeScreenHeader.waitForDisplayed({ timeout: 10000 });
        await expect(repeatnewCodeScreenHeader).toBeDisplayed();
        await driver.pause(1000);

        await enterPinCode('2');
        await driver.pause(100);

        await assertPopup(
            'Код змінено',
            'Ви змінили код для входу у застосунок Дія.'
        );

        const thankBtn = getElementByClassChain('Button', 'name == "Дякую" OR label == "Дякую"');
        await thankBtn.waitForDisplayed({ timeout: 5000 });
        await thankBtn.click();

        // Для iOS перевіряємо наявність екрану налаштувань по тексту
        const settingsHeader = getElementByAccessibilityId('Налаштування');
        await settingsHeader.waitForDisplayed({ timeout: 5000 });
        await expect(settingsHeader).toBeDisplayed();
    });

    it('user should be able to login with new pin (after changing it via Settings)', async () => {
        // Setup: start from PIN_LOGIN screen with PIN '2' set (after changing via Settings)
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '2' });
        
        // Test logic
        await login('2');
        await assertGreeting();
    });

    it('user should be able to sign out from the app', async () => {
        // Setup: start from MAIN screen with any PIN set (using '2' from previous test)
        await setupTestState(SCREEN_STATE.MAIN, { pinCode: '2' });

        const menuBtn = getMenuButton();
        await menuBtn.waitForDisplayed({ timeout: 5000 });
        await menuBtn.click();

        // Очікуємо відкриття меню - перевіряємо наявність елементів меню
        await driver.waitUntil(
            async () => {
                try {
                    const settingsBtn = getElementByPredicate(
                        'type == "XCUIElementTypeButton" AND (name CONTAINS "Налаштування" OR label CONTAINS "Налаштування")'
                    );
                    return await settingsBtn.isDisplayed();
                } catch (e) {
                    return false;
                }
            },
            { timeout: 3000, timeoutMsg: 'Menu did not open' }
        );

        // Для iOS прокручуємо до кнопки "Вийти"
        await driver.execute('mobile: scroll', {
            direction: 'down',
            predicateString: 'name == "Вийти" OR label == "Вийти"'
        });

        // Знаходимо кнопку "Вийти" в меню (не в діалозі)
        // Використовуємо більш специфічний селектор - кнопка в меню має бути видимою та enabled
        const signoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true AND visible == true');
        await signoutBtn.waitForDisplayed({ timeout: 5000 });
        await signoutBtn.click();

        // Очікуємо появу діалогу підтвердження
        await driver.waitUntil(
            async () => {
                try {
                    // Перевіряємо наявність діалогу підтвердження
                    const confirmDialog = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true');
                    return await confirmDialog.isDisplayed();
                } catch (e) {
                    return false;
                }
            },
            { timeout: 3000, timeoutMsg: 'Confirmation dialog did not appear' }
        );

        // Клікаємо на кнопку підтвердження в діалозі
        const confirmSignoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true');
        await confirmSignoutBtn.waitForDisplayed({ timeout: 5000 });
        await confirmSignoutBtn.click();

        // Очікуємо появу екрану авторизації
        const loginWithNBU = getElementByClassChain('Button', 'name == "BankID НБУ  . "');
        await loginWithNBU.waitForDisplayed({ timeout: 5000 });
        await expect(loginWithNBU).toBeDisplayed();
    });

    it('user should be able to authorize to the app after sign out', async () => {
        // Setup: start from AUTH screen (after sign out)
        await setupTestState(SCREEN_STATE.AUTH);
        
        // Test logic
        await authorize('3');
        await assertGreeting();
    });

    it('user should be able to reauthorize after 3 not successful pin code inputs', async function() {
        this.timeout(900000); // 15 minutes for double BankID flow (3 wrong PINs + reauthorize)
        
        // Setup: start from PIN_LOGIN screen with PIN '0' set
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '0' });
        
        // Test logic: Enter wrong PIN 3 times
        for (let i = 0; i < 3; ++i) {
            // Verify we're still on PIN login screen before each attempt
            const currentState = await detectScreen();
            if (currentState !== SCREEN_STATE.PIN_LOGIN && i < 2) {
                throw new Error(`Expected PIN_LOGIN screen before attempt ${i + 1}, but got ${currentState}`);
            }
            
            // Enter wrong PIN
            await enterPinCode('9');
            
            // After entering PIN, wait a bit for app to process
            await driver.pause(500);
        }

        // After 3rd wrong attempt, wait for popup to appear
        await driver.pause(500);
        
        // Wait for and assert the popup
        await assertPopup(
            'Ви ввели неправильний код тричі',
            'Пройдіть повторну авторизацію у застосунку'
        );

        // Click "Авторизуватися" button
        const authorizeBtn = getElementByClassChain('Button', 'name == "Авторизуватися" OR label == "Авторизуватися"');
        await authorizeBtn.waitForDisplayed({ timeout: 5000 });
        await authorizeBtn.click();

        // After clicking "Авторизуватися", wait for AUTH screen to appear
        await driver.pause(2000);
        
        // Wait for AUTH screen with retry logic
        await driver.waitUntil(
            async () => {
                try {
                    // Wait for loading to complete first
                    await waitForLoadingToComplete(10000).catch(() => {});
                    
                    // Check if we're on AUTH screen
                    const state = await detectScreen();
                    if (state === SCREEN_STATE.AUTH) {
                        return true;
                    }
                    
                    // Also check for auth screen elements directly
                    try {
                        const checkbox = getElementByAccessibilityId('checkbox_conditions_bordered_auth');
                        if (await checkbox.isDisplayed().catch(() => false)) {
                            return true;
                        }
                    } catch (e) {
                        // Continue
                    }
                    
                    try {
                        const bankIdBtn = getElementByPredicate(
                            'type == "XCUIElementTypeButton" AND (name CONTAINS "BankID" OR label CONTAINS "BankID")'
                        );
                        if (await bankIdBtn.isDisplayed().catch(() => false)) {
                            return true;
                        }
                    } catch (e) {
                        // Continue
                    }
                    
                    // Check page source for auth indicators
                    try {
                        const pageSource = await driver.getPageSource();
                        if (pageSource.includes('checkbox_conditions_bordered_auth') || 
                            (pageSource.includes('BankID НБУ') && !pageSource.includes('menuSettings'))) {
                            return true;
                        }
                    } catch (e) {
                        // Session might be temporarily unavailable, continue waiting
                        return false;
                    }
                    
                    return false;
                } catch (e) {
                    // If session is unavailable, wait a bit and retry
                    await driver.pause(1000);
                    return false;
                }
            },
            { timeout: 30000, timeoutMsg: 'AUTH screen did not appear after clicking "Авторизуватися"' }
        );

        // Reauthorize with new PIN '4'
        await authorize('4');
        await assertGreeting();
    });
});
