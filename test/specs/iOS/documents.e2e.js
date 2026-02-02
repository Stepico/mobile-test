const { driver, expect } = require('@wdio/globals');
const path = require('path');

const { 
    getElementByText,
    getElementByAccessibilityId,
    getElementByClassChain,
    authorize,
    login,
    assertGreeting,
    restart,
    findTextViewByText,
    getContainer,
    assertTextView,
    clickByCoordinates
} = require(path.resolve(__dirname, '../../../helpers/helper-iOS.js'));

describe('Docs test suite', () => {
    it('user should be able to observe driver license document', async () => {
        await authorize('0');
    
        await assertGreeting();

        // Increased timeout for CI (slower simulator)
        const timeout = process.env.CI ? 30000 : 10000;

        const documentsTab = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Документи"`]');
        await documentsTab.waitForDisplayed({ timeout });
        await expect(documentsTab).toBeDisplayed();
        await documentsTab.click();

        // Wait for documents screen to load (may take longer in CI)
        await driver.pause(process.env.CI ? 3000 : 1000);

        const docTitle = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Посвідчення водія"`]');
        await docTitle.waitForDisplayed({ timeout });
        await expect(docTitle).toBeDisplayed();
    });
});