// Запуск сервера. Переменные окружения:
//   PORT (по умолчанию 8787), DB_PATH (по умолчанию ./clinician-server.db)
import { openDb } from './db.js';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? './clinician-server.db';

const db = openDb(dbPath);
const app = buildApp(db, { logger: true });

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
