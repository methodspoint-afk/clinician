// Сборка демо-версии одним HTML-файлом (все ассеты, включая wasm, инлайнятся).
// Используется для публикации демонстрации без установки чего-либо.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2021',
    outDir: 'dist-demo',
    assetsInlineLimit: 100_000_000, // wasm уходит в data: URI
  },
  optimizeDeps: {
    exclude: ['sql.js'],
  },
});
