/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node', // las pruebas del repositorio usan fake-indexeddb, no necesitan DOM
    include: ['src/**/*.test.{ts,tsx}'],
  },
});