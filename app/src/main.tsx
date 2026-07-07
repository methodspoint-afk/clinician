import React from 'react';
import ReactDOM from 'react-dom/client';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SqlJsAdapter, migrate } from './db/database';
import { methodsRepo, normsRepo, settingsRepo } from './db/repositories';
import { useApp } from './store';
import { App } from './ui/App';
import './ui/styles.css';

// В песочницах (например, демо-страница) localStorage может быть недоступен —
// тогда работаем без сохранения между перезагрузками
function safeStorage(): Storage | null {
  try {
    window.localStorage.getItem('');
    return window.localStorage;
  } catch {
    return null;
  }
}

async function bootstrap() {
  const db = await SqlJsAdapter.open({
    locateWasm: () => wasmUrl,
    storage: safeStorage(),
  });
  await migrate(db);
  await methodsRepo.seedIfEmpty(db);
  await normsRepo.seedIfEmpty(db, await settingsRepo.getScoring(db));
  await db.persist();
  await useApp.getState().init(db);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap().catch((e) => {
  document.getElementById('root')!.innerHTML =
    `<p style="padding:2rem;font-family:sans-serif">Ошибка запуска приложения: ${String(e)}</p>`;
});
