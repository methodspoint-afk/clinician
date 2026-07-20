import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { normsRepo, resultsRepo, settingsRepo } from '../db/repositories';
import {
  buildNormCatalog,
  buildSubmissions,
  parseNormCatalog,
  Submission,
} from '../domain/sync';
import { fetchNormCatalog, pushSubmissions } from '../domain/syncHttp';
import { Norm, Subject } from '../domain/types';

// Этап С0: файловый обмен без сервера. Экспорт каталога норм и обезличенных
// слепков результатов; импорт каталога норм. Транспорт (файл) на этапе С1
// заменится на HTTP — логика сборки/разбора та же (domain/sync.ts).

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

export function SyncScreen() {
  const { db, subjects, methods, scoring, persist } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [preview, setPreview] = useState<Submission[] | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [serverToken, setServerToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!db) return;
      setServerUrl((await settingsRepo.getValue(db, 'server_url')) ?? '');
      setServerToken((await settingsRepo.getValue(db, 'server_token')) ?? '');
    })();
  }, [db]);

  async function saveServerSettings() {
    if (!db) return;
    await settingsRepo.setValue(db, 'server_url', serverUrl.trim());
    await settingsRepo.setValue(db, 'server_token', serverToken.trim());
    await persist();
    setMsg({ kind: 'ok', text: 'Настройки сервера сохранены (локально, в вашей базе).' });
  }

  async function importNormList(norms: Norm[], parseErrors: string[], sourceLabel: string) {
    if (!db) return;
    for (const n of norms) await normsRepo.save(db, n, scoring);
    await persist();
    const tail = parseErrors.length ? ` Пропущено с ошибками: ${parseErrors.length}.` : '';
    setMsg({ kind: 'ok', text: `${sourceLabel}: импортировано норм ${norms.length}.${tail}` });
  }

  async function pullNormsFromServer() {
    if (!db || !serverUrl.trim()) return;
    setBusy(true);
    const res = await fetchNormCatalog(serverUrl);
    if (!res.ok) setMsg({ kind: 'warn', text: res.error });
    else if (res.catalog.norms.length === 0)
      setMsg({ kind: 'warn', text: 'На сервере пока нет валидированных норм.' });
    else await importNormList(res.catalog.norms, res.catalog.errors, 'Сервер');
    setBusy(false);
  }

  async function pushSubmissionsToServer() {
    if (!db || !serverUrl.trim() || !serverToken.trim()) return;
    setBusy(true);
    const results = await resultsRepo.listAll(db);
    const subjectByCode: Record<string, Subject> = {};
    for (const s of subjects) subjectByCode[s.subjectCode] = s;
    const methodById = Object.fromEntries(methods.map((m) => [m.methodId, m]));
    const file = buildSubmissions({ results, subjectByCode, methodById });
    if (file.submissions.length === 0) {
      setMsg({
        kind: 'warn',
        text: 'Нет данных для отправки: нужны обследования с согласием поделиться обезличенным результатом.',
      });
      setBusy(false);
      return;
    }
    const res = await pushSubmissions(serverUrl, serverToken, file);
    if (!res.ok) setMsg({ kind: 'warn', text: res.error });
    else
      setMsg({
        kind: 'ok',
        text: `Отправлено в общую базу: ${res.accepted} точек данных${res.rejected ? `, отклонено ${res.rejected}` : ''}.`,
      });
    setBusy(false);
  }

  async function exportNorms() {
    if (!db) return;
    const all = await normsRepo.listAll(db);
    const catalog = buildNormCatalog(all);
    if (catalog.norms.length === 0) {
      setMsg({ kind: 'warn', text: 'Нет валидированных активных норм для экспорта.' });
      return;
    }
    download(`norms-catalog-${today()}.json`, catalog);
    setMsg({ kind: 'ok', text: `Экспортировано норм: ${catalog.norms.length}.` });
  }

  async function exportSubmissions() {
    if (!db) return;
    const results = await resultsRepo.listAll(db);
    const subjectByCode: Record<string, Subject> = {};
    for (const s of subjects) subjectByCode[s.subjectCode] = s;
    const methodById = Object.fromEntries(methods.map((m) => [m.methodId, m]));
    const file = buildSubmissions({ results, subjectByCode, methodById });
    setPreview(file.submissions);
    if (file.submissions.length === 0) {
      setMsg({
        kind: 'warn',
        text: 'Нет данных для отправки: нужны обследования, где отмечено согласие поделиться обезличенным результатом.',
      });
      return;
    }
    download(`submissions-${today()}.json`, file);
    setMsg({ kind: 'ok', text: `Экспортировано обезличенных точек данных: ${file.submissions.length}.` });
  }

  async function importNorms(text: string) {
    if (!db) return;
    const { norms, errors } = parseNormCatalog(text);
    if (norms.length === 0) {
      setMsg({ kind: 'warn', text: `Импорт не выполнен: ${errors.join('; ') || 'нет норм в файле'}` });
      return;
    }
    await importNormList(norms, errors, 'Файл');
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importNorms(String(reader.result));
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Синхронизация (обмен файлами)</h2>
      <p className="muted">
        Предварительный этап общей базы: пока без сервера, обмен через файлы. Каталог норм можно
        выгрузить и передать коллеге; обезличенные результаты — подготовить к отправке в общую базу.
        Персональных данных в файлах нет: ни кода испытуемого, ни комментариев, ни препаратов.
      </p>

      {msg && <div className={`warn ${msg.kind === 'ok' ? 'offline' : 'big'}`}>{msg.text}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Сервер общей базы</h3>
        <p className="muted">
          Когда сервер проекта развёрнут, обмен идёт в один клик: скачивание общего каталога норм
          и отправка обезличенных результатов. Адрес и токен выдаёт владелец проекта; токен не
          содержит персональных данных и хранится только в вашей локальной базе.
        </p>
        <div className="grid2">
          <label className="field">
            <span>Адрес сервера</span>
            <input
              placeholder="https://…"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Токен доступа</span>
            <input
              placeholder="spc_… или adm_…"
              value={serverToken}
              onChange={(e) => setServerToken(e.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <button className="secondary" onClick={saveServerSettings}>
            Сохранить настройки
          </button>
          <button className="secondary" disabled={busy || !serverUrl.trim()} onClick={pullNormsFromServer}>
            Скачать нормы с сервера
          </button>
          <button
            className="primary"
            disabled={busy || !serverUrl.trim() || !serverToken.trim()}
            onClick={pushSubmissionsToServer}
          >
            Отправить обезличенные результаты
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Каталог норм (файлы)</h3>
        <p className="muted">
          Экспорт — только валидированные активные нормы. Импорт добавляет нормы из файла в вашу
          базу (балл качества пересчитывается по вашим настройкам).
        </p>
        <div className="row">
          <button className="secondary" onClick={exportNorms}>
            Выгрузить каталог норм
          </button>
          <button className="secondary" onClick={() => fileRef.current?.click()}>
            Загрузить каталог норм из файла
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onPickFile} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Обезличенные результаты (в общую базу)</h3>
        <p className="muted">
          В файл попадают только обследования с отметкой согласия «поделиться обезличенным
          результатом» и только количественные методики. Каждая точка: методика, показатель,
          значение, возраст, пол, образование, диагноз, год. Испытуемые связываются случайным
          кодом, не раскрывающим вашу картотеку.
        </p>
        <button className="primary" onClick={exportSubmissions}>
          Подготовить файл обезличенных результатов
        </button>
        {preview && preview.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Методика</th>
                <th>Показатель</th>
                <th>Значение</th>
                <th>Возраст</th>
                <th>Диагноз</th>
                <th>Год</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 20).map((s, i) => (
                <tr key={i}>
                  <td>{s.methodId}</td>
                  <td>{s.metric}</td>
                  <td>{Math.round(s.value * 1000) / 1000}</td>
                  <td>{s.age}</td>
                  <td>{s.diagnosis ?? '—'}</td>
                  <td>{s.year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {preview && preview.length > 20 && (
          <p className="muted">…и ещё {preview.length - 20} точек в файле.</p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Мониторинг публикаций (Контур A)</h3>
        <p className="muted">
          Новые исследования с нормами отслеживаются по утверждённому реестру источников:
          автоматический прогон — раз в квартал (плюс горячие алерты по важным событиям),
          результаты — в журнале мониторинга и квартальном дайджесте. Найденные нормы попадают
          в базу только как черновики и только после валидации специалистом.
        </p>
        <div className="row">
          <a
            href="https://github.com/methodspoint-afk/clinician/tree/claude/gifted-thompson-dsmsv5/clinician-os/research"
            target="_blank"
            rel="noreferrer"
          >
            <button className="secondary" type="button">Проверить новые публикации (журнал мониторинга)</button>
          </a>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Внеплановый прогон по конкретной методике можно запросить у владельца проекта.
          Проверка нажатием прямо из приложения появится на серверном этапе.
        </p>
      </div>
    </div>
  );
}
