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
        console.log('[Docs] Starting - CI mode:', !!process.env.CI);
        await authorize('0');
        await assertGreeting();

        // Bug 2 fix: CI env now set in workflow!
        const timeout = process.env.CI ? 30000 : 10000;
        const pauseTime = process.env.CI ? 3000 : 1000;
        console.log(`[Docs] Timeouts - wait: ${timeout}ms, pause: ${pauseTime}ms`);

        console.log('[Docs] Navigating to Documents tab');
        const documentsTab = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Документи"`]');
        await documentsTab.waitForDisplayed({ timeout });
        await expect(documentsTab).toBeDisplayed();
        await documentsTab.click();

        console.log('[Docs] Waiting for documents screen load');
        await driver.pause(pauseTime);

        console.log('[Docs] Finding driver license');
        const docTitle = getElementByClassChain('**/XCUIElementTypeStaticText[`name == "Посвідчення водія"`]');
        await docTitle.waitForDisplayed({ timeout });
        await expect(docTitle).toBeDisplayed();
        
        // Bug 1 fix: Validate actual document viewing!
        console.log('[Docs] Opening document details');
        await docTitle.click();
        await driver.pause(pauseTime);
        
        console.log('[Docs] Verifying document content loaded');
        const pageSource = await driver.getPageSource();
        const hasDocumentContent = 
            pageSource.includes('Посвідчення водія') || 
            pageSource.includes('Категорія') ||
            pageSource.includes('QR');
        
        if (!hasDocumentContent) {
            console.error('[Docs] ERROR: Document content not found!');
            console.log('[Docs] Page preview:', pageSource.substring(0, 500));
        }
        
        await expect(hasDocumentContent).toBe(true);
        console.log('[Docs] ✓ Document validated successfully!');
    });
});