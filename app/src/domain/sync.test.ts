import { describe, expect, it } from 'vitest';
import {
  buildNormCatalog,
  buildSubmissions,
  diffCatalogAgainst,
  NORM_CATALOG_SCHEMA,
  parseNormCatalog,
} from './sync';
import { SEED_METHODS } from './seedMethods';
import { Method, Norm, Subject, TestResult } from './types';

function norm(overrides: Partial<Norm> = {}): Norm {
  return {
    normId: 'n1',
    version: 1,
    sourceRef: 'src',
    sourceType: 'methodical_guide',
    validationStatus: 'validated',
    methodId: 'schulte',
    metric: 'ER',
    procedureMatch: 'full',
    ageMin: 18,
    ageMax: 45,
    educationLevel: 'not_stratified',
    language: 'ru',
    clinicalStatus: 'healthy',
    cellN: 100,
    statForm: 'mean_sd',
    mean: 35,
    sd: 4,
    isSkewed: false,
    higherIsWorse: false,
    stratifiedBy: ['age'],
    flags: [],
    active: true,
    appliedCount: 0,
    ...overrides,
  };
}

const schulte = SEED_METHODS.find((m) => m.methodId === 'schulte')!;
const exclusion = SEED_METHODS.find((m) => m.methodId === 'exclusion')!;

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    subjectCode: 'PSY-2026-0001',
    age: 34,
    education: 'higher',
    sex: 'm',
    diagnosis: 'F06',
    createdBy: 'u1',
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function result(overrides: Partial<TestResult> = {}): TestResult {
  return {
    resultId: 'r1',
    subjectCode: 'PSY-2026-0001',
    methodId: 'schulte',
    rawMeasures: { t1: 45, t2: 50, t3: 40, t4: 55, t5: 60 },
    derived: { ER: 50, VR: 0.9, PU: 1.1 },
    shareConsent: true,
    createdBy: 'u1',
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Каталог норм', () => {
  it('экспорт берёт только валидированные активные нормы', () => {
    const cat = buildNormCatalog([
      norm({ normId: 'ok' }),
      norm({ normId: 'draft', validationStatus: 'draft' }),
      norm({ normId: 'inactive', active: false }),
    ]);
    expect(cat.schema).toBe(NORM_CATALOG_SCHEMA);
    expect(cat.norms.map((n) => n.normId)).toEqual(['ok']);
  });

  it('round-trip: экспорт → разбор возвращает те же нормы', () => {
    const cat = buildNormCatalog([norm({ normId: 'a' }), norm({ normId: 'b' })]);
    const parsed = parseNormCatalog(JSON.stringify(cat));
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.norms.map((n) => n.normId).sort()).toEqual(['a', 'b']);
  });

  it('разбор отклоняет чужой формат и битый JSON', () => {
    expect(parseNormCatalog('{not json').errors.length).toBeGreaterThan(0);
    expect(parseNormCatalog(JSON.stringify({ schema: 'other', norms: [] })).errors.length).toBeGreaterThan(0);
  });

  it('разбор пропускает норму без обязательных полей, но принимает валидные', () => {
    const bad = { schema: NORM_CATALOG_SCHEMA, exportedAt: 'x', norms: [{ normId: 'a', methodId: 'schulte', metric: 'ER' }, { foo: 1 }] };
    const parsed = parseNormCatalog(JSON.stringify(bad));
    expect(parsed.norms).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
  });

  it('diffCatalogAgainst: разделяет добавляемые и перезаписывающие (защита от молчаливой перезаписи)', () => {
    const existing = [norm({ normId: 'a', version: 1 }), norm({ normId: 'b', version: 1 })];
    const incoming = [
      norm({ normId: 'a', version: 1 }), // перезапишет
      norm({ normId: 'b', version: 2 }), // новая версия — добавит
      norm({ normId: 'c', version: 1 }), // новая — добавит
    ];
    const d = diffCatalogAgainst(incoming, existing);
    expect(d.added).toBe(2);
    expect(d.overwritten).toBe(1);
    expect(d.overwrittenKeys).toEqual(['a:1']);
  });
});

describe('Обезличенные слепки', () => {
  const methodById: Record<string, Method> = { schulte, exclusion };
  const subjectByCode = { 'PSY-2026-0001': subject() };
  let counter = 0;
  const rid = () => `anon_${++counter}`;

  it('собирает точки по всем сравниваемым показателям, без ПДн', () => {
    const file = buildSubmissions({ results: [result()], subjectByCode, methodById }, rid);
    // schulte сравнивает ER, VR, PU
    expect(file.submissions.map((s) => s.metric).sort()).toEqual(['ER', 'PU', 'VR']);
    const s = file.submissions[0];
    expect(s).not.toHaveProperty('subjectCode');
    expect(s.diagnosis).toBe('F06');
    expect(s.age).toBe(34);
    expect(s.year).toBe(2026);
    expect(s.anonId).toMatch(/^anon_/);
  });

  it('без согласия — точка не выгружается', () => {
    const file = buildSubmissions(
      { results: [result({ shareConsent: false })], subjectByCode, methodById },
      rid,
    );
    expect(file.submissions).toHaveLength(0);
  });

  it('качественные методики в слепки не попадают', () => {
    const qual = result({ methodId: 'exclusion', derived: {}, rawMeasures: {}, qualitativeRows: [{ excluded: 'x' }] });
    const file = buildSubmissions({ results: [qual], subjectByCode, methodById }, rid);
    expect(file.submissions).toHaveLength(0);
  });

  it('повторы одного испытуемого получают один anonId', () => {
    let c = 0;
    const rid2 = () => `A${++c}`;
    const file = buildSubmissions(
      {
        results: [result({ resultId: 'r1' }), result({ resultId: 'r2', createdAt: '2026-06-01T00:00:00.000Z' })],
        subjectByCode,
        methodById,
      },
      rid2,
    );
    const ids = new Set(file.submissions.map((s) => s.anonId));
    expect(ids.size).toBe(1);
  });
});
