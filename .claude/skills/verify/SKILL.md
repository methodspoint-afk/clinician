# verify — Реестр патопсихологических методик

Surface: GUI (React SPA, русский интерфейс). Приложение в `app/`.

## Build & launch

```bash
cd app
npm install
npm run build                       # tsc --noEmit + vite build
npm run preview -- --port 4173 &    # раздаёт dist на :4173
```

## Drive

Полный приёмочный сценарий (профиль → нормы → испытуемый → обследование Шульте →
подбор нормы → override → сводный отчёт → перезагрузка):

```bash
node e2e/acceptance.mjs             # CHROMIUM_PATH=/opt/pw-browsers/chromium по умолчанию
```

Скриншоты падают в `e2e/shots/` (переопределяется SHOT_DIR). Скрипт печатает
`OK:`-строки по каждому шагу и `PAGE ERRORS` в конце — там должно быть «нет».

## Gotchas

- Каждый запуск браузерного контекста стартует с чистым localStorage — БД
  создаётся заново, сценарий самодостаточен.
- Формы используют label-обёртки; для `select` внутри `label.field` надёжнее
  `page.locator('label.field:has(> span:text-is("…")) select')`, чем getByLabel.
- `vite preview` не перечитывает dist — после правок кода обязательно
  `npm run build` и перезапуск preview.
- Tauri-обёртка (`app/src-tauri/`) в этом окружении не собирается (нет
  webkit2gtk); собирать на целевой машине.
