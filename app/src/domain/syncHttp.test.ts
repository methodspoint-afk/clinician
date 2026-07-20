import { describe, expect, it } from 'vitest';
import { fetchNormCatalog, pushSubmissions } from './syncHttp';
import { NORM_CATALOG_SCHEMA, SUBMISSIONS_SCHEMA, SubmissionsFile } from './sync';

const catalogBody = JSON.stringify({
  schema: NORM_CATALOG_SCHEMA,
  exportedAt: 'x',
  norms: [{ normId: 'n1', methodId: 'schulte', metric: 'ER' }],
});

function fakeFetch(status: number, body: string) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
  return { fn, calls };
}

const file: SubmissionsFile = {
  schema: SUBMISSIONS_SCHEMA,
  exportedAt: 'x',
  submissions: [
    { anonId: 'a', methodId: 'schulte', metric: 'ER', value: 40, age: 30, education: 'higher', year: 2026 },
  ],
};

describe('fetchNormCatalog', () => {
  it('скачивает и разбирает каталог; хвостовые слэши в адресе не мешают', async () => {
    const { fn, calls } = fakeFetch(200, catalogBody);
    const res = await fetchNormCatalog('https://api.example.ru///', fn);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.catalog.norms[0].normId).toBe('n1');
    expect(calls[0].url).toBe('https://api.example.ru/norms');
  });

  it('ошибка HTTP → понятное сообщение, не исключение', async () => {
    const { fn } = fakeFetch(500, 'boom');
    const res = await fetchNormCatalog('https://x', fn);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('500');
  });

  it('сеть упала → «сервер недоступен»', async () => {
    const res = await fetchNormCatalog('https://x', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('недоступен');
  });
});

describe('pushSubmissions', () => {
  it('шлёт файл С0 как JSON с bearer-токеном', async () => {
    const { fn, calls } = fakeFetch(200, JSON.stringify({ accepted: 1, rejected: 0 }));
    const res = await pushSubmissions('https://api.example.ru', ' spc_token ', file, fn);
    expect(res).toMatchObject({ ok: true, accepted: 1, rejected: 0 });
    const init = calls[0].init!;
    expect(calls[0].url).toBe('https://api.example.ru/submissions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer spc_token');
    expect(JSON.parse(String(init.body)).schema).toBe(SUBMISSIONS_SCHEMA);
  });

  it('401 → сообщение про токен', async () => {
    const { fn } = fakeFetch(401, '{}');
    const res = await pushSubmissions('https://x', 'bad', file, fn);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('токен');
  });
});
