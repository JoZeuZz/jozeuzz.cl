import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const requerir = createRequire(path.join(raiz, 'package.json'))

type Opciones = {
  baseDir: string
  distDir: string
  imageImportsEnabled: boolean
  hasPagesDir: boolean
  hasAppDir: boolean
  strictRouteTypes: boolean
  typedRoutes: boolean
}
type Escritor = { writeAppTypeDeclarations(opciones: Opciones): Promise<void> }

// Función real de Next (la que ejecutan `next dev` y `next build`: lib/verify-typescript-setup.js).
const { writeAppTypeDeclarations } = requerir(path.join(raiz, 'node_modules/next/dist/lib/typescript/writeAppTypeDeclarations.js')) as Escritor

// Opciones tal como Next las deriva de este proyecto (next.config.ts y árbol real):
//  - dev: distDir efectivo = <distDir>/dev (server/config.js: result.distDir = join(result.distDir, 'dev'))
//  - build con POC_DIST_DIR=.next-prod: distDir = .next-prod
async function opciones(baseDir: string, distDir: string): Promise<Opciones> {
  const config = await readFile(path.join(raiz, 'next.config.ts'), 'utf8')
  expect(config, 'sin typedRoutes').not.toMatch(/typedRoutes/)
  expect(config, 'sin strictRouteTypes').not.toMatch(/strictRouteTypes/)
  expect(config, 'imágenes estáticas habilitadas').not.toMatch(/disableStaticImages/)
  expect(config).toContain("distDir: process.env.POC_DIST_DIR ?? '.next'")
  return {
    baseDir,
    distDir,
    imageImportsEnabled: true,
    hasPagesDir: existsSync(path.join(raiz, 'src/pages')) || existsSync(path.join(raiz, 'pages')),
    hasAppDir: existsSync(path.join(raiz, 'src/app')),
    strictRouteTypes: false,
    typedRoutes: false,
  }
}

async function generado(distDir: string): Promise<Buffer> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'jz-next-env-'))
  try {
    await writeAppTypeDeclarations(await opciones(tmp, distDir))
    return await readFile(path.join(tmp, 'next-env.d.ts'))
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

describe('next-env.d.ts de contenedor (raíz /app de sólo lectura)', () => {
  it('el árbol real es app-router sin pages', () => {
    expect(existsSync(path.join(raiz, 'src/app'))).toBe(true)
    expect(existsSync(path.join(raiz, 'src/pages'))).toBe(false)
    expect(existsSync(path.join(raiz, 'pages'))).toBe(false)
  })

  it('next-env.dev.txt coincide byte a byte con la salida de Next en dev', async () => {
    const esperado = await generado('.next/dev')
    expect(esperado.toString('utf8')).toContain('import "./.next/dev/types/routes.d.ts";')
    const real = await readFile(path.join(raiz, 'contenedor/next-env.dev.txt'))
    expect(real.equals(esperado)).toBe(true)
  })

  it('next-env.prod.txt coincide byte a byte con la salida de Next en build', async () => {
    const esperado = await generado('.next-prod')
    expect(esperado.toString('utf8')).toContain('import "./.next-prod/types/routes.d.ts";')
    const real = await readFile(path.join(raiz, 'contenedor/next-env.prod.txt'))
    expect(real.equals(esperado)).toBe(true)
  })

  it('Next no reescribe el archivo cuando ya contiene el contenido de contenedor', async () => {
    for (const [archivo, distDir] of [['next-env.dev.txt', '.next/dev'], ['next-env.prod.txt', '.next-prod']] as const) {
      const tmp = await mkdtemp(path.join(os.tmpdir(), 'jz-next-env-'))
      try {
        const destino = path.join(tmp, 'next-env.d.ts')
        const contenido = await readFile(path.join(raiz, 'contenedor', archivo))
        await writeFile(destino, contenido, { mode: 0o444 })
        const antes = await stat(destino)
        await writeAppTypeDeclarations(await opciones(tmp, distDir))
        const despues = await stat(destino)
        expect(despues.mtimeMs, archivo).toBe(antes.mtimeMs)
        expect((await readFile(destino)).equals(contenido), archivo).toBe(true)
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    }
  })
})
