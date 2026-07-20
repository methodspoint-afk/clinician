// HTTP-режим синхронизации (этап С1): те же форматы, что файловый обмен С0,
// но по сети — GET /norms и POST /submissions серверу из server/.
// fetch передаётся параметром, чтобы логика тестировалась без сети.

import { parseNormCatalog, ParsedCatalog, SubmissionsFile } from './sync';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type HttpOk<T> = { ok: true } & T;
export type HttpErr = { ok: false; error: string };

const trimBase = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

function describeStatus(status: number): string {
  if (status === 401) return 'Сервер отклонил токен (401): проверьте токен доступа';
  if (status === 403) return 'Недостаточно прав (403): нужен токен другой роли';
  return `Сервер ответил ошибкой (HTTP ${status})`;
}

/** Скачивание каталога норм с сервера; разбор — тем же parseNormCatalog, что и файл */
export async function fetchNormCatalog(
  baseUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<HttpOk<{ catalog: ParsedCatalog }> | HttpErr> {
  try {
    const res = await fetchFn(`${trimBase(baseUrl)}/norms`);
    if (!res.ok) return { ok: false, error: describeStatus(res.status) };
    const catalog = parseNormCatalog(await res.text());
    return { ok: true, catalog };
  } catch (e) {
    return { ok: false, error: `Сервер недоступен: ${String(e)}` };
  }
}

/** Отправка обезличенных слепков на сервер (формат С0 без изменений) */
export async function pushSubmissions(
  baseUrl: string,
  token: string,
  file: SubmissionsFile,
  fetchFn: FetchLike = fetch,
): Promise<HttpOk<{ accepted: number; rejected: number }> | HttpErr> {
  try {
    const res = await fetchFn(`${trimBase(baseUrl)}/submissions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.trim()}`,
      },
      body: JSON.stringify(file),
    });
    if (!res.ok) return { ok: false, error: describeStatus(res.status) };
    const body = (await res.json()) as { accepted?: number; rejected?: number };
    return { ok: true, accepted: body.accepted ?? 0, rejected: body.rejected ?? 0 };
  } catch (e) {
    return { ok: false, error: `Сервер недоступен: ${String(e)}` };
  }
}
