const { expect, driver } = require('@wdio/globals')

describe('Open Diia app', () => {
    it('should open the Diia app and wait 5 seconds', async () => {
        await driver.startActivity(
            'ua.gov.diia.opensource',
            'ua.gov.diia.opensource.VendorActivity'
        );
        
        const codeScreenHeader = await $('android=new UiSelector().text("Код для входу")');
        await expect(codeScreenHeader).toBeDisplayed();

        const zeroCodeButton = await $('android=new UiSelector().text("0")');
        for (let i = 0; i < 4; i++) {
            await zeroCodeButton.click();
        }

        const greeting = await driver.$('~Привіт, Надія 👋');
        await expect(greeting).toBeDisplayed();

        const documentsButton = await driver.$('~Документи');
        await documentsButton.click();

        await driver.pause(5000);
    });
});
