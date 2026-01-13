const { driver, expect } = require('@wdio/globals');

const { 
    getElementByText,
    getElementByAccessibilityId,
    authorize,
    login,
    assertGreeting,
    restart,
    findTextViewByText,
    getContainer,
    assertTextView
} = require('../../helper');

describe('Docs test suite', () => {
    it('user should be able to observe driver license document', async () => {
        await authorize('0');
    
        await assertGreeting();

        const documentsTab = getElementByAccessibilityId('Документи')
        await documentsTab.click();

        const docTitle = getElementByText('Посвідчення водія');
        await expect(docTitle).toBeDisplayed();

        await assertTextView('birth_date_driver-license_ua', 'Дата\nнародження:');

        await assertTextView('birth_date_driver-license_ua', '06.01.1996');
        
        await assertTextView('category_driver-license_ua', 'Категорія:');

        await assertTextView('category_driver-license_ua', 'B');

        await assertTextView('doc_number_driver-license_ua', 'Номер\nдокумента:');

        await assertTextView('doc_number_driver-license_ua', 'РОЕ886082');

        await assertTextView('full_name_ua', 'Михальченко\nВіктор\nОлександрович');
    });
});