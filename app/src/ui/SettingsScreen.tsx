import { useRef, useState } from 'react';
import { useApp } from '../store';
import { settingsRepo } from '../db/repositories';
import { DEFAULT_SCORING_CONFIG, ScoringConfig } from '../domain/normSelection/score';
import { SqlJsAdapter, migrate } from '../db/database';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export function SettingsScreen() {
  const { db, scoring, refreshScoring, init, persist } = useApp();
  const [text, setText] = useState(JSON.stringify(scoring, null, 2));
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveScoring() {
    if (!db) return;
    try {
      const cfg = JSON.parse(text) as ScoringConfig;
      await settingsRepo.setScoring(db, cfg);
      await persist();
      await refreshScoring();
      setMessage('Веса сохранены. Баллы норм пересчитаются при следующем их сохранении и при подборе.');
    } catch (e) {
      setMessage(`Ошибка: ${(e as Error).message}`);
    }
  }

  async function exportBackup() {
    if (!db) return;
    const bytes = await db.exportBytes();
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clinician-backup-${new Date().toISOString().slice(0, 10)}.sqlite`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importBackup(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const restored = await SqlJsAdapter.open({
      locateWasm: () => wasmUrl,
      storage: window.localStorage,
      initialBytes: bytes,
    });
    await migrate(restored);
    await restored.persist();
    await init(restored);
    setMessage('Резервная копия восстановлена.');
  }

  return (
    <div>
      <h2>Настройки</h2>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Веса скоринга качества норм</h3>
        <p className="muted">
          Стартовая калибровочная точка из ТЗ. Схема рассчитана на несколько итераций на живом
          материале: проверяйте, не доминирует ли один критерий и не отсекается ли систематически
          русскоязычная классика.
        </p>
        <textarea
          rows={14}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={saveScoring}>
            Сохранить веса
          </button>
          <button
            className="secondary"
            onClick={() => setText(JSON.stringify(DEFAULT_SCORING_CONFIG, null, 2))}
          >
            Вернуть значения по умолчанию
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Резервная копия</h3>
        <p className="muted">
          Все данные хранятся локально на этом устройстве. Регулярно сохраняйте резервную копию в
          надёжное место.
        </p>
        <div className="row">
          <button className="primary" onClick={exportBackup}>
            Скачать резервную копию
          </button>
          <button className="secondary" onClick={() => fileRef.current?.click()}>
            Восстановить из файла…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".sqlite"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])}
          />
        </div>
      </div>

      {message && <div className="warn">{message}</div>}
    </div>
  );
}
