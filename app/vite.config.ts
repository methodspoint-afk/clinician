import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // sql.js подгружает wasm-файл; отдаём его как ассет
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  build: {
    target: 'es2021',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as never);
