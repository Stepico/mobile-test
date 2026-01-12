const { expect, driver } = require('@wdio/globals');

const { 
    getElementByText,
    getElementByAccessibilityId,
    authorize,
    login,
    assertGreeting,
    assertPopup,
    restart,
    enterPinCode
} = require('../../helper');

describe('Auth test suite', () => {
    it('user should be able to authorize in the app for the first time', async () => {
        await authorize('0');
    
        await assertGreeting();
    });

    it('user should be able to log in to the app', async () => {
        await restart();

        await login('0');

        await assertGreeting();
    });

    it('user should be able to use "Forgot code" feature', async () => {
        await restart();

        const forgotCodeBtn = getElementByText("Не пам'ятаю код для входу");
        await forgotCodeBtn.click();

        const confirmAuthorize = getElementByText('Авторизуватися');
        await confirmAuthorize.click();

        await authorize('1');

        await assertGreeting();
    });

    it('user should be able to log in with new code after changing it (via "Forgot code" feature)', async () => {
        await restart();

        await login('1');

        await assertGreeting();
    });

    it('user should be able to change pin code (via Settings)', async () => {
        const menuBtn = getElementByAccessibilityId('МенюЄ нові повідомлення');
        await menuBtn.click();

        const settingsBtn = getElementByAccessibilityId('Налаштування');
        await settingsBtn.click();

        const changePinBtn = await $('id=ua.gov.diia.opensource:id/tv_change_app_pin');
        await changePinBtn.click();

        const repeatCodeScreenHeader = getElementByAccessibilityId('Повторіть\nкод з 4 цифр');
        await expect(repeatCodeScreenHeader).toBeDisplayed();

        await enterPinCode('1');

        const codeScreenHeader = getElementByAccessibilityId('Новий\nкод з 4 цифр');
        await expect(codeScreenHeader).toBeDisplayed();

        await enterPinCode('2');

        const repeatnewCodeScreenHeader = getElementByAccessibilityId('Повторіть\nкод з 4 цифр');
        await expect(repeatnewCodeScreenHeader).toBeDisplayed();

        await enterPinCode('2');

        await assertPopup(
            'Код змінено',
            'Ви змінили код для входу у застосунок Дія.'
        );

        const thankBtn = getElementByText('Дякую');
        await thankBtn.click();

        const settingsHeader = await $('id=ua.gov.diia.opensource:id/tv_settings_title');
        await expect(settingsHeader).toBeDisplayed();
    });

    it('user should be able to login with new pin (after changing it via Settings)', async () => {
        await restart();

        await login('2');

        await assertGreeting();
    });

    it('user should be able to sign out from the app', async () => {
        const menuBtn = getElementByAccessibilityId('МенюЄ нові повідомлення');
        await menuBtn.click();

        driver.$(
            'android=new UiScrollable(new UiSelector().scrollable(true))' +
            '.scrollTextIntoView("Вийти")'
        );

        const signoutBtn = getElementByText('Вийти');
        await signoutBtn.waitForDisplayed({ timeout: 10000 });
        await signoutBtn.click();

        const confirmSignoutBtn = getElementByText('ВИЙТИ');
        await confirmSignoutBtn.click();

        const loginWithNBU = getElementByText('BankID HБУ');
        await expect(loginWithNBU).toBeDisplayed();
    });

    it('user should be able to authorize to the app after sign out', async () => {
        await authorize('3');

        await assertGreeting();
    });

    it('user should be able to reauthorize after 3 not successful pin code inputs', async () => {
        await restart();

        for (let i = 0; i < 3; ++i) {
            await login('4');
        }

        await assertPopup(
            'Ви ввели неправильний код тричі',
            'Пройдіть повторну авторизацію у застосунку'
        );

        const authorizeBtn = getElementByText('Авторизуватися');
        await authorizeBtn.click();

        await authorize('4');

        await assertGreeting();
    });
});
