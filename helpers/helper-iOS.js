const { driver, expect } = require('@wdio/globals')

const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || 'ua.gov.diia.opensource.app';

const LOG_PREFIX = '[iOS]';
const COLOR_GREEN = '\x1b[32m';
const COLOR_RED = '\x1b[31m';
const COLOR_RESET = '\x1b[0m';

function logStep(name, details = '') {
    const suffix = details ? ` | ${details}` : '';
    console.log(`${LOG_PREFIX} ${name}${suffix}`);
}

function logSuccess(name, details = '') {
    const suffix = details ? ` | ${details}` : '';
    console.log(`${COLOR_GREEN}${LOG_PREFIX} ${name} OK${suffix}${COLOR_RESET}`);
}

function logError(name, details = '', error) {
    const suffix = details ? ` | ${details}` : '';
    const message = error && error.message ? ` | ${error.message}` : '';
    console.log(`${COLOR_RED}${LOG_PREFIX} ${name} FAILED${suffix}${message}${COLOR_RESET}`);
}

async function withLog(name, details, fn) {
    logStep(name, details);
    try {
        const result = await fn();
        logSuccess(name, details);
        return result;
    } catch (error) {
        logError(name, details, error);
        throw error;
    }
}

function getElementByText(text) {
    logStep('getElementByText', `text="${text}"`);
    const normalizedText = text.trim();
    return $(`//XCUIElementTypeStaticText[contains(@label, "${normalizedText}")] | //XCUIElementTypeButton[contains(@label, "${normalizedText}")]`);
}

function getElementByAccessibilityId(accessibilityId) {
    logStep('getElementByAccessibilityId', `id="${accessibilityId}"`);
    return driver.$(`~${accessibilityId}`);
}

function getElementByXPath(xpath) {
    logStep('getElementByXPath', `xpath="${xpath}"`);
    return driver.$(xpath);
}

function getElementByClassChain(elementType, predicate = '') {
    if (elementType && elementType.startsWith('**/')) {
        logStep('getElementByClassChain', `fullChain="${elementType}"`);
        return driver.$(`-ios class chain:${elementType}`);
    }
    logStep('getElementByClassChain', `type="${elementType}" predicate="${predicate}"`);
    if (predicate) {
        return driver.$(`-ios class chain:**/XCUIElementType${elementType}[\`${predicate}\`]`);
    }
    return driver.$(`-ios class chain:**/XCUIElementType${elementType}`);
}

function getElementByPredicate(predicate) {
    logStep('getElementByPredicate', `predicate="${predicate}"`);
    return driver.$(`-ios predicate string:${predicate}`);
}

function getElementByTypeAndText(elementType, text) {
    logStep('getElementByTypeAndText', `type="${elementType}" text="${text}"`);
    return driver.$(`//XCUIElementType${elementType}[@label="${text}"]`);
}

function getMenuButton() {
    return getElementByPredicate(
        'type == "XCUIElementTypeImage" AND (name == "menuSettingsInactive" OR name == "menuSettingsActive" OR label == "menuSettingsInactive" OR label == "menuSettingsActive")'
    );
}

const SCREEN_STATE = {
    AUTH: 'auth',
    PIN_LOGIN: 'pin_login',
    PIN_CREATE: 'pin_create',
    PIN_CONFIRM: 'pin_confirm',
    MAIN: 'main',
    LOADING: 'loading',
    WEBVIEW_ERROR: 'webview_error',
    WEBVIEW: 'webview',
    UNKNOWN: 'unknown'
};

async function waitForLoadingToComplete(timeout = 30000) {
    return withLog('waitForLoadingToComplete', '', async () => {
        await driver.waitUntil(
            async () => {
                try {
                    const pageSource = await driver.getPageSource();
                    
                    const hasKnownScreen = pageSource.includes('title_auth') ||
                                          pageSource.includes('checkbox_conditions_bordered_auth') ||
                                          pageSource.includes('menuSettingsInactive') ||
                                          pageSource.includes('menuSettingsActive') ||
                                          pageSource.includes('title_pincreate') ||
                                          pageSource.includes('title_pinconfirm') ||
                                          pageSource.includes('Код для входу') ||
                                          pageSource.includes('BankID НБУ') ||
                                          pageSource.includes('Привіт,');
                    
                    if (hasKnownScreen) {
                        if (pageSource.includes('BankID НБУ') || pageSource.includes('checkbox_conditions_bordered_auth')) {
                            const hasEnabledButton = pageSource.includes('name="BankID НБУ  . "') ||
                                                    pageSource.includes('name="checkbox_conditions_bordered_auth"');
                            if (hasEnabledButton) {
                                logStep('waitForLoadingToComplete', 'Auth screen ready with enabled elements');
                                return true;
                            }
                        }
                        
                        if (pageSource.includes('menuSettingsInactive') ||
                            pageSource.includes('menuSettingsActive') || 
                            pageSource.includes('title_pincreate') ||
                            pageSource.includes('title_pinconfirm') ||
                            pageSource.includes('Код для входу') ||
                            pageSource.includes('Привіт,')) {
                            logStep('waitForLoadingToComplete', 'Known screen structure found');
                            return true;
                        }
                    }
                    
                    const hasLoadingText = pageSource.includes('Триває завантаження даних');
                    const hasButtons = pageSource.includes('XCUIElementTypeButton');
                    
                    if (!hasLoadingText && hasButtons) {
                        logStep('waitForLoadingToComplete', 'No loading text, buttons present');
                        return true;
                    }
                    
                    return false;
                } catch (e) {
                    await driver.pause(500);
                    return false;
                }
            },
            { timeout, timeoutMsg: `Loading screen did not disappear after ${timeout}ms - no interactive elements found` }
        );
        await driver.pause(500);
    });
}

async function detectScreen() {
    return withLog('detectScreen', '', async () => {
        let pageSource = null;
        try {
            pageSource = await driver.getPageSource();
        } catch (e) {
            logStep('detectScreen', `Failed to get pageSource: ${e.message}`);
            return SCREEN_STATE.UNKNOWN;
        }
        
        if (!pageSource) {
            logStep('detectScreen', 'PageSource is null/empty');
            return SCREEN_STATE.UNKNOWN;
        }
        
        if (pageSource.length < 100) {
            logStep('detectScreen', `PageSource too short (${pageSource.length} chars), treating as UNKNOWN`);
            return SCREEN_STATE.UNKNOWN;
        }

        try {

        if (pageSource.includes('menuSettingsInactive') || pageSource.includes('menuSettingsActive')) {
            logStep('detectScreen', 'MAIN screen detected (menu present)');
            return SCREEN_STATE.MAIN;
        }

        if (pageSource.includes('menuFeedActive') || pageSource.includes('menuFeedInactive')) {
            logStep('detectScreen', 'MAIN screen detected (feed menu present)');
            return SCREEN_STATE.MAIN;
        }

        if (pageSource.includes('checkbox_conditions_bordered_auth')) {
            logStep('detectScreen', 'AUTH screen detected (checkbox present)');
            return SCREEN_STATE.AUTH;
        }
        
        if (pageSource.includes('title_auth') && pageSource.includes('BankID')) {
            logStep('detectScreen', 'AUTH screen detected (title + BankID)');
            return SCREEN_STATE.AUTH;
        }
        
        if (pageSource.includes('BankID НБУ') && !pageSource.includes('menuSettings')) {
            logStep('detectScreen', 'AUTH screen detected (BankID button)');
            return SCREEN_STATE.AUTH;
        }

        if (pageSource.includes('title_pincreate')) {
            logStep('detectScreen', 'PIN_CREATE screen detected');
            return SCREEN_STATE.PIN_CREATE;
        }

        if (pageSource.includes('title_pinconfirm')) {
            logStep('detectScreen', 'PIN_CONFIRM screen detected');
            return SCREEN_STATE.PIN_CONFIRM;
        }

        if (pageSource.includes('Код для входу') && !pageSource.includes('title_pincreate') && !pageSource.includes('title_pinconfirm')) {
            logStep('detectScreen', 'PIN_LOGIN screen detected (Код для входу)');
            return SCREEN_STATE.PIN_LOGIN;
        }

        if (pageSource.includes('Не пам\'ятаю код') || pageSource.includes('Не пам\'ятаю')) {
            logStep('detectScreen', 'PIN_LOGIN screen detected (Не пам\'ятаю код button)');
            return SCREEN_STATE.PIN_LOGIN;
        }

        if (pageSource.includes('NotFoundError') || pageSource.includes('Not found')) {
            logStep('detectScreen', 'WEBVIEW_ERROR screen detected (BankID API error)');
            return SCREEN_STATE.WEBVIEW_ERROR;
        }

        if (pageSource.includes('XCUIElementTypeWebView') && pageSource.includes('name="Назад"')) {
            logStep('detectScreen', 'WEBVIEW screen detected (with back button)');
            return SCREEN_STATE.WEBVIEW;
        }

        if (pageSource.includes('Триває завантаження даних')) {

            const hasInteractiveElements = pageSource.includes('checkbox_conditions_bordered_auth') ||
                                          pageSource.includes('BankID НБУ') ||
                                          pageSource.includes('menuSettings') ||
                                          pageSource.includes('title_pincreate') ||
                                          pageSource.includes('title_pinconfirm') ||
                                          pageSource.includes('Не пам\'ятаю');
            
            if (!hasInteractiveElements) {
                logStep('detectScreen', 'LOADING screen detected');
                return SCREEN_STATE.LOADING;
            }
        }

        logStep('detectScreen', 'UNKNOWN screen - no matching patterns');
        return SCREEN_STATE.UNKNOWN;
        
        } catch (e) {

            logStep('detectScreen', `Exception during detection: ${e.message}`);
            return SCREEN_STATE.UNKNOWN;
        }
    });
}
async function ensureState(targetState, options = {}) {
    const { timeout = 20000, force = false } = options;
    return withLog('ensureState', `target="${targetState}"`, async () => {

        await waitForLoadingToComplete(timeout);
        
        const currentState = await detectScreen();
        
        if (currentState === targetState && !force) {
            logStep('ensureState', `Already on ${targetState} screen`);
            return;
        }

        logStep('ensureState', `Current: ${currentState}, Target: ${targetState}`);

        switch (targetState) {
            case SCREEN_STATE.MAIN:
                await ensureOnMainScreen(timeout);
                break;
            case SCREEN_STATE.PIN_LOGIN:
                await ensureOnPinLoginScreen(timeout);
                break;
            case SCREEN_STATE.AUTH:
                await ensureAuthorized(timeout);
                break;
            default:
                throw new Error(`ensureState: Unsupported target state ${targetState}`);
        }
    });
}
async function ensureOnMainScreen(timeout = 30000) {
    return withLog('ensureOnMainScreen', '', async () => {
        const currentState = await detectScreen();
        
        if (currentState === SCREEN_STATE.MAIN) {
            return;
        }

        if (currentState === SCREEN_STATE.PIN_LOGIN) {

            throw new Error('ensureOnMainScreen: On PIN login screen but PIN not provided. Use login() first.');
        }

        if (currentState === SCREEN_STATE.AUTH) {
            throw new Error('ensureOnMainScreen: On auth screen. Use authorize() first.');
        }

        await restart();
        const newState = await detectScreen();
        
        if (newState === SCREEN_STATE.MAIN) {
            return;
        }

        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                return state === SCREEN_STATE.MAIN;
            },
            { timeout, timeoutMsg: `Main screen did not appear after ${timeout}ms` }
        );
    });
}
async function ensureOnPinLoginScreen(timeout = 20000) {
    return withLog('ensureOnPinLoginScreen', '', async () => {

        await waitForLoadingToComplete(timeout);
        
        let currentState = await detectScreen();
        logStep('ensureOnPinLoginScreen', `Current state: ${currentState}`);
        
        if (currentState === SCREEN_STATE.PIN_LOGIN) {
            logStep('ensureOnPinLoginScreen', 'Already on PIN_LOGIN screen');
            return;
        }

        if (currentState === SCREEN_STATE.MAIN) {
            logStep('ensureOnPinLoginScreen', 'On MAIN, restarting to get to PIN_LOGIN');
            await restart();
            await waitForLoadingToComplete(timeout);

            currentState = await detectScreen();
            logStep('ensureOnPinLoginScreen', `State after restart from MAIN: ${currentState}`);
        }

        if (currentState === SCREEN_STATE.AUTH) {
            throw new Error('ensureOnPinLoginScreen: On auth screen. User needs to authorize first.');
        }

        if (currentState === SCREEN_STATE.PIN_CREATE || currentState === SCREEN_STATE.PIN_CONFIRM) {
            logStep('ensureOnPinLoginScreen', 'On PIN_CREATE/CONFIRM, restarting');
            await restart();
            await waitForLoadingToComplete(timeout);

            currentState = await detectScreen();
            logStep('ensureOnPinLoginScreen', `State after restart from PIN_CREATE/CONFIRM: ${currentState}`);

            if (currentState === SCREEN_STATE.AUTH) {
                throw new Error('ensureOnPinLoginScreen: On auth screen after restart. User needs to authorize first.');
            }
        }

        logStep('ensureOnPinLoginScreen', 'Waiting for PIN_LOGIN screen to appear');
        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                logStep('ensureOnPinLoginScreen', `Checking state: ${state}`);
                return state === SCREEN_STATE.PIN_LOGIN;
            },
            { timeout, timeoutMsg: `PIN login screen did not appear after ${timeout}ms` }
        );
        logStep('ensureOnPinLoginScreen', 'Successfully on PIN_LOGIN screen');
    });
}
async function signOut() {
    return withLog('signOut', '', async () => {

        const currentState = await detectScreen();

        if (currentState !== SCREEN_STATE.MAIN) {
            await ensureOnMainScreen(15000);
        }

        const menuBtn = getMenuButton();
        await driver.waitUntil(
            async () => {
                try {
                    return await menuBtn.isDisplayed();
                } catch (e) {
                    return false;
                }
            },
            { timeout: 15000, timeoutMsg: 'Menu button not found - cannot sign out' }
        );
        await menuBtn.click();

        await driver.pause(1000);
        await driver.waitUntil(
            async () => {
                try {
                    const pageSource = await driver.getPageSource();

                    return pageSource.includes('Налаштування') || 
                           pageSource.includes('Вийти') ||
                           pageSource.includes('Settings');
                } catch (e) {
                    return false;
                }
            },
            { timeout: 10000, timeoutMsg: 'Menu did not open - no menu elements found' }
        );

        await driver.execute('mobile: scroll', {
            direction: 'down',
            predicateString: 'name == "Вийти" OR label == "Вийти"'
        });

        const signoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true AND visible == true');
        await signoutBtn.waitForDisplayed({ timeout: 10000 });
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
            { timeout: 5000, timeoutMsg: 'Confirmation dialog did not appear' }
        );

        const confirmSignoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true');
        await confirmSignoutBtn.waitForDisplayed({ timeout: 10000 });
        await confirmSignoutBtn.click();

        await waitForLoadingToComplete(15000);

        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                return state === SCREEN_STATE.AUTH;
            },
            { timeout: 10000, timeoutMsg: 'Authorization screen did not appear after sign out' }
        );
    });
}
async function ensureAuthorized(timeout = 20000) {
    return withLog('ensureAuthorized', '', async () => {

        await waitForLoadingToComplete(timeout);
        
        let currentState = await detectScreen();
        
        if (currentState === SCREEN_STATE.AUTH) {
            return;
        }

        if (currentState === SCREEN_STATE.MAIN) {
            const menuBtn = getMenuButton();
            const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
            if (isMenuVisible) {
                await signOut();

                await waitForLoadingToComplete(timeout);

                await driver.waitUntil(
                    async () => {
                        const state = await detectScreen();
                        return state === SCREEN_STATE.AUTH;
                    },
                    { timeout, timeoutMsg: `Authorization screen did not appear after sign out` }
                );
                return;
            } else {

                logStep('ensureAuthorized', 'Menu not visible, restarting instead of sign out');
                await restart();

                await waitForLoadingToComplete(timeout);

                currentState = await detectScreen();
                logStep('ensureAuthorized', `State after restart from MAIN: ${currentState}`);
            }
        }

        if (currentState === SCREEN_STATE.PIN_LOGIN) {
            await forgotCode();

            await waitForLoadingToComplete(timeout);

            await driver.waitUntil(
                async () => {
                    const state = await detectScreen();
                    return state === SCREEN_STATE.AUTH;
                },
                { timeout, timeoutMsg: `Authorization screen did not appear after forgotCode` }
            );
            return;
        }

        if (currentState === SCREEN_STATE.PIN_CREATE || currentState === SCREEN_STATE.PIN_CONFIRM) {
            await restart();

            await waitForLoadingToComplete(timeout);

            currentState = await detectScreen();
            logStep('ensureAuthorized', `State after restart from PIN_CREATE/CONFIRM: ${currentState}`);
        }

        if (currentState === SCREEN_STATE.WEBVIEW_ERROR || currentState === SCREEN_STATE.WEBVIEW) {
            logStep('ensureAuthorized', 'WebView error detected, clicking back and restarting');
            try {
                const backBtn = getElementByText('Назад');
                if (await backBtn.isDisplayed().catch(() => false)) {
                    await backBtn.click();
                    await driver.pause(1000);
                }
            } catch (e) {
                logStep('ensureAuthorized', `Could not click back button: ${e.message}`);
            }

            await restart();
            await waitForLoadingToComplete(timeout);
        }

        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                return state === SCREEN_STATE.AUTH;
            },
            { timeout, timeoutMsg: `Authorization screen did not appear after ${timeout}ms` }
        );
    });
}
async function setupTestState(targetState, options = {}) {
    const { pinCode, timeout = 30000 } = options;
    return withLog('setupTestState', `target="${targetState}" pinCode="${pinCode || 'none'}"`, async () => {

        await waitForLoadingToComplete(timeout);

        await driver.pause(500);

        try {
            const backBtn = getElementByAccessibilityId('menu back');
            const settingsTitle = getElementByAccessibilityId('Налаштування');
            if (await backBtn.isDisplayed().catch(() => false) && 
                await settingsTitle.isDisplayed().catch(() => false)) {
                logStep('setupTestState', 'Detected Settings screen, going back to MAIN');
                await backBtn.click();
                await driver.pause(1000);

            }
        } catch (e) {

        }
        
        const currentState = await detectScreen();

        if (currentState === targetState) {

            if (targetState === SCREEN_STATE.MAIN) {

                const menuBtn = getMenuButton();
                const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
                if (isMenuVisible) {
                    logStep('setupTestState', 'Already on MAIN screen with user logged in');
                    return;
                } else {

                    logStep('setupTestState', 'On MAIN but menu not visible, setting up from scratch');
                }
            } else if (targetState === SCREEN_STATE.PIN_LOGIN) {

                logStep('setupTestState', 'Already on PIN_LOGIN screen');
                return;
            } else if (targetState === SCREEN_STATE.AUTH) {
                logStep('setupTestState', 'Already on AUTH screen');
                return;
            }
        }

        switch (targetState) {
            case SCREEN_STATE.AUTH:

                logStep('setupTestState', 'Setting up AUTH state');
                
                if (currentState === SCREEN_STATE.MAIN) {
                    logStep('setupTestState', 'Currently on MAIN, signing out');
                    const menuBtn = getMenuButton();
                    const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
                    if (isMenuVisible) {
                        await signOut();
                        await waitForLoadingToComplete(timeout);
                    } else {
                        logStep('setupTestState', 'Menu not visible, restarting');
                        await restart();
                        await waitForLoadingToComplete(timeout);
                        await ensureState(SCREEN_STATE.AUTH, { timeout });
                    }
                } else if (currentState === SCREEN_STATE.PIN_LOGIN) {
                    logStep('setupTestState', 'Currently on PIN_LOGIN, using forgot code');
                    await forgotCode();
                    await waitForLoadingToComplete(timeout);
                    await ensureState(SCREEN_STATE.AUTH, { timeout });
                } else if (currentState === SCREEN_STATE.AUTH) {
                    logStep('setupTestState', 'Already on AUTH');
                } else {
                    logStep('setupTestState', 'Unknown state, ensuring AUTH');
                    await ensureState(SCREEN_STATE.AUTH, { timeout });
                    await waitForLoadingToComplete(timeout);
                }
                logStep('setupTestState', 'Successfully set up AUTH state');
                break;

            case SCREEN_STATE.PIN_LOGIN:

                if (!pinCode) {
                    throw new Error('setupTestState: pinCode is required for PIN_LOGIN state');
                }
                
                logStep('setupTestState', `Setting up PIN_LOGIN state with PIN: ${pinCode}`);

                if (currentState === SCREEN_STATE.AUTH) {
                    logStep('setupTestState', 'Currently on AUTH, authorizing with correct PIN');
                    await authorize(pinCode);
                    await assertGreeting();
                    await driver.pause(500);
                } else if (currentState === SCREEN_STATE.MAIN) {
                    logStep('setupTestState', 'Currently on MAIN, optimizing setup');

                    logStep('setupTestState', 'Restarting from MAIN to check PIN_LOGIN');
                    await restart();
                    await waitForLoadingToComplete(timeout);
                    await driver.pause(1000);
                    
                    const stateAfterRestart = await detectScreen();
                    logStep('setupTestState', `After restart from MAIN, state: ${stateAfterRestart}`);
                    
                    if (stateAfterRestart === SCREEN_STATE.PIN_LOGIN) {

                        logStep('setupTestState', 'Already on PIN_LOGIN after restart, skipping re-authorization');
                        return;
                    } else if (stateAfterRestart === SCREEN_STATE.AUTH) {

                        logStep('setupTestState', 'On AUTH after restart, authorizing');
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(500);
                    } else if (stateAfterRestart === SCREEN_STATE.MAIN) {

                        logStep('setupTestState', 'Still on MAIN after restart, signing out and re-authorizing');
                        await signOut();
                        await waitForLoadingToComplete(timeout);

                        await ensureState(SCREEN_STATE.AUTH, { timeout });
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(500);
                    } else {

                        logStep('setupTestState', 'Unknown state after restart, ensuring AUTH');
                        await ensureState(SCREEN_STATE.AUTH, { timeout });
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(500);
                    }
                } else if (currentState === SCREEN_STATE.PIN_LOGIN) {
                    logStep('setupTestState', 'Already on PIN_LOGIN, verifying correct PIN by reauthorizing');

                    await restart();
                    await waitForLoadingToComplete(timeout);
                    await driver.pause(1000);
                    const newState = await detectScreen();
                    if (newState === SCREEN_STATE.AUTH) {
                        logStep('setupTestState', 'After restart on AUTH, authorizing');
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(500);
                    } else if (newState === SCREEN_STATE.PIN_LOGIN) {

                        logStep('setupTestState', 'After restart still on PIN_LOGIN, attempting login to verify PIN');
                        try {
                            await login(pinCode);
                            await assertGreeting();
                            await driver.pause(500);

                            logStep('setupTestState', 'Login successful, PIN is correct');
                        } catch (loginError) {

                            logStep('setupTestState', 'Login failed, reauthorizing with correct PIN');
                            await forgotCode();
                            await waitForLoadingToComplete(timeout);

                            await ensureState(SCREEN_STATE.AUTH, { timeout });
                            await authorize(pinCode);
                            await assertGreeting();
                            await driver.pause(500);
                        }
                    } else {
                        logStep('setupTestState', 'After restart on unknown state, ensuring AUTH');
                        await ensureState(SCREEN_STATE.AUTH, { timeout });
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(500);
                    }
                } else {

                    logStep('setupTestState', 'Unknown state, ensuring AUTH and authorizing');
                    await ensureState(SCREEN_STATE.AUTH, { timeout });
                    await authorize(pinCode);
                    await assertGreeting();
                    await driver.pause(500);
                }

                const currentStateBeforeFinalRestart = await detectScreen();
                if (currentStateBeforeFinalRestart === SCREEN_STATE.PIN_LOGIN) {
                    logStep('setupTestState', 'Already on PIN_LOGIN, skipping final restart');
                } else {

                    logStep('setupTestState', 'Restarting to get to PIN_LOGIN screen');
                    await restart();
                    await waitForLoadingToComplete(timeout);
                    await ensureState(SCREEN_STATE.PIN_LOGIN, { timeout });
                }
                logStep('setupTestState', 'Successfully set up PIN_LOGIN state');
                break;

            case SCREEN_STATE.MAIN:

                if (!pinCode) {
                    throw new Error('setupTestState: pinCode is required for MAIN state');
                }
                
                logStep('setupTestState', `Setting up MAIN state with PIN: ${pinCode}`);

                if (currentState === SCREEN_STATE.AUTH) {
                    logStep('setupTestState', 'Currently on AUTH, authorizing');
                    await authorize(pinCode);
                    await assertGreeting();
                    await driver.pause(300);
                } else if (currentState === SCREEN_STATE.PIN_LOGIN) {
                    logStep('setupTestState', 'Currently on PIN_LOGIN, logging in');
                    await login(pinCode);
                    await assertGreeting();
                    await driver.pause(300);
                } else if (currentState === SCREEN_STATE.MAIN) {
                    logStep('setupTestState', 'Already on MAIN, verifying menu is accessible');

                    const menuBtn = getMenuButton();
                    const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
                    if (!isMenuVisible) {

                        logStep('setupTestState', 'Menu not visible, restarting and logging in');
                        await restart();
                        await waitForLoadingToComplete(timeout);
                        const newState = await detectScreen();
                        if (newState === SCREEN_STATE.PIN_LOGIN) {
                            await login(pinCode);
                            await assertGreeting();
                            await driver.pause(300);
                        } else if (newState === SCREEN_STATE.AUTH) {
                            await authorize(pinCode);
                            await assertGreeting();
                            await driver.pause(300);
                        } else {
                            await ensureState(SCREEN_STATE.PIN_LOGIN, { timeout });
                            await login(pinCode);
                            await assertGreeting();
                            await driver.pause(300);
                        }
                    } else {

                        logStep('setupTestState', 'Menu visible, already on MAIN');
                        await driver.pause(300);
                    }
                } else {

                    logStep('setupTestState', 'Unknown state, restarting');
                    await restart();
                    await waitForLoadingToComplete(timeout);
                    const newState = await detectScreen();
                    if (newState === SCREEN_STATE.PIN_LOGIN) {
                        logStep('setupTestState', 'After restart on PIN_LOGIN, logging in');
                        await login(pinCode);
                        await assertGreeting();
                        await driver.pause(300);
                    } else if (newState === SCREEN_STATE.AUTH) {
                        logStep('setupTestState', 'After restart on AUTH, authorizing');
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(300);
                    } else if (newState === SCREEN_STATE.MAIN) {
                        logStep('setupTestState', 'After restart already on MAIN');
                        await driver.pause(300);
                    } else {

                        logStep('setupTestState', 'Still unknown, ensuring PIN_LOGIN');
                        await ensureState(SCREEN_STATE.PIN_LOGIN, { timeout });
                        await login(pinCode);
                        await assertGreeting();
                        await driver.pause(300);
                    }
                }
                logStep('setupTestState', 'Successfully set up MAIN state');
                break;

            default:
                throw new Error(`setupTestState: Unsupported target state ${targetState}`);
        }
    });
}
async function authorize(codeDigit) {
    return withLog('authorize', `codeDigit=${codeDigit}`, async () => {

        await waitForLoadingToComplete(30000);

        try {
            const menuBtn = getMenuButton();
            const isMenuDisplayed = await menuBtn.isDisplayed().catch(() => false);
            if (isMenuDisplayed) {
                logStep('authorize', 'User already authorized, skipping authorization flow');
                return;
            }
        } catch (e) {

        }

        await driver.waitUntil(
            async () => {
                try {

                    const pageSource = await driver.getPageSource();
                    const hasAuthElements = pageSource.includes('checkbox_conditions_bordered_auth') || 
                                          pageSource.includes('title_auth') ||
                                          pageSource.includes('BankID');
                    
                    if (hasAuthElements) {

                        try {
                            const checkbox = getElementByAccessibilityId('checkbox_conditions_bordered_auth');
                            if (await checkbox.isDisplayed().catch(() => false)) {
                                return true;
                            }
                        } catch (e1) {

                        }
                        try {
                            const authTitle = getElementByAccessibilityId('title_auth');
                            if (await authTitle.isDisplayed().catch(() => false)) {
                                return true;
                            }
                        } catch (e2) {

                        }
                        try {
                            const loginWithNBU = getElementByPredicate(
                                'type == "XCUIElementTypeButton" AND (name CONTAINS "BankID" OR label CONTAINS "BankID")'
                            );
                            if (await loginWithNBU.isDisplayed().catch(() => false)) {
                                return true;
                            }
                        } catch (e3) {

                        }

                        return true;
                    }
                    return false;
                } catch (e) {
                    return false;
                }
            },
            { timeout: 20000, timeoutMsg: 'Authorization screen did not load - neither checkbox nor BankID button found' }
        );

        let checkbox;
        try {
            checkbox = getElementByAccessibilityId('checkbox_conditions_bordered_auth');
            await checkbox.waitForDisplayed({ timeout: 5000 });
        } catch (e) {

            logStep('authorize', 'Checkbox not found - trying to proceed with BankID button only');
            checkbox = null;
        }

        const loginWithNBU = getElementByPredicate(
            'type == "XCUIElementTypeButton" AND (name CONTAINS "BankID" OR label CONTAINS "BankID")'
        );
        await loginWithNBU.waitForDisplayed({ timeout: 10000 });
        await loginWithNBU.click();

        logStep('authorize', 'Waiting for WebView to load - looking for "Банк НаДія" button');
        await driver.waitUntil(
            async () => {
                try {

                    const pageSource = await driver.getPageSource();

                    return pageSource.includes('Банк НаДія') || pageSource.includes('Оберіть свій банк');
                } catch (e) {
                    if (e.message && e.message.includes('session')) {
                        throw new Error('Session terminated while waiting for WebView');
                    }
                    return false;
                }
            },
            { timeout: 15000, timeoutMsg: 'WebView did not load - bank selection screen not found' }
        );

        const bankNadiia = getElementByText('Банк НаДія');
        await bankNadiia.waitForDisplayed({ timeout: 5000 });
        await bankNadiia.click();
        await driver.pause(500);

        const TOKEN = process.env.BANKID_TOKEN || 'B7B5908CFBA2DBDA1BE9';

        let tokenInput;
        try {
            tokenInput = getElementByAccessibilityId('tokenInputField');
            await tokenInput.waitForDisplayed({ timeout: 1000 });
        } catch (e) {
            tokenInput = getElementByPredicate('type == "XCUIElementTypeTextField" AND enabled == true AND visible == true');
            await tokenInput.waitForDisplayed({ timeout: 15000 });
        }
        await expect(tokenInput).toBeDisplayed();

        try {
            await tokenInput.click();
            await driver.pause(50);
            try {
                await tokenInput.clear();
            } catch (clearError) {
                await tokenInput.setValue('');
                await driver.pause(50);
            }
        } catch (e) {
        }

        await tokenInput.setValue(TOKEN);

        await driver.waitUntil(
            async () => {
                try {
                    const enteredValue = await tokenInput.getValue();
                    return enteredValue && enteredValue.length > 0;
                } catch (e) {
                    return false;
                }
            },
            { timeout: 3000, timeoutMsg: 'Token was not entered' }
        );

        try {
            const enteredValue = await tokenInput.getValue();
            if (enteredValue !== TOKEN) {
                await tokenInput.clear();
                await driver.pause(100);
                for (let i = 0; i < TOKEN.length; i++) {
                    await tokenInput.addValue(TOKEN[i]);
                    await driver.pause(30);
                }
                await driver.pause(300);
            }
        } catch (e) {
        }

        const signinBtn = getElementByAccessibilityId('SignIn');
        await expect(signinBtn).toBeDisplayed();
        
        logStep('authorize', 'Clicking SignIn button - calling BankID API...');
        await signinBtn.click();

        await driver.pause(2000);

        const pageSourceAfterSignIn = await driver.getPageSource();

        if (pageSourceAfterSignIn.includes('NotFoundError') || pageSourceAfterSignIn.includes('Not found')) {
            logStep('authorize', 'Clicking back and restarting...');

            try {
                const backBtn = getElementByText('Назад');
                if (await backBtn.isDisplayed().catch(() => false)) {
                    await backBtn.click();
                    await driver.pause(1000);
                }
            } catch (e) {
                logStep('authorize', `Could not click back: ${e.message}`);
            }

            await restart();
            throw new Error('BankID API returned 404 error. This might be due to invalid token, bank, or API unavailability. Please check test environment.');
        }

        logStep('authorize', 'Waiting for "Далі" button or PIN create screen after SignIn');
        
        let nextBtnClicked = false;
        try {
            await driver.waitUntil(
                async () => {
                    try {

                        try {
                            await driver.getPageSource();
                        } catch (sessionError) {
                            if (sessionError.message && sessionError.message.includes('session')) {
                                logStep('authorize', 'Session terminated, cannot continue');
                                throw new Error('Session terminated during authorization');
                            }
                        }

                        const pinCreateHeader = getElementByAccessibilityId('title_pincreate');
                        if (await pinCreateHeader.isDisplayed().catch(() => false)) {
                            logStep('authorize', 'Already on PIN create screen, skipping "Далі" button');
                            return true;
                        }

                        const nextBtn1 = getElementByClassChain('Button', 'name == "Далі"');
                        if (await nextBtn1.isDisplayed().catch(() => false)) {
                            return true;
                        }
                        
                        const nextBtn2 = getElementByPredicate('type == "XCUIElementTypeButton" AND (name == "Далі" OR label == "Далі")');
                        if (await nextBtn2.isDisplayed().catch(() => false)) {
                            return true;
                        }
                        
                        return false;
                    } catch (e) {

                        if (e.message && e.message.includes('Session terminated')) {
                            throw e;
                        }
                        return false;
                    }
                },
                { timeout: 30000, timeoutMsg: 'Button "Далі" did not appear and PIN create screen not found' }
            );

            const pinCreateCheck = getElementByAccessibilityId('title_pincreate');
            const isOnPinCreate = await pinCreateCheck.isDisplayed().catch(() => false);
            
            if (!isOnPinCreate) {

                let nextBtn = null;
                try {
                    nextBtn = getElementByClassChain('Button', 'name == "Далі"');
                    await nextBtn.waitForDisplayed({ timeout: 5000 });
                } catch (e) {
                    nextBtn = getElementByPredicate('type == "XCUIElementTypeButton" AND (name == "Далі" OR label == "Далі")');
                    await nextBtn.waitForDisplayed({ timeout: 5000 });
                }
                await expect(nextBtn).toBeDisplayed();
                await nextBtn.click();
                nextBtnClicked = true;
                await driver.pause(500);
            }
        } catch (e) {

            if (e.message && e.message.includes('Session terminated')) {
                throw e;
            }
            logStep('authorize', `Error in "Далі" flow: ${e.message}, checking if already on PIN create...`);

            const pinCreateCheck = getElementByAccessibilityId('title_pincreate');
            const isOnPinCreate = await pinCreateCheck.isDisplayed().catch(() => false);
            if (!isOnPinCreate && !nextBtnClicked) {
                throw new Error(`Failed to click "Далі" button and not on PIN create screen: ${e.message}`);
            }
        }

        logStep('authorize', 'Waiting for PIN create/confirm/login or MAIN screen');
        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                return (
                    state === SCREEN_STATE.PIN_CREATE ||
                    state === SCREEN_STATE.PIN_CONFIRM ||
                    state === SCREEN_STATE.PIN_LOGIN ||
                    state === SCREEN_STATE.MAIN
                );
            },
            { timeout: 20000, timeoutMsg: 'PIN create/confirm/login or MAIN screen did not appear after clicking "Далі"' }
        );

        const postAuthState = await detectScreen();
        if (postAuthState === SCREEN_STATE.PIN_CREATE) {
            logStep('authorize', 'On PIN_CREATE screen, entering first PIN');
            await enterPinCode(codeDigit);

            logStep('authorize', 'Waiting for transition after PIN create');
            await driver.waitUntil(
                async () => {
                    const state = await detectScreen();
                    logStep('authorize', `Current state after PIN create: ${state}`);
                    return (
                        state === SCREEN_STATE.PIN_CONFIRM ||
                        state === SCREEN_STATE.PIN_LOGIN ||
                        state === SCREEN_STATE.MAIN
                    );
                },
                { timeout: 30000, timeoutMsg: 'PIN confirm/login or MAIN screen did not appear after PIN create' }
            );

            const afterCreateState = await detectScreen();
            logStep('authorize', `After PIN create, detected state: ${afterCreateState}`);
            if (afterCreateState === SCREEN_STATE.PIN_CONFIRM) {
                logStep('authorize', 'On PIN_CONFIRM screen, entering confirmation PIN');
                await enterPinCode(codeDigit);
            } else if (afterCreateState === SCREEN_STATE.PIN_LOGIN) {
                logStep('authorize', 'On PIN_LOGIN screen, entering PIN to login');
                await enterPinCode(codeDigit);
            } else if (afterCreateState === SCREEN_STATE.MAIN) {
                logStep('authorize', 'Already on MAIN screen, skipping further PIN entry');
            }
        } else if (postAuthState === SCREEN_STATE.PIN_CONFIRM) {
            logStep('authorize', 'On PIN_CONFIRM screen, entering confirmation PIN');
            await enterPinCode(codeDigit);
        } else if (postAuthState === SCREEN_STATE.PIN_LOGIN) {
            logStep('authorize', 'On PIN_LOGIN screen, entering PIN to login');
            await enterPinCode(codeDigit);
        }
    });
}
async function forgotCode() {
    return withLog('forgotCode', '', async () => {

        await waitForLoadingToComplete(15000);

        await ensureOnPinLoginScreen(15000);

        logStep('forgotCode', 'Looking for "Forgot code" button');
        const forgotCodeBtn = getElementByPredicate(
            '(type == "XCUIElementTypeButton") AND (name CONTAINS "Не пам\'ятаю" OR label CONTAINS "Не пам\'ятаю" OR name CONTAINS "пам\'ятаю код" OR label CONTAINS "пам\'ятаю код")'
        );
        await forgotCodeBtn.waitForDisplayed({ timeout: 10000 });
        await forgotCodeBtn.click();

        logStep('forgotCode', 'Looking for "Authorize" button');
        await driver.waitUntil(
            async () => {
                try {
                    const authorizeBtn = getElementByPredicate(
                        '(type == "XCUIElementTypeButton") AND (name == "Авторизуватися" OR label == "Авторизуватися") AND enabled == true'
                    );
                    return await authorizeBtn.isDisplayed().catch(() => false);
                } catch (e) {
                    return false;
                }
            },
            { timeout: 10000, timeoutMsg: '"Авторизуватися" button did not appear' }
        );

        const confirmAuthorize = getElementByPredicate(
            '(type == "XCUIElementTypeButton") AND (name == "Авторизуватися" OR label == "Авторизуватися") AND enabled == true'
        );
        await confirmAuthorize.waitForDisplayed({ timeout: 5000 });
        await confirmAuthorize.click();
        logStep('forgotCode', 'Clicked "Authorize" button - PIN reset, back to AUTH screen');

        await waitForLoadingToComplete(30000);

        await driver.waitUntil(
            async () => {
                try {
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
                    return false;
                } catch (e) {
                    return false;
                }
            },
            { timeout: 30000, timeoutMsg: 'Authorization screen did not appear after clicking "Authorize"' }
        );
        logStep('forgotCode', 'AUTH screen confirmed after forgot code');
    });
}
async function login(codeDigit) {
    return withLog('login', `codeDigit=${codeDigit}`, async () => {

        await waitForLoadingToComplete(15000);

        await driver.pause(500);

        await ensureOnPinLoginScreen(15000);

        let retries = 3;
        let currentState = await detectScreen();
        while (currentState !== SCREEN_STATE.PIN_LOGIN && retries > 0) {
            logStep('login', `Not on PIN_LOGIN (detected: ${currentState}), retrying... (${retries} attempts left)`);
            await driver.pause(1000);
            await waitForLoadingToComplete(10000);
            currentState = await detectScreen();
            retries--;
        }

        if (currentState !== SCREEN_STATE.PIN_LOGIN) {
            throw new Error(`login: Expected PIN_LOGIN screen, but detected ${currentState} after retries`);
        }
        
        logStep('login', 'Confirmed on PIN_LOGIN screen, entering PIN code');
        await enterPinCode(codeDigit);

        await driver.pause(500);
    });
}
async function restart() {
    return withLog('restart', '', async () => {
        await driver.execute('mobile: terminateApp', {
            bundleId: IOS_BUNDLE_ID
        });

        await driver.pause(1500);

        await driver.execute('mobile: activateApp', {
            bundleId: IOS_BUNDLE_ID
        });

        await waitForLoadingToComplete(30000);

        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                if (state !== SCREEN_STATE.UNKNOWN && state !== SCREEN_STATE.LOADING) {
                    logStep('restart', `App loaded - detected screen: ${state}`);
                    return true;
                }
                return false;
            },
            { timeout: 30000, timeoutMsg: 'App did not load after restart - screen state unknown' }
        );
    });
}
async function enterPinCode(codeDigit) {
    return withLog('enterPinCode', `codeDigit=${codeDigit}`, async () => {

        const codeButton = getElementByText(`${codeDigit}`);
        await driver.waitUntil(
            async () => {
                try {
                    return await codeButton.isDisplayed();
                } catch (e) {
                    return false;
                }
            },
            { timeout: 15000, timeoutMsg: `PIN button "${codeDigit}" did not appear` }
        );
        
        logStep('enterPinCode', `Entering PIN code: ${codeDigit}${codeDigit}${codeDigit}${codeDigit}`);
        for (let i = 0; i < 4; i++) {
            await codeButton.click();

            await driver.pause(250);
        }

        logStep('enterPinCode', 'Waiting for app to process PIN code and transition to next screen');
        await driver.pause(2500);
    });
}
async function assertGreeting() {
    return withLog('assertGreeting', '', async () => {

        let greetingFound = false;

        await driver.pause(500);
        
        await driver.waitUntil(
            async () => {

                const currentState = await detectScreen();
                if (currentState === SCREEN_STATE.MAIN) {
                    return true;
                }

                try {
                    const menuBtn = getMenuButton();
                    if (await menuBtn.isDisplayed().catch(() => false)) {
                        return true;
                    }
                } catch (e) {

                }

                try {
                    const greeting = getElementByAccessibilityId('Привіт, Віктор 👋');
                    if (await greeting.isDisplayed().catch(() => false)) {
                        greetingFound = true;
                        return true;
                    }
                } catch (e2) {

                    try {
                        const greetingPredicate = getElementByPredicate('label CONTAINS "Привіт" OR name CONTAINS "Привіт"');
                        if (await greetingPredicate.isDisplayed().catch(() => false)) {
                            greetingFound = true;
                            return true;
                        }
                    } catch (e3) {

                    }
                }
                
                return false;
            },
            { timeout: 15000, timeoutMsg: 'Main screen did not load after authorization' }
        );

        if (greetingFound) {
            const greeting = getElementByAccessibilityId('Привіт, Віктор 👋');
            try {
                await expect(greeting).toBeDisplayed();
                return;
            } catch (e) {

                const greetingPredicate = getElementByPredicate('label CONTAINS "Привіт" OR name CONTAINS "Привіт"');
                await expect(greetingPredicate).toBeDisplayed();
                return;
            }
        }

        const greeting = getElementByAccessibilityId('Привіт, Віктор 👋');
        try {
            await greeting.waitForDisplayed({ timeout: 10000 });
            await expect(greeting).toBeDisplayed();
            return;
        } catch (e) {

            try {
                const greetingExact = getElementByPredicate(
                    'label == "Привіт, Віктор 👋" OR name == "Привіт, Віктор 👋" OR value == "Привіт, Віктор 👋"'
                );
                await greetingExact.waitForDisplayed({ timeout: 10000 });
                await expect(greetingExact).toBeDisplayed();
                return;
            } catch (err) {

                const greetingPredicate = getElementByPredicate('label CONTAINS "Привіт" OR name CONTAINS "Привіт"');
                await greetingPredicate.waitForDisplayed({ timeout: 10000 });
                await expect(greetingPredicate).toBeDisplayed();
            }
        }
    });
}
function normalizeText(text) {
    if (!text) return '';
    return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}
async function assertPopup(title = '', msg = '') {
    return withLog('assertPopup', `title="${title}" msg="${msg}"`, async () => {

        const normalizedTitle = normalizeText(title);
        const normalizedMsg = normalizeText(msg);

        let alertContainer = null;
        try {
            const alert = getElementByPredicate('type == "XCUIElementTypeAlert"');
            if (await alert.isDisplayed().catch(() => false)) {
                alertContainer = alert;
            }
        } catch (e) {

        }

        if (!alertContainer) {
            try {
                const sheet = getElementByPredicate('type == "XCUIElementTypeSheet"');
                if (await sheet.isDisplayed().catch(() => false)) {
                    alertContainer = sheet;
                }
            } catch (e) {

            }
        }

        const findTextElement = async (searchText, container = null) => {
            if (!searchText) return null;

            const searchPredicate = `(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton") AND (name CONTAINS "${searchText}" OR label CONTAINS "${searchText}" OR value CONTAINS "${searchText}")`;
            
            if (container) {

                const elements = await container.$$(`-ios predicate string:${searchPredicate}`);
                for (const el of elements) {
                    try {
                        if (await el.isDisplayed().catch(() => false)) {
                            const text = await el.getText().catch(() => '');
                            const normalized = normalizeText(text);
                            if (normalized.includes(searchText) || searchText.includes(normalized)) {
                                return el;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            } else {

                const element = getElementByPredicate(searchPredicate);
                if (await element.isDisplayed().catch(() => false)) {
                    return element;
                }
            }
            return null;
        };

        await driver.waitUntil(
            async () => {
                if (title) {
                    const titleEl = await findTextElement(normalizedTitle, alertContainer);
                    if (titleEl) return true;
                }
                if (msg) {
                    const msgEl = await findTextElement(normalizedMsg, alertContainer);
                    if (msgEl) return true;
                }
                return false;
            },
            { timeout: 10000, timeoutMsg: `Popup with title "${title}" did not appear` }
        );

        if (title) {
            const titleEl = await findTextElement(normalizedTitle, alertContainer);
            if (!titleEl) {

                try {
                    const titleById = getElementByAccessibilityId(title);
                    await titleById.waitForDisplayed({ timeout: 2000 });
                    await expect(titleById).toBeDisplayed();
                } catch (e) {
                    throw new Error(`Popup title "${title}" not found`);
                }
            } else {
                await expect(titleEl).toBeDisplayed();
            }
        }

        if (msg) {
            const msgEl = await findTextElement(normalizedMsg, alertContainer);
            if (!msgEl) {

                try {
                    const msgById = getElementByAccessibilityId(msg);
                    await msgById.waitForDisplayed({ timeout: 2000 });
                    await expect(msgById).toBeDisplayed();
                } catch (e) {
                    throw new Error(`Popup message "${msg}" not found`);
                }
            } else {
                await expect(msgEl).toBeDisplayed();
            }
        }
    });
}
async function scrollToElement(element, direction = 'down') {
    return withLog('scrollToElement', `direction="${direction}"`, async () => {
        await driver.execute('mobile: scroll', {
            direction: direction,
            element: element
        });
    });
}
async function findTextViewByText(container, expectedText, normalizeNewlines = true) {
    return withLog('findTextViewByText', `expectedText="${expectedText}" normalizeNewlines=${normalizeNewlines}`, async () => {

        const textViews = await container.$$('//XCUIElementTypeStaticText');
        
        const normalizedExpected = normalizeNewlines 
            ? expectedText.replace(/\n/g, ' ').trim() 
            : expectedText.trim();
        
        for (const textView of textViews) {
            try {
                const text = await textView.getText();
                const normalizedText = normalizeNewlines 
                    ? text.replace(/\n/g, ' ').trim() 
                    : text.trim();
                
                if (normalizedText === normalizedExpected) {
                    return textView;
                }
            } catch (error) {

                continue;
            }
        }
        
        throw new Error(`No StaticText found with text "${expectedText}" in container`);
    });
}
async function scrollContainerIntoView(accessibilityId) {
    return withLog('scrollContainerIntoView', `id="${accessibilityId}"`, async () => {

        const container = getElementByAccessibilityId(accessibilityId);

        try {
            await container.waitForDisplayed({ timeout: 2000 });
        } catch (e) {

            await driver.execute('mobile: scroll', {
                direction: 'down',
                predicateString: `name == "${accessibilityId}"`
            });
        }

        await container.waitForDisplayed({
            timeout: 30000,
            timeoutMsg: `Container ${accessibilityId} not visible`
        });

        return container;
    });
}
async function assertTextView(accessibilityId, expectedText, normalizeNewlines = true) {
    return withLog('assertTextView', `id="${accessibilityId}" expectedText="${expectedText}" normalizeNewlines=${normalizeNewlines}`, async () => {
        const container = await scrollContainerIntoView(accessibilityId);

        const normalizedExpected = normalizeNewlines
            ? expectedText.replace(/\n/g, ' ').trim()
            : expectedText.trim();

        await driver.waitUntil(
            async () => {

                const textViews = await container.$$('//XCUIElementTypeStaticText');

                for (const tv of textViews) {
                    try {
                        const actual = await tv.getText();
                        
                        const normalizedActual = normalizeNewlines
                            ? actual.replace(/\n/g, ' ').trim()
                            : actual.trim();

                        if (normalizedActual === normalizedExpected) {
                            const isDisplayed = await tv.isDisplayed();
                            if (isDisplayed) {
                                return true;
                            }
                        }
                    } catch (error) {

                        continue;
                    }
                }
                return false;
            },
            {
                timeout: 20000,
                interval: 500,
                timeoutMsg: `Text "${expectedText}" not found in container with accessibilityId "${accessibilityId}"`
            }
        );
    });
}
async function getContainer(accessibilityId) {
    return withLog('getContainer', `id="${accessibilityId}"`, async () => {
        const container = getElementByAccessibilityId(accessibilityId);

        await container.waitForDisplayed({ 
            timeout: 10000,
            timeoutMsg: `Container ${accessibilityId} not found`
        });
        
        return container;
    });
}
async function findMoreOptionsButton(nearText = 'Олександрович') {
    return withLog('findMoreOptionsButton', `nearText="${nearText}"`, async () => {

        try {
            logStep('findMoreOptionsButton', 'Strategy 0: Finding all small buttons on screen (PRIMARY, text-independent)');
            const allButtons = await driver.$$('-ios predicate string:type == "XCUIElementTypeButton" AND enabled == true AND visible == true');
            
            logStep('findMoreOptionsButton', `Found ${allButtons.length} buttons on screen`);

            const docTitle = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Посвідчення водія"`]');
            await docTitle.waitForDisplayed({ timeout: 5000 });
            const docLocation = await docTitle.getLocation();
            const docSize = await docTitle.getSize();
            
            logStep('findMoreOptionsButton', `Document title location: x=${docLocation.x}, y=${docLocation.y}, width=${docSize.width}, height=${docSize.height}`);

            for (let i = 0; i < allButtons.length; i++) {
                const button = allButtons[i];
                try {
                    const buttonLocation = await button.getLocation();
                    const buttonSize = await button.getSize();
                    const buttonLabel = await button.getAttribute('name').catch(() => '');
                    
                    logStep('findMoreOptionsButton', `Button ${i}: x=${buttonLocation.x}, y=${buttonLocation.y}, width=${buttonSize.width}, height=${buttonSize.height}, label="${buttonLabel}"`);

                    const isSmallRoundButton = buttonSize.width <= 60 && buttonSize.height <= 60;

                    const isInDocArea = (buttonLocation.x > docLocation.x - 50 && 
                                        buttonLocation.x < docLocation.x + docSize.width + 200) &&
                                       (buttonLocation.y > docLocation.y - 50 && 
                                        buttonLocation.y < docLocation.y + docSize.height + 200);
                    
                    if (isSmallRoundButton && isInDocArea) {
                        logSuccess('findMoreOptionsButton', `Found button using Strategy 0: x=${buttonLocation.x}, y=${buttonLocation.y}, size=${buttonSize.width}x${buttonSize.height}`);
                        return button;
                    }
                } catch (e) {
                    logStep('findMoreOptionsButton', `Button ${i} error: ${e.message}`);
                    continue;
                }
            }
        } catch (e) {
            logStep('findMoreOptionsButton', `Strategy 0 failed: ${e.message}`);
        }

        try {
            logStep('findMoreOptionsButton', 'Strategy 5: Finding button directly in document container (text-independent)');

            const docTitle = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Посвідчення водія"`]');
            await docTitle.waitForDisplayed({ timeout: 5000 });

            const parentXPath = `//XCUIElementTypeStaticText[@name="Посвідчення водія"]/ancestor::XCUIElementTypeOther[1]`;
            const parentContainer = getElementByXPath(parentXPath);
            const buttonsInContainer = await parentContainer.$$('-ios class chain:**/XCUIElementTypeButton');
            
            logStep('findMoreOptionsButton', `Found ${buttonsInContainer.length} buttons in document container`);
            
            for (const button of buttonsInContainer) {
                try {
                    const isDisplayed = await button.isDisplayed();
                    if (isDisplayed) {
                        const buttonSize = await button.getSize();

                        if (buttonSize.width <= 60 && buttonSize.height <= 60) {
                            logSuccess('findMoreOptionsButton', 'Found button in document container (Strategy 5)');
                            return button;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            logStep('findMoreOptionsButton', `Strategy 5 failed: ${e.message}`);
        }

        try {
            logStep('findMoreOptionsButton', 'Strategy 6: Finding button in documents list container (text-independent)');

            const scrollViews = await driver.$$('-ios class chain:**/XCUIElementTypeScrollView');
            const tableViews = await driver.$$('-ios class chain:**/XCUIElementTypeTable');
            const allContainers = [...scrollViews, ...tableViews];
            
            logStep('findMoreOptionsButton', `Found ${allContainers.length} scroll/table containers`);
            
            for (const container of allContainers) {
                try {
                    const isDisplayed = await container.isDisplayed();
                    if (!isDisplayed) continue;
                    
                    const buttonsInContainer = await container.$$('-ios class chain:**/XCUIElementTypeButton');
                    
                    for (const button of buttonsInContainer) {
                        try {
                            const isDisplayed = await button.isDisplayed();
                            if (isDisplayed) {
                                const buttonSize = await button.getSize();

                                if (buttonSize.width <= 60 && buttonSize.height <= 60) {
                                    logSuccess('findMoreOptionsButton', 'Found button in documents list container (Strategy 6)');
                                    return button;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            logStep('findMoreOptionsButton', `Strategy 6 failed: ${e.message}`);
        }

        try {
            logStep('findMoreOptionsButton', 'Strategy 1: Finding button in container with text using class chain');

            const textElement = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "' + nearText + '"`]');
            await textElement.waitForDisplayed({ timeout: 3000 });

            const buttonInContainer = getElementByClassChain(
                '**/XCUIElementTypeStaticText[`name == "' + nearText + '"`]/..//XCUIElementTypeButton'
            );
            await buttonInContainer.waitForDisplayed({ timeout: 3000 });
            const isDisplayed = await buttonInContainer.isDisplayed();
            if (isDisplayed) {
                logSuccess('findMoreOptionsButton', 'Found button using class chain strategy');
                return buttonInContainer;
            }
        } catch (e) {
            logStep('findMoreOptionsButton', `Strategy 1 failed: ${e.message}`);
        }

        try {
            logStep('findMoreOptionsButton', 'Strategy 2: Finding all buttons and selecting one near text');
            const textElement = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "' + nearText + '"`]');
            await textElement.waitForDisplayed({ timeout: 2000 });
            
            const textLocation = await textElement.getLocation();
            const textSize = await textElement.getSize();
            const textRightEdge = textLocation.x + textSize.width;

            const allButtons = await driver.$$('-ios class chain:**/XCUIElementTypeButton');
            
            for (const button of allButtons) {
                try {
                    const isDisplayed = await button.isDisplayed();
                    if (!isDisplayed) continue;
                    
                    const buttonLocation = await button.getLocation();
                    const buttonSize = await button.getSize();

                    const isNearText = buttonLocation.x > textRightEdge && 
                                     buttonLocation.x < textRightEdge + 100 &&
                                     Math.abs(buttonLocation.y - textLocation.y) < 30;
                    
                    if (isNearText) {
                        logSuccess('findMoreOptionsButton', 'Found button using coordinate-based strategy');
                        return button;
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            logStep('findMoreOptionsButton', `Strategy 2 failed: ${e.message}`);
        }

        try {
            logStep('findMoreOptionsButton', 'Strategy 3: Finding button using predicate string');
            const buttons = await driver.$$('-ios predicate string:type == "XCUIElementTypeButton" AND enabled == true AND visible == true');

            const textElement = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "' + nearText + '"`]');
            await textElement.waitForDisplayed({ timeout: 2000 });
            const textLocation = await textElement.getLocation();
            const textSize = await textElement.getSize();
            const textRightEdge = textLocation.x + textSize.width;
            
            for (const button of buttons) {
                try {
                    const buttonLocation = await button.getLocation();
                    const buttonSize = await button.getSize();

                    const isSmallRoundButton = buttonSize.width <= 50 && buttonSize.height <= 50;
                    const isNearText = buttonLocation.x > textRightEdge && 
                                     buttonLocation.x < textRightEdge + 100 &&
                                     Math.abs(buttonLocation.y - textLocation.y) < 30;
                    
                    if (isSmallRoundButton && isNearText) {
                        logSuccess('findMoreOptionsButton', 'Found button using predicate string strategy');
                        return button;
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            logStep('findMoreOptionsButton', `Strategy 3 failed: ${e.message}`);
        }

        try {
            logStep('findMoreOptionsButton', 'Strategy 4: Finding button using XPath');

            const buttonXPath = `//XCUIElementTypeStaticText[@name="${nearText}"]/following-sibling::XCUIElementTypeButton[1]`;
            const button = getElementByXPath(buttonXPath);
            await button.waitForDisplayed({ timeout: 3000 });
            const isDisplayed = await button.isDisplayed();
            if (isDisplayed) {
                logSuccess('findMoreOptionsButton', 'Found button using XPath strategy');
                return button;
            }
        } catch (e) {
            logStep('findMoreOptionsButton', `Strategy 4 failed: ${e.message}`);
        }

        throw new Error(`Could not find more options button near text "${nearText}" using any strategy.`);
    });
}

async function tapSmart(x, y, description = '', options = {}) {
    const { retries = 3, timeout = 3000 } = options;
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    
    logStep('tapSmart', `Starting tap at x=${roundedX}, y=${roundedY}${description ? ` (${description})` : ''}`);

    try {
        const windowSize = await driver.getWindowRect();
        logStep('tapSmart', `Window size: ${windowSize.width}x${windowSize.height}`);
        if (roundedX < 0 || roundedX > windowSize.width || roundedY < 0 || roundedY > windowSize.height) {
            logStep('tapSmart', `WARNING: Coordinates (${roundedX}, ${roundedY}) may be outside viewport`);
        }
    } catch (e) {
        logStep('tapSmart', `Could not get window size: ${e.message}`);
    }
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        logStep('tapSmart', `Attempt ${attempt}/${retries}`);

        try {
            logStep('tapSmart', 'Strategy 1: W3C performActions');
            const actionsPromise = driver.performActions([{
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: roundedX, y: roundedY },
                    { type: 'pointerDown', button: 0 },
                    { type: 'pause', duration: 150 },
                    { type: 'pointerUp', button: 0 }
                ]
            }]);
            
            const actionsTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('performActions timeout')), timeout)
            );
            
            await Promise.race([actionsPromise, actionsTimeout]);

            try {
                const releasePromise = driver.releaseActions();
                const releaseTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('releaseActions timeout')), 1000)
                );
                await Promise.race([releasePromise, releaseTimeout]);
            } catch (releaseErr) {
                logStep('tapSmart', `releaseActions warning: ${releaseErr.message}, continuing...`);
            }
            
            await driver.pause(300);
            logSuccess('tapSmart', `Successfully tapped using W3C Actions (attempt ${attempt})`);
            return true;
        } catch (e) {
            lastError = e;
            logStep('tapSmart', `Strategy 1 failed: ${e.message}`);
        }

        try {
            logStep('tapSmart', 'Strategy 2: mobile: tap');
            const tapPromise = driver.execute('mobile: tap', { x: roundedX, y: roundedY });
            const tapTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('mobile: tap timeout')), timeout)
            );
            await Promise.race([tapPromise, tapTimeout]);
            await driver.pause(300);
            logSuccess('tapSmart', `Successfully tapped using mobile: tap (attempt ${attempt})`);
            return true;
        } catch (e) {
            lastError = e;
            logStep('tapSmart', `Strategy 2 failed: ${e.message}`);
        }

        try {
            logStep('tapSmart', 'Strategy 3: mobile: tap with options');
            const tapPromise = driver.execute('mobile: tap', { 
                x: roundedX, 
                y: roundedY,
                pressure: 0.5
            });
            const tapTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('mobile: tap with options timeout')), timeout)
            );
            await Promise.race([tapPromise, tapTimeout]);
            await driver.pause(300);
            logSuccess('tapSmart', `Successfully tapped using mobile: tap with options (attempt ${attempt})`);
            return true;
        } catch (e) {
            lastError = e;
            logStep('tapSmart', `Strategy 3 failed: ${e.message}`);
        }

        if (attempt < retries) {
            await driver.pause(500);
        }
    }
    
    throw new Error(`All tap strategies failed after ${retries} attempts. Last error: ${lastError?.message || 'unknown'}`);
}
async function clickByCoordinates(x, y, description = '') {
    return withLog('clickByCoordinates', `x=${x}, y=${y}${description ? `, description="${description}"` : ''}`, async () => {
        await tapSmart(x, y, description, { retries: 3, timeout: 3000 });
    });
}
async function findAndClickMoreOptionsButton(nearText = null, coordinates = null) {
    return withLog('findAndClickMoreOptionsButton', `nearText="${nearText}", coordinates=${coordinates ? `{x:${coordinates.x}, y:${coordinates.y}}` : 'null'}`, async () => {

        if (coordinates && coordinates.x !== undefined && coordinates.y !== undefined) {
            logStep('findAndClickMoreOptionsButton', 'Using provided coordinates to click');
            await clickByCoordinates(coordinates.x, coordinates.y);
            return;
        }

        try {
            const button = await findMoreOptionsButton(nearText);
            await button.click();
            return button;
        } catch (e) {
            logStep('findAndClickMoreOptionsButton', `Failed to find button: ${e.message}`);
            throw e;
        }
    });
}

module.exports = {
    getElementByText,
    getElementByAccessibilityId,
    getElementByXPath,
    getElementByClassChain,
    getElementByPredicate,
    getElementByTypeAndText,
    getMenuButton,
    detectScreen,
    ensureState,
    ensureOnMainScreen,
    ensureOnPinLoginScreen,
    ensureAuthorized,
    signOut,
    setupTestState,
    SCREEN_STATE,
    authorize,
    forgotCode,
    login,
    restart,
    enterPinCode,
    assertGreeting,
    assertPopup,
    waitForLoadingToComplete,
    scrollToElement,
    findTextViewByText,
    scrollContainerIntoView,
    assertTextView,
    getContainer,
    findMoreOptionsButton,
    clickByCoordinates,
    tapSmart,
    findAndClickMoreOptionsButton
};
