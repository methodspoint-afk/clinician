# Промпт на разработку MVP

# «Реестр патопсихологических методик с базой норм»

> **Как использовать документ.** Это готовое задание для разработчика (человека или
> ИИ-агента). Вместе с ним обязательны к прочтению: `technical-specification-v1-for-prompt.md`
> (ТЗ v1.1) и `norm-selection-and-scoring.md` (логика отбора норм). При противоречии
> приоритет: этот промпт → ТЗ v1.1 → раздел о нормах (в части, которую промпт не
> детализирует, раздел о нормах — первоисточник).

---

## 1. Роль и контекст

Ты — опытный разработчик десктопных офлайн-first приложений. Твоя задача — собрать
MVP приложения для клинических психологов: ввод результатов патопсихологических
методик, автоматический расчёт производных показателей, подбор валидной нормы по
двухступенчатой логике Gate → Score и наглядное сравнение результата с нормой.

**Главный инвариант продукта (нарушать нельзя):** приложение — поддержка решения,
а не автоматический диагност. Все выводы — подсказки; выбор нормы и интерпретацию
всегда подтверждает специалист.

---

## 2. Технологический стек (утверждён)

| Слой | Технология |
|---|---|
| Оболочка десктоп | **Tauri 2** (Windows в первую очередь; путь к Android/iOS в фазе 2) |
| UI | **React 18 + TypeScript**, сборка Vite |
| Локальная БД | **SQLite** (через `tauri-plugin-sql`), миграции версионируются |
| Состояние | Zustand (или аналогичный лёгкий стор) |
| Тесты | **Vitest** для доменной логики; Playwright для смоук-тестов UI (опционально) |
| Язык интерфейса | Русский. Все подписи, статусы, предупреждения — по-русски |

**Архитектурное требование:** вся доменная логика — формулы методик, Gate, Score,
тай-брейкер, расчёт отклонения — оформляется как **чистые TypeScript-функции без
зависимостей от UI и БД** (папка `src/domain/`). Они покрываются юнит-тестами и
переиспользуются без изменений при будущем серверном слое или мобильной версии.

**Запреты MVP:** никаких сетевых вызовов с данными испытуемых; никакого поля ФИО
где бы то ни было; никаких вызовов внешних ИИ в рантайме.

---

## 3. Структура проекта (ориентир)

```
src/
  domain/            # чистая логика, 100% покрытие тестами
    formulas/        # движок формул + расчёты методик
    normSelection/   # gate.ts, score.ts, tiebreaker.ts, deviation.ts
    types.ts         # доменные типы (Norm, Subject, Method, ...)
  db/                # миграции, репозитории (CRUD поверх SQLite)
  features/          # экраны: subjects, examination, norms, methods, reports, settings
  components/        # общие UI-компоненты
src-tauri/           # оболочка Tauri
```

---

## 4. Схема БД (SQLite)

JSON-поля хранятся как TEXT с JSON-содержимым. Все таблицы — `created_at`/`updated_at`.

```sql
-- Профили пользователей (локальные, на одном устройстве)
CREATE TABLE users (
  user_id      TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('owner','researcher')),
  pin_hash     TEXT            -- простая защита профиля PIN-кодом (опционально)
);

-- Методики: конфигурация, не код
CREATE TABLE methods (
  method_id    TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  measure_type TEXT NOT NULL CHECK (measure_type IN ('quantitative','qualitative')),
  config       TEXT NOT NULL,  -- JSON: замеры, формулы, настройки Gate, направления шкал
  is_active    INTEGER NOT NULL DEFAULT 1
);

-- Испытуемые (ФИО НЕ существует как поле; язык не хранится — респонденты всегда
-- русскоязычные, в Gate язык испытуемого — константа 'ru')
CREATE TABLE subjects (
  subject_code TEXT PRIMARY KEY,               -- PSY-ГГГГ-XXXX, автогенерация
  age          INTEGER NOT NULL,
  education    TEXT NOT NULL CHECK (education IN
               ('primary','secondary','vocational','higher','unknown')),
  sex          TEXT CHECK (sex IN ('m','f')),
  diagnosis    TEXT,                           -- опционально
  created_by   TEXT NOT NULL REFERENCES users(user_id),
  created_at   TEXT NOT NULL
);

-- Нормы: поля по разделу 8.1 файла norm-selection-and-scoring.md
CREATE TABLE norms (
  norm_id            TEXT NOT NULL,
  version            INTEGER NOT NULL,
  PRIMARY KEY (norm_id, version),
  -- идентификация
  source_ref         TEXT NOT NULL,
  source_type        TEXT NOT NULL CHECK (source_type IN ('indexed_article',
                     'standardization_manual','dissertation','monograph',
                     'methodical_guide','other')),
  entered_by         TEXT REFERENCES users(user_id),
  entered_at         TEXT,
  validated_by       TEXT REFERENCES users(user_id),
  validated_at       TEXT,
  validation_status  TEXT NOT NULL DEFAULT 'draft' CHECK (validation_status IN
                     ('draft','validated','rejected','archived')),
  -- привязка к методике
  method_id          TEXT NOT NULL REFERENCES methods(method_id),
  method_variant     TEXT,
  measure_type       TEXT NOT NULL,
  metric             TEXT NOT NULL,           -- какой показатель (напр. 'ER','IU','words_delayed')
  procedure_notes    TEXT,
  procedure_match    TEXT NOT NULL DEFAULT 'full' CHECK (procedure_match IN
                     ('full','minor_diff','mismatch')),
  -- популяция (вход Gate)
  age_min            INTEGER NOT NULL,
  age_max            INTEGER NOT NULL,
  education_level    TEXT NOT NULL DEFAULT 'not_stratified',
  sex                TEXT,
  language           TEXT NOT NULL DEFAULT 'ru',
  culture_region     TEXT,
  clinical_status    TEXT NOT NULL DEFAULT 'healthy',
  cell_n             INTEGER NOT NULL,
  total_study_n      INTEGER,
  -- статистика (вход расчёта)
  stat_form          TEXT NOT NULL CHECK (stat_form IN
                     ('percentile_table','mean_sd','cutoff','qualitative_rubric')),
  mean               REAL, sd REAL,
  percentiles        TEXT,                    -- JSON {"10":35,"25":40,...}
  cutoffs            TEXT,                    -- JSON
  distribution_note  TEXT,
  is_skewed          INTEGER NOT NULL DEFAULT 0,
  higher_is_worse    INTEGER NOT NULL,
  -- метаданные качества (вход Score)
  data_collection_year INTEGER,
  publication_year     INTEGER,
  stratified_by        TEXT,                  -- JSON ["age","education"]
  peer_reviewed        INTEGER,
  quality_score        INTEGER,               -- кэш 0–100
  quality_tier         TEXT,                  -- reliable|acceptable|weak|unfit
  flags                TEXT,                  -- JSON ["old_data",...]
  -- служебное
  supersedes         TEXT,
  active             INTEGER NOT NULL DEFAULT 1,
  applied_count      INTEGER NOT NULL DEFAULT 0
);

-- Результаты обследований
CREATE TABLE test_results (
  result_id      TEXT PRIMARY KEY,
  subject_code   TEXT NOT NULL REFERENCES subjects(subject_code),
  method_id      TEXT NOT NULL REFERENCES methods(method_id),
  raw_measures   TEXT NOT NULL,   -- JSON {"t1":45,...}
  derived        TEXT NOT NULL,   -- JSON {"ER":50,"VR":0.9,...}
  interpretation TEXT,
  share_consent  INTEGER NOT NULL DEFAULT 0,  -- галочка «поделиться в общей базе» (только признак)
  created_by     TEXT NOT NULL REFERENCES users(user_id),
  created_at     TEXT NOT NULL
);

-- Лог применения норм (раздел 8.2 файла о нормах)
CREATE TABLE norm_applications (
  application_id       TEXT PRIMARY KEY,
  result_id            TEXT NOT NULL REFERENCES test_results(result_id),
  norm_id              TEXT NOT NULL,
  norm_version         INTEGER NOT NULL,
  metric               TEXT NOT NULL,
  patient_demographics TEXT NOT NULL,  -- JSON-снимок на момент применения
  raw_value            REAL NOT NULL,
  computed_deviation   TEXT NOT NULL,  -- JSON {kind:'percentile'|'z', value, skewed_warning}
  system_suggestion    TEXT,
  was_default          INTEGER NOT NULL,   -- предложена ли эта норма дефолтом
  clinician_confirmed  INTEGER NOT NULL,
  is_override          INTEGER NOT NULL DEFAULT 0, -- применена норма, отсеянная Gate
  override_reason      TEXT,
  applied_by           TEXT NOT NULL REFERENCES users(user_id),
  applied_at           TEXT NOT NULL
);

-- Конфигурация скоринга (веса — не хардкод)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL   -- JSON
);
```

**Разделение данных:** Researcher видит только `subjects`/`test_results`, где
`created_by = его user_id`. Owner видит всё. Управление нормами и методиками —
только Owner.

---

## 5. Конфигурация методики (JSON в `methods.config`)

Формулы описываются декларативно — как арифметические выражения над именами замеров.
Реализуй маленький безопасный вычислитель выражений (`+ - * / ( )`, имена
переменных); **никакого `eval`**. Пример для таблиц Шульте:

```json
{
  "measures": [
    {"id": "t1", "label": "Время 1-й таблицы, с", "type": "number", "min": 1},
    {"id": "t2", "label": "Время 2-й таблицы, с", "type": "number", "min": 1},
    {"id": "t3", "label": "Время 3-й таблицы, с", "type": "number", "min": 1},
    {"id": "t4", "label": "Время 4-й таблицы, с", "type": "number", "min": 1},
    {"id": "t5", "label": "Время 5-й таблицы, с", "type": "number", "min": 1}
  ],
  "derived": [
    {"id": "ER", "label": "Эффективность работы", "expr": "(t1+t2+t3+t4+t5)/5",
     "higher_is_worse": true, "compare_with_norm": true},
    {"id": "VR", "label": "Врабатываемость", "expr": "t1/ER",
     "higher_is_worse": true, "compare_with_norm": true},
    {"id": "PU", "label": "Психическая устойчивость", "expr": "t4/ER",
     "higher_is_worse": true, "compare_with_norm": true}
  ],
  "gate": {"education_mismatch": "flag", "language_mismatch": "flag"}
}
```

Для вербальных методик (`10 слов`): `"language_mismatch": "fail"`.
`derived` могут ссылаться на ранее вычисленные показатели (как `VR` на `ER`) —
вычисляй по порядку объявления.

### Предустановленные методики (seed-миграция)

1. **Таблицы Шульте** — конфиг выше.
2. **Заучивание 10 слов**: замеры `p1..p5` (слова по предъявлениям), `substitutions`
   (устойчивые замены), `delayed` (отсроченное). Производных формул нет — с нормой
   сравниваются сами замеры (`p5`, `delayed`, `substitutions`); кривая запоминания
   отображается графиком `p1..p5`. `higher_is_worse: false` для слов,
   `true` для замен. `language_mismatch: "fail"`.
3. **Цифровая корректурная проба (адаптация НИИ им. Бехтерева)**: замеры `t_total`,
   `t1` (верхняя половина), `errors_total`, `m1` (ошибки справа), `m2` (ошибки слева).
   Производные: `t2 = t_total - t1`; `IU = t1 / t2`; `KAV = m1 / m2` (при `m2 = 0`
   показывать «не рассчитывается: нет ошибок в левой половине», не делить на ноль).
   Текстовые правила-подсказки: ИУ < 1 — «повышенная утомляемость», ИУ > 1 —
   «врабатываемость», ИУ = 1 — «нормальная психическая активность»; норма ошибок 1–2.
4. **Зрительно-пространственная память**: один замер `score` («балл специалиста»),
   без формул, сравнение с нормой по баллу.

---

## 6. Доменная логика: подбор нормы и отклонение

Реализуй строго по `norm-selection-and-scoring.md`. Сигнатуры-ориентиры:

```ts
selectNorms(subject, methodConfig, metricId, candidates: Norm[]): SelectionResult
// SelectionResult: { status: 'ok' | 'no_valid_norm',
//   ranked: {norm, score, tier, flags}[], defaultNorm?, rejected: {norm, reason}[] }

computeDeviation(value: number, norm: Norm): Deviation
// перцентили есть → линейная интерполяция между соседними точками таблицы;
// значение вне таблицы → '<P10' / '>P90' (по краям того, что есть);
// только mean+sd → z = (value - mean) / sd; при is_skewed → warning: true;
// направление интерпретации — из higher_is_worse.
```

### Gate (проверяй в этом порядке, собирай все результаты)

1. **Возраст:** внутри `[age_min, age_max]` → pass; ровно на границе → pass с флагом
   `edge_of_cell`; вне → fail.
2. **Образование:** совпадение страты → pass; норма не стратифицирована → pass с
   флагом `no_education_strata`; несовпадение → по `gate.education_mismatch` методики
   (`flag` для всех методик MVP). Образование испытуемого `unknown` → pass с флагом
   `no_education_strata`.
3. **Язык:** язык испытуемого — всегда константа `'ru'` (поле не вводится).
   Сравнивается с `norms.language` — это язык **стимульного материала** нормы;
   язык публикации-источника может быть любым (английский и др.) и на Gate не
   влияет. Совпадение → pass; несовпадение → по `gate.language_mismatch`
   (для «10 слов» — fail; для невербальных — флаг `culture_mismatch`).
4. `clinical_status`: по умолчанию в кандидаты идут только `healthy`-нормы
   (переключатель «сравнить с клинической группой» — отдельная опция).

Отсеянные нормы не выбрасываются: возвращай их с причиной отсева; UI даёт раскрыть
список и применить отсеянную норму как `override` (с обязательным текстовым
обоснованием, пишется в `norm_applications.override_reason`).

### Score (0–100), пороги и тай-брейкер

Веса и таблицы баллов A(30)/B(25)/C(20)/D(15)/E(10), пороги tier'ов (75/50/30) и
тай-брейкер (Δ≤5 → выше A, затем выше D) — **строго из файла о нормах**, значения
читаются из `settings` (seed — значения из файла), не из констант в коде.
`quality_score`, `quality_tier`, `flags` кэшируются в карточке нормы и пересчитываются
при каждом её изменении.

### Числовые примеры (обязательные тест-кейсы)

```
Шульте: t = [45, 50, 40, 55, 60]
  ЭР = 250/5 = 50.0;  ВР = 45/50 = 0.9;  ПУ = 55/50 = 1.1

Корректурная: t_total = 480, t1 = 220, m1 = 4, m2 = 2
  t2 = 260;  ИУ = 220/260 ≈ 0.846 → «повышенная утомляемость»;  КАВ = 2.0

z-оценка: значение 62 с, норма mean = 50, sd = 8, higher_is_worse = true
  z = +1.5 → хуже нормы на 1.5 σ

Перцентиль: percentiles {10:35, 25:40, 50:48, 75:58, 90:70}, значение 62,
  higher_is_worse = true → интерполяция: 75 + (62−58)/(70−58)×15 = 80-й перцентиль
  → «медленнее, чем 80% нормативной выборки»

Score: cell_n = 120, стратификация по возрасту и образованию → A = 30;
  mean+sd, скошено → B = 15 (+флаг skewed_distribution); процедура полная → C = 20;
  сбор данных 2018 (8 лет назад) → D = 15; диссертация → E = 7;
  итого 87 → «надёжная»

Gate-пустота: испытуемому 83 года, все нормы до 75 → status = 'no_valid_norm',
  Score не считается, UI показывает «Валидной нормы нет»

10 слов: p5 = 9, норма mean = 9.1, sd = 0.8, higher_is_worse = false
  z = −0.125 → в пределах нормы (знак не перепутан!)
```

---

## 7. Экраны (все на русском)

1. **Выбор профиля** — список профилей, создание (имя + роль; первый профиль всегда
   Owner), опциональный PIN.
2. **Испытуемые** — список карточек текущего пользователя (код, возраст, пол, число
   обследований), поиск по коду, кнопка «Новый испытуемый».
3. **Карточка испытуемого** — демография + хронологическая лента обследований +
   кнопки «Новое обследование» и «Сводный отчёт».
4. **Новое обследование** (мастер, 3 шага):
   - шаг 1: выбор методики;
   - шаг 2: форма ввода замеров (генерируется из `methods.config`), мгновенный
     показ производных показателей;
   - шаг 3: подбор нормы — по каждому сравниваемому показателю: рекомендованный
     дефолт сверху, остальные кандидаты ниже (для каждой: источник, популяция,
     `cell_n`, год сбора, форма статистики, tier цветом, флаги по-русски);
     свёрнутый блок «Отсеянные нормы (N) — показать»; подтверждение выбора.
5. **Экран результата** — таблица `Показатель | Результат | Норма | Отклонение |
   Статус`, предупреждения (скошенность, слабая норма, override), опциональное поле
   осторожной интерпретации, сохранение с галочкой «поделиться в общей базе (в
   будущем)».
6. **Сводный отчёт** — все методики испытуемого одной таблицей + график кривой
   запоминания; текстовая сводка; простые правила-подсказки (конфигурируемые
   «паттерн → осторожная формулировка», напр.: память ↓ при внимании в норме →
   «паттерн чаще встречается при невротическом регистре; требует клинической
   оценки»); экспорт в печатную форму (PDF или печать из webview).
7. **Нормы (Owner)** — реестр с фильтрами (методика, статус, tier); форма карточки
   нормы со всеми полями, live-расчёт `quality_score` при заполнении; кнопки
   «Валидировать», «Отклонить», «Новая версия», «Архивировать»; история версий.
8. **Методики (Owner)** — список, редактор конфигурации (JSON-форма с валидацией
   и предпросмотром формы ввода).
9. **Настройки (Owner)** — веса Score, пороги tier, страты образования; экспорт/импорт
   резервной копии БД (локальный файл).

Стиль: простое современное приложение «из магазина», не 1С. Крупные формы, минимум
полей на экране, понятные русские подписи, цветовая маркировка tier'ов
(зелёный/жёлтый/оранжевый/серый).

---

## 8. Этапы разработки и критерии готовности

**Этап 1. Каркас.** Tauri 2 + React + SQLite, миграции, профили пользователей,
CRUD испытуемых с автокодом `PSY-ГГГГ-XXXX` (последовательный номер в году).
✔ Готово: приложение собирается под Windows; профили разделяют данные; код
испытуемого генерируется и уникален.

**Этап 2. Доменное ядро (без UI).** Движок формул; Gate; Score; тай-брейкер;
расчёт отклонения. Все числовые примеры раздела 6 — как юнит-тесты.
✔ Готово: `vitest run` зелёный; покрытие `src/domain/` ≥ 90%; ни одна функция
домена не импортирует БД или React.

**Этап 3. Нормы и методики (Owner).** Seed 4 методик; реестр и карточка нормы;
live-скоринг; workflow валидации; версионирование.
✔ Готово: норму можно завести, провалидировать, выпустить новую версию; `draft`
не попадает в подбор (тест); score в карточке совпадает с ручным расчётом по файлу
о нормах.

**Этап 4. Обследование.** Мастер обследования; подбор нормы с дефолтом, флагами и
отсеянными; override с обоснованием; экран результата; лог `norm_applications`.
✔ Готово: сквозной сценарий «новый испытуемый → Шульте → выбор нормы → результат»
проходит вручную; каждое сравнение оставляет запись в логе; случай «валидной нормы
нет» отображается честно.

**Этап 5. Отчёты и полировка.** Сводный отчёт с графиком и правилами-подсказками;
печать/PDF; бэкап/восстановление; пустые состояния, валидация ввода (время > 0,
слова 0–10 и т.п.), обработка деления на ноль (КАВ).
✔ Готово: выполняются все критерии приёмки раздела 13 ТЗ v1.1 и чек-лист раздела 9
файла о нормах.

---

## 9. Сквозной приёмочный сценарий (финальная проверка)

1. Создать профиль Owner, завести 3 нормы для Шульте (разные возрастные ячейки,
   разные `stat_form`), одну оставить в `draft`.
2. Создать профиль Researcher, завести испытуемого: 34 года, высшее, м.
3. Провести Шульте с t = [45, 50, 40, 55, 60] → увидеть ЭР = 50, ВР = 0.9, ПУ = 1.1.
4. Убедиться: `draft`-норма не предлагается; дефолт — норма с максимальным score;
   флаги видны; после подтверждения появилась запись в `norm_applications`.
5. Провести «10 слов» и корректурную пробу, открыть сводный отчёт — таблица, кривая
   запоминания, подсказки.
6. Завести испытуемого 83 лет → Шульте → «Валидной нормы нет»; раскрыть отсеянные,
   применить одну как override с обоснованием → в логе `is_override = 1`.
7. Сделать бэкап, удалить БД, восстановить — данные на месте.
