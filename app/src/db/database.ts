// Абстракция над SQLite: в браузере/тестах — sql.js (wasm),
// в десктопной сборке Tauri — tauri-plugin-sql (тот же интерфейс).

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { MIGRATIONS } from './schema';

export interface SqlDatabase {
  run(sql: string, params?: unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Снимок БД для резервной копии */
  exportBytes(): Promise<Uint8Array>;
  persist(): Promise<void>;
}

const STORAGE_KEY = 'clinician-db-v1';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export class SqlJsAdapter implements SqlDatabase {
  private constructor(
    private db: SqlJsDatabase,
    private storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  ) {}

  static async open(options: {
    locateWasm?: (file: string) => string;
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
    initialBytes?: Uint8Array;
  } = {}): Promise<SqlJsAdapter> {
    const SQL = await initSqlJs(
      options.locateWasm ? { locateFile: options.locateWasm } : undefined,
    );
    let bytes = options.initialBytes;
    if (!bytes && options.storage) {
      const saved = options.storage.getItem(STORAGE_KEY);
      if (saved) bytes = base64ToBytes(saved);
    }
    const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    return new SqlJsAdapter(db, options.storage ?? null);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.run(sql, params as never);
  }

  async select<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as never);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  }

  async exportBytes(): Promise<Uint8Array> {
    return this.db.export();
  }

  async persist(): Promise<void> {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY, bytesToBase64(this.db.export()));
  }
}

/** Применяет недостающие миграции */
export async function migrate(db: SqlDatabase): Promise<void> {
  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
  const applied = await db.select<{ version: number }>('SELECT version FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (appliedSet.has(version)) continue;
    // Строки-комментарии убираем до разбиения, чтобы «;» внутри комментария
    // не разрезала SQL-выражение
    const withoutComments = MIGRATIONS[i]
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    for (const stmt of withoutComments.split(';')) {
      const sql = stmt.trim();
      if (sql) await db.run(sql);
    }
    await db.run('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
  }
}
