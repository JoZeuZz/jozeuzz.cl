import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const requerir = createRequire(path.join(raiz, 'package.json'))

type Escribir = (
  typescriptVersion: string,
  tsConfigPath: string,
  isFirstTimeSetup: boolean,
  hasAppDir: boolean,
  distDir: string,
  hasPagesDir: boolean,
  strictRouteTypes: boolean,
) => Promise<void>

// Función real de Next (la que ejecutan `next dev` y `next build`: lib/verify-typescript-setup.js:195).
const { writeConfigurationDefaults } = requerir(path.join(raiz, 'node_modules/next/dist/lib/typescript/writeConfigurationDefaults.js')) as {
  writeConfigurationDefaults: Escribir
}
const { version: versionTs } = requerir(path.join(raiz, 'node_modules/typescript/package.json')) as { version: string }

// Mismas opciones que verify-typescript-setup.js para este proyecto (app router, sin pages, sin strictRouteTypes);
// distDir dev efectivo = <distDir>/dev (como en next-env-contenedor.test.ts).
// type-paths.js decide los globs de tipos según NODE_ENV en el momento de la llamada:
// `next dev` corre con 'development'; `next build`, con 'production'.
async function ejecutar(modo: 'dev' | 'build', distDir: string, tsconfig: string): Promise<{ despues: string; mtimeIgual: boolean }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'jz-tsconfig-'))
  const env = process.env as Record<string, string | undefined>
  const previo = env.NODE_ENV
  try {
    const destino = path.join(tmp, 'tsconfig.json')
    await writeFile(destino, tsconfig, { mode: 0o644 })
    const antes = await stat(destino)
    env.NODE_ENV = modo === 'dev' ? 'development' : 'production'
    await writeConfigurationDefaults(versionTs, destino, false, true, distDir, false, false)
    const despues = await stat(destino)
    return { despues: await readFile(destino, 'utf8'), mtimeIgual: despues.mtimeMs === antes.mtimeMs }
  } finally {
    if (previo === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previo
    await rm(tmp, { recursive: true, force: true })
  }
}

describe('tsconfig.json es punto fijo de writeConfigurationDefaults (raíz /app de sólo lectura)', () => {
  for (const [modo, distDir] of [['dev', '.next/dev'], ['build', '.next-prod']] as const) {
    it(`Next no reescribe poc1a/tsconfig.json en ${modo} (${distDir})`, async () => {
      const real = await readFile(path.join(raiz, 'tsconfig.json'), 'utf8')
      const r = await ejecutar(modo, distDir, real)
      expect(r.despues).toBe(real)
      expect(r.mtimeIgual).toBe(true)
    })
  }

  it('control: la misma función sí reescribe un tsconfig al que le falta un glob de tipos (la prueba detecta cambios)', async () => {
    const real = await readFile(path.join(raiz, 'tsconfig.json'), 'utf8')
    const mutado = real.replace('".next-prod/types/**/*.ts",', '')
    expect(mutado).not.toBe(real)
    const r = await ejecutar('build', '.next-prod', mutado)
    expect(r.despues).not.toBe(mutado)
  })
})
