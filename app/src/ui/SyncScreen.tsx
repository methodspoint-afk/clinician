import { useRef, useState } from 'react';
import { useApp } from '../store';
import { normsRepo, resultsRepo } from '../db/repositories';
import {
  buildNormCatalog,
  buildSubmissions,
  parseNormCatalog,
  Submission,
} from '../domain/sync';
import { Subject } from '../domain/types';

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
    for (const n of norms) await normsRepo.save(db, n, scoring);
    await persist();
    const tail = errors.length ? ` Пропущено с ошибками: ${errors.length}.` : '';
    setMsg({ kind: 'ok', text: `Импортировано норм: ${norms.length}.${tail}` });
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
        <h3 style={{ marginTop: 0 }}>Каталог норм</h3>
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
    </div>
  );
}
