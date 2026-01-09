const { driver } = require('@wdio/globals')

// SELECTOR OPTIONS

export function getElementByText(text) {
    return $(`android=new UiSelector().text("${text}")`);
}

export function getElementByAccessibilityId(accessibilityId) {
    return driver.$(`~${accessibilityId}`);
}

// FLOWS

export async function authorize(codeDigit) {
    const loginWithNBU = getElementByText('BankID HБУ');
    await loginWithNBU.click();

    const bankNadiia = getElementByText('Банк НаДія');
    await bankNadiia.click();

    const tokenInput = await $('//android.widget.EditText[@resource-id="tokenInputField"]');

    await tokenInput.click();
    await tokenInput.setValue('B322F2E0FB8181467AF63FFB879D5');

    const signinBtn = getElementByText('SignIn');
    await signinBtn.click();

    const nextBtn = getElementByText('Далі');
    await nextBtn.click();
    
    const codeScreenHeader = getElementByAccessibilityId('Придумайте\nкод з 4 цифр');
    await expect(codeScreenHeader).toBeDisplayed();

    const codeButton = getElementByText(`${codeDigit}`);
    for (let i = 0; i < 4; i++) {
        await codeButton.click();
    }

    const repeatCodeScreenHeader = getElementByAccessibilityId('Повторіть\nкод з 4 цифр');
    await expect(repeatCodeScreenHeader).toBeDisplayed();

    for (let i = 0; i < 4; i++) {
        await codeButton.click();
    }
}

export async function login(codeDigit) {
    const codeScreenHeader = getElementByText('Код для входу');
    await expect(codeScreenHeader).toBeDisplayed();

    const codeButton = getElementByText(`${codeDigit}`);
    for (let i = 0; i < 4; i++) {
        await codeButton.click();
    }
}

export async function restart() {
    await driver.execute('mobile: terminateApp', {
        appId: 'ua.gov.diia.opensource'
    });

    await driver.execute('mobile: activateApp', { 
        appId: 'ua.gov.diia.opensource'
    });
}

// ASSERTIONS

export async function assertGreeting() {
    const greeting = getElementByAccessibilityId('Привіт, Надія 👋');
    await expect(greeting).toBeDisplayed();
}