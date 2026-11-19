
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],



    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**/*.ts',
        'src/aplicacion/servicio.ts',
        'src/aplicacion/sincronizacion.ts',
        'src/infra/repositorio.ts',
      ],
      exclude: ['**/__tests__/**', 'src/domain/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
