import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  // .env sólo lo lee compose; vite no debe abrirlo (en el contenedor no es legible).
  envDir: false,
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // Aislamiento: schema y directorio de medios propios de las pruebas.
    env: { POC_DB_SCHEMA: 'poc_test', POC_MEDIA_DIR: '/app/media-store-test' },
    // Las pruebas de integración comparten una base: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
