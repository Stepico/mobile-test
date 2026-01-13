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
    it('user should be able to observe driver license document (short info)', async () => {
        await authorize('0');
    
        await assertGreeting();

        const documentsTab = getElementByAccessibilityId('Документи')
        await documentsTab.click();

        const docTitle = getElementByText('Посвідчення водія');
        await expect(docTitle).toBeDisplayed();

        await assertTextView('birth_date_driver-license_ua', 'Дата народження:');
        await assertTextView('birth_date_driver-license_ua', '06.01.1996');
        
        await assertTextView('category_driver-license_ua', 'Категорія:');
        await assertTextView('category_driver-license_ua', 'B');

        await assertTextView('doc_number_driver-license_ua', 'Номер документа:');
        await assertTextView('doc_number_driver-license_ua', 'РОЕ886082');

        await assertTextView('full_name_ua', 'Михальченко Віктор Олександрович');
    });

    it('user should be able to observe driver license document (full info)', async () => {
        const contextMenu = getElementByAccessibilityId('Контекстне меню')
        await contextMenu.click();

        const fullInfoBtn = getElementByText('Повна інформація');
        await fullInfoBtn.click();

        await assertTextView('doc_name_full', 'Driving Licence');
        await assertTextView('doc_name_full', 'Посвідчення водія');
        await assertTextView('doc_name_full', 'Ukraine • Україна');

        await assertTextView('doc_number_heading_full', 'РОЕ886082');

        await assertTextView('surname_full', 'Прізвище:');
        await assertTextView('surname_full', 'Surname');
        await assertTextView('surname_full', 'Михальченко');
        await assertTextView('surname_full', 'Mykhalchenko');

        await assertTextView('given_names_full', 'Імʼя та по батькові:');
        await assertTextView('given_names_full', 'Given names');
        await assertTextView('given_names_full', 'Віктор Олександрович');
        await assertTextView('given_names_full', 'Viktor');

        await assertTextView('birth_date_full', 'Дата і місце народження:');
        await assertTextView('birth_date_full', 'Date and place of birth');
        await assertTextView('birth_date_full', '06.01.1996 м. УКРАЇНА М. КИЇВ ВУЛ. ХМЕЛЬНИЦЬКОГО БОГДАНА БУД. 10 КВ. 43');

        await assertTextView('issue_date_full', 'Дата видачі:');
        await assertTextView('issue_date_full', 'Date of issue');
        await assertTextView('issue_date_full', '07.01.2023');

        await assertTextView('expiry_date_full', 'Дійсний до:');
        await assertTextView('expiry_date_full', 'Date of expiry');
        await assertTextView('expiry_date_full', '07.01.2033');

        await assertTextView('authority_full', 'Орган, що видав:');
        await assertTextView('authority_full', 'Authority');
        await assertTextView('authority_full', 'ТСЦ 1247');

        await assertTextView('unzr_full', 'Запис № (УНЗР):');
        await assertTextView('unzr_full', 'Record No.');
        await assertTextView('unzr_full', '19960106-28771');

        await assertTextView('doc_number_full', 'Номер документа:');
        await assertTextView('doc_number_full', 'Licence number');
        await assertTextView('doc_number_full', 'РОЕ886082');

        await assertTextView('category_full', 'Категорія:');
        await assertTextView('category_full', 'Category');
        await assertTextView('category_full', 'B');

        await assertTextView('category_issue_date_full', 'Дата відкриття категорії:');
        await assertTextView('category_issue_date_full', 'Category issuing date');
        await assertTextView('category_issue_date_full', '01.01.2023');
    });
});