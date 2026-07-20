import { beforeEach, describe, expect, it } from 'vitest';
import { ageBucket, createToken, openDb } from '../src/db.js';
import { buildApp, NORM_CATALOG_SCHEMA, SUBMISSIONS_SCHEMA } from '../src/app.js';

let db;
let app;
const ADMIN = 'adm_test_token';
const SPEC = 'spc_test_token';

const auth = (token) => ({ authorization: `Bearer ${token}` });

function norm(overrides = {}) {
  return {
    normId: 'n1',
    version: 1,
    sourceRef: 'Тестовый источник',
    methodId: 'schulte',
    metric: 'ER',
    validationStatus: 'validated',
    active: true,
    ageMin: 18,
    ageMax: 45,
    cellN: 100,
    statForm: 'mean_sd',
    mean: 35,
    sd: 4,
    higherIsWorse: false,
    ...overrides,
  };
}

function submission(overrides = {}) {
  return {
    anonId: 'anon_1',
    methodId: 'schulte',
    metric: 'ER',
    value: 40,
    age: 30,
    sex: 'm',
    education: 'higher',
    diagnosis: 'органический симптомокомплекс',
    year: 2026,
    ...overrides,
  };
}

beforeEach(() => {
  db = openDb(':memory:');
  createToken(db, { token: ADMIN, role: 'admin', label: 'Степан' });
  createToken(db, { token: SPEC, role: 'specialist', label: 'Коллега' });
  app = buildApp(db);
});

describe('Аутентификация', () => {
  it('/health открыт без токена', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /norms: без токена 401, со специалистским 403, с админским 200', async () => {
    const body = { schema: NORM_CATALOG_SCHEMA, norms: [norm()] };
    expect((await app.inject({ method: 'POST', url: '/norms', payload: body })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/norms', payload: body, headers: auth(SPEC) })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/norms', payload: body, headers: auth(ADMIN) })).statusCode,
    ).toBe(200);
  });

  it('неизвестный/отозванный токен = 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/submissions',
      payload: {},
      headers: auth('nope'),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Каталог норм', () => {
  it('публичный GET /norms отдаёт только валидированные активные, в формате С0', async () => {
    await app.inject({
      method: 'POST',
      url: '/norms',
      headers: auth(ADMIN),
      payload: {
        schema: NORM_CATALOG_SCHEMA,
        norms: [
          norm({ normId: 'ok' }),
          norm({ normId: 'draft', validationStatus: 'draft' }),
          norm({ normId: 'off', active: false }),
        ],
      },
    });
    const res = await app.inject({ method: 'GET', url: '/norms' });
    const body = res.json();
    expect(body.schema).toBe(NORM_CATALOG_SCHEMA);
    expect(body.norms.map((n) => n.normId)).toEqual(['ok']);
    // а админ видит всё, включая черновики-кандидаты
    const all = await app.inject({ method: 'GET', url: '/norms/all', headers: auth(ADMIN) });
    expect(all.json().norms).toHaveLength(3);
  });

  it('норма без обязательных полей не принимается, остальные принимаются', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/norms',
      headers: auth(ADMIN),
      payload: { norms: [norm(), { foo: 1 }] },
    });
    expect(res.json()).toMatchObject({ accepted: 1 });
    expect(res.json().errors).toHaveLength(1);
  });

  it('PATCH валидирует черновик — он появляется в публичном каталоге', async () => {
    await app.inject({
      method: 'POST',
      url: '/norms',
      headers: auth(ADMIN),
      payload: { norms: [norm({ normId: 'cand', validationStatus: 'draft' })] },
    });
    expect((await app.inject({ method: 'GET', url: '/norms' })).json().norms).toHaveLength(0);
    const patch = await app.inject({
      method: 'PATCH',
      url: '/norms/cand/1',
      headers: auth(ADMIN),
      payload: { validationStatus: 'validated' },
    });
    expect(patch.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/norms' })).json().norms.map((n) => n.normId)).toEqual([
      'cand',
    ]);
  });
});

describe('Слепки и агрегаты', () => {
  it('POST /submissions принимает файл С0, отбраковывает битые строки', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/submissions',
      headers: auth(SPEC),
      payload: {
        schema: SUBMISSIONS_SCHEMA,
        submissions: [submission(), { anonId: 'x' }],
      },
    });
    expect(res.json()).toEqual({ accepted: 1, rejected: 1 });
  });

  it('чужой schema → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/submissions',
      headers: auth(SPEC),
      payload: { schema: 'other', submissions: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('ячейка с n>=30 появляется в агрегатах с mean/sd; меньшая — нет', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      submission({ anonId: `a${i}`, value: 35 + (i % 5) }),
    );
    const few = Array.from({ length: 5 }, (_, i) =>
      submission({ anonId: `b${i}`, diagnosis: 'редкий диагноз' }),
    );
    await app.inject({
      method: 'POST',
      url: '/submissions',
      headers: auth(SPEC),
      payload: { schema: SUBMISSIONS_SCHEMA, submissions: [...many, ...few] },
    });
    const res = await app.inject({ method: 'GET', url: '/aggregates', headers: auth(ADMIN) });
    const { cells } = res.json();
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({
      methodId: 'schulte',
      metric: 'ER',
      diagnosis: 'органический симптомокомплекс',
      ageBucket: '26-35',
      n: 30,
    });
    expect(cells[0].mean).toBeGreaterThan(35);
    expect(cells[0].sd).toBeGreaterThan(0);
    // специалисту агрегаты недоступны
    expect(
      (await app.inject({ method: 'GET', url: '/aggregates', headers: auth(SPEC) })).statusCode,
    ).toBe(403);
  });
});

describe('CORS (приложение живёт на другом origin)', () => {
  it('preflight OPTIONS → 204 с нужными заголовками', async () => {
    const res = await app.inject({ method: 'OPTIONS', url: '/submissions' });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-headers']).toContain('authorization');
  });

  it('обычный ответ несёт access-control-allow-origin', async () => {
    const res = await app.inject({ method: 'GET', url: '/norms' });
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('Возрастные корзины', () => {
  it('жёсткие границы 16/60 соблюдаются', () => {
    expect(ageBucket(15)).toBe('<16');
    expect(ageBucket(16)).toBe('16-25');
    expect(ageBucket(26)).toBe('26-35');
    expect(ageBucket(60)).toBe('46-60');
    expect(ageBucket(61)).toBe('>60');
  });
});
