import React from 'react';
import ReactDOM from 'react-dom/client';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SqlJsAdapter, migrate } from './db/database';
import { methodsRepo } from './db/repositories';
import { useApp } from './store';
import { App } from './ui/App';
import './ui/styles.css';

async function bootstrap() {
  const db = await SqlJsAdapter.open({
    locateWasm: () => wasmUrl,
    storage: window.localStorage,
  });
  await migrate(db);
  await methodsRepo.seedIfEmpty(db);
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
