// Слой хранения (этап С1, вариант A: одна машина, SQLite-файл, бэкап = копия
// файла + дампы). Переезд на Postgres (вариант B) меняет только этот модуль.
import Database from 'better-sqlite3';

export function openDb(path = ':memory:') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS norms (
      norm_id           TEXT NOT NULL,
      version           INTEGER NOT NULL,
      method_id         TEXT NOT NULL,
      metric            TEXT NOT NULL,
      validation_status TEXT NOT NULL DEFAULT 'draft',
      active            INTEGER NOT NULL DEFAULT 1,
      payload           TEXT NOT NULL, -- полная карточка нормы (формат приложения)
      updated_at        TEXT NOT NULL,
      updated_by        TEXT,
      PRIMARY KEY (norm_id, version)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      anon_id     TEXT NOT NULL,
      method_id   TEXT NOT NULL,
      metric      TEXT NOT NULL,
      value       REAL NOT NULL,
      age         INTEGER NOT NULL,
      sex         TEXT,
      education   TEXT,
      diagnosis   TEXT,
      year        INTEGER,
      received_at TEXT NOT NULL,
      via_token   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_cell
      ON submissions (method_id, metric, diagnosis, age);

    -- Токены доступа: без ПДн (инвайт-коды). label — «для кого», задаёт владелец.
    CREATE TABLE IF NOT EXISTS tokens (
      token      TEXT PRIMARY KEY,
      role       TEXT NOT NULL CHECK (role IN ('specialist','admin')),
      label      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked    INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

const now = () => new Date().toISOString();

// ---------- токены ----------

export function createToken(db, { token, role, label }) {
  db.prepare('INSERT INTO tokens (token, role, label, created_at) VALUES (?,?,?,?)').run(
    token,
    role,
    label,
    now(),
  );
  return { token, role, label };
}

export function findToken(db, token) {
  if (!token) return undefined;
  const row = db.prepare('SELECT * FROM tokens WHERE token = ? AND revoked = 0').get(token);
  return row ? { token: row.token, role: row.role, label: row.label } : undefined;
}

// ---------- нормы ----------

export function upsertNorm(db, norm, updatedBy) {
  db.prepare(
    `INSERT INTO norms (norm_id, version, method_id, metric, validation_status, active, payload, updated_at, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(norm_id, version) DO UPDATE SET
       method_id=excluded.method_id, metric=excluded.metric,
       validation_status=excluded.validation_status, active=excluded.active,
       payload=excluded.payload, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
  ).run(
    norm.normId,
    norm.version ?? 1,
    norm.methodId,
    norm.metric,
    norm.validationStatus ?? 'draft',
    norm.active === false ? 0 : 1,
    JSON.stringify(norm),
    now(),
    updatedBy ?? null,
  );
}

export function setNormStatus(db, normId, version, { validationStatus, active }, updatedBy) {
  const row = db.prepare('SELECT payload FROM norms WHERE norm_id = ? AND version = ?').get(normId, version);
  if (!row) return false;
  const payload = JSON.parse(row.payload);
  if (validationStatus !== undefined) payload.validationStatus = validationStatus;
  if (active !== undefined) payload.active = active;
  upsertNorm(db, payload, updatedBy);
  return true;
}

/** Публичный каталог: только валидированные активные (как buildNormCatalog в приложении) */
export function listPublicNorms(db) {
  return db
    .prepare("SELECT payload FROM norms WHERE validation_status = 'validated' AND active = 1")
    .all()
    .map((r) => JSON.parse(r.payload));
}

/** Все нормы (админ): включая черновики-кандидаты */
export function listAllNorms(db) {
  return db.prepare('SELECT payload FROM norms').all().map((r) => JSON.parse(r.payload));
}

// ---------- слепки ----------

export function insertSubmissions(db, submissions, viaToken) {
  const stmt = db.prepare(
    `INSERT INTO submissions (anon_id, method_id, metric, value, age, sex, education, diagnosis, year, received_at, via_token)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertMany = db.transaction((rows) => {
    let n = 0;
    for (const s of rows) {
      stmt.run(
        s.anonId,
        s.methodId,
        s.metric,
        s.value,
        s.age,
        s.sex ?? null,
        s.education ?? null,
        s.diagnosis ?? null,
        s.year ?? null,
        now(),
        viaToken,
      );
      n++;
    }
    return n;
  });
  return insertMany(submissions);
}

// ---------- агрегаты (черновики норм-кандидатов по диагнозам) ----------

// Возрастные корзины: жёсткие границы 16/60 как в Gate; внутри взрослых — по ~10 лет
export function ageBucket(age) {
  if (age < 16) return '<16';
  if (age > 60) return '>60';
  if (age <= 25) return '16-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  return '46-60';
}

// Разделитель ключа ячейки: диагноз может содержать пробелы,
// поэтому используем управляющий символ Unit Separator
const SEP = '\u001F';

/**
 * Ячейки (методика x показатель x диагноз x возрастная корзина) с n >= minN:
 * count, mean, sd — материал для норм-кандидатов, валидирует админ.
 */
export function aggregates(db, minN = 30) {
  const rows = db
    .prepare('SELECT method_id, metric, diagnosis, age, value FROM submissions')
    .all();
  const cells = new Map();
  for (const r of rows) {
    const key = [r.method_id, r.metric, r.diagnosis ?? '', ageBucket(r.age)].join(SEP);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(r.value);
  }
  const out = [];
  for (const [key, values] of cells) {
    if (values.length < minN) continue;
    const [methodId, metric, diagnosis, bucket] = key.split(SEP);
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
    out.push({
      methodId,
      metric,
      diagnosis: diagnosis || null,
      ageBucket: bucket,
      n,
      mean: Math.round(mean * 1000) / 1000,
      sd: Math.round(Math.sqrt(variance) * 1000) / 1000,
    });
  }
  out.sort((a, b) => b.n - a.n);
  return out;
}
