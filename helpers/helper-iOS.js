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

/**
 * НАЙКРАЩІ ПРАКТИКИ ДЛЯ СЕЛЕКТОРІВ iOS/XCUITest (Appium)
 * 
 * Пріоритет використання (від найкращого до найгіршого):
 * 
 * 1. ✅ Accessibility ID (accessibilityIdentifier)
 *    - Найшвидший та найстабільніший
 *    - Не залежить від UI змін
 *    - Приклад: getElementByAccessibilityId('myButtonId')
 * 
 * 2. ✅ Class Chain (-ios class chain)
 *    - Швидкий, нативний для iOS
 *    - Краще за XPath для iOS
 *    - Приклад: getElementByClassChain('Button', 'name == "SignIn"')
 * 
 * 3. ✅ Predicate String (-ios predicate string)
 *    - Швидкий, гнучкий для складних умов
 *    - Приклад: getElementByPredicate('name == "tokenInputField" AND type == "XCUIElementTypeTextField"')
 * 
 * 4. ⚠️ XPath
 *    - Повільний, менш стабільний
 *    - Використовуйте тільки якщо інші не підходять
 *    - Приклад: getElementByXPath('//XCUIElementTypeButton[@name="SignIn"]')
 * 
 * ⚠️ НЕ використовуйте XCUIElementTypeTextField як селектор напряму!
 *    Це тип елемента, а не селектор. Використовуйте Accessibility ID або Class Chain.
 */

// SELECTOR OPTIONS для iOS (XCUITest)

/**
 * Отримати елемент по тексту (XCUIElementTypeStaticText або XCUIElementTypeButton)
 * Використовує contains для більш гнучкого пошуку
 */
function getElementByText(text) {
    logStep('getElementByText', `text="${text}"`);
    // Використовуємо XPath з contains для пошуку по label або value (нечутливо до пробілів)
    const normalizedText = text.trim();
    return $(`//XCUIElementTypeStaticText[contains(@label, "${normalizedText}")] | //XCUIElementTypeButton[contains(@label, "${normalizedText}")]`);
}

/**
 * Отримати елемент по Accessibility ID
 */
function getElementByAccessibilityId(accessibilityId) {
    logStep('getElementByAccessibilityId', `id="${accessibilityId}"`);
    return driver.$(`~${accessibilityId}`);
}

/**
 * Отримати елемент по XPath
 * ⚠️ Уникайте XPath, використовуйте Class Chain або Predicate String замість цього
 */
function getElementByXPath(xpath) {
    logStep('getElementByXPath', `xpath="${xpath}"`);
    return driver.$(xpath);
}

/**
 * Отримати елемент по Class Chain (рекомендовано для iOS)
 * Швидший та стабільніший за XPath
 * Може приймати повний class chain як один параметр або elementType + predicate
 */
function getElementByClassChain(elementType, predicate = '') {
    // Якщо передано повний class chain (починається з **/)
    if (elementType && elementType.startsWith('**/')) {
        logStep('getElementByClassChain', `fullChain="${elementType}"`);
        return driver.$(`-ios class chain:${elementType}`);
    }
    // Стандартний випадок: elementType + predicate
    logStep('getElementByClassChain', `type="${elementType}" predicate="${predicate}"`);
    if (predicate) {
        return driver.$(`-ios class chain:**/XCUIElementType${elementType}[\`${predicate}\`]`);
    }
    return driver.$(`-ios class chain:**/XCUIElementType${elementType}`);
}

/**
 * Отримати елемент по Predicate String (рекомендовано для iOS)
 * Швидший та гнучкіший за XPath
 */
function getElementByPredicate(predicate) {
    logStep('getElementByPredicate', `predicate="${predicate}"`);
    return driver.$(`-ios predicate string:${predicate}`);
}

/**
 * Отримати елемент по типу та тексту
 * ⚠️ Застаріло - використовуйте getElementByClassChain замість цього
 */
function getElementByTypeAndText(elementType, text) {
    logStep('getElementByTypeAndText', `type="${elementType}" text="${text}"`);
    return driver.$(`//XCUIElementType${elementType}[@label="${text}"]`);
}

/**
 * Отримати кнопку меню (inactive/active)
 */
function getMenuButton() {
    return getElementByPredicate(
        'type == "XCUIElementTypeImage" AND (name == "menuSettingsInactive" OR name == "menuSettingsActive" OR label == "menuSettingsInactive" OR label == "menuSettingsActive")'
    );
}

// SCREEN DETECTION & STATE MANAGEMENT

/**
 * Screen states enum
 */
const SCREEN_STATE = {
    AUTH: 'auth',
    PIN_LOGIN: 'pin_login',
    PIN_CREATE: 'pin_create',
    PIN_CONFIRM: 'pin_confirm',
    MAIN: 'main',
    LOADING: 'loading',
    WEBVIEW_ERROR: 'webview_error',  // BankID API error (404, etc.)
    WEBVIEW: 'webview',  // Generic WebView screen
    UNKNOWN: 'unknown'
};

/**
 * Wait for loading screen to disappear
 * The loading text may still be present, but we check if interactive elements are ready
 */
async function waitForLoadingToComplete(timeout = 30000) {
    return withLog('waitForLoadingToComplete', '', async () => {
        await driver.waitUntil(
            async () => {
                try {
                    // Use page source check as primary method - more reliable
                    const pageSource = await driver.getPageSource();
                    
                    // Check if we have a known screen structure
                    const hasKnownScreen = pageSource.includes('title_auth') ||
                                          pageSource.includes('checkbox_conditions_bordered_auth') ||
                                          pageSource.includes('menuSettingsInactive') ||
                                          pageSource.includes('menuSettingsActive') ||
                                          pageSource.includes('title_pincreate') ||
                                          pageSource.includes('title_pinconfirm') ||
                                          pageSource.includes('Код для входу') ||
                                          pageSource.includes('BankID НБУ') ||
                                          pageSource.includes('Привіт,'); // Greeting on main screen
                    
                    if (hasKnownScreen) {
                        // Check if BankID button or checkbox is enabled (for auth screen)
                        if (pageSource.includes('BankID НБУ') || pageSource.includes('checkbox_conditions_bordered_auth')) {
                            const hasEnabledButton = pageSource.includes('name="BankID НБУ  . "') ||
                                                    pageSource.includes('name="checkbox_conditions_bordered_auth"');
                            if (hasEnabledButton) {
                                logStep('waitForLoadingToComplete', 'Auth screen ready with enabled elements');
                                return true;
                            }
                        }
                        
                        // For other screens, if we have known structure, assume ready
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
                    
                    // Fallback: If no known screen but no loading text either, might be ready
                    const hasLoadingText = pageSource.includes('Триває завантаження даних');
                    const hasButtons = pageSource.includes('XCUIElementTypeButton');
                    
                    if (!hasLoadingText && hasButtons) {
                        logStep('waitForLoadingToComplete', 'No loading text, buttons present');
                        return true;
                    }
                    
                    return false;
                } catch (e) {
                    // If page source check fails, wait a bit and try again
                    await driver.pause(500);
                    return false;
                }
            },
            { timeout, timeoutMsg: `Loading screen did not disappear after ${timeout}ms - no interactive elements found` }
        );
        // Small delay to ensure UI is ready after loading
        await driver.pause(500);
    });
}

/**
 * Detect current screen state
 * Returns one of: 'auth', 'pin_login', 'pin_create', 'pin_confirm', 'main', 'loading', 'unknown'
 */
async function detectScreen() {
    return withLog('detectScreen', '', async () => {
        // Get page source once for faster checking - NO .isDisplayed() calls for speed
        let pageSource = null;
        try {
            pageSource = await driver.getPageSource();
        } catch (e) {
            // If page source fails, return unknown
            logStep('detectScreen', `Failed to get pageSource: ${e.message}`);
            return SCREEN_STATE.UNKNOWN;
        }
        
        if (!pageSource) {
            logStep('detectScreen', 'PageSource is null/empty');
            return SCREEN_STATE.UNKNOWN;
        }
        
        // Safety check - if pageSource is too short, it's likely incomplete
        if (pageSource.length < 100) {
            logStep('detectScreen', `PageSource too short (${pageSource.length} chars), treating as UNKNOWN`);
            return SCREEN_STATE.UNKNOWN;
        }
        
        // Wrap all checks in try-catch to prevent hanging on string operations
        try {
        
        // OPTIMIZATION: Use ONLY pageSource analysis to avoid slow .isDisplayed() calls
        // Check for main screen - menu button and greeting are reliable indicators
        if (pageSource.includes('menuSettingsInactive') || pageSource.includes('menuSettingsActive')) {
            logStep('detectScreen', 'MAIN screen detected (menu present)');
            return SCREEN_STATE.MAIN;
        }
        
        // Check for feed menu (another main screen indicator)
        if (pageSource.includes('menuFeedActive') || pageSource.includes('menuFeedInactive')) {
            logStep('detectScreen', 'MAIN screen detected (feed menu present)');
            return SCREEN_STATE.MAIN;
        }

        // Check for authorization screen - BEFORE checking loading text
        // because auth screen has "Триває завантаження" as a container even when ready
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

        // Check for PIN create screen
        if (pageSource.includes('title_pincreate')) {
            logStep('detectScreen', 'PIN_CREATE screen detected');
            return SCREEN_STATE.PIN_CREATE;
        }

        // Check for PIN confirm screen
        if (pageSource.includes('title_pinconfirm')) {
            logStep('detectScreen', 'PIN_CONFIRM screen detected');
            return SCREEN_STATE.PIN_CONFIRM;
        }

        // Check for PIN login screen (contains "Код для входу" or "Не пам'ятаю код")
        // Must NOT be PIN create or PIN confirm (checked above)
        if (pageSource.includes('Код для входу') && !pageSource.includes('title_pincreate') && !pageSource.includes('title_pinconfirm')) {
            logStep('detectScreen', 'PIN_LOGIN screen detected (Код для входу)');
            return SCREEN_STATE.PIN_LOGIN;
        }
        
        // Check for "Не пам'ятаю код" button which is only on PIN login screen
        if (pageSource.includes('Не пам\'ятаю код') || pageSource.includes('Не пам\'ятаю')) {
            logStep('detectScreen', 'PIN_LOGIN screen detected (Не пам\'ятаю код button)');
            return SCREEN_STATE.PIN_LOGIN;
        }
        
        // Check for WebView error screen (BankID API errors)
        if (pageSource.includes('NotFoundError') || pageSource.includes('Not found')) {
            logStep('detectScreen', 'WEBVIEW_ERROR screen detected (BankID API error)');
            return SCREEN_STATE.WEBVIEW_ERROR;
        }
        
        // Check for WebView with back button (generic WebView screen)
        if (pageSource.includes('XCUIElementTypeWebView') && pageSource.includes('name="Назад"')) {
            logStep('detectScreen', 'WEBVIEW screen detected (with back button)');
            return SCREEN_STATE.WEBVIEW;
        }
        
        // Check for loading screen LAST - only if we haven't identified any other screen
        // Loading text can appear as a container on other screens, so check it last
        if (pageSource.includes('Триває завантаження даних')) {
            // If we have loading text but NO interactive elements (no buttons, no auth screen, etc.), it's loading
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
            // If ANY error occurs during screen detection, log and return UNKNOWN
            logStep('detectScreen', `Exception during detection: ${e.message}`);
            return SCREEN_STATE.UNKNOWN;
        }
    });
}

/**
 * Ensure we are on a specific screen state
 * @param {string} targetState - Target screen state
 * @param {Object} options - Options {timeout: number, force: boolean}
 */
async function ensureState(targetState, options = {}) {
    const { timeout = 20000, force = false } = options;
    return withLog('ensureState', `target="${targetState}"`, async () => {
        // Wait for loading to complete first
        await waitForLoadingToComplete(timeout);
        
        const currentState = await detectScreen();
        
        if (currentState === targetState && !force) {
            logStep('ensureState', `Already on ${targetState} screen`);
            return;
        }

        logStep('ensureState', `Current: ${currentState}, Target: ${targetState}`);

        // Handle transitions
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

/**
 * Ensure we are on main screen (authorized and logged in)
 */
async function ensureOnMainScreen(timeout = 30000) {
    return withLog('ensureOnMainScreen', '', async () => {
        const currentState = await detectScreen();
        
        if (currentState === SCREEN_STATE.MAIN) {
            return;
        }

        // If on PIN login, login first
        if (currentState === SCREEN_STATE.PIN_LOGIN) {
            // Need to know which PIN to use - this should be passed or detected
            // For now, throw error - caller should handle this
            throw new Error('ensureOnMainScreen: On PIN login screen but PIN not provided. Use login() first.');
        }

        // If on auth screen, authorize first
        if (currentState === SCREEN_STATE.AUTH) {
            throw new Error('ensureOnMainScreen: On auth screen. Use authorize() first.');
        }

        // If unknown or other state, restart and check
        await restart();
        const newState = await detectScreen();
        
        if (newState === SCREEN_STATE.MAIN) {
            return;
        }

        // Wait for main screen to appear
        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                return state === SCREEN_STATE.MAIN;
            },
            { timeout, timeoutMsg: `Main screen did not appear after ${timeout}ms` }
        );
    });
}

/**
 * Ensure we are on PIN login screen
 */
async function ensureOnPinLoginScreen(timeout = 20000) {
    return withLog('ensureOnPinLoginScreen', '', async () => {
        // Wait for loading first
        await waitForLoadingToComplete(timeout);
        
        const currentState = await detectScreen();
        logStep('ensureOnPinLoginScreen', `Current state: ${currentState}`);
        
        if (currentState === SCREEN_STATE.PIN_LOGIN) {
            logStep('ensureOnPinLoginScreen', 'Already on PIN_LOGIN screen');
            return;
        }

        // If on main screen, restart to get to login
        if (currentState === SCREEN_STATE.MAIN) {
            logStep('ensureOnPinLoginScreen', 'On MAIN, restarting to get to PIN_LOGIN');
            await restart();
            await waitForLoadingToComplete(timeout);
        }

        // If on auth screen, user needs to authorize first
        if (currentState === SCREEN_STATE.AUTH) {
            throw new Error('ensureOnPinLoginScreen: On auth screen. User needs to authorize first.');
        }
        
        // If on PIN create/confirm, restart
        if (currentState === SCREEN_STATE.PIN_CREATE || currentState === SCREEN_STATE.PIN_CONFIRM) {
            logStep('ensureOnPinLoginScreen', 'On PIN_CREATE/CONFIRM, restarting');
            await restart();
            await waitForLoadingToComplete(timeout);
        }

        // Wait for PIN login screen
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

/**
 * Sign out from the app
 */
async function signOut() {
    return withLog('signOut', '', async () => {
        // Check current state
        const currentState = await detectScreen();
        
        // If not on main screen, try to get there
        if (currentState !== SCREEN_STATE.MAIN) {
            await ensureOnMainScreen(15000);
        }
        
        // Wait for menu to be visible (might need time to load)
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

        // Wait for menu to open - check for any menu elements
        await driver.pause(1000); // Give menu time to animate
        await driver.waitUntil(
            async () => {
                try {
                    const pageSource = await driver.getPageSource();
                    // Check for common menu elements
                    return pageSource.includes('Налаштування') || 
                           pageSource.includes('Вийти') ||
                           pageSource.includes('Settings');
                } catch (e) {
                    return false;
                }
            },
            { timeout: 10000, timeoutMsg: 'Menu did not open - no menu elements found' }
        );

        // Scroll to "Вийти" button
        await driver.execute('mobile: scroll', {
            direction: 'down',
            predicateString: 'name == "Вийти" OR label == "Вийти"'
        });

        // Find and click sign out button
        const signoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true AND visible == true');
        await signoutBtn.waitForDisplayed({ timeout: 10000 });
        await signoutBtn.click();

        // Wait for confirmation dialog
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

        // Click confirm button
        const confirmSignoutBtn = getElementByClassChain('Button', 'name == "Вийти" AND enabled == true');
        await confirmSignoutBtn.waitForDisplayed({ timeout: 10000 });
        await confirmSignoutBtn.click();

        // Wait for loading to complete after sign out
        await waitForLoadingToComplete(15000);

        // Wait for auth screen
        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                return state === SCREEN_STATE.AUTH;
            },
            { timeout: 10000, timeoutMsg: 'Authorization screen did not appear after sign out' }
        );
    });
}

/**
 * Ensure we are on authorization screen
 */
async function ensureAuthorized(timeout = 20000) {
    return withLog('ensureAuthorized', '', async () => {
        // Wait for loading to complete first
        await waitForLoadingToComplete(timeout);
        
        const currentState = await detectScreen();
        
        if (currentState === SCREEN_STATE.AUTH) {
            return;
        }

        // If on main screen, verify menu is visible before trying to sign out
        if (currentState === SCREEN_STATE.MAIN) {
            const menuBtn = getMenuButton();
            const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
            if (isMenuVisible) {
                await signOut();
                // Wait for loading after sign out
                await waitForLoadingToComplete(timeout);
                // Verify we're on auth screen
                await driver.waitUntil(
                    async () => {
                        const state = await detectScreen();
                        return state === SCREEN_STATE.AUTH;
                    },
                    { timeout, timeoutMsg: `Authorization screen did not appear after sign out` }
                );
                return;
            } else {
                // Menu not visible - might be misdetected, restart instead
                logStep('ensureAuthorized', 'Menu not visible, restarting instead of sign out');
                await restart();
                // Wait for loading after restart
                await waitForLoadingToComplete(timeout);
            }
        }

        // If on PIN screens, use forgot code to get to auth
        if (currentState === SCREEN_STATE.PIN_LOGIN) {
            await forgotCode();
            // Wait for loading after forgot code
            await waitForLoadingToComplete(timeout);
            // Wait for auth screen
            await driver.waitUntil(
                async () => {
                    const state = await detectScreen();
                    return state === SCREEN_STATE.AUTH;
                },
                { timeout, timeoutMsg: `Authorization screen did not appear after forgotCode` }
            );
            return;
        }

        // If on PIN create/confirm, restart to get to auth
        if (currentState === SCREEN_STATE.PIN_CREATE || currentState === SCREEN_STATE.PIN_CONFIRM) {
            await restart();
            // Wait for loading after restart
            await waitForLoadingToComplete(timeout);
        }
        
        // If on WebView error screen (BankID API error), click back and restart
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
            // Restart to clean state
            await restart();
            await waitForLoadingToComplete(timeout);
        }

        // Wait for auth screen
        await driver.waitUntil(
            async () => {
                const state = await detectScreen();
                return state === SCREEN_STATE.AUTH;
            },
            { timeout, timeoutMsg: `Authorization screen did not appear after ${timeout}ms` }
        );
    });
}

// TEST SETUP

/**
 * Setup initial state for a test
 * @param {string} targetState - Target screen state (AUTH, PIN_LOGIN, MAIN)
 * @param {Object} options - Options {pinCode: string, timeout: number}
 * @returns {Promise<void>}
 */
async function setupTestState(targetState, options = {}) {
    const { pinCode, timeout = 30000 } = options;
    return withLog('setupTestState', `target="${targetState}" pinCode="${pinCode || 'none'}"`, async () => {
        // First, wait for loading screen to disappear and interactive elements to be ready
        await waitForLoadingToComplete(timeout);
        
        // Small delay to ensure UI is fully ready after loading completes
        await driver.pause(500);
        
        // Check if we're on Settings screen first (before detectScreen)
        // Settings screen has "menu back" button and needs special handling
        try {
            const backBtn = getElementByAccessibilityId('menu back');
            const settingsTitle = getElementByAccessibilityId('Налаштування');
            if (await backBtn.isDisplayed().catch(() => false) && 
                await settingsTitle.isDisplayed().catch(() => false)) {
                logStep('setupTestState', 'Detected Settings screen, going back to MAIN');
                await backBtn.click();
                await driver.pause(1000);
                // After going back, continue with normal flow
            }
        } catch (e) {
            // Not on Settings, continue normally
        }
        
        const currentState = await detectScreen();
        
        // If already in target state, verify it's correct
        if (currentState === targetState) {
            // For PIN_LOGIN and MAIN, verify PIN is set correctly
            if (targetState === SCREEN_STATE.MAIN) {
                // Verify menu is visible (user is logged in)
                const menuBtn = getMenuButton();
                const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
                if (isMenuVisible) {
                    logStep('setupTestState', 'Already on MAIN screen with user logged in');
                    return;
                } else {
                    // Menu not visible - need to set up from scratch
                    logStep('setupTestState', 'On MAIN but menu not visible, setting up from scratch');
                }
            } else if (targetState === SCREEN_STATE.PIN_LOGIN) {
                // PIN login screen - verify we can proceed
                logStep('setupTestState', 'Already on PIN_LOGIN screen');
                return;
            } else if (targetState === SCREEN_STATE.AUTH) {
                logStep('setupTestState', 'Already on AUTH screen');
                return;
            }
        }

        // Setup based on target state
        switch (targetState) {
            case SCREEN_STATE.AUTH:
                // Need to get to auth screen
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
                // Need PIN login screen with specific PIN set
                if (!pinCode) {
                    throw new Error('setupTestState: pinCode is required for PIN_LOGIN state');
                }
                
                logStep('setupTestState', `Setting up PIN_LOGIN state with PIN: ${pinCode}`);
                
                // Always ensure user is authorized with the correct PIN first
                // This guarantees the PIN is set correctly before restarting
                if (currentState === SCREEN_STATE.AUTH) {
                    logStep('setupTestState', 'Currently on AUTH, authorizing with correct PIN');
                    await authorize(pinCode);
                    await assertGreeting();
                    await driver.pause(500);
                } else if (currentState === SCREEN_STATE.MAIN) {
                    logStep('setupTestState', 'Currently on MAIN, need to set correct PIN');
                    // Sign out first, then authorize with correct PIN
                    const menuBtn = getMenuButton();
                    const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
                    if (isMenuVisible) {
                        logStep('setupTestState', 'Menu visible, signing out');
                        await signOut();
                        await waitForLoadingToComplete(timeout);
                        await ensureState(SCREEN_STATE.AUTH, { timeout });
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(500);
                    } else {
                        // Menu not visible - restart and authorize
                        logStep('setupTestState', 'Menu not visible, restarting');
                        await restart();
                        await waitForLoadingToComplete(timeout);
                        await ensureState(SCREEN_STATE.AUTH, { timeout });
                        await authorize(pinCode);
                        await assertGreeting();
                        await driver.pause(500);
                    }
                } else if (currentState === SCREEN_STATE.PIN_LOGIN) {
                    logStep('setupTestState', 'Already on PIN_LOGIN, verifying correct PIN by reauthorizing');
                    // Already on PIN login - we can't verify PIN without trying to login
                    // Always restart and reauthorize to ensure correct PIN is set
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
                        // Still on PIN login - try to login to verify PIN, if fails then reauthorize
                        logStep('setupTestState', 'After restart still on PIN_LOGIN, attempting login to verify PIN');
                        try {
                            await login(pinCode);
                            await assertGreeting();
                            await driver.pause(500);
                            // Login successful, PIN is correct
                            logStep('setupTestState', 'Login successful, PIN is correct');
                        } catch (loginError) {
                            // Login failed - wrong PIN, need to reauthorize
                            logStep('setupTestState', 'Login failed, reauthorizing with correct PIN');
                            await forgotCode();
                            await waitForLoadingToComplete(timeout);
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
                    // Unknown state - authorize first
                    logStep('setupTestState', 'Unknown state, ensuring AUTH and authorizing');
                    await ensureState(SCREEN_STATE.AUTH, { timeout });
                    await authorize(pinCode);
                    await assertGreeting();
                    await driver.pause(500);
                }
                
                // Now restart to get to PIN login screen
                logStep('setupTestState', 'Restarting to get to PIN_LOGIN screen');
                await restart();
                await waitForLoadingToComplete(timeout);
                await ensureState(SCREEN_STATE.PIN_LOGIN, { timeout });
                logStep('setupTestState', 'Successfully set up PIN_LOGIN state');
                break;

            case SCREEN_STATE.MAIN:
                // Need main screen with user logged in with specific PIN
                if (!pinCode) {
                    throw new Error('setupTestState: pinCode is required for MAIN state');
                }
                
                logStep('setupTestState', `Setting up MAIN state with PIN: ${pinCode}`);
                
                // Always ensure we're logged in with correct PIN
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
                    // Verify menu is visible - if not, need to login
                    const menuBtn = getMenuButton();
                    const isMenuVisible = await menuBtn.isDisplayed().catch(() => false);
                    if (!isMenuVisible) {
                        // Not really on main - need to restart and login
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
                        // Menu visible - already on MAIN with correct state
                        logStep('setupTestState', 'Menu visible, already on MAIN');
                        await driver.pause(300);
                    }
                } else {
                    // Unknown - restart and login
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
                        // Still unknown - try to get to PIN login
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

// FLOWS

/**
 * Авторизація в додатку
 */
async function authorize(codeDigit) {
    return withLog('authorize', `codeDigit=${codeDigit}`, async () => {
        // Wait for loading screen to disappear first
        await waitForLoadingToComplete(30000);
        
        // Перевіряємо, чи користувач вже авторизований
        try {
            const menuBtn = getMenuButton();
            const isMenuDisplayed = await menuBtn.isDisplayed().catch(() => false);
            if (isMenuDisplayed) {
                logStep('authorize', 'User already authorized, skipping authorization flow');
                return;
            }
        } catch (e) {
            // Меню не знайдено - продовжуємо з авторизацією
        }
        
        // Очікуємо повного завантаження екрану авторизації
        // Використовуємо page source check для швидшої та надійнішої перевірки
        await driver.waitUntil(
            async () => {
                try {
                    // First check page source (faster)
                    const pageSource = await driver.getPageSource();
                    const hasAuthElements = pageSource.includes('checkbox_conditions_bordered_auth') || 
                                          pageSource.includes('title_auth') ||
                                          pageSource.includes('BankID');
                    
                    if (hasAuthElements) {
                        // Verify with element finding
                        try {
                            const checkbox = getElementByAccessibilityId('checkbox_conditions_bordered_auth');
                            if (await checkbox.isDisplayed().catch(() => false)) {
                                return true;
                            }
                        } catch (e1) {
                            // Continue
                        }
                        try {
                            const authTitle = getElementByAccessibilityId('title_auth');
                            if (await authTitle.isDisplayed().catch(() => false)) {
                                return true;
                            }
                        } catch (e2) {
                            // Continue
                        }
                        try {
                            const loginWithNBU = getElementByPredicate(
                                'type == "XCUIElementTypeButton" AND (name CONTAINS "BankID" OR label CONTAINS "BankID")'
                            );
                            if (await loginWithNBU.isDisplayed().catch(() => false)) {
                                return true;
                            }
                        } catch (e3) {
                            // Continue
                        }
                        // If elements exist in page source, UI is ready even if isDisplayed() fails
                        return true;
                    }
                    return false;
                } catch (e) {
                    return false;
                }
            },
            { timeout: 20000, timeoutMsg: 'Authorization screen did not load - neither checkbox nor BankID button found' }
        );

        // Тепер нам точно відомо, що екран авторизації завантажений
        // Отримуємо елементи (це не має падати, бо вже чекали)
        let checkbox;
        try {
            checkbox = getElementByAccessibilityId('checkbox_conditions_bordered_auth');
            await checkbox.waitForDisplayed({ timeout: 5000 });
        } catch (e) {
            // Якщо чекбокс все ще не видно, то можливо система підтримує авторизацію без нього
            logStep('authorize', 'Checkbox not found - trying to proceed with BankID button only');
            checkbox = null;
        }

        // Перевіряємо, що кнопка BankID присутня і видна
        const loginWithNBU = getElementByPredicate(
            'type == "XCUIElementTypeButton" AND (name CONTAINS "BankID" OR label CONTAINS "BankID")'
        );
        await loginWithNBU.waitForDisplayed({ timeout: 10000 });
        await loginWithNBU.click();
        
        // Очікуємо завантаження WebView - перевіряємо появу кнопки "Банк НаДія"
        logStep('authorize', 'Waiting for WebView to load - looking for "Банк НаДія" button');
        await driver.waitUntil(
            async () => {
                try {
                    // Check if session is still active
                    const pageSource = await driver.getPageSource();
                    // Check if bank selection screen appeared (look for "Банк НаДія" or "Оберіть свій банк")
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
        
        // Now find and click the bank button (element will be fresh)
        const bankNadiia = getElementByText('Банк НаДія');
        await bankNadiia.waitForDisplayed({ timeout: 5000 });
        await bankNadiia.click();
        await driver.pause(500); // Wait for WebView to process click

        // Вводимо токен в поле вводу
        // Можна передати через env variable BANKID_TOKEN або використати дефолтний
        const TOKEN = process.env.BANKID_TOKEN || 'B7B5908CFBA2DBDA1BE9';
        console.log(`[DEBUG] authorize() | Використовуємо токен: ${TOKEN.substring(0, 4)}...${TOKEN.substring(TOKEN.length - 4)} (довжина: ${TOKEN.length})`);
        
        let tokenInput;
        try {
            // Спочатку спробуємо знайти по accessibilityIdentifier (якщо буде додано)
            tokenInput = getElementByAccessibilityId('tokenInputField');
            await tokenInput.waitForDisplayed({ timeout: 1000 });
            console.log(`[DEBUG] authorize() | Знайдено поле по accessibilityIdentifier: tokenInputField`);
        } catch (e) {
            // Fallback: використовуємо Predicate String
            // WebView потребує більше часу для завантаження
            tokenInput = getElementByPredicate('type == "XCUIElementTypeTextField" AND enabled == true AND visible == true');
            await tokenInput.waitForDisplayed({ timeout: 15000 }); // 15 seconds for WebView to load
            console.log(`[DEBUG] authorize() | Знайдено поле по Predicate String (fallback)`);
        }
        await expect(tokenInput).toBeDisplayed();
        
        // Перевіряємо початковий стан поля
        try {
            const initialValue = await tokenInput.getValue();
            console.log(`[DEBUG] authorize() | Початкове значення поля: "${initialValue}"`);
        } catch (e) {
            console.log(`[DEBUG] authorize() | Не вдалося отримати початкове значення поля: ${e.message}`);
        }
        
        // Очищаємо поле перед введенням
        try {
            await tokenInput.click();
            await driver.pause(50);
            // Для iOS clear() може не працювати, використовуємо альтернативний метод
            try {
                await tokenInput.clear();
                console.log(`[DEBUG] authorize() | Поле очищено через clear()`);
            } catch (clearError) {
                // Альтернативний метод: встановлюємо порожнє значення
                await tokenInput.setValue('');
                await driver.pause(50);
                console.log(`[DEBUG] authorize() | Поле очищено через setValue('')`);
            }
        } catch (e) {
            console.log(`[DEBUG] authorize() | Помилка при очищенні поля: ${e.message}`);
        }
        
        // Вводимо токен
        console.log(`[DEBUG] authorize() | Введення токену через setValue(): ${TOKEN}`);
        await tokenInput.setValue(TOKEN);
        
        // Очікуємо, що токен введено - перевіряємо значення поля
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
        
        // Перевіряємо, що саме введено в поле
        try {
            const enteredValue = await tokenInput.getValue();
            console.log(`[DEBUG] authorize() | Значення після setValue(): "${enteredValue}" (довжина: ${enteredValue ? enteredValue.length : 0})`);
            
            if (enteredValue !== TOKEN) {
                console.log(`[WARNING] authorize() | Токен обрізано! Очікувано: "${TOKEN}", отримано: "${enteredValue}"`);
                console.log(`[WARNING] authorize() | Відсутні символи: "${TOKEN.replace(enteredValue, '')}"`);
                
                // Спробуємо ввести токен посимвольно
                console.log(`[DEBUG] authorize() | Спроба введення посимвольно...`);
                await tokenInput.clear();
                await driver.pause(100);
                
                for (let i = 0; i < TOKEN.length; i++) {
                    await tokenInput.addValue(TOKEN[i]);
                    await driver.pause(30);
                }
                await driver.pause(300);
                
                const valueAfterCharByChar = await tokenInput.getValue();
                console.log(`[DEBUG] authorize() | Значення після посимвольного введення: "${valueAfterCharByChar}" (довжина: ${valueAfterCharByChar ? valueAfterCharByChar.length : 0})`);
            } else {
                console.log(`[DEBUG] authorize() | Токен введено коректно!`);
            }
        } catch (e) {
            console.log(`[DEBUG] authorize() | Помилка при отриманні значення після введення: ${e.message}`);
        }

        // Знаходимо кнопку SignIn
        const signinBtn = getElementByAccessibilityId('SignIn');
        await expect(signinBtn).toBeDisplayed();
        
        logStep('authorize', 'Clicking SignIn button - calling BankID API...');
        await signinBtn.click();
        
        // Wait for response from BankID API (check for errors first)
        await driver.pause(2000);
        
        // Check if BankID API returned an error
        const pageSourceAfterSignIn = await driver.getPageSource();
        
        // Детальна діагностика відповіді
        if (pageSourceAfterSignIn.includes('NotFoundError') || pageSourceAfterSignIn.includes('Not found')) {
            logStep('authorize', '❌ BankID API returned error 404');
            console.log('[ERROR] BankID API Response contains:');
            
            // Витягуємо JSON помилку якщо є
            const errorMatch = pageSourceAfterSignIn.match(/"name"\s*:\s*"NotFoundError"[\s\S]{0,200}/);
            if (errorMatch) {
                console.log('[ERROR] Error details:', errorMatch[0]);
            }
            
            // Показуємо що було надіслано
            console.log('[ERROR] Request parameters:');
            console.log(`  - Bank: Банк НаДія`);
            console.log(`  - Token: ${TOKEN.substring(0, 4)}...${TOKEN.substring(TOKEN.length - 4)}`);
            console.log(`  - Token length: ${TOKEN.length}`);
            
            logStep('authorize', 'Clicking back and restarting...');
            
            // Click back button to return
            try {
                const backBtn = getElementByText('Назад');
                if (await backBtn.isDisplayed().catch(() => false)) {
                    await backBtn.click();
                    await driver.pause(1000);
                }
            } catch (e) {
                logStep('authorize', `Could not click back: ${e.message}`);
            }
            
            // Restart app to clean state
            await restart();
            throw new Error('BankID API returned 404 error. This might be due to invalid token, bank, or API unavailability. Please check test environment.');
        }
        
        // Очікуємо завершення обробки авторизації - перевіряємо появу кнопки "Далі" або PIN create екрану
        logStep('authorize', 'Waiting for "Далі" button or PIN create screen after SignIn');
        
        let nextBtnClicked = false;
        try {
            await driver.waitUntil(
                async () => {
                    try {
                        // Перевіряємо, чи сесія ще активна
                        try {
                            await driver.getPageSource();
                        } catch (sessionError) {
                            if (sessionError.message && sessionError.message.includes('session')) {
                                logStep('authorize', 'Session terminated, cannot continue');
                                throw new Error('Session terminated during authorization');
                            }
                        }
                        
                        // Можливо, ми вже вийшли з WebView і на екрані PIN create
                        const pinCreateHeader = getElementByAccessibilityId('title_pincreate');
                        if (await pinCreateHeader.isDisplayed().catch(() => false)) {
                            logStep('authorize', 'Already on PIN create screen, skipping "Далі" button');
                            return true;
                        }
                        
                        // Спробуємо знайти кнопку "Далі"
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
                        // Якщо помилка сесії, пробрасуємо далі
                        if (e.message && e.message.includes('Session terminated')) {
                            throw e;
                        }
                        return false;
                    }
                },
                { timeout: 30000, timeoutMsg: 'Button "Далі" did not appear and PIN create screen not found' }
            );
            
            // Якщо ми не на PIN create екрані, знаходимо і клікаємо "Далі"
            const pinCreateCheck = getElementByAccessibilityId('title_pincreate');
            const isOnPinCreate = await pinCreateCheck.isDisplayed().catch(() => false);
            
            if (!isOnPinCreate) {
                // Знаходимо кнопку "Далі" і клікаємо
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
                await driver.pause(500); // Wait for transition
            }
        } catch (e) {
            // Якщо помилка сесії, пробрасуємо
            if (e.message && e.message.includes('Session terminated')) {
                throw e;
            }
            logStep('authorize', `Error in "Далі" flow: ${e.message}, checking if already on PIN create...`);
            // Перевіряємо, чи ми вже на PIN create екрані
            const pinCreateCheck = getElementByAccessibilityId('title_pincreate');
            const isOnPinCreate = await pinCreateCheck.isDisplayed().catch(() => false);
            if (!isOnPinCreate && !nextBtnClicked) {
                throw new Error(`Failed to click "Далі" button and not on PIN create screen: ${e.message}`);
            }
        }
        
        // Очікуємо один із релевантних екранів після авторизації
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
            await enterPinCode(codeDigit);

            // Після введення першого коду очікуємо confirm або MAIN/PIN_LOGIN
            await driver.waitUntil(
                async () => {
                    const state = await detectScreen();
                    return (
                        state === SCREEN_STATE.PIN_CONFIRM ||
                        state === SCREEN_STATE.PIN_LOGIN ||
                        state === SCREEN_STATE.MAIN
                    );
                },
                { timeout: 20000, timeoutMsg: 'PIN confirm/login or MAIN screen did not appear after PIN create' }
            );

            const afterCreateState = await detectScreen();
            if (afterCreateState === SCREEN_STATE.PIN_CONFIRM) {
                await enterPinCode(codeDigit);
            } else if (afterCreateState === SCREEN_STATE.PIN_LOGIN) {
                await enterPinCode(codeDigit);
            }
        } else if (postAuthState === SCREEN_STATE.PIN_CONFIRM) {
            await enterPinCode(codeDigit);
        } else if (postAuthState === SCREEN_STATE.PIN_LOGIN) {
            await enterPinCode(codeDigit);
        }
    });
}

/**
 * Функція "Забув код"
 * Перевіряє, чи є екран введення PIN коду, і якщо ні - спочатку авторизується
 */
async function forgotCode() {
    return withLog('forgotCode', '', async () => {
        // Wait for loading to complete first
        await waitForLoadingToComplete(15000);
        
        // Ensure we are on PIN login screen
        await ensureOnPinLoginScreen(15000);

        // Find and click "Не пам'ятаю код для входу" button
        logStep('forgotCode', 'Looking for "Forgot code" button');
        const forgotCodeBtn = getElementByPredicate(
            '(type == "XCUIElementTypeButton") AND (name CONTAINS "Не пам\'ятаю" OR label CONTAINS "Не пам\'ятаю" OR name CONTAINS "пам\'ятаю код" OR label CONTAINS "пам\'ятаю код")'
        );
        await forgotCodeBtn.waitForDisplayed({ timeout: 10000 });
        await forgotCodeBtn.click();

        // Wait for "Авторизуватися" button to appear (might be in popup/alert)
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
        
        // Wait for loading to complete after clicking authorize
        await waitForLoadingToComplete(30000);
        
        // Wait for AUTH screen to appear
        await driver.waitUntil(
            async () => {
                try {
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

/**
 * Логін в додаток
 */
async function login(codeDigit) {
    return withLog('login', `codeDigit=${codeDigit}`, async () => {
        // Wait for loading to complete first
        await waitForLoadingToComplete(15000);
        
        // Small stabilization delay
        await driver.pause(500);
        
        // Ensure we are on PIN login screen
        await ensureOnPinLoginScreen(15000);
        
        // Additional verification with retry
        let retries = 3;
        let currentState = await detectScreen();
        while (currentState !== SCREEN_STATE.PIN_LOGIN && retries > 0) {
            logStep('login', `Not on PIN_LOGIN (detected: ${currentState}), retrying... (${retries} attempts left)`);
            await driver.pause(1000);
            await waitForLoadingToComplete(10000);
            currentState = await detectScreen();
            retries--;
        }

        // Verify we're on login screen (not create/confirm)
        if (currentState !== SCREEN_STATE.PIN_LOGIN) {
            throw new Error(`login: Expected PIN_LOGIN screen, but detected ${currentState} after retries`);
        }
        
        logStep('login', 'Confirmed on PIN_LOGIN screen, entering PIN code');
        await enterPinCode(codeDigit);
        
        // Wait for login to process
        await driver.pause(500);
    });
}

/**
 * Перезапуск додатку
 */
async function restart() {
    return withLog('restart', '', async () => {
        await driver.execute('mobile: terminateApp', {
            bundleId: IOS_BUNDLE_ID
        });

        // Невелика пауза для закриття додатку
        await driver.pause(1500);

        await driver.execute('mobile: activateApp', {
            bundleId: IOS_BUNDLE_ID
        });

        // Wait for loading screen to disappear first
        await waitForLoadingToComplete(30000);

        // Очікуємо завантаження додатку - використовуємо detectScreen для стабільного визначення
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

/**
 * Введення PIN коду
 */
async function enterPinCode(codeDigit) {
    return withLog('enterPinCode', `codeDigit=${codeDigit}`, async () => {
        // Чекаємо на кнопку з потрібною цифрою (пін-пад)
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
        
        for (let i = 0; i < 4; i++) {
            await codeButton.click();
            // Невелика пауза між кліками для стабільності
            await driver.pause(50);
        }
    });
}

// ASSERTIONS

/**
 * Перевірка привітання
 */
async function assertGreeting() {
    return withLog('assertGreeting', '', async () => {
        // Спочатку перевіряємо, що головний екран завантажився
        // Використовуємо waitUntil для гнучкого очікування появи будь-якого елемента головного екрану
        let greetingFound = false;
        
        // Додаємо невелику затримку для стабілізації UI після авторизації/логіну
        await driver.pause(500);
        
        await driver.waitUntil(
            async () => {
                // Перевіряємо стан екрану
                const currentState = await detectScreen();
                if (currentState === SCREEN_STATE.MAIN) {
                    return true;
                }
                
                // Перевіряємо наявність меню (якщо меню є, головний екран завантажився)
                try {
                    const menuBtn = getMenuButton();
                    if (await menuBtn.isDisplayed().catch(() => false)) {
                        return true;
                    }
                } catch (e) {
                    // Continue checking
                }
                
                // Якщо меню не знайдено, пробуємо знайти привітання
                try {
                    const greeting = getElementByAccessibilityId('Привіт, Віктор 👋');
                    if (await greeting.isDisplayed().catch(() => false)) {
                        greetingFound = true;
                        return true;
                    }
                } catch (e2) {
                    // Спробуємо знайти привітання через predicate
                    try {
                        const greetingPredicate = getElementByPredicate('label CONTAINS "Привіт" OR name CONTAINS "Привіт"');
                        if (await greetingPredicate.isDisplayed().catch(() => false)) {
                            greetingFound = true;
                            return true;
                        }
                    } catch (e3) {
                        // Continue
                    }
                }
                
                return false;
            },
            { timeout: 15000, timeoutMsg: 'Main screen did not load after authorization' }
        );

        // Якщо привітання вже знайдено в waitUntil, просто перевіряємо його
        if (greetingFound) {
            const greeting = getElementByAccessibilityId('Привіт, Віктор 👋');
            try {
                await expect(greeting).toBeDisplayed();
                return;
            } catch (e) {
                // Якщо не знайдено по accessibilityId, пробуємо predicate
                const greetingPredicate = getElementByPredicate('label CONTAINS "Привіт" OR name CONTAINS "Привіт"');
                await expect(greetingPredicate).toBeDisplayed();
                return;
            }
        }

        // Якщо привітання не знайдено в waitUntil, шукаємо його явно
        const greeting = getElementByAccessibilityId('Привіт, Віктор 👋');
        try {
            await greeting.waitForDisplayed({ timeout: 10000 });
            await expect(greeting).toBeDisplayed();
            return;
        } catch (e) {
            // Фолбек: точний match по name/label/value
            try {
                const greetingExact = getElementByPredicate(
                    'label == "Привіт, Віктор 👋" OR name == "Привіт, Віктор 👋" OR value == "Привіт, Віктор 👋"'
                );
                await greetingExact.waitForDisplayed({ timeout: 10000 });
                await expect(greetingExact).toBeDisplayed();
                return;
            } catch (err) {
                // Фолбек: шукаємо будь-який текст з "Привіт"
                const greetingPredicate = getElementByPredicate('label CONTAINS "Привіт" OR name CONTAINS "Привіт"');
                await greetingPredicate.waitForDisplayed({ timeout: 10000 });
                await expect(greetingPredicate).toBeDisplayed();
            }
        }
    });
}

/**
 * Normalize text for comparison (handles newlines, spaces)
 */
function normalizeText(text) {
    if (!text) return '';
    return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Перевірка popup (robust implementation for iOS alerts/sheets)
 */
async function assertPopup(title = '', msg = '') {
    return withLog('assertPopup', `title="${title}" msg="${msg}"`, async () => {
        // Normalize search text
        const normalizedTitle = normalizeText(title);
        const normalizedMsg = normalizeText(msg);

        // First, check if we have an alert or sheet container
        let alertContainer = null;
        try {
            const alert = getElementByPredicate('type == "XCUIElementTypeAlert"');
            if (await alert.isDisplayed().catch(() => false)) {
                alertContainer = alert;
            }
        } catch (e) {
            // Continue
        }

        if (!alertContainer) {
            try {
                const sheet = getElementByPredicate('type == "XCUIElementTypeSheet"');
                if (await sheet.isDisplayed().catch(() => false)) {
                    alertContainer = sheet;
                }
            } catch (e) {
                // Continue
            }
        }

        // Function to find text in container or globally
        const findTextElement = async (searchText, container = null) => {
            if (!searchText) return null;

            const searchPredicate = `(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton") AND (name CONTAINS "${searchText}" OR label CONTAINS "${searchText}" OR value CONTAINS "${searchText}")`;
            
            if (container) {
                // Search within container
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
                // Search globally
                const element = getElementByPredicate(searchPredicate);
                if (await element.isDisplayed().catch(() => false)) {
                    return element;
                }
            }
            return null;
        };

        // Wait for popup to appear
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

        // Assert title if provided
        if (title) {
            const titleEl = await findTextElement(normalizedTitle, alertContainer);
            if (!titleEl) {
                // Fallback: try accessibility ID
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

        // Assert message if provided
        if (msg) {
            const msgEl = await findTextElement(normalizedMsg, alertContainer);
            if (!msgEl) {
                // Fallback: try accessibility ID
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

// OTHER

/**
 * Прокрутка до елемента (для iOS)
 */
async function scrollToElement(element, direction = 'down') {
    return withLog('scrollToElement', `direction="${direction}"`, async () => {
        await driver.execute('mobile: scroll', {
            direction: direction,
            element: element
        });
    });
}

/**
 * Знайти TextView по тексту (для iOS)
 * Шукає XCUIElementTypeStaticText всередині контейнера з заданим текстом
 */
async function findTextViewByText(container, expectedText, normalizeNewlines = true) {
    return withLog('findTextViewByText', `expectedText="${expectedText}" normalizeNewlines=${normalizeNewlines}`, async () => {
        // Використовуємо XPath для пошуку StaticText всередині контейнера
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
                // Елемент може бути недоступний, пропускаємо
                continue;
            }
        }
        
        throw new Error(`No StaticText found with text "${expectedText}" in container`);
    });
}

/**
 * Прокрутка контейнера до видимості елемента
 */
async function scrollContainerIntoView(accessibilityId) {
    return withLog('scrollContainerIntoView', `id="${accessibilityId}"`, async () => {
        // Для iOS спочатку спробуємо знайти елемент
        const container = getElementByAccessibilityId(accessibilityId);
        
        // Якщо не видимий, прокручуємо
        try {
            await container.waitForDisplayed({ timeout: 2000 });
        } catch (e) {
            // Прокручуємо вниз до знаходження елемента
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

/**
 * Перевірка TextView з текстом (для iOS)
 * Шукає XCUIElementTypeStaticText всередині контейнера з заданим accessibilityId
 */
async function assertTextView(accessibilityId, expectedText, normalizeNewlines = true) {
    return withLog('assertTextView', `id="${accessibilityId}" expectedText="${expectedText}" normalizeNewlines=${normalizeNewlines}`, async () => {
        const container = await scrollContainerIntoView(accessibilityId);

        // Нормалізуємо очікуваний текст для порівняння
        const normalizedExpected = normalizeNewlines
            ? expectedText.replace(/\n/g, ' ').trim()
            : expectedText.trim();

        await driver.waitUntil(
            async () => {
                // Використовуємо XPath для пошуку StaticText всередині контейнера
                // XPath працює надійно з контейнерами в iOS
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
                        // Елемент може бути недоступний, пропускаємо
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

/**
 * Отримати контейнер по Accessibility ID
 */
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

/**
 * Знайти кнопку з трьома крапками (more options button) поруч з текстом
 * Використовує кілька стратегій для надійного пошуку
 */
async function findMoreOptionsButton(nearText = 'Олександрович') {
    return withLog('findMoreOptionsButton', `nearText="${nearText}"`, async () => {
        // ПРИОРИТЕТ: Спочатку спробуємо знайти кнопку БЕЗ залежності від тексту
        // оскільки кнопка з'являється після кліку на "Документи" і може не мати тексту поруч
        
        // Стратегія 0 (НАЙВАЖЛИВІША): Знайти всі маленькі кнопки на екрані після відкриття документів
        try {
            logStep('findMoreOptionsButton', 'Strategy 0: Finding all small buttons on screen (PRIMARY, text-independent)');
            const allButtons = await driver.$$('-ios predicate string:type == "XCUIElementTypeButton" AND enabled == true AND visible == true');
            
            logStep('findMoreOptionsButton', `Found ${allButtons.length} buttons on screen`);
            
            // Знаходимо заголовок документа для визначення області пошуку
            const docTitle = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Посвідчення водія"`]');
            await docTitle.waitForDisplayed({ timeout: 5000 });
            const docLocation = await docTitle.getLocation();
            const docSize = await docTitle.getSize();
            
            logStep('findMoreOptionsButton', `Document title location: x=${docLocation.x}, y=${docLocation.y}, width=${docSize.width}, height=${docSize.height}`);
            
            // Шукаємо маленькі кнопки в області документа
            for (let i = 0; i < allButtons.length; i++) {
                const button = allButtons[i];
                try {
                    const buttonLocation = await button.getLocation();
                    const buttonSize = await button.getSize();
                    const buttonLabel = await button.getAttribute('name').catch(() => '');
                    
                    logStep('findMoreOptionsButton', `Button ${i}: x=${buttonLocation.x}, y=${buttonLocation.y}, width=${buttonSize.width}, height=${buttonSize.height}, label="${buttonLabel}"`);
                    
                    // Маленька кругла кнопка (зазвичай 20-50px)
                    const isSmallRoundButton = buttonSize.width <= 60 && buttonSize.height <= 60;
                    // Кнопка знаходиться в області документа (праворуч від заголовка або в правому верхньому куті)
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

        // Стратегія 5: Знайти кнопку безпосередньо в контейнері документа (не залежить від тексту)
        try {
            logStep('findMoreOptionsButton', 'Strategy 5: Finding button directly in document container (text-independent)');
            // Шукаємо кнопку в контейнері, який містить текст "Посвідчення водія"
            const docTitle = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Посвідчення водія"`]');
            await docTitle.waitForDisplayed({ timeout: 5000 });
            
            // Знаходимо батьківський контейнер через XPath (спробуємо кілька рівнів)
            const parentXPath = `//XCUIElementTypeStaticText[@name="Посвідчення водія"]/ancestor::XCUIElementTypeOther[1]`;
            const parentContainer = getElementByXPath(parentXPath);
            const buttonsInContainer = await parentContainer.$$('-ios class chain:**/XCUIElementTypeButton');
            
            logStep('findMoreOptionsButton', `Found ${buttonsInContainer.length} buttons in document container`);
            
            for (const button of buttonsInContainer) {
                try {
                    const isDisplayed = await button.isDisplayed();
                    if (isDisplayed) {
                        const buttonSize = await button.getSize();
                        // Маленька кругла кнопка (зазвичай 20-50px)
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

        // Стратегія 6: Знайти кнопку в контейнері списку документів (можливо ScrollView або TableView)
        try {
            logStep('findMoreOptionsButton', 'Strategy 6: Finding button in documents list container (text-independent)');
            // Шукаємо ScrollView або TableView, який містить документи
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
                                // Маленька кругла кнопка
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

        // Тепер спробуємо стратегії, які залежать від тексту (якщо текст існує)
        // Стратегія 1: Знайти кнопку в контейнері з текстом через class chain
        // Шукаємо кнопку в тому ж контейнері, що й текст
        try {
            logStep('findMoreOptionsButton', 'Strategy 1: Finding button in container with text using class chain');
            // Знаходимо контейнер, який містить текст
            const textElement = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "' + nearText + '"`]');
            await textElement.waitForDisplayed({ timeout: 3000 });
            
            // Шукаємо кнопку в тому ж контейнері
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

        // Стратегія 2: Знайти всі кнопки на екрані і вибрати ту, що знаходиться поруч з текстом
        try {
            logStep('findMoreOptionsButton', 'Strategy 2: Finding all buttons and selecting one near text');
            const textElement = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "' + nearText + '"`]');
            await textElement.waitForDisplayed({ timeout: 2000 });
            
            const textLocation = await textElement.getLocation();
            const textSize = await textElement.getSize();
            const textRightEdge = textLocation.x + textSize.width;
            
            // Шукаємо всі кнопки
            const allButtons = await driver.$$('-ios class chain:**/XCUIElementTypeButton');
            
            for (const button of allButtons) {
                try {
                    const isDisplayed = await button.isDisplayed();
                    if (!isDisplayed) continue;
                    
                    const buttonLocation = await button.getLocation();
                    const buttonSize = await button.getSize();
                    
                    // Перевіряємо, чи кнопка знаходиться праворуч від тексту і на тій же висоті
                    const isNearText = buttonLocation.x > textRightEdge && 
                                     buttonLocation.x < textRightEdge + 100 && // Не далі 100px
                                     Math.abs(buttonLocation.y - textLocation.y) < 30; // На тій же висоті ±30px
                    
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

        // Стратегія 3: Знайти кнопку через predicate string (всі кнопки, які enabled і visible)
        try {
            logStep('findMoreOptionsButton', 'Strategy 3: Finding button using predicate string');
            const buttons = await driver.$$('-ios predicate string:type == "XCUIElementTypeButton" AND enabled == true AND visible == true');
            
            // Знаходимо текст і порівнюємо координати
            const textElement = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "' + nearText + '"`]');
            await textElement.waitForDisplayed({ timeout: 2000 });
            const textLocation = await textElement.getLocation();
            const textSize = await textElement.getSize();
            const textRightEdge = textLocation.x + textSize.width;
            
            for (const button of buttons) {
                try {
                    const buttonLocation = await button.getLocation();
                    const buttonSize = await button.getSize();
                    
                    // Маленька кругла кнопка (зазвичай 20-40px)
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

        // Стратегія 4: Використати XPath для пошуку кнопки після тексту
        try {
            logStep('findMoreOptionsButton', 'Strategy 4: Finding button using XPath');
            // XPath: знайти кнопку, яка йде після тексту в тому ж контейнері
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


        // Якщо всі стратегії не спрацювали, зберігаємо page source для діагностики
        try {
            logStep('findMoreOptionsButton', 'All strategies failed, saving page source for debugging');
            const pageSource = await driver.getPageSource();
            const timestamp = Date.now();
            const fs = require('fs');
            const path = require('path');
            const debugDir = path.resolve(__dirname, '../../artifacts/debug');
            if (!fs.existsSync(debugDir)) {
                fs.mkdirSync(debugDir, { recursive: true });
            }
            const debugPath = path.join(debugDir, `pageSource-moreOptionsButton-${timestamp}.xml`);
            fs.writeFileSync(debugPath, pageSource);
            logStep('findMoreOptionsButton', `Page source saved to: ${debugPath}`);
        } catch (e) {
            logStep('findMoreOptionsButton', `Failed to save page source: ${e.message}`);
        }

        throw new Error(`Could not find more options button near text "${nearText}" using any strategy. Check debug page source in artifacts/debug/`);
    });
}

/**
 * Клікнути по координатах на екрані
 * @param {number} x - X координата
 * @param {number} y - Y координата
 * @param {string} description - Опис дії для логування (опціонально)
 */
/**
 * Розумний тап по координатах з багаторівневим fallback
 * @param {number} x - X координата
 * @param {number} y - Y координата
 * @param {string} description - Опис дії для логування
 * @param {Object} options - Додаткові опції {retries: number, timeout: number}
 */
async function tapSmart(x, y, description = '', options = {}) {
    const { retries = 3, timeout = 3000 } = options;
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    
    logStep('tapSmart', `Starting tap at x=${roundedX}, y=${roundedY}${description ? ` (${description})` : ''}`);
    
    // Перевірка координат в межах viewport
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
        
        // Стратегія 1: W3C Actions (найнадійніша для iOS)
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
            
            // releaseActions з timeout
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
        
        // Стратегія 2: mobile: tap (Appium native)
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
        
        // Стратегія 3: mobile: tap з параметрами
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
        
        // Невелика затримка перед наступною спробою
        if (attempt < retries) {
            await driver.pause(500);
        }
    }
    
    throw new Error(`All tap strategies failed after ${retries} attempts. Last error: ${lastError?.message || 'unknown'}`);
}

/**
 * Клікнути по координатах (legacy, використовує tapSmart)
 */
async function clickByCoordinates(x, y, description = '') {
    return withLog('clickByCoordinates', `x=${x}, y=${y}${description ? `, description="${description}"` : ''}`, async () => {
        await tapSmart(x, y, description, { retries: 3, timeout: 3000 });
    });
}

/**
 * Знайти і клікнути кнопку more options, або клікнути по координатах якщо надано
 * @param {string} nearText - Текст поруч з кнопкою (опціонально)
 * @param {Object} coordinates - Координати для кліку {x: number, y: number} (опціонально)
 * @returns {Promise<WebdriverIO.Element|void>} - Елемент кнопки або void якщо клікнули по координатах
 */
async function findAndClickMoreOptionsButton(nearText = null, coordinates = null) {
    return withLog('findAndClickMoreOptionsButton', `nearText="${nearText}", coordinates=${coordinates ? `{x:${coordinates.x}, y:${coordinates.y}}` : 'null'}`, async () => {
        // Якщо надано координати, використовуємо їх напряму
        if (coordinates && coordinates.x !== undefined && coordinates.y !== undefined) {
            logStep('findAndClickMoreOptionsButton', 'Using provided coordinates to click');
            await clickByCoordinates(coordinates.x, coordinates.y);
            return; // Повертаємо void, оскільки не знайшли елемент
        }
        
        // Інакше намагаємося знайти кнопку
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
