# Сервер общей базы (этап С1, бюджет-вариант A)

Тонкий REST API поверх SQLite: каталог норм + приём обезличенных слепков +
агрегаты для норм-кандидатов. Форматы совпадают с файловым обменом С0
(`app/src/domain/sync.ts`) — приложение шлёт те же JSON по HTTP.

## Эндпоинты

| Метод | Путь | Доступ | Что делает |
|---|---|---|---|
| GET | /health | публично | проверка живости |
| GET | /norms | публично | каталог валидированных активных норм (clinician-norm-catalog-1) |
| GET | /norms/all | админ | все нормы, включая черновики-кандидаты |
| POST | /norms | админ | приём каталога/списка норм (upsert) |
| PATCH | /norms/:normId/:version | админ | validationStatus / active (валидация кандидата) |
| POST | /submissions | специалист/админ | приём слепков (clinician-submissions-1) |
| GET | /aggregates?minN=30 | админ | ячейки методика×показатель×диагноз×возраст с n≥minN (mean/sd) |

Аутентификация: `Authorization: Bearer <токен>`. Токены — без персональных
данных, выпускаются владельцем на сервере:

```bash
npm run token -- admin "Степан"
npm run token -- specialist "Коллега из отделения №2"
```

## Локальный запуск

```bash
cd server && npm install
npm test          # 10 тестов API
npm start         # PORT=8787, DB_PATH=./clinician-server.db
```

## Развёртывание на VPS (вариант A, ~700–1300 ₽/мес)

1. VPS в РФ: 2 vCPU / 2 ГБ RAM / Ubuntu LTS. Node 22 LTS (`nodesource`).
2. `git clone … && cd clinician/server && npm ci --omit=dev`.
3. systemd-юнит (авторестарт):
   ```ini
   [Service]
   WorkingDirectory=/opt/clinician/server
   Environment=PORT=8787 DB_PATH=/var/lib/clinician/clinician-server.db
   ExecStart=/usr/bin/node src/index.js
   Restart=always
   ```
4. Обратный прокси с TLS: Caddy (автосертификат Let's Encrypt) или nginx+certbot.
   Наружу — только 443; порт 8787 закрыт фаерволом.
5. Бэкапы: ежедневный `sqlite3 …db ".backup /backup/$(date +%F).db"` в cron +
   снапшоты VPS. WAL-режим включён — файл можно копировать на живом сервере.
6. Токены выпускать `npm run token -- …` на сервере, передавать лично.

Переезд на вариант B (managed Postgres): меняется только `src/db.js`;
данные переносятся дампом. Триггеры перехода — `clinician-os/server-budget-options.md`.
