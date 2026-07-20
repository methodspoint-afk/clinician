// REST API общей базы (этап С1). Форматы обмена совпадают с этапом С0
// (app/src/domain/sync.ts): каталог норм clinician-norm-catalog-1,
// слепки clinician-submissions-1 — приложение шлёт те же файлы по HTTP.
import Fastify from 'fastify';
import {
  aggregates,
  findToken,
  insertSubmissions,
  listAllNorms,
  listPublicNorms,
  setNormStatus,
  upsertNorm,
} from './db.js';

export const NORM_CATALOG_SCHEMA = 'clinician-norm-catalog-1';
export const SUBMISSIONS_SCHEMA = 'clinician-submissions-1';

export function buildApp(db, opts = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  // CORS: приложение — статичный сайт на другом origin (GitHub Pages/локально).
  // API публично читаемое, запись — по токену, поэтому "*" безопасно.
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-headers', 'authorization, content-type');
    reply.header('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') {
      reply.code(204).send();
      return reply;
    }
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    req.auth = findToken(db, token) ?? null;
  });

  const requireRole = (req, reply, roles) => {
    if (!req.auth) {
      reply.code(401).send({ error: 'Нужен токен доступа (Authorization: Bearer …)' });
      return false;
    }
    if (!roles.includes(req.auth.role)) {
      reply.code(403).send({ error: 'Недостаточно прав' });
      return false;
    }
    return true;
  };

  app.get('/health', async () => ({ ok: true }));

  // Публичный каталог валидированных норм — формат тот же, что файл С0
  app.get('/norms', async () => ({
    schema: NORM_CATALOG_SCHEMA,
    exportedAt: new Date().toISOString(),
    norms: listPublicNorms(db),
  }));

  // Полный список для админов (включая черновики-кандидаты)
  app.get('/norms/all', async (req, reply) => {
    if (!requireRole(req, reply, ['admin'])) return;
    return { norms: listAllNorms(db) };
  });

  // Приём норм (админ): принимает файл-каталог С0 или {norms: [...]}
  app.post('/norms', async (req, reply) => {
    if (!requireRole(req, reply, ['admin'])) return;
    const body = req.body ?? {};
    const norms = Array.isArray(body.norms) ? body.norms : [];
    if (body.schema && body.schema !== NORM_CATALOG_SCHEMA) {
      return reply.code(400).send({ error: `Ожидался schema=${NORM_CATALOG_SCHEMA}` });
    }
    let accepted = 0;
    const errors = [];
    norms.forEach((n, i) => {
      if (!n?.normId || !n?.methodId || !n?.metric) {
        errors.push(`Норма #${i + 1}: нет normId/methodId/metric`);
        return;
      }
      upsertNorm(db, n, req.auth.label);
      accepted++;
    });
    return { accepted, errors };
  });

  // Валидация/архивация нормы (админ) — только статусные поля, не данные
  app.patch('/norms/:normId/:version', async (req, reply) => {
    if (!requireRole(req, reply, ['admin'])) return;
    const { normId, version } = req.params;
    const { validationStatus, active } = req.body ?? {};
    const ok = setNormStatus(db, normId, Number(version), { validationStatus, active }, req.auth.label);
    if (!ok) return reply.code(404).send({ error: 'Норма не найдена' });
    return { ok: true };
  });

  // Приём обезличенных слепков (специалист или админ) — файл С0 по HTTP
  app.post('/submissions', async (req, reply) => {
    if (!requireRole(req, reply, ['specialist', 'admin'])) return;
    const body = req.body ?? {};
    if (body.schema !== SUBMISSIONS_SCHEMA || !Array.isArray(body.submissions)) {
      return reply.code(400).send({ error: `Ожидался schema=${SUBMISSIONS_SCHEMA} с массивом submissions` });
    }
    const valid = body.submissions.filter(
      (s) =>
        s &&
        typeof s.anonId === 'string' &&
        typeof s.methodId === 'string' &&
        typeof s.metric === 'string' &&
        Number.isFinite(s.value) &&
        Number.isInteger(s.age),
    );
    const accepted = insertSubmissions(db, valid, req.auth.token);
    return { accepted, rejected: body.submissions.length - valid.length };
  });

  // Ячейки-агрегаты для норм-кандидатов (админ): n >= minN (по умолчанию 30)
  app.get('/aggregates', async (req, reply) => {
    if (!requireRole(req, reply, ['admin'])) return;
    const minN = Number(req.query.minN ?? 30);
    return { minN, cells: aggregates(db, minN) };
  });

  return app;
}
