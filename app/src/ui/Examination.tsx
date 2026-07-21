import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { applicationsRepo, normsRepo, resultsRepo } from '../db/repositories';
import { computeDerived, comparableMetrics } from '../domain/formulas/derive';
import { selectNorms, SelectionResult, RankedNorm } from '../domain/normSelection/selection';
import { computeDeviation } from '../domain/normSelection/deviation';
import { metricHint } from '../domain/seedMethods';
import {
  Method,
  Norm,
  NORM_FLAG_LABELS,
  QUALITY_TIER_LABELS,
  STAT_FORM_LABELS,
  SUBJECT_LANGUAGE,
} from '../domain/types';

interface MetricChoice {
  selected?: { norm: Norm; wasDefault: boolean; isOverride: boolean; overrideReason?: string };
  skipped: boolean;
}

export function Examination({ code }: { code: string }) {
  const { db, user, subjects, methods, scoring, go, persist } = useApp();
  const subject = subjects.find((s) => s.subjectCode === code);

  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<Method | null>(null);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [qualRows, setQualRows] = useState<Record<string, string>[]>([]);
  const [candidates, setCandidates] = useState<Norm[]>([]);
  const [choices, setChoices] = useState<Record<string, MetricChoice>>({});
  const [interpretation, setInterpretation] = useState('');
  const [shareConsent, setShareConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  const isQual = method?.measureType === 'qualitative';
  const qualCfg = method?.config.qualitative;
  // Строки протокола, где заполнено хотя бы одно поле — только они идут в сохранение
  const filledQualRows = qualRows.filter((r) => Object.values(r).some((v) => v && v.trim()));

  useEffect(() => {
    (async () => {
      if (db && method) setCandidates(await normsRepo.candidatesForMethod(db, method.methodId));
    })();
  }, [db, method]);

  if (!subject) return <div className="empty">Карточка не найдена</div>;

  const rawNumbers: Record<string, number> = {};
  let rawValid = !!method;
  for (const m of method?.config.measures ?? []) {
    const v = Number(raw[m.id]);
    if (raw[m.id] === undefined || raw[m.id] === '' || !Number.isFinite(v)) rawValid = false;
    else if ((m.min !== undefined && v < m.min) || (m.max !== undefined && v > m.max)) rawValid = false;
    else rawNumbers[m.id] = v;
  }

  const derived = useMemo(
    () => (method && rawValid ? computeDerived(method.config, rawNumbers) : { values: {}, errors: [] }),
    [method, JSON.stringify(rawNumbers), rawValid],
  );

  const metrics = method ? comparableMetrics(method.config) : [];
  const metricValue = (id: string): number =>
    derived.values[id] !== undefined ? derived.values[id] : rawNumbers[id];

  const selections: Record<string, SelectionResult> = useMemo(() => {
    if (!method || !rawValid) return {};
    const out: Record<string, SelectionResult> = {};
    for (const m of metrics) {
      out[m.id] = selectNorms(subject, method.config.gate, m.id, candidates, { scoring });
    }
    return out;
  }, [method, candidates, subject, scoring, rawValid]);

  const allChosen = metrics.every((m) => {
    const c = choices[m.id];
    if (metricValue(m.id) === undefined) return true; // показатель не рассчитался (напр. КАВ при М2=0)
    return c && (c.skipped || c.selected);
  });

  async function save() {
    if (!db || !user || !method) return;
    setSaving(true);
    const result = await resultsRepo.create(db, {
      subjectCode: subject!.subjectCode,
      methodId: method.methodId,
      rawMeasures: isQual ? {} : rawNumbers,
      derived: isQual ? {} : derived.values,
      qualitativeRows: isQual ? filledQualRows : undefined,
      interpretation: interpretation.trim() || undefined,
      shareConsent,
      createdBy: user.userId,
    });
    // Качественная проба: норм и отклонений нет — сохраняем только протокол
    if (isQual) {
      await persist();
      setSaving(false);
      go({ name: 'subject', code });
      return;
    }
    for (const m of metrics) {
      const c = choices[m.id];
      const value = metricValue(m.id);
      if (!c?.selected || value === undefined) continue;
      const dev = computeDeviation(value, c.selected.norm);
      await applicationsRepo.create(db, {
        resultId: result.resultId,
        normId: c.selected.norm.normId,
        normVersion: c.selected.norm.version,
        metric: m.id,
        patientDemographics: {
          age: subject!.age,
          education: subject!.education,
          sex: subject!.sex,
          language: SUBJECT_LANGUAGE,
        },
        rawValue: value,
        computedDeviation: dev,
        systemSuggestion: metricHint(method.methodId, m.id, value),
        wasDefault: c.selected.wasDefault,
        clinicianConfirmed: true,
        isOverride: c.selected.isOverride,
        overrideReason: c.selected.overrideReason,
        appliedBy: user.userId,
      });
    }
    await persist();
    setSaving(false);
    go({ name: 'subject', code });
  }

  return (
    <div>
      <button className="secondary" onClick={() => go({ name: 'subject', code })}>
        ← К карточке {code}
      </button>
      <h2 style={{ marginTop: 14 }}>Новое обследование</h2>
      <div className="steps">
        {(isQual ? ['Методика', 'Протокол ответов'] : ['Методика', 'Замеры', 'Нормы и результат']).map((label, i) => (
          <span key={label} className={`step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div>
          {methods
            .filter((m) => m.isActive)
            .map((m) => (
              <div
                key={m.methodId}
                className="card clickable"
                onClick={() => {
                  setMethod(m);
                  setRaw({});
                  setChoices({});
                  setQualRows(m.measureType === 'qualitative' ? [{}] : []);
                  setStep(2);
                }}
              >
                <strong>{m.name}</strong>
                <div className="muted">
                  {m.measureType === 'qualitative'
                    ? 'Качественная проба: протокол ответов (без числовых норм)'
                    : `Вводится замеров: ${m.config.measures.length}; сравнивается с нормой показателей: ${comparableMetrics(m.config).length}`}
                </div>
              </div>
            ))}
        </div>
      )}

      {step === 2 && method && isQual && qualCfg && (
        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{method.name} — протокол ответов</h3>
            <p className="muted">
              Вносите ответы испытуемого построчно. Система ничего не подсказывает и не оценивает —
              квалификация полностью за вами; протокол копит базу для будущего анализа.
            </p>
            {qualRows.map((row, ri) => (
              <div key={ri} className="card" style={{ background: 'transparent' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>
                    {qualCfg.itemLabel} {ri + 1}
                  </strong>
                  {qualRows.length > 1 && (
                    <button
                      className="secondary no-print"
                      onClick={() => setQualRows(qualRows.filter((_, i) => i !== ri))}
                    >
                      Удалить
                    </button>
                  )}
                </div>
                <div className="grid2">
                  {qualCfg.fields.map((f) => (
                    <label key={f.id} className="field">
                      <span>{f.label}</span>
                      {f.type === 'choice' ? (
                        <select
                          value={row[f.id] ?? ''}
                          onChange={(e) =>
                            setQualRows(qualRows.map((r, i) => (i === ri ? { ...r, [f.id]: e.target.value } : r)))
                          }
                        >
                          <option value="">— не выбрано —</option>
                          {(f.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={row[f.id] ?? ''}
                          placeholder={f.placeholder}
                          onChange={(e) =>
                            setQualRows(qualRows.map((r, i) => (i === ri ? { ...r, [f.id]: e.target.value } : r)))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button className="secondary no-print" onClick={() => setQualRows([...qualRows, {}])}>
              + Добавить {qualCfg.itemLabel.toLowerCase()}
            </button>
          </div>

          <div className="card">
            <label className="field">
              <span>Общий комментарий специалиста по методике (необязательно)</span>
              <textarea
                rows={3}
                value={interpretation}
                onChange={(e) => setInterpretation(e.target.value)}
                placeholder="Например: снижение уровня обобщения, опора на конкретно-ситуативные связи"
              />
            </label>
            {filledQualRows.length === 0 && (
              <div className="missing-hint">Внесите хотя бы одну заполненную строку протокола.</div>
            )}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="secondary" onClick={() => setStep(1)}>
                ← Назад
              </button>
              <button className="primary" disabled={filledQualRows.length === 0 || saving} onClick={save}>
                Сохранить обследование
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && method && !isQual && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{method.name} — ввод замеров</h3>
          <div className="grid3">
            {method.config.measures.map((m) => {
              const v = Number(raw[m.id]);
              const filled =
                raw[m.id] !== undefined &&
                raw[m.id] !== '' &&
                Number.isFinite(v) &&
                !(m.min !== undefined && v < m.min) &&
                !(m.max !== undefined && v > m.max);
              return (
                <label key={m.id} className={`field${filled ? '' : ' missing'}`}>
                  <span>{m.label} *</span>
                  <input
                    type="number"
                    step="any"
                    min={m.min}
                    max={m.max}
                    value={raw[m.id] ?? ''}
                    onChange={(e) => setRaw({ ...raw, [m.id]: e.target.value })}
                  />
                </label>
              );
            })}
          </div>
          {!rawValid && (
            <div className="missing-hint">Заполните все замеры (поля, помеченные красным).</div>
          )}

          {rawValid && (
            <>
              <h3>Производные показатели</h3>
              <table>
                <tbody>
                  {method.config.derived.map((d) => (
                    <tr key={d.id}>
                      <td>{d.label}</td>
                      <td>
                        {derived.values[d.id] !== undefined ? (
                          <strong>{Math.round(derived.values[d.id] * 1000) / 1000}</strong>
                        ) : (
                          <span className="muted">
                            не рассчитывается ({derived.errors.find((e) => e.id === d.id)?.message})
                          </span>
                        )}
                        {derived.values[d.id] !== undefined && metricHint(method.methodId, d.id, derived.values[d.id]) && (
                          <div className="muted">{metricHint(method.methodId, d.id, derived.values[d.id])}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <button className="secondary" onClick={() => setStep(1)}>
              ← Назад
            </button>
            <button className="primary" disabled={!rawValid} onClick={() => setStep(3)}>
              К подбору норм →
            </button>
          </div>
        </div>
      )}

      {step === 3 && method && (
        <div>
          <p className="muted">
            Для каждого показателя система предлагает рекомендованную норму (подбор: допуск по
            популяции → балл качества → тай-брейкер). Финальный выбор — за вами.
          </p>
          {metrics.map((m) => {
            const value = metricValue(m.id);
            if (value === undefined) return null;
            return (
              <MetricNormPicker
                key={m.id}
                label={`${m.label ?? m.id}: значение ${Math.round(value * 1000) / 1000}`}
                value={value}
                subjectAge={subject.age}
                selection={selections[m.id]}
                choice={choices[m.id] ?? { skipped: false }}
                onChange={(c) => setChoices({ ...choices, [m.id]: c })}
              />
            );
          })}

          <div className="card">
            <label className="field">
              <span>
                Комментарий специалиста по методике (необязательно; войдёт в протокол и отчёт —
                например, слова испытуемого во время выполнения)
              </span>
              <textarea
                rows={3}
                value={interpretation}
                onChange={(e) => setInterpretation(e.target.value)}
                placeholder="Например: выраженная истощаемость к 4-й таблице; со слов испытуемого — «цифры расплываются»"
              />
            </label>
            <label className="row" style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={shareConsent}
                onChange={(e) => setShareConsent(e.target.checked)}
              />
              Согласен(на) поделиться обезличенным результатом в общей базе (отправка — на экране
              «Синхронизация»; без кода испытуемого и комментариев)
            </label>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="secondary" onClick={() => setStep(2)}>
                ← Назад
              </button>
              <button className="primary" disabled={!allChosen || saving} onClick={save}>
                Сохранить обследование
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NormCard({ r, value }: { r: RankedNorm; value: number }) {
  const dev = computeDeviation(value, r.norm);
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{r.norm.sourceRef}</strong>
        <span className={`badge ${r.quality.tier}`}>
          {QUALITY_TIER_LABELS[r.quality.tier]} · {r.quality.total}/100
        </span>
      </div>
      <div className="muted">
        Возраст {r.norm.ageMin}–{r.norm.ageMax} · n ячейки = {r.norm.cellN} · {STAT_FORM_LABELS[r.norm.statForm]} ·{' '}
        {r.norm.dataCollectionYear ? `сбор данных ${r.norm.dataCollectionYear}` : `публикация ${r.norm.publicationYear ?? '—'}`}
      </div>
      {r.allFlags.length > 0 && (
        <div className="row" style={{ marginTop: 6, gap: 6 }}>
          {r.allFlags.map((f) => (
            <span key={f} className="badge flag">
              {NORM_FLAG_LABELS[f]}
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 6 }}>{dev.text}</div>
      {r.quality.tier === 'weak' && (
        <div className="warn big">Слабая норма — используйте только при отсутствии лучшей.</div>
      )}
    </>
  );
}

function MetricNormPicker({
  label,
  value,
  subjectAge,
  selection,
  choice,
  onChange,
}: {
  label: string;
  value: number;
  subjectAge: number;
  selection?: SelectionResult;
  choice: MetricChoice;
  onChange: (c: MetricChoice) => void;
}) {
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  if (!selection) return null;

  const noValid = selection.status === 'no_valid_norm';
  // При «нормы нет» показываем отсеянные сразу, ближайшие по возрасту — первыми:
  // клиницист видит их характеристики и решает — применить осознанно или без сравнения
  const ageDistance = (n: Norm) =>
    subjectAge < n.ageMin ? n.ageMin - subjectAge : subjectAge > n.ageMax ? subjectAge - n.ageMax : 0;
  const rejectedShown = noValid
    ? [...selection.rejected].sort((a, b) => ageDistance(a.norm) - ageDistance(b.norm))
    : selection.rejected;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{label}</h3>

      {noValid && (
        <div className="warn big">
          Валидной нормы нет: ни одна норма не прошла допуск по популяции. Система не подставляет
          «ближайшую» норму автоматически. Ниже показаны ближайшие нормы с их характеристиками —
          вы можете применить одну из них осознанно (выбор попадёт в лог) или сохранить показатель
          без сравнения с нормой.
        </div>
      )}

      {selection.ranked.map((r, i) => {
        const isSelected =
          choice.selected?.norm.normId === r.norm.normId &&
          choice.selected?.norm.version === r.norm.version &&
          !choice.selected.isOverride;
        return (
          <div
            key={`${r.norm.normId}:${r.norm.version}`}
            className={`norm-option ${isSelected ? 'selected' : ''}`}
            onClick={() =>
              onChange({ skipped: false, selected: { norm: r.norm, wasDefault: i === 0, isOverride: false } })
            }
          >
            {i === 0 && <div className="badge validated" style={{ marginBottom: 6 }}>Рекомендованный дефолт</div>}
            <NormCard r={r} value={value} />
          </div>
        );
      })}

      {rejectedShown.length > 0 && (
        <details className="rejected" open={noValid}>
          <summary>
            {noValid
              ? `Ближайшие нормы, не прошедшие допуск (${rejectedShown.length})`
              : `Отсеянные нормы (${rejectedShown.length}) — показать`}
          </summary>
          {rejectedShown.map((rej) => {
            const key = `${rej.norm.normId}:${rej.norm.version}`;
            const isSelected = choice.selected?.isOverride && choice.selected.norm.normId === rej.norm.normId;
            return (
              <div key={key} className={`norm-option ${isSelected ? 'selected' : ''}`}>
                <strong>{rej.norm.sourceRef}</strong>{' '}
                <span className="muted">
                  (возраст {rej.norm.ageMin}–{rej.norm.ageMax}, n = {rej.norm.cellN},{' '}
                  {STAT_FORM_LABELS[rej.norm.statForm]},{' '}
                  {rej.norm.dataCollectionYear
                    ? `сбор ${rej.norm.dataCollectionYear}`
                    : `публикация ${rej.norm.publicationYear ?? '—'}`})
                </span>
                <div className="muted">Причина отсева: {rej.reasons.join('; ')}</div>
                {isSelected ? (
                  <div>
                    <span className="badge override">Выбрана вручную (override)</span>
                    <div className="muted">Обоснование: {choice.selected!.overrideReason}</div>
                  </div>
                ) : overrideFor === key ? (
                  <div style={{ marginTop: 8 }}>
                    <label className="field">
                      <span>Обоснование применения отсеянной нормы (обязательно, попадёт в лог)</span>
                      <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                    </label>
                    <button
                      className="danger"
                      disabled={!overrideReason.trim()}
                      onClick={() => {
                        onChange({
                          skipped: false,
                          selected: {
                            norm: rej.norm,
                            wasDefault: false,
                            isOverride: true,
                            overrideReason: overrideReason.trim(),
                          },
                        });
                        setOverrideFor(null);
                        setOverrideReason('');
                      }}
                    >
                      Применить осознанно
                    </button>
                  </div>
                ) : (
                  <button className="secondary no-print" style={{ marginTop: 8 }} onClick={() => setOverrideFor(key)}>
                    Применить несмотря на отсев…
                  </button>
                )}
              </div>
            );
          })}
        </details>
      )}

      <label className="row" style={{ fontSize: 14, marginTop: 10 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={choice.skipped}
          onChange={(e) => onChange({ skipped: e.target.checked, selected: undefined })}
        />
        Сохранить без сравнения с нормой
      </label>
    </div>
  );
}
