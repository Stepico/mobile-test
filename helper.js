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
    await tokenInput.setValue('B7B5908CFBA2DBDA1BE9');

    const signinBtn = getElementByText('SignIn');
    await signinBtn.click();

    const nextBtn = getElementByText('Далі');
    await nextBtn.waitForDisplayed({ timeout: 10000 });
    await nextBtn.click();
    
    const codeScreenHeader = getElementByAccessibilityId('Придумайте\nкод з 4 цифр');
    await expect(codeScreenHeader).toBeDisplayed();

    await enterPinCode(codeDigit);

    const repeatCodeScreenHeader = getElementByAccessibilityId('Повторіть\nкод з 4 цифр');
    await expect(repeatCodeScreenHeader).toBeDisplayed();

    await enterPinCode(codeDigit);
}

export async function login(codeDigit) {
    const codeScreenHeader = getElementByText('Код для входу');
    await expect(codeScreenHeader).toBeDisplayed();

    await enterPinCode(codeDigit);
}

export async function restart() {
    await driver.execute('mobile: terminateApp', {
        appId: 'ua.gov.diia.opensource'
    });

    await driver.execute('mobile: activateApp', { 
        appId: 'ua.gov.diia.opensource'
    });

    await driver.waitUntil(
        async () => (await driver.queryAppState('ua.gov.diia.opensource')) === 4,
        {
          timeout: 15000,
          interval: 500,
          timeoutMsg: 'App did not reach foreground state'
        }
    );
}

export async function enterPinCode(codeDigit) {
    const codeButton = getElementByText(`${codeDigit}`);
    for (let i = 0; i < 4; i++) {
        await codeButton.click();
    }
}

// ASSERTIONS

export async function assertGreeting() {
    const greeting = getElementByAccessibilityId('Привіт, Віктор 👋');
    await expect(greeting).toBeDisplayed();
}

export async function assertPopup(title = '', msg = '') {
    if (title) {
        const popupTitle = getElementByText(title);
        await expect(popupTitle).toBeDisplayed();
    }

    if (msg) {
        const popupMsg = getElementByText(msg);
        await expect(popupMsg).toBeDisplayed();
    }
}

// OTHER

export async function getContainer(resourceId) {
    const container = driver.$(
        'android=new UiScrollable(new UiSelector().scrollable(true))' +
        `.scrollIntoView(new UiSelector().resourceId("${resourceId}"))`
    );

    await container.waitForDisplayed({ 
        timeout: 10000,
        timeoutMsg: `Container ${resourceId} not found after scrolling`
    });
    
    return container;
}

export async function findTextViewByText(container, expectedText, normalizeNewlines = true) {
    const textViews = await container.$$('android.widget.TextView');
    
    for (const textView of textViews) {
        const text = await textView.getText();
        const normalizedText = normalizeNewlines ? text.replace(/\n/g, ' ').trim() : text.trim();
        const normalizedExpected = normalizeNewlines ? expectedText.replace(/\n/g, ' ').trim() : expectedText.trim();
        
        if (normalizedText === normalizedExpected) {
            return textView;
        }
    }
    
    throw new Error(`No TextView found with text "${expectedText}" in container`);
}

export async function assertTextView(resourceId, text) {
    const container = await getContainer(resourceId);

    const textView = await findTextViewByText(container, text);
    await expect(textView).toBeDisplayed();
}
