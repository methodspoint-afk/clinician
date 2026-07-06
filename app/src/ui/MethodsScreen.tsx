import { useState } from 'react';
import { useApp } from '../store';
import { methodsRepo } from '../db/repositories';
import { Method, MethodConfig } from '../domain/types';
import { comparableMetrics } from '../domain/formulas/derive';

export function MethodsScreen() {
  const { db, methods, refreshMethods, persist } = useApp();
  const [editing, setEditing] = useState<Method | null>(null);
  const [configText, setConfigText] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  function startEdit(m: Method) {
    setEditing(m);
    setName(m.name);
    setConfigText(JSON.stringify(m.config, null, 2));
    setError('');
  }

  function startNew() {
    const m: Method = {
      methodId: `custom_${Date.now().toString(36)}`,
      name: 'Новая методика',
      measureType: 'quantitative',
      isActive: true,
      config: {
        measures: [{ id: 'value', label: 'Значение', type: 'number', min: 0 }],
        derived: [],
        compareMeasures: [{ id: 'value', higherIsWorse: true }],
        gate: { educationMismatch: 'flag', languageMismatch: 'flag' },
      },
    };
    startEdit(m);
  }

  async function save() {
    if (!db || !editing) return;
    let config: MethodConfig;
    try {
      config = JSON.parse(configText) as MethodConfig;
      if (!Array.isArray(config.measures) || !Array.isArray(config.derived) || !config.gate) {
        throw new Error('В конфигурации должны быть поля measures, derived и gate');
      }
    } catch (e) {
      setError(`Ошибка в конфигурации: ${(e as Error).message}`);
      return;
    }
    await methodsRepo.upsert(db, { ...editing, name: name.trim() || editing.name, config });
    await persist();
    await refreshMethods();
    setEditing(null);
  }

  if (editing) {
    let preview: MethodConfig | null = null;
    try {
      preview = JSON.parse(configText) as MethodConfig;
    } catch {
      preview = null;
    }
    return (
      <div>
        <h2>Методика: {name}</h2>
        <p className="muted">
          Методика описывается конфигурацией: замеры, формулы производных показателей и настройки
          допуска. Изменение кода не требуется — так закладывается добавление новых методик.
        </p>
        <div className="card">
          <label className="field">
            <span>Название</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Конфигурация (JSON)</span>
            <textarea
              rows={18}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
            />
          </label>
          {error && <div className="warn">{error}</div>}
          {preview && (
            <div className="muted">
              Предпросмотр: замеров — {preview.measures?.length ?? 0}; формул — {preview.derived?.length ?? 0};
              сравнивается с нормой — {(() => {
                try {
                  return comparableMetrics(preview!).map((m) => m.id).join(', ') || '—';
                } catch {
                  return '—';
                }
              })()}
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={save}>
              Сохранить
            </button>
            <button className="secondary" onClick={() => setEditing(null)}>
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Методики</h2>
        <button className="primary" onClick={startNew}>
          + Новая методика
        </button>
      </div>
      {methods.map((m) => (
        <div key={m.methodId} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{m.name}</strong>
              <div className="muted">
                Замеров: {m.config.measures.length} · формул: {m.config.derived.filter((d) => d.expr).length} ·
                сравнивается с нормой: {comparableMetrics(m.config).map((x) => x.id).join(', ')}
              </div>
              <div className="muted">
                Допуск: образование — {m.config.gate.educationMismatch === 'fail' ? 'жёсткий отсев' : 'предупреждение'};
                язык — {m.config.gate.languageMismatch === 'fail' ? 'жёсткий отсев' : 'предупреждение'}
              </div>
            </div>
            <button className="secondary" onClick={() => startEdit(m)}>
              Редактировать
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
