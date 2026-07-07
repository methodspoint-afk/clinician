import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { applicationsRepo, resultsRepo } from '../db/repositories';
import { EDUCATION_LABELS, NormApplication, SEX_LABELS, TestResult } from '../domain/types';

// Простые конфигурируемые правила-подсказки «паттерн → осторожная формулировка».
// Полноценный синдромальный анализ — фаза 2.
const PATTERN_HINTS: { when: (worse: Set<string>) => boolean; text: string }[] = [
  {
    when: (worse) =>
      (worse.has('ten_words:p5') || worse.has('ten_words:delayed')) &&
      !worse.has('schulte:ER') &&
      !worse.has('correction_test:errors_total'),
    text: 'Снижение памяти при сохранном внимании — такой паттерн чаще встречается при невротическом регистре, чем при общем когнитивном снижении. Требует клинической оценки.',
  },
  {
    when: (worse) => worse.has('schulte:ER') && worse.has('ten_words:p5'),
    text: 'Одновременное снижение темпа сенсомоторных реакций и памяти — паттерн, требующий дифференциации общего когнитивного снижения. Требует клинической оценки.',
  },
];

export function SummaryReport({ code }: { code: string }) {
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

  // Отклонения «в сторону ухудшения» для правил-подсказок
  const worse = new Set<string>();
  for (const r of results) {
    for (const a of apps[r.resultId] ?? []) {
      if (a.computedDeviation.kind === 'z' && Math.abs(a.computedDeviation.value) >= 1 && a.computedDeviation.text.includes('ухудшения')) {
        worse.add(`${r.methodId}:${a.metric}`);
      }
      if (a.computedDeviation.kind === 'percentile' && a.computedDeviation.text.includes('хуже') && a.computedDeviation.value >= 75) {
        worse.add(`${r.methodId}:${a.metric}`);
      }
    }
  }
  const hints = PATTERN_HINTS.filter((h) => h.when(worse)).map((h) => h.text);

  const tenWords = results.find((r) => r.methodId === 'ten_words');

  return (
    <div>
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <button className="secondary" onClick={() => go({ name: 'subject', code })}>
          ← К карточке
        </button>
        <button className="primary" onClick={() => window.print()}>
          Печать / PDF
        </button>
      </div>

      <h2 style={{ marginTop: 14 }}>Сводный отчёт — {subject.subjectCode}</h2>
      <div className="card">
        {subject.age} лет · {EDUCATION_LABELS[subject.education]}
        {subject.sex ? ` · ${SEX_LABELS[subject.sex]}` : ''}
        {subject.diagnosis ? ` · диагноз: ${subject.diagnosis}` : ''}
        <div className="muted">Отчёт сформирован {new Date().toLocaleString('ru-RU')}</div>
      </div>

      {results.map((r) => (
        <div key={r.resultId} className="card">
          <strong>{methodName(r.methodId)}</strong>{' '}
          <span className="muted">({new Date(r.createdAt).toLocaleDateString('ru-RU')})</span>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Показатель</th>
                <th>Результат</th>
                <th>Отклонение от нормы</th>
              </tr>
            </thead>
            <tbody>
              {(apps[r.resultId] ?? []).map((a) => (
                <tr key={a.applicationId}>
                  <td>{a.metric}</td>
                  <td>{a.rawValue}</td>
                  <td>{a.computedDeviation.text}{a.isOverride ? ' (норма выбрана вручную)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.interpretation && <p className="muted">Интерпретация специалиста: {r.interpretation}</p>}
        </div>
      ))}

      {tenWords && (
        <div className="card">
          <strong>Кривая запоминания (10 слов)</strong>
          <div className="curve">
            {['p1', 'p2', 'p3', 'p4', 'p5'].map((p, i) => {
              const v = tenWords.rawMeasures[p] ?? 0;
              return (
                <div key={p} className="bar" style={{ height: `${(v / 10) * 100}%` }}>
                  <span>{v}</span>
                  <small>{i + 1}</small>
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ marginTop: 26 }}>
            Отсроченное воспроизведение: {tenWords.rawMeasures.delayed ?? '—'}; устойчивые замены:{' '}
            {tenWords.rawMeasures.substitutions ?? '—'}
          </div>
        </div>
      )}

      {hints.length > 0 && (
        <div className="card">
          <strong>Подсказки по межтестовым паттернам (гипотезы, не диагноз)</strong>
          <ul>
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted">
        Все выводы приложения — поддержка решения специалиста, а не диагностическое заключение.
        Итоговая квалификация — за клиницистом.
      </p>
    </div>
  );
}
