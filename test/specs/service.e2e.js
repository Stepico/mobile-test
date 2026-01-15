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
    assertTextView,
    scrollUntilVisible,
    assertPopup
} = require('../../helper');

describe('Criminal record certificate test suite', () => {
    it('user should be able use criminal record certification service', async () => {
        await authorize('0');
    
        await assertGreeting();

        const servicesTab = getElementByAccessibilityId('Сервіси')
        await servicesTab.click();

        const servicesTabTitle = await $(
            'android=new UiSelector().resourceId("title_services")' +
            '.childSelector(new UiSelector().description("Сервіси"))'
          );
          
        await expect(servicesTabTitle).toBeDisplayed();

        const serviceCard = await scrollUntilVisible(
        'android=new UiSelector().text("Довідки та витяги")'
        );

        await expect(serviceCard).toBeDisplayed();

        await serviceCard.click();

        await assertTextView('navigation_panel_subcategories', 'Довідки та витяги');

        const criminalRecordCertificateBtn = getElementByAccessibilityId('Довідка про несудимість');
        await criminalRecordCertificateBtn.click();

        await driver.pause(1000);
        const existingApplication = await driver.$('android=new UiSelector().resourceId("card_0")');

        if (await existingApplication.isExisting()) {
            const startBtn = getElementByText('Замовити витяг');
            await startBtn.click();

            await assertPopup(
                'Заява вже є',
                'У вас уже створено заяву про отримання витягу про несудимість. Перевірте її статус.'
            );

            const understandBtn = getElementByText('Зрозуміло');
            await understandBtn.click();

            const canceldBtn = getElementByText('Скасувати заяву');
            await canceldBtn.click();

            await assertPopup(
                'Скасувати заяву?',
                'Повторно подати заяву можна будь-коли, але все доведеться почати заново.'
            );

            const confirmCanceldBtn = getElementByText('Так, скасувати');
            await confirmCanceldBtn.click();

            await assertPopup(
                'Заяву скасовано',
                'Повторно подати заяву можна будь-коли.'
            );

            const thankBtn = getElementByText('Дякую');
            await thankBtn.click();

            await assertTextView('navigation_panel_subcategories', 'Довідки та витяги');

            const criminalRecordCertificateBtn = getElementByAccessibilityId('Довідка про несудимість');
            await criminalRecordCertificateBtn.click();
        } 

        const greeting = await $('android=new UiSelector().resourceId("title_label")');
        await expect(greeting).toHaveText('Вітаємо, Віктор 👋');

        await assertTextView('text_label_container', 'Тут можна замовити витяг про несудимість. Для цього потрібно вказати: • тип та мету запиту; • особисті дані; • контактні дані; • який тип витягу бажаєте отримати — цифровий або паперовий з апостилем; • як зручніше отримати — забрати самостійно чи замовити доставку Укрпошти. Зазвичай обробка заяв триває декілька годин. Інколи дані потребують додаткової перевірки. Доведеться зачекати до 30 календарних днів. Вартість послуги залежить від типу витягу: - паперовий з апостилем — 51.00 грн; - цифровий — безоплатно. Доставка Укрпоштою оплачується окремо та коштує 294.00 грн.');

        const startBtn = getElementByText('Розпочати');
        await startBtn.click();
    
        const reason = await findTextViewByText('reasons', 'Надання до установ іноземних держав');
        await reason.click();

        const nextBtn = await findTextViewByText('btn_primary_default', 'Далі');
        await nextBtn.click();

        const type = await findTextViewByText('types', 'Короткий');
        await type.click();

        await nextBtn.click();

        await assertPopup(
            'Дякуємо!',
            'Наступний крок — вказати дані про ваші попередні ПІБ, місце народження та громадянство.'
        );

        const continueBtn = getElementByText('Продовжити');
        await continueBtn.click();

        await nextBtn.click();

        const place = await findTextViewByText('birth_place_selection', 'Київ');
        await place.click();

        await nextBtn.click();

        const format = await findTextViewByText('formatExtract', 'Цифровий');
        await format.click();

        await nextBtn.click();

        await nextBtn.click();

        await assertTextView('applicant_data_title', 'Дані заявника');

        await assertTextView('applicant_data_name', 'ПІБ:');
        await assertTextView('applicant_data_name', 'Михальченко Віктор Олександрович');

        await assertTextView('applicant_data_birth_date', 'Дата народження:');
        await assertTextView('applicant_data_birth_date', '06.01.1996');

        await assertTextView('applicant_data_gender', 'Стать:');
        await assertTextView('applicant_data_gender', 'Чоловіча');

        await assertTextView('applicant_data_rnokpp', 'Податковий номер (РНОКПП):');
        await assertTextView('applicant_data_rnokpp', '7772928771');

        await assertTextView('applicant_data_nationality', 'Громадянство:');
        await assertTextView('applicant_data_nationality', 'Україна');

        await assertTextView('applicant_document_title', 'Документ, що посвідчує особу');

        await assertTextView('applicant_document_type', 'Тип:');
        await assertTextView('applicant_document_type', 'Паспорт громадянина України (ID картка)');

        await assertTextView('applicant_document_number', 'Номер:');
        await assertTextView('applicant_document_number', '000028771');

        await assertTextView('applicant_document_issue_date', 'Дата видачі:');
        await assertTextView('applicant_document_issue_date', '07.01.2021');

        await assertTextView('applicant_document_issue_date_end', 'Дійсний до:');
        await assertTextView('applicant_document_issue_date_end', '07.01.2031');

        await assertTextView('birth_place', 'Україна, Київ');

        await assertTextView('birth_place_title', 'Місце народження');

        await assertTextView('contact_data_title', 'Контактні дані');

        await assertTextView('contact_phone_number', 'Номер телефону:');
        await assertTextView('contact_phone_number', '380998249229');

        await assertTextView('contact_email', 'Email:');
        await assertTextView('contact_email', 'user7772928771@ukr.net');

        await assertTextView('reason_title', 'Мета запиту');

        await assertTextView('reason', 'Надання до установ іноземних держав');

        await assertTextView('receiving_details_title', 'Отримання витягу');

        await assertTextView('type', 'Тип витягу:');
        await assertTextView('type', 'Цифровий');

        await assertTextView('sum', 'Вартість:');
        await assertTextView('sum', 'Безкоштовно');

        const agreeCheckbox = await findTextViewByText('checkbox_btn_white', 'Підтверджую достовірність наведених у заяві даних');
        await agreeCheckbox.click();

        const finishBtn = await findTextViewByText('checkbox_btn_white', 'Підтвердити');
        await finishBtn.click();

        await assertPopup(
            'Надсилаємо заяву у реєстр',
            'Очікуйте на сповіщення про готовність витягу.'
        );

        const thankBtn = getElementByText('Дякую');
        await thankBtn.click();

        await assertTextView('status_message', 'Надсилаємо заяву');
        await assertTextView('status_message', 'Надсилаємо заяву до ІАС МВС...');
    });
})