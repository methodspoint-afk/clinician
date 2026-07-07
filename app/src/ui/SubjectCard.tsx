import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { applicationsRepo, resultsRepo } from '../db/repositories';
import { metricLabel } from '../domain/formulas/derive';
import { EDUCATION_LABELS, NORM_FLAG_LABELS, NormApplication, SEX_LABELS, TestResult } from '../domain/types';

export function SubjectCard({ code }: { code: string }) {
  const { db, subjects, methods, go } = useApp();
  const subject = subjects.find((s) => s.subjectCode === code);
  const [results, setResults] = useState<TestResult[]>([]);
  const [apps, setApps] = useState<Record<string, NormApplication[]>>({});

  useEffect(() => {
    (async () => {
      if (!db) return;
      const list = await resultsRepo.listForSubject(db, code);
      setResults(list);
      const byResult: Record<string, NormApplication[]> = {};
      for (const r of list) byResult[r.resultId] = await applicationsRepo.listForResult(db, r.resultId);
      setApps(byResult);
    })();
  }, [db, code]);

  if (!subject) return <div className="empty">Карточка не найдена</div>;

  const methodName = (id: string) => methods.find((m) => m.methodId === id)?.name ?? id;
  const label = (methodId: string, metricId: string) =>
    metricLabel(methods.find((m) => m.methodId === methodId)?.config, metricId);

  return (
    <div>
      <button className="secondary no-print" onClick={() => go({ name: 'subjects' })}>
        ← К списку
      </button>
      <div className="row" style={{ justifyContent: 'space-between', margin: '14px 0' }}>
        <h2 style={{ margin: 0 }}>{subject.subjectCode}</h2>
        <div className="row no-print">
          <button className="primary" onClick={() => go({ name: 'exam', code })}>
            Новое обследование
          </button>
          <button className="secondary" onClick={() => go({ name: 'report', code })} disabled={results.length === 0}>
            Сводный отчёт
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <span>Возраст: <strong>{subject.age}</strong></span>
          <span>Образование: <strong>{EDUCATION_LABELS[subject.education]}</strong></span>
          {subject.sex && <span>Пол: <strong>{SEX_LABELS[subject.sex]}</strong></span>}
          {subject.diagnosis && <span>Диагноз: <strong>{subject.diagnosis}</strong></span>}
          {subject.medications && <span>Препараты: <strong>{subject.medications}</strong></span>}
        </div>
        {subject.comment && (
          <p className="muted" style={{ marginBottom: 0 }}>Комментарий специалиста: {subject.comment}</p>
        )}
      </div>

      <h3>История обследований</h3>
      {results.length === 0 && <div className="empty">Обследований ещё не было.</div>}
      {results.map((r) => (
        <div key={r.resultId} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{methodName(r.methodId)}</strong>
            <span className="muted">{new Date(r.createdAt).toLocaleString('ru-RU')}</span>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Показатель</th>
                <th>Значение</th>
                <th>Сравнение с нормой</th>
              </tr>
            </thead>
            <tbody>
              {(apps[r.resultId] ?? []).map((a) => (
                <tr key={a.applicationId}>
                  <td>{label(r.methodId, a.metric)}</td>
                  <td>{a.rawValue}</td>
                  <td>
                    {a.computedDeviation.text}
                    {a.isOverride && (
                      <div>
                        <span className="badge override">Норма применена вручную (override)</span>
                        {a.overrideReason && <div className="muted">Обоснование: {a.overrideReason}</div>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {Object.entries(r.derived)
                .filter(([k]) => !(apps[r.resultId] ?? []).some((a) => a.metric === k))
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>{label(r.methodId, k)}</td>
                    <td>{Math.round(v * 1000) / 1000}</td>
                    <td className="muted">без сравнения с нормой</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {r.interpretation && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Интерпретация: {r.interpretation}
            </p>
          )}
        </div>
      ))}
      <p className="muted">
        Пояснения к флагам: {Object.values(NORM_FLAG_LABELS).slice(0, 2).join('; ')} и др. — полный
        список виден при подборе нормы.
      </p>
    </div>
  );
}
