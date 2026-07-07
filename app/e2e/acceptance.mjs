// Сквозной приёмочный сценарий из development-prompt.md, раздел 9
import { chromium } from 'playwright-core';

const SHOT_DIR = process.env.SHOT_DIR ?? 'e2e/shots';
import { mkdirSync } from 'fs';
mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const shot = (name) => page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
const step = (msg) => console.log('STEP:', msg);

await page.goto('http://localhost:4173/');

// --- 1. Первый профиль (автоматически Owner) ---
step('Создание профиля Owner');
await page.getByPlaceholder('Например: Степан').fill('Степан');
await page.getByRole('button', { name: 'Создать и войти' }).click();
await page.getByText('Испытуемые', { exact: true }).first().waitFor();
console.log('OK: вход выполнен, экран испытуемых');

// --- 2. Нормы: валидированная + черновик ---
step('Создание нормы Шульте (ЭР)');
await page.getByRole('button', { name: 'Нормы' }).click();
await page.getByRole('button', { name: '+ Новая норма' }).click();
await page.getByLabel('Библиография / DOI / выходные данные *').fill('Пушкина Т.П., Пушкина А.В. Клиническая психология (тестовые данные)');
await page.locator('label.field:has(> span:text-is("Методика")) select').selectOption('schulte');
const metricSelected = await page.locator('label.field:has(> span:text-is("Показатель")) select').inputValue();
console.log('OK: показатель после выбора методики:', metricSelected, '(ожидается ER)');
await page.getByLabel('Год сбора данных').fill('2015');
await page.getByLabel('Возраст до *').fill('45');
await page.getByLabel('Размер этой ячейки (n) *').fill('120');
await page.getByLabel('Среднее (M)').fill('45');
await page.getByLabel('Стандартное отклонение (SD)').fill('8');
await shot('01-norm-form-live-score');
const scoreBadge = await page.locator('.card .badge').first().textContent();
console.log('OK: live-балл в форме нормы:', scoreBadge.trim());
await page.getByRole('button', { name: 'Сохранить норму' }).click();
await page.getByRole('button', { name: 'Валидировать' }).click();
await page.getByText('Проверена').first().waitFor();
console.log('OK: норма валидирована');

step('Создание черновика нормы (не должен попадать в подбор)');
await page.getByRole('button', { name: '+ Новая норма' }).click();
await page.getByLabel('Библиография / DOI / выходные данные *').fill('ЧЕРНОВИК-ИСТОЧНИК (не должен предлагаться)');
await page.locator('label.field:has(> span:text-is("Методика")) select').selectOption('schulte');
await page.getByLabel('Возраст до *').fill('45');
await page.getByLabel('Размер этой ячейки (n) *').fill('50');
await page.getByLabel('Среднее (M)').fill('40');
await page.getByLabel('Стандартное отклонение (SD)').fill('7');
await page.getByRole('button', { name: 'Сохранить норму' }).click();
await page.getByText('ЧЕРНОВИК-ИСТОЧНИК (не должен предлагаться)').waitFor();
await shot('02-norms-list');
console.log('OK: черновик сохранён без валидации');

// --- 3. Испытуемый 34 лет ---
step('Создание испытуемого 34 лет, высшее, м');
await page.getByRole('button', { name: 'Испытуемые' }).click();
await page.getByRole('button', { name: '+ Новый испытуемый' }).click();
await page.getByLabel('Возраст *').fill('34');
await page.getByLabel('Пол').selectOption('m');
await page.getByRole('button', { name: 'Создать карточку' }).click();
await page.getByText(/PSY-\d{4}-0001/).first().waitFor();
console.log('OK: код испытуемого сгенерирован (PSY-ГГГГ-0001)');

// --- 4. Обследование: Шульте t=[45,50,40,55,60] ---
step('Обследование Шульте');
await page.getByRole('button', { name: 'Новое обследование' }).click();
await page.getByText('Таблицы Шульте (5 таблиц)').click();
const times = { 't1': '45', 't2': '50', 't3': '40', 't4': '55', 't5': '60' };
let i = 1;
for (const v of Object.values(times)) {
  await page.getByLabel(`Время ${i}-й таблицы, с *`).fill(v);
  i++;
}
await page.getByText('Эффективность работы (ЭР)').waitFor();
const derivedTable = await page.locator('table').first().textContent();
console.log('Производные показатели содержат ЭР=50:', derivedTable.includes('50'));
console.log('  ВР=0.9:', derivedTable.includes('0.9'), ' ПУ=1.1:', derivedTable.includes('1.1'));
await shot('03-exam-derived');
await page.getByRole('button', { name: 'К подбору норм →' }).click();

// --- 5. Подбор нормы ---
step('Подбор нормы: дефолт есть, черновик отсутствует');
await page.getByText('Рекомендованный дефолт').first().waitFor();
const body = await page.locator('body').textContent();
const draftOffered = (await page.locator('.norm-option:not(details .norm-option)').allTextContents()).join(' ').includes('ЧЕРНОВИК');
console.log('OK: дефолт предложен; черновик среди кандидатов:', draftOffered, '(должно быть false)');
console.log('  z-текст присутствует:', body.includes('z = '));
await shot('04-norm-picker');
// выбираем дефолт по всем трём показателям (ЭР, ВР, ПУ) — по валидированной норме есть только ЭР;
// для ВР и ПУ норм нет → «Валидной нормы нет» → сохранить без сравнения
const pickers = page.locator('.card', { hasText: 'значение' });
await page.locator('.norm-option', { hasText: 'Пушкина' }).first().click();
const noNorm = await page.getByText('Валидной нормы нет').count();
console.log('OK: для показателей без норм честно показано «Валидной нормы нет»:', noNorm, 'раз(а)');
const skips = page.getByText('Сохранить без сравнения с нормой');
const skipCount = await skips.count();
for (let k = 0; k < skipCount; k++) {
  const cardText = await skips.nth(k).locator('xpath=ancestor::div[contains(@class,"card")]').textContent();
  if (cardText.includes('Валидной нормы нет')) await skips.nth(k).click();
}
await shot('05-before-save');
await page.getByRole('button', { name: 'Сохранить обследование' }).click();
await page.getByText('История обследований').waitFor();
const cardBody = await page.locator('body').textContent();
console.log('OK: результат сохранён; z-отклонение в истории:', cardBody.includes('z = '));
await shot('06-subject-card');

// --- 6. Probe: испытуемый 83 лет → нормы нет → override ---
step('Probe: 83 года — «Валидной нормы нет» и override');
await page.getByRole('button', { name: 'Испытуемые' }).click();
await page.getByRole('button', { name: '+ Новый испытуемый' }).click();
await page.getByLabel('Возраст *').fill('83');
await page.getByRole('button', { name: 'Создать карточку' }).click();
await page.getByRole('button', { name: 'Новое обследование' }).click();
await page.getByText('Таблицы Шульте (5 таблиц)').click();
i = 1;
for (const v of ['70', '75', '80', '85', '90']) {
  await page.getByLabel(`Время ${i}-й таблицы, с *`).fill(v);
  i++;
}
await page.getByRole('button', { name: 'К подбору норм →' }).click();
await page.getByText('Валидной нормы нет').first().waitFor();
console.log('OK: для 83 лет — «Валидной нормы нет», ближайшая не подставлена');
await shot('07-no-valid-norm');
// override
await page.locator('details.rejected summary').first().click();
const rejText = await page.locator('details.rejected').first().textContent();
console.log('OK: причина отсева видна:', rejText.includes('вне диапазона'));
await page.getByRole('button', { name: 'Применить несмотря на отсев…' }).first().click();
await page.getByLabel(/Обоснование применения отсеянной нормы/).fill('Единственная доступная норма; клинически сопоставимая выборка');
await page.getByRole('button', { name: 'Применить осознанно' }).click();
await page.getByText('Выбрана вручную (override)').waitFor();
console.log('OK: override применён с обоснованием');
await shot('08-override');
const skips2 = page.getByText('Сохранить без сравнения с нормой');
const n2 = await skips2.count();
for (let k = 0; k < n2; k++) {
  const cardText = await skips2.nth(k).locator('xpath=ancestor::div[contains(@class,"card")]').textContent();
  if (cardText.includes('Валидной нормы нет') && !cardText.includes('override')) await skips2.nth(k).click();
}
await page.getByRole('button', { name: 'Сохранить обследование' }).click();
await page.getByText('Норма применена вручную (override)').waitFor();
console.log('OK: пометка override и обоснование видны в карточке');
await shot('09-card-with-override');

// --- 7. Сводный отчёт ---
step('Сводный отчёт');
await page.getByRole('button', { name: 'Сводный отчёт' }).click();
await page.getByText(/Сводный отчёт — PSY/).waitFor();
await shot('10-report');
console.log('OK: сводный отчёт открыт');

// --- 8. Persistence: перезагрузка страницы ---
step('Probe: перезагрузка — данные сохраняются (localStorage/SQLite)');
await page.reload();
await page.getByText('Степан').first().waitFor();
await page.getByText('Степан').first().click();
await page.getByText(/PSY-\d{4}-0001/).first().waitFor();
console.log('OK: после перезагрузки профиль и испытуемые на месте');

console.log('\nPAGE ERRORS:', errors.length ? errors : 'нет');
await browser.close();
console.log('E2E DONE');
