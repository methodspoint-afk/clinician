// Сквозной приёмочный сценарий из development-prompt.md, раздел 9
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'child_process';

const SHOT_DIR = process.env.SHOT_DIR ?? 'e2e/shots';
import { mkdirSync, rmSync } from 'fs';
mkdirSync(SHOT_DIR, { recursive: true });

// --- Живой сервер общей базы (этап С1) для проверки HTTP-синхронизации ---
const SRV_PORT = 8788;
const SRV_DB = '/tmp/e2e-clinician-server.db';
rmSync(SRV_DB, { force: true });
rmSync(SRV_DB + '-wal', { force: true });
const tokenOut = execFileSync('node', ['../server/src/create-token.js', 'admin', 'e2e-admin'], {
  env: { ...process.env, DB_PATH: SRV_DB },
  encoding: 'utf8',
});
const ADMIN_TOKEN = tokenOut.split('\n').find((l) => l.startsWith('adm_'));
const srv = spawn('node', ['../server/src/index.js'], {
  env: { ...process.env, PORT: String(SRV_PORT), DB_PATH: SRV_DB },
  stdio: 'ignore',
});
srv.unref(); // не держать event loop скрипта после E2E DONE
process.on('exit', () => srv.kill());
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${SRV_PORT}/health`);
    if (r.ok) break;
  } catch { /* ещё поднимается */ }
  await new Promise((res) => setTimeout(res, 100));
}
// заносим на сервер валидированную норму, которую UI потом скачает
await fetch(`http://127.0.0.1:${SRV_PORT}/norms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` },
  body: JSON.stringify({
    norms: [{
      normId: 'srv_norm_1', version: 1, sourceRef: 'СЕРВЕРНАЯ НОРМА (e2e)',
      sourceType: 'methodical_guide', validationStatus: 'validated', active: true,
      methodId: 'ten_words', metric: 'delayed', procedureMatch: 'full',
      ageMin: 18, ageMax: 45, educationLevel: 'not_stratified', language: 'ru',
      clinicalStatus: 'healthy', cellN: 120, statForm: 'mean_sd', mean: 8, sd: 1.5,
      isSkewed: false, higherIsWorse: false, dataCollectionYear: 2020,
      stratifiedBy: ['age'], flags: [], appliedCount: 0,
    }],
  }),
});
console.log('OK: тестовый сервер С1 поднят на', SRV_PORT, 'с одной валидированной нормой');

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
await page.getByLabel('Год публикации').fill('2019'); // год обязателен (подсветка красным)
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
// По каждому показателю: если есть рекомендованные нормы (в т.ч. стартовая база) —
// выбираем дефолт; если норм нет — сохраняем без сравнения.
const metricCards = page.locator('.card', { has: page.getByText('Сохранить без сравнения с нормой') });
const noNorm = await page.getByText('Валидной нормы нет').count();
console.log('OK: показателей без валидной нормы:', noNorm);
const mc = await metricCards.count();
for (let k = 0; k < mc; k++) {
  const card = metricCards.nth(k);
  const ranked = card.locator(':scope > .norm-option').first();
  if (await ranked.count()) await ranked.click();
  else await card.getByText('Сохранить без сравнения с нормой').click();
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
// override; при «нормы нет» список ближайших раскрыт автоматически — раскрываем только если закрыт
const rejDetails = page.locator('details.rejected').first();
if (!(await rejDetails.evaluate((el) => el.open))) await rejDetails.locator('summary').click();
const rejText = await rejDetails.textContent();
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

// --- 7b. Качественная проба: «Исключение лишнего» (протокол, без норм) ---
step('Качественная проба: Исключение лишнего');
await page.getByRole('button', { name: 'Испытуемые' }).click();
await page.getByText(/PSY-\d{4}-0001/).first().click();
await page.getByRole('button', { name: 'Новое обследование' }).click();
await page.getByText('Исключение лишнего (4-й лишний)').click();
await page.getByLabel('Набор (4 предмета/слова)').fill('стол, стул, кровать, чайник');
await page.getByLabel('Что исключил испытуемый').fill('чайник');
await page.getByLabel('Пояснение испытуемого').fill('остальное — мебель');
await page.locator('label.field:has(> span:text-is("Квалификация обобщения")) select').selectOption('по существенному признаку');
await page.getByRole('button', { name: 'Сохранить обследование' }).click();
await page.getByText('История обследований').waitFor();
const qualBody = await page.locator('body').textContent();
console.log('OK: качественный протокол сохранён и виден:', qualBody.includes('чайник'));
await shot('11-qualitative');

// --- 7c. Синхронизация (этап С0): экспорт каталога норм файлом ---
step('Синхронизация: экспорт каталога норм');
await page.getByRole('button', { name: 'Синхронизация' }).click();
await page.getByText('Синхронизация (обмен файлами)').waitFor();
const [dl] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Выгрузить каталог норм' }).click(),
]);
console.log('OK: каталог норм выгружен файлом:', dl.suggestedFilename());
await page.getByText(/Экспортировано норм/).waitFor();

// HTTP-режим (этап С1): скачиваем норму с живого сервера через UI (проверяет и CORS)
step('Синхронизация: скачивание норм с сервера по HTTP');
await page.getByLabel('Адрес сервера').fill(`http://127.0.0.1:${SRV_PORT}`);
await page.getByLabel('Токен доступа').fill(ADMIN_TOKEN);
await page.getByRole('button', { name: 'Сохранить настройки' }).click();
await page.getByRole('button', { name: 'Скачать нормы с сервера' }).click();
await page.getByText(/Сервер: импортировано норм 1/).waitFor();
console.log('OK: норма скачана с сервера по HTTP и импортирована в локальную базу');
await page.getByRole('button', { name: 'Нормы', exact: true }).click();
await page.getByText('СЕРВЕРНАЯ НОРМА (e2e)').waitFor();
console.log('OK: серверная норма видна в базе норм');
await shot('12-sync');

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
