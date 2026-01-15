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

    const bankNadiia = getElementByAccessibilityId('Банк НаДія');
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

export async function assertPopup(title, body) {
    const container = await getContainer('android:id/content');

    const textViews = await container.$$('android.widget.TextView');

    const titleText = await textViews[0].getText();
    const bodyText = await textViews[1].getText();

    expect(titleText).toEqual(title);
    expect(bodyText).toEqual(body);
}

// OTHER

export async function scrollUntilVisible(selector, maxSwipes = 10) {
    for (let i = 0; i < maxSwipes; i++) {
        const el = await driver.$(selector);
        if (await el.isDisplayed()) {
            return el;
        }

        const { height, width } = await driver.getWindowRect();

        const startX = Math.floor(width / 2);
        const startY = Math.floor(height * 0.8);
        const endY   = Math.floor(height * 0.2);

        await driver.performActions([{
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
                { type: 'pointerMove', duration: 0, x: startX, y: startY },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 300 },
                { type: 'pointerMove', duration: 600, x: startX, y: endY },
                { type: 'pointerUp', button: 0 }
            ]
        }]);

        await driver.pause(800);
    }

    throw new Error(`Element ${selector} not visible after scrolling`);
}

export async function getContainer(resourceId) {
    const selector = `android=new UiSelector().resourceId("${resourceId}")`;

    const container = await scrollUntilVisible(selector);

    await container.waitForDisplayed({
        timeout: 5000,
        timeoutMsg: `Container ${resourceId} not visible`
    });

    return container;
}

// export async function findTextViewByText(container, expectedText, normalizeText = true) {
//     const textViews = await container.$$('android.widget.TextView');

//     const foundTexts = [];
    
//     const normalize = normalizeText 
//         ? (t) => t.replace(/\s+/g, ' ').trim() 
//         : (t) => t.trim();

//     const expectedNormalized = normalize(expectedText);

//     for (const textView of textViews) {
//         const rawText = await textView.getText();
//         const normalizedText = normalize(rawText);
        
//         if (normalizedText === expectedNormalized) {
//             return textView;
//         }

//         foundTexts.push(normalizedText);
//     }
    
//     throw new Error(
//         `No TextView found with text "${expectedText}".\n` +
//         `TextViews found (${foundTexts.length}):\n` +
//         foundTexts.map(t => `  - "${t}"`).join('\n')
//     );
// }

export async function findTextViewByText(resourceId, expectedText, normalizeText = true) {
    const container = await getContainer(resourceId);
    const textViews = await container.$$('android.widget.TextView');

    const foundTexts = [];
    
    const normalize = normalizeText 
        ? (t) => t.replace(/\s+/g, ' ').trim() 
        : (t) => t.trim();

    const expectedNormalized = normalize(expectedText);

    for (const textView of textViews) {
        const rawText = await textView.getText();
        const normalizedText = normalize(rawText);
        
        if (normalizedText === expectedNormalized) {
            return textView;
        }

        foundTexts.push(normalizedText);
    }
    
    throw new Error(
        `No TextView found with text "${expectedText}".\n` +
        `TextViews found (${foundTexts.length}):\n` +
        foundTexts.map(t => `  - "${t}"`).join('\n')
    );
}

// export async function assertTextView(resourceId, text, normalizeText = true) {
//     const container = await getContainer(resourceId);

//     const textView = await findTextViewByText(container, text, normalizeText);
//     await expect(textView).toBeDisplayed();
// }

export async function assertTextView(resourceId, text, normalizeText = true) {
    const textView = await findTextViewByText(resourceId, text, normalizeText);
    await expect(textView).toBeDisplayed();
}
