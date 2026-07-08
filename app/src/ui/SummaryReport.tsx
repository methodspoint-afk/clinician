import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { applicationsRepo, resultsRepo } from '../db/repositories';
import { metricLabel } from '../domain/formulas/derive';
import { QualitativeProtocol } from './QualitativeProtocol';
import { METHOD_DOMAIN_FALLBACK } from '../domain/seedMethods';
import {
  EDUCATION_LABELS,
  Method,
  METHOD_DOMAIN_LABELS,
  METHOD_DOMAIN_ORDER,
  MethodDomain,
  NormApplication,
  SEX_LABELS,
  TestResult,
} from '../domain/types';

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

function methodDomain(method: Method | undefined, methodId: string): MethodDomain {
  return method?.config.domain ?? METHOD_DOMAIN_FALLBACK[methodId] ?? 'other';
}

const fmt = (v: number) => Math.round(v * 1000) / 1000;

export function SummaryReport({ code }: { code: string }) {
  const { db, subjects, methods, go } = useApp();
  const subject = subjects.find((s) => s.subjectCode === code);
  const [results, setResults] = useState<TestResult[]>([]);
  const [apps, setApps] = useState<Record<string, NormApplication[]>>({});
  const reportRef = useRef<HTMLDivElement>(null);

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

  const methodOf = (id: string) => methods.find((m) => m.methodId === id);
  const methodName = (id: string) => methodOf(id)?.name ?? id;
  const label = (methodId: string, metricId: string) => metricLabel(methodOf(methodId)?.config, metricId);

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

  // Группировка результатов по блокам: внимание / память / мышление (запрос клинициста)
  const byDomain = new Map<MethodDomain, TestResult[]>();
  for (const r of results) {
    const d = methodDomain(methodOf(r.methodId), r.methodId);
    byDomain.set(d, [...(byDomain.get(d) ?? []), r]);
  }

  // Динамика: методики с повторными обследованиями (сравнение в катамнезе)
  const byMethod = new Map<string, TestResult[]>();
  for (const r of results) byMethod.set(r.methodId, [...(byMethod.get(r.methodId) ?? []), r]);
  const repeated = [...byMethod.entries()]
    // динамика — только по количественным методикам (у качественных нет числовых показателей)
    .filter(([methodId, list]) => list.length >= 2 && methodOf(methodId)?.measureType !== 'qualitative')
    .map(([methodId, list]) => ({
      methodId,
      // от ранних к поздним
      list: [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));

  // Экспорт .doc: Word открывает HTML-документ с расширением .doc —
  // достаточно для копирования заключения в МИС/ЭМК решением специалиста
  function exportDoc() {
    if (!reportRef.current) return;
    const clone = reportRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-print').forEach((el) => el.remove());
    const html =
      '<html><head><meta charset="utf-8"><style>body{font-family:Cambria,serif;font-size:12pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4pt 8pt;text-align:left}</style></head><body>' +
      clone.innerHTML +
      '</body></html>';
    const blob = new Blob(['﻿' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Заключение_${subject!.subjectCode}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderResultCard(r: TestResult) {
    return (
      <div key={r.resultId} className="card">
        <strong>{methodName(r.methodId)}</strong>{' '}
        <span className="muted">({new Date(r.createdAt).toLocaleDateString('ru-RU')})</span>
        {r.qualitativeRows ? (
          <QualitativeProtocol config={methodOf(r.methodId)?.config.qualitative} rows={r.qualitativeRows} />
        ) : (
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
                  <td>{label(r.methodId, a.metric)}</td>
                  <td>{a.rawValue}</td>
                  <td>{a.computedDeviation.text}{a.isOverride ? ' (норма выбрана вручную)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {r.interpretation && (
          <p className="muted">Комментарий специалиста: {r.interpretation}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <button className="secondary" onClick={() => go({ name: 'subject', code })}>
          ← К карточке
        </button>
        <div className="row">
          <button className="secondary" onClick={exportDoc}>
            Скачать .doc
          </button>
          <button className="primary" onClick={() => window.print()}>
            Печать / PDF
          </button>
        </div>
      </div>

      <div ref={reportRef}>
        <h2 style={{ marginTop: 14 }}>Сводный отчёт — {subject.subjectCode}</h2>
        <div className="card">
          {subject.age} лет · {EDUCATION_LABELS[subject.education]}
          {subject.sex ? ` · ${SEX_LABELS[subject.sex]}` : ''}
          {subject.diagnosis ? ` · диагноз: ${subject.diagnosis}` : ''}
          {subject.medications && (
            <div>Принимаемые препараты: {subject.medications}</div>
          )}
          {subject.comment && <div className="muted">Комментарий специалиста: {subject.comment}</div>}
          <div className="muted">Отчёт сформирован {new Date().toLocaleString('ru-RU')}</div>
        </div>

        {METHOD_DOMAIN_ORDER.filter((d) => byDomain.has(d)).map((d) => (
          <section key={d}>
            <h3>{METHOD_DOMAIN_LABELS[d]}</h3>
            {byDomain.get(d)!.map(renderResultCard)}
          </section>
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

        {repeated.length > 0 && (
          <section>
            <h3>Динамика (повторные обследования)</h3>
            <p className="muted">
              Сравнение с предыдущими результатами того же испытуемого — динамика в катамнезе,
              дополнительно к сравнению с нормой.
            </p>
            {repeated.map(({ methodId, list }) => {
              const cfg = methodOf(methodId)?.config;
              const metricIds = [
                ...new Set(
                  list.flatMap((r) => [
                    ...Object.keys(r.derived),
                    ...(apps[r.resultId] ?? []).map((a) => a.metric),
                  ]),
                ),
              ];
              return (
                <div key={methodId} className="card">
                  <strong>{methodName(methodId)}</strong>
                  <table style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Показатель</th>
                        {list.map((r) => (
                          <th key={r.resultId}>{new Date(r.createdAt).toLocaleDateString('ru-RU')}</th>
                        ))}
                        <th>Изменение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricIds.map((mid) => {
                        const values = list.map((r) => r.derived[mid] ?? r.rawMeasures[mid]);
                        const first = values.find((v) => v !== undefined);
                        const last = [...values].reverse().find((v) => v !== undefined);
                        const delta =
                          first !== undefined && last !== undefined && first !== last
                            ? `${last > first ? '↑' : '↓'} ${fmt(Math.abs(last - first))}`
                            : '=';
                        return (
                          <tr key={mid}>
                            <td>{metricLabel(cfg, mid)}</td>
                            {values.map((v, i) => (
                              <td key={list[i].resultId}>{v !== undefined ? fmt(v) : '—'}</td>
                            ))}
                            <td>{delta}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
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
    </div>
  );
}
