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
    let shouldSkipRestart = null;
    let skipRestartDetermined = false;
    let isFirstTest = true;
    const TOTAL_TESTS_IN_FILE = 9;

    beforeEach(async function() {
        if (!skipRestartDetermined) {
            const hasGrep = process.argv.some(arg => 
                arg.includes('--mochaOpts.grep') || arg.includes('--grep')
            );
            
            if (hasGrep) {
                shouldSkipRestart = true;
                console.log(`[INFO] Skipping restart: grep filter detected (single/filtered test execution)`);
            } else {
                shouldSkipRestart = false;
                console.log(`[INFO] No grep filter: restarting app between tests (full suite)`);
            }
            skipRestartDetermined = true;
        }
        
        if (shouldSkipRestart) {
            console.log('[INFO] Skipping restart in beforeEach');
            
            if (isFirstTest) {
                console.log('[INFO] First test - waiting for app to load after session creation');
                await driver.pause(2000);
                isFirstTest = false;
            } else {
                await driver.pause(300);
            }
            return;
        }
        
        await restart();
        await driver.pause(300);
    });

    // Test-case #1.1
    it('user should be able to authorize in the app for the first time', async () => {
        await setupTestState(SCREEN_STATE.AUTH);
        
        await authorize('0');
        await assertGreeting();
    });

    // Test-case #1.2
    it('user should be able to log in to the app', async () => {
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '0' });
        
        await driver.pause(1000);
        const state = await detectScreen();
        console.log(`[INFO] Current state after setupTestState: ${state}`);
        
        if (state !== SCREEN_STATE.PIN_LOGIN) {
            console.log(`[WARNING] Expected PIN_LOGIN but got ${state}, ensuring correct state...`);
            await ensureOnPinLoginScreen(15000);
        }
        
        await login('0');
        await assertGreeting();
    });

    // Test-case #1.3
    it('user should be able to use "Forgot code" feature', async function() {
        this.timeout(900000);
        
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '0' });
        
        await driver.pause(1000);
        const state = await detectScreen();
        console.log(`[INFO] Current state after setupTestState: ${state}`);
        
        if (state !== SCREEN_STATE.PIN_LOGIN) {
            console.log(`[WARNING] Expected PIN_LOGIN but got ${state}, ensuring correct state...`);
            await ensureOnPinLoginScreen(15000);
        }
        
        await forgotCode();
        await driver.pause(2000);
        await waitForLoadingToComplete(30000);
        await authorize('1');
        await assertGreeting();
    });

    // Test-case #1.4
    it('user should be able to log in with new code after changing it (via "Forgot code" feature)', async () => {
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '1' });
        
        const currentState = await detectScreen();
        if (currentState !== SCREEN_STATE.PIN_LOGIN) {
            await ensureOnPinLoginScreen(15000);
        }
        await login('1');
        await assertGreeting();
    });

    // Test-case #1.5
    it('user should be able to change pin code (via Settings)', async () => {
        await setupTestState(SCREEN_STATE.MAIN, { pinCode: '1' });

        const menuBtn = getMenuButton();
        await menuBtn.waitForDisplayed({ timeout: 5000 });
        await menuBtn.click();

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

        const repeatCodeScreenHeader = getElementByPredicate('label CONTAINS "Повторіть" AND label CONTAINS "код з 4 цифр"');
        await repeatCodeScreenHeader.waitForDisplayed({ timeout: 10000 });
        await expect(repeatCodeScreenHeader).toBeDisplayed();

        await enterPinCode('1');

        const codeScreenHeader = getElementByAccessibilityId('Новий код з 4 цифр');
        await codeScreenHeader.waitForDisplayed({ timeout: 10000 });
        await expect(codeScreenHeader).toBeDisplayed();

        await enterPinCode('2');

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

        const settingsHeader = getElementByAccessibilityId('Налаштування');
        await settingsHeader.waitForDisplayed({ timeout: 5000 });
        await expect(settingsHeader).toBeDisplayed();
    });

    // Test-case #1.6
    it('user should be able to login with new pin (after changing it via Settings)', async () => {
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '2' });
        
        await login('2');
        await assertGreeting();
    });

    // Test-case #1.7
    it('user should be able to sign out from the app', async () => {
        await setupTestState(SCREEN_STATE.MAIN, { pinCode: '2' });

        const menuBtn = getMenuButton();
        await menuBtn.waitForDisplayed({ timeout: 5000 });
        await menuBtn.click();

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

        await driver.execute('mobile: scroll', {
            direction: 'down',
            predicateString: 'name == "Вийти" OR label == "Вийти"'
        });

        const signoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true AND visible == true');
        await signoutBtn.waitForDisplayed({ timeout: 5000 });
        await signoutBtn.click();

        await driver.waitUntil(
            async () => {
                try {
                    const confirmDialog = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true');
                    return await confirmDialog.isDisplayed();
                } catch (e) {
                    return false;
                }
            },
            { timeout: 3000, timeoutMsg: 'Confirmation dialog did not appear' }
        );

        const confirmSignoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true');
        await confirmSignoutBtn.waitForDisplayed({ timeout: 5000 });
        await confirmSignoutBtn.click();

        const loginWithNBU = getElementByClassChain('Button', 'name == "BankID НБУ  . "');
        await loginWithNBU.waitForDisplayed({ timeout: 5000 });
        await expect(loginWithNBU).toBeDisplayed();
    });

    // Test-case #1.8
    it('user should be able to authorize to the app after sign out', async () => {
        await setupTestState(SCREEN_STATE.AUTH);
        
        await authorize('3');
        await assertGreeting();
    });

    // Test-case #1.9
    it('user should be able to reauthorize after 3 not successful pin code inputs', async function() {
        this.timeout(900000);
        
        await setupTestState(SCREEN_STATE.PIN_LOGIN, { pinCode: '4' });
        
        await driver.pause(1000);
        const state = await detectScreen();
        console.log(`[INFO] Current state after setupTestState: ${state}`);
        
        if (state !== SCREEN_STATE.PIN_LOGIN) {
            console.log(`[WARNING] Expected PIN_LOGIN but got ${state}, ensuring correct state...`);
            await ensureOnPinLoginScreen(15000);
        }
        
        for (let i = 0; i < 3; ++i) {
            console.log(`[INFO] Entering wrong PIN attempt ${i + 1}/3`);
            
            const currentState = await detectScreen();
            if (currentState !== SCREEN_STATE.PIN_LOGIN && i < 2) {
                throw new Error(`Expected PIN_LOGIN screen before attempt ${i + 1}, but got ${currentState}`);
            }
            
            await enterPinCode('9');
            
            await driver.pause(800);
        }

        console.log('[INFO] Waiting for error popup after 3 wrong PIN attempts');
        await driver.pause(1000);
        
        await assertPopup(
            'Ви ввели неправильний код тричі',
            'Пройдіть повторну авторизацію у застосунку'
        );
        console.log('[INFO] Error popup confirmed');

        const authorizeBtn = getElementByClassChain('Button', 'name == "Авторизуватися" OR label == "Авторизуватися"');
        await authorizeBtn.waitForDisplayed({ timeout: 5000 });
        await authorizeBtn.click();
        console.log('[INFO] Clicked Authorize button');

        console.log('[INFO] Waiting for app to navigate to AUTH screen');
        await driver.pause(3000);
        await waitForLoadingToComplete(30000);
        
        await driver.waitUntil(
            async () => {
                try {
                    await waitForLoadingToComplete(10000).catch(() => {});
                    
                    const state = await detectScreen();
                    if (state === SCREEN_STATE.AUTH) {
                        return true;
                    }
                    
                    try {
                        const checkbox = getElementByAccessibilityId('checkbox_conditions_bordered_auth');
                        if (await checkbox.isDisplayed().catch(() => false)) {
                            return true;
                        }
                    } catch (e) {
                    }
                    
                    try {
                        const bankIdBtn = getElementByPredicate(
                            'type == "XCUIElementTypeButton" AND (name CONTAINS "BankID" OR label CONTAINS "BankID")'
                        );
                        if (await bankIdBtn.isDisplayed().catch(() => false)) {
                            return true;
                        }
                    } catch (e) {
                    }
                    
                    try {
                        const pageSource = await driver.getPageSource();
                        if (pageSource.includes('checkbox_conditions_bordered_auth') || 
                            (pageSource.includes('BankID НБУ') && !pageSource.includes('menuSettings'))) {
                            return true;
                        }
                    } catch (e) {
                        return false;
                    }
                    
                    return false;
                } catch (e) {
                    await driver.pause(1000);
                    return false;
                }
            },
            { 
                timeout: process.env.CI ? 90000 : 30000,
                timeoutMsg: 'AUTH screen did not appear after clicking "Авторизуватися"' 
            }
        );

        console.log('[INFO] Starting reauthorization with new PIN');
        await authorize('5');
        await assertGreeting();
        console.log('[INFO] Reauthorization successful');
    });
});
