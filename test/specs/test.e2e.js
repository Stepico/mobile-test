const { expect, driver } = require('@wdio/globals')
const { 
    getElementByText,
    getElementByAccessibilityId,
    authorize,
    login,
    assertGreeting,
    restart
} = require('../../helper');

describe('Diia app test suite', () => {
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

        const codeButton = getElementByText('1');

        const repeatCodeScreenHeader = getElementByAccessibilityId('Повторіть\nкод з 4 цифр');
        await expect(repeatCodeScreenHeader).toBeDisplayed();
    
        for (let i = 0; i < 4; i++) {
            await codeButton.click();
        }

        const newcodeButton = getElementByText('2');

        const codeScreenHeader = getElementByAccessibilityId('Новий\nкод з 4 цифр');
        await expect(codeScreenHeader).toBeDisplayed();

        for (let i = 0; i < 4; i++) {
            await newcodeButton.click();
        }

        const repeatnewCodeScreenHeader = getElementByAccessibilityId('Повторіть\nкод з 4 цифр');
        await expect(repeatnewCodeScreenHeader).toBeDisplayed();
    
        for (let i = 0; i < 4; i++) {
            await newcodeButton.click();
        }

        const codeChangedTitle = getElementByText('Код змінено');
        await expect(codeChangedTitle).toBeDisplayed();

        const codeChangedMsg = getElementByText('Ви змінили код для входу у застосунок Дія.');
        await expect(codeChangedMsg).toBeDisplayed();

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

        const signoutBtn = getElementByText('Вийти');
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
});
