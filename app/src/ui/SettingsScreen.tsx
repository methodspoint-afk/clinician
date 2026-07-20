import { useRef, useState } from 'react';
import { useApp } from '../store';
import { settingsRepo } from '../db/repositories';
import { DEFAULT_SCORING_CONFIG, ScoringConfig } from '../domain/normSelection/score';
import { BackupInfo, SqlJsAdapter, inspectBackup, migrate } from '../db/database';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export function SettingsScreen() {
  const { db, scoring, refreshScoring, init, persist } = useApp();
  const [text, setText] = useState(JSON.stringify(scoring, null, 2));
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Ожидающее подтверждения восстановление: проверенный файл + сводка содержимого
  const [pending, setPending] = useState<{ bytes: Uint8Array; info: BackupInfo } | null>(null);
  const [restoring, setRestoring] = useState(false);

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

  async function downloadCurrent(prefix = 'clinician-backup') {
    if (!db) return;
    const bytes = await db.exportBytes();
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.sqlite`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportBackup() {
    await downloadCurrent();
    setMessage('Резервная копия скачана. Храните её в надёжном месте (не только на этом устройстве).');
  }

  // Шаг 1: проверяем выбранный файл, НЕ трогая текущие данные
  async function pickRestoreFile(file: File) {
    setMessage('');
    setPending(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await inspectBackup(bytes, { locateWasm: () => wasmUrl });
    if (!res.ok) {
      setMessage(`Восстановление отменено: ${res.error}`);
      return;
    }
    setPending({ bytes, info: res.info });
  }

  // Шаг 2: по подтверждению — сперва страховочная копия текущей базы, потом замена
  async function confirmRestore() {
    if (!pending) return;
    setRestoring(true);
    try {
      await downloadCurrent('clinician-ДО-восстановления');
      const restored = await SqlJsAdapter.open({
        locateWasm: () => wasmUrl,
        storage: window.localStorage,
        initialBytes: pending.bytes,
      });
      await migrate(restored);
      await restored.persist();
      await init(restored);
      setPending(null);
      setMessage(
        'Резервная копия восстановлена. Страховочная копия прежних данных скачана. ' +
          'Рекомендуется перезагрузить страницу.',
      );
    } catch (e) {
      setMessage(`Не удалось восстановить: ${String(e)}. Текущие данные не изменены.`);
    } finally {
      setRestoring(false);
    }
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
          Все данные хранятся локально в этом браузере. Если очистить данные браузера или сменить
          устройство — данные пропадут. Регулярно сохраняйте копию в надёжное место (облако, флешка).
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
            onChange={(e) => {
              if (e.target.files?.[0]) pickRestoreFile(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>

        {pending && (
          <div className="warn big" style={{ marginTop: 12 }}>
            <strong>Подтвердите восстановление.</strong> Выбранная копия содержит:{' '}
            {pending.info.subjects} испытуемых, {pending.info.results} обследований,{' '}
            {pending.info.norms} норм, {pending.info.methods} методик.
            <div style={{ marginTop: 6 }}>
              Все текущие данные в этом браузере будут заменены. Перед заменой автоматически
              скачается страховочная копия нынешних данных.
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="danger" disabled={restoring} onClick={confirmRestore}>
                Скачать страховочную копию и восстановить
              </button>
              <button className="secondary" disabled={restoring} onClick={() => setPending(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      {message && <div className="warn">{message}</div>}
    </div>
  );
}
