// Выпуск инвайт-токена (без ПДн). Запускается владельцем на сервере:
//   npm run token -- specialist "Коллега из отделения №2"
//   npm run token -- admin "Степан"
import { randomBytes } from 'node:crypto';
import { createToken, openDb } from './db.js';

const [role, label] = process.argv.slice(2);
if (!['specialist', 'admin'].includes(role) || !label) {
  console.error('Использование: npm run token -- <specialist|admin> "<метка: для кого>"');
  process.exit(1);
}

const dbPath = process.env.DB_PATH ?? './clinician-server.db';
const db = openDb(dbPath);
const token = `${role === 'admin' ? 'adm' : 'spc'}_${randomBytes(18).toString('base64url')}`;
createToken(db, { token, role, label });
console.log(`Токен (${role}, «${label}»):\n${token}\nПередайте лично; в токене нет персональных данных.`);
