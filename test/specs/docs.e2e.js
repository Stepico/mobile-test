const { driver } = require('@wdio/globals');

const { 
    getElementByText,
    getElementByAccessibilityId,
    authorize,
    login,
    assertGreeting,
    restart
} = require('../../helper');

describe.only('Docs test suite', () => {
    it('user should be able to observe driver license document', async () => {
        await authorize('0');
    
        await assertGreeting();

        const documentsTab = getElementByAccessibilityId('Документи')
        await documentsTab.click();
    });
});