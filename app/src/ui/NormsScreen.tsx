import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { normsRepo } from '../db/repositories';
import { computeQuality } from '../domain/normSelection/score';
import {
  EDUCATION_LABELS,
  Education,
  Norm,
  NORM_FLAG_LABELS,
  PROCEDURE_MATCH_LABELS,
  ProcedureMatch,
  QUALITY_TIER_LABELS,
  SOURCE_TYPE_LABELS,
  SourceType,
  STAT_FORM_LABELS,
  StatForm,
  VALIDATION_STATUS_LABELS,
} from '../domain/types';
import { comparableMetrics } from '../domain/formulas/derive';

function emptyNorm(methodId: string, metric: string): Norm {
  return {
    normId: normsRepo.newNormId(),
    version: 1,
    sourceRef: '',
    sourceType: 'methodical_guide',
    validationStatus: 'draft',
    methodId,
    metric,
    procedureMatch: 'full',
    ageMin: 18,
    ageMax: 60,
    educationLevel: 'not_stratified',
    language: 'ru',
    clinicalStatus: 'healthy',
    cellN: 0,
    statForm: 'mean_sd',
    isSkewed: false,
    higherIsWorse: true,
    stratifiedBy: ['age'],
    flags: [],
    active: true,
    appliedCount: 0,
  };
}

export function NormsScreen() {
  const { db, user, methods, scoring, persist } = useApp();
  const [norms, setNorms] = useState<Norm[]>([]);
  const [editing, setEditing] = useState<Norm | null>(null);
  const [filterMethod, setFilterMethod] = useState('');

  async function refresh() {
    if (db) setNorms(await normsRepo.listAll(db));
  }
  useEffect(() => {
    refresh();
  }, [db]);

  async function saveNorm(norm: Norm) {
    if (!db || !user) return;
    await normsRepo.save(
      db,
      { ...norm, enteredBy: norm.enteredBy ?? user.userId, enteredAt: norm.enteredAt ?? new Date().toISOString() },
      scoring,
    );
    await persist();
    await refresh();
    setEditing(null);
  }

  async function setStatus(norm: Norm, status: Norm['validationStatus']) {
    if (!db || !user) return;
    await normsRepo.save(
      db,
      {
        ...norm,
        validationStatus: status,
        validatedBy: status === 'validated' ? user.userId : norm.validatedBy,
        validatedAt: status === 'validated' ? new Date().toISOString() : norm.validatedAt,
      },
      scoring,
    );
    await persist();
    await refresh();
  }

  async function newVersion(norm: Norm) {
    if (!db) return;
    const v2 = await normsRepo.newVersion(db, norm, scoring);
    await persist();
    await refresh();
    setEditing(v2);
  }

  if (editing) {
    return (
      <NormForm
        norm={editing}
        onSave={saveNorm}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const visible = norms.filter((n) => !filterMethod || n.methodId === filterMethod);
  const methodName = (id: string) => methods.find((m) => m.methodId === id)?.name ?? id;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>База норм</h2>
        <button
          className="primary"
          onClick={() => {
            const m = methods[0];
            const metric = m ? comparableMetrics(m.config)[0] : undefined;
            setEditing({
              ...emptyNorm(m?.methodId ?? 'schulte', metric?.id ?? ''),
              higherIsWorse: metric?.higherIsWorse ?? true,
            });
          }}
        >
          + Новая норма
        </button>
      </div>
      <p className="muted">
        Норма участвует в подборе только со статусом «Проверена». Старые версии не удаляются.
      </p>

      <label className="field" style={{ maxWidth: 340 }}>
        <span>Фильтр по методике</span>
        <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
          <option value="">Все методики</option>
          {methods.map((m) => (
            <option key={m.methodId} value={m.methodId}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      {visible.length === 0 && <div className="empty">Норм пока нет. Добавьте первую из источника.</div>}
      {visible.map((n) => (
        <div key={`${n.normId}:${n.version}`} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{n.sourceRef || '(без источника)'}</strong>{' '}
              <span className="muted">v{n.version}{n.active ? '' : ' (неактивна)'}</span>
              <div className="muted">
                {methodName(n.methodId)} · показатель {n.metric} · возраст {n.ageMin}–{n.ageMax} · n ={' '}
                {n.cellN} · {STAT_FORM_LABELS[n.statForm]}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${n.qualityTier ?? 'unfit'}`}>
                {n.qualityTier ? QUALITY_TIER_LABELS[n.qualityTier] : '—'} · {n.qualityScore ?? '—'}/100
              </span>
              <br />
              <span className={`badge ${n.validationStatus}`} style={{ marginTop: 4 }}>
                {VALIDATION_STATUS_LABELS[n.validationStatus]}
              </span>
            </div>
          </div>
          {n.flags.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              {n.flags.map((f) => (
                <span key={f} className="badge flag">
                  {NORM_FLAG_LABELS[f]}
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="secondary" onClick={() => setEditing(n)}>
              Редактировать
            </button>
            {n.validationStatus === 'draft' && (
              <button className="primary" onClick={() => setStatus(n, 'validated')}>
                Валидировать
              </button>
            )}
            {n.validationStatus === 'draft' && (
              <button className="danger" onClick={() => setStatus(n, 'rejected')}>
                Отклонить
              </button>
            )}
            {n.validationStatus === 'validated' && n.active && (
              <button className="secondary" onClick={() => newVersion(n)}>
                Новая версия
              </button>
            )}
            {n.validationStatus === 'validated' && (
              <button className="secondary" onClick={() => setStatus(n, 'archived')}>
                В архив
              </button>
            )}
            <span className="muted">Применений: {n.appliedCount}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NormForm({
  norm,
  onSave,
  onCancel,
}: {
  norm: Norm;
  onSave: (n: Norm) => void;
  onCancel: () => void;
}) {
  const { methods, scoring } = useApp();
  const [n, setN] = useState<Norm>(norm);
  const [percText, setPercText] = useState(
    norm.percentiles ? Object.entries(norm.percentiles).map(([p, v]) => `${p}: ${v}`).join('\n') : '',
  );
  const [percError, setPercError] = useState('');

  const method = methods.find((m) => m.methodId === n.methodId);
  const metricOptions = method ? comparableMetrics(method.config) : [];

  // Показатель обязан принадлежать выбранной методике — иначе норма никогда
  // не попадёт в подбор
  useEffect(() => {
    if (metricOptions.length > 0 && !metricOptions.some((m) => m.id === n.metric)) {
      setN((prev) => ({ ...prev, metric: metricOptions[0].id, higherIsWorse: metricOptions[0].higherIsWorse }));
    }
  }, [n.methodId]);

  function parsePercentiles(text: string): Record<string, number> | undefined {
    const out: Record<string, number> = {};
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(/^(\d+(?:\.\d+)?)\s*[:=]\s*(-?\d+(?:[.,]\d+)?)$/);
      if (!m) throw new Error(`Строка «${t}» не в формате «перцентиль: значение»`);
      out[m[1]] = Number(m[2].replace(',', '.'));
    }
    return Object.keys(out).length ? out : undefined;
  }

  const set = (patch: Partial<Norm>) => setN({ ...n, ...patch });

  const quality = computeQuality(n, scoring);

  function submit() {
    let percentiles: Record<string, number> | undefined;
    try {
      percentiles = parsePercentiles(percText);
      setPercError('');
    } catch (e) {
      setPercError((e as Error).message);
      return;
    }
    onSave({ ...n, percentiles });
  }

  // Незаполненные обязательные поля — подсветка красным (запрос клинициста):
  // без неё легко не заметить пропущенный год и «зависнуть» на неактивной кнопке
  const missing = {
    sourceRef: !n.sourceRef.trim(),
    cellN: !(n.cellN > 0),
    ageRange: n.ageMin > n.ageMax,
    meanSd: n.statForm === 'mean_sd' && (n.mean === undefined || n.sd === undefined),
    year: n.dataCollectionYear === undefined && n.publicationYear === undefined,
  };
  const valid = !Object.values(missing).some(Boolean);

  return (
    <div>
      <h2>Карточка нормы {n.version > 1 ? `(версия ${n.version})` : ''}</h2>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Балл качества (пересчитывается сразу)</strong>
          <span className={`badge ${quality.tier}`}>
            {QUALITY_TIER_LABELS[quality.tier]} · {quality.total}/100
          </span>
        </div>
        <div className="muted">
          A (ячейка/стратификация): {quality.a} · B (мера разброса): {quality.b} · C (процедура):{' '}
          {quality.c} · D (свежесть): {quality.d} · E (источник): {quality.e}
        </div>
        {quality.flags.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            {quality.flags.map((f) => (
              <span key={f} className="badge flag">
                {NORM_FLAG_LABELS[f]}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Источник</h3>
        <label className={`field${missing.sourceRef ? ' missing' : ''}`}>
          <span>Библиография / DOI / выходные данные *</span>
          <input value={n.sourceRef} onChange={(e) => set({ sourceRef: e.target.value })} />
        </label>
        <div className="grid3">
          <label className="field">
            <span>Тип источника</span>
            <select value={n.sourceType} onChange={(e) => set({ sourceType: e.target.value as SourceType })}>
              {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className={`field${missing.year ? ' missing' : ''}`}>
            <span>Год сбора данных *</span>
            <input
              type="number"
              value={n.dataCollectionYear ?? ''}
              onChange={(e) => set({ dataCollectionYear: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className={`field${missing.year ? ' missing' : ''}`}>
            <span>Год публикации * (нужен хотя бы один из годов)</span>
            <input
              type="number"
              value={n.publicationYear ?? ''}
              onChange={(e) => set({ publicationYear: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Методика и показатель</h3>
        <div className="grid3">
          <label className="field">
            <span>Методика</span>
            <select
              value={n.methodId}
              onChange={(e) => {
                const mid = e.target.value;
                const m = methods.find((x) => x.methodId === mid);
                const metrics = m ? comparableMetrics(m.config) : [];
                set({ methodId: mid, metric: metrics[0]?.id ?? '' });
              }}
            >
              {methods.map((m) => (
                <option key={m.methodId} value={m.methodId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Показатель</span>
            <select
              value={n.metric}
              onChange={(e) => {
                const metric = metricOptions.find((x) => x.id === e.target.value);
                set({ metric: e.target.value, higherIsWorse: metric?.higherIsWorse ?? n.higherIsWorse });
              }}
            >
              {metricOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.id})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Идентичность процедуры</span>
            <select
              value={n.procedureMatch}
              onChange={(e) => set({ procedureMatch: e.target.value as ProcedureMatch })}
            >
              {Object.entries(PROCEDURE_MATCH_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Заметки о процедуре (для проверки идентичности)</span>
          <input value={n.procedureNotes ?? ''} onChange={(e) => set({ procedureNotes: e.target.value })} />
        </label>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Популяция (вход допуска)</h3>
        <div className="grid3">
          <label className={`field${missing.ageRange ? ' missing' : ''}`}>
            <span>Возраст от *</span>
            <input type="number" value={n.ageMin} onChange={(e) => set({ ageMin: Number(e.target.value) })} />
          </label>
          <label className={`field${missing.ageRange ? ' missing' : ''}`}>
            <span>Возраст до *</span>
            <input type="number" value={n.ageMax} onChange={(e) => set({ ageMax: Number(e.target.value) })} />
          </label>
          <label className={`field${missing.cellN ? ' missing' : ''}`}>
            <span>Размер этой ячейки (n) *</span>
            <input type="number" value={n.cellN || ''} onChange={(e) => set({ cellN: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Образовательная страта</span>
            <select
              value={n.educationLevel}
              onChange={(e) => set({ educationLevel: e.target.value as Education | 'not_stratified' })}
            >
              <option value="not_stratified">Не стратифицировано</option>
              {Object.entries(EDUCATION_LABELS)
                .filter(([k]) => k !== 'unknown')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Язык стимульного материала</span>
            <select value={n.language} onChange={(e) => set({ language: e.target.value })}>
              <option value="ru">Русский</option>
              <option value="en">Английский</option>
              <option value="other">Другой</option>
            </select>
          </label>
          <label className="field">
            <span>Клинический статус выборки</span>
            <select
              value={n.clinicalStatus}
              onChange={(e) => set({ clinicalStatus: e.target.value as Norm['clinicalStatus'] })}
            >
              <option value="healthy">Условно здоровые</option>
              <option value="clinical_group">Клиническая группа</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ gap: 18 }}>
          {['age', 'education', 'sex'].map((s) => (
            <label key={s} className="row" style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={n.stratifiedBy.includes(s)}
                onChange={(e) =>
                  set({
                    stratifiedBy: e.target.checked
                      ? [...n.stratifiedBy, s]
                      : n.stratifiedBy.filter((x) => x !== s),
                  })
                }
              />
              Стратифицирована по: {s === 'age' ? 'возрасту' : s === 'education' ? 'образованию' : 'полу'}
            </label>
          ))}
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          <span>Общий размер исследования (справочно)</span>
          <input
            type="number"
            value={n.totalStudyN ?? ''}
            onChange={(e) => set({ totalStudyN: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Статистика нормы</h3>
        <div className="grid3">
          <label className="field">
            <span>Форма данных</span>
            <select value={n.statForm} onChange={(e) => set({ statForm: e.target.value as StatForm })}>
              {Object.entries(STAT_FORM_LABELS)
                .filter(([k]) => k !== 'qualitative_rubric')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
          <label className={`field${missing.meanSd && n.mean === undefined ? ' missing' : ''}`}>
            <span>Среднее (M){n.statForm === 'mean_sd' ? ' *' : ''}</span>
            <input
              type="number"
              step="any"
              value={n.mean ?? ''}
              onChange={(e) => set({ mean: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className={`field${missing.meanSd && n.sd === undefined ? ' missing' : ''}`}>
            <span>Стандартное отклонение (SD){n.statForm === 'mean_sd' ? ' *' : ''}</span>
            <input
              type="number"
              step="any"
              value={n.sd ?? ''}
              onChange={(e) => set({ sd: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>
        <label className="field">
          <span>Перцентили (по строке «перцентиль: значение», например «25: 40»)</span>
          <textarea rows={4} value={percText} onChange={(e) => setPercText(e.target.value)} />
        </label>
        {percError && <div className="warn">{percError}</div>}
        <div className="row" style={{ gap: 18 }}>
          <label className="row" style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={n.isSkewed}
              onChange={(e) => set({ isSkewed: e.target.checked })}
            />
            Распределение скошено (типично для времени)
          </label>
          <label className="row" style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={n.higherIsWorse}
              onChange={(e) => set({ higherIsWorse: e.target.checked })}
            />
            Больше = хуже (направление шкалы)
          </label>
        </div>
      </div>

      <div className="row">
        <button className="primary" disabled={!valid} onClick={submit}>
          Сохранить норму
        </button>
        <button className="secondary" onClick={onCancel}>
          Отмена
        </button>
      </div>
      {!valid && (
        <div className="missing-hint">
          Заполните обязательные поля, помеченные красным
          {missing.ageRange ? ' («возраст от» не может быть больше «возраст до»)' : ''}.
        </div>
      )}
    </div>
  );
}
