// Этап С0 — файловый обмен (без сервера): экспорт/импорт каталога норм и
// экспорт обезличенных слепков результатов. Здесь только чистые функции
// сборки/разбора payload'ов; доступ к БД — в UI через репозитории.
// Транспорт на этапе С1 меняется на HTTP, эти функции переиспользуются.

import { comparableMetrics } from './formulas/derive';
import { Method, Norm, Subject, TestResult } from './types';

export const NORM_CATALOG_SCHEMA = 'clinician-norm-catalog-1';
export const SUBMISSIONS_SCHEMA = 'clinician-submissions-1';

export interface NormCatalogFile {
  schema: typeof NORM_CATALOG_SCHEMA;
  exportedAt: string;
  norms: Norm[];
}

/** Обезличенный слепок одной точки данных (для будущей агрегации норм по диагнозам) */
export interface Submission {
  anonId: string; // случайный код испытуемого — связывает повторы, но не раскрывает локальный код
  methodId: string;
  metric: string;
  value: number;
  age: number;
  sex?: string;
  education: string;
  diagnosis?: string;
  year: number;
}

export interface SubmissionsFile {
  schema: typeof SUBMISSIONS_SCHEMA;
  exportedAt: string;
  submissions: Submission[];
}

// ---------- Каталог норм ----------

/** Экспорт: только валидированные активные нормы (курируемый каталог) */
export function buildNormCatalog(norms: Norm[], now: Date = new Date()): NormCatalogFile {
  return {
    schema: NORM_CATALOG_SCHEMA,
    exportedAt: now.toISOString(),
    norms: norms.filter((n) => n.validationStatus === 'validated' && n.active),
  };
}

export interface ParsedCatalog {
  norms: Norm[];
  errors: string[];
}

/** Разбор файла каталога норм с валидацией обязательных полей */
export function parseNormCatalog(text: string): ParsedCatalog {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { norms: [], errors: ['Файл не является корректным JSON'] };
  }
  const obj = data as Partial<NormCatalogFile>;
  if (!obj || obj.schema !== NORM_CATALOG_SCHEMA) {
    return { norms: [], errors: [`Ожидался каталог норм (schema=${NORM_CATALOG_SCHEMA})`] };
  }
  if (!Array.isArray(obj.norms)) {
    return { norms: [], errors: ['В файле нет массива norms'] };
  }
  const errors: string[] = [];
  const norms: Norm[] = [];
  obj.norms.forEach((n, i) => {
    if (!n || typeof n !== 'object') {
      errors.push(`Норма #${i + 1}: не объект`);
      return;
    }
    const norm = n as Norm;
    if (!norm.normId || !norm.methodId || !norm.metric) {
      errors.push(`Норма #${i + 1}: нет обязательных полей (normId/methodId/metric)`);
      return;
    }
    norms.push(norm);
  });
  return { norms, errors };
}

// ---------- Обезличенные слепки результатов ----------

/**
 * Собирает обезличенные слепки из результатов, по которым специалист дал согласие
 * (shareConsent). Только количественные методики. Никакой локальный код,
 * комментарии, препараты и интерпретации в слепок не попадают.
 */
export function buildSubmissions(
  input: {
    results: TestResult[];
    subjectByCode: Record<string, Subject>;
    methodById: Record<string, Method>;
  },
  randomId: () => string = defaultRandomId,
  now: Date = new Date(),
): SubmissionsFile {
  // стабильная анонимизация в пределах одного файла: код испытуемого → случайный anonId
  const anonByCode: Record<string, string> = {};
  const anonFor = (code: string) => (anonByCode[code] ??= randomId());

  const submissions: Submission[] = [];
  for (const r of input.results) {
    if (!r.shareConsent) continue;
    const subject = input.subjectByCode[r.subjectCode];
    const method = input.methodById[r.methodId];
    if (!subject || !method || method.measureType !== 'quantitative') continue;

    const year = new Date(r.createdAt).getFullYear();
    for (const m of comparableMetrics(method.config)) {
      const value = r.derived[m.id] ?? r.rawMeasures[m.id];
      if (value === undefined || !Number.isFinite(value)) continue;
      submissions.push({
        anonId: anonFor(r.subjectCode),
        methodId: r.methodId,
        metric: m.id,
        value,
        age: subject.age,
        sex: subject.sex,
        education: subject.education,
        diagnosis: subject.diagnosis,
        year,
      });
    }
  }
  return { schema: SUBMISSIONS_SCHEMA, exportedAt: now.toISOString(), submissions };
}

function defaultRandomId(): string {
  return 'anon_' + Math.random().toString(36).slice(2, 10);
}
