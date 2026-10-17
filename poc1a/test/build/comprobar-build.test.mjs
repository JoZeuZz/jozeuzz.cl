// Prueba unitaria de la comprobación del build (POC-3 U7): usa un árbol de build ficticio creado en un directorio
// temporal; no necesita Docker ni un build real. Ejecución: `node --test test/build/comprobar-build.test.mjs` desde poc1a/.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { comprobarBuild } from './comprobar-build.mjs'

const FUENTES = ['fallos', 'log', 'manejador']
const hace = (segundos) => new Date(Date.now() - segundos * 1000)

/** Árbol válido: build posterior a las fuentes, positivos presentes y marcadores ausentes. */
function crearArbol({ js = 'x="mensaje omitido";y="campos_no_permitidos"', map = { sources: ['../../../src/lib/intake/fallos.ts'] }, edadBuild = 10, edadFuentes = 100 } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'comprobar-build-'))
  fs.mkdirSync(path.join(raiz, 'src/lib/intake'), { recursive: true })
  for (const nombre of FUENTES) {
    const ruta = path.join(raiz, `src/lib/intake/${nombre}.ts`)
    fs.writeFileSync(ruta, '// fuente')
    fs.utimesSync(ruta, hace(edadFuentes), hace(edadFuentes))
  }
  fs.mkdirSync(path.join(raiz, '.next-prod/server/chunks'), { recursive: true })
  fs.writeFileSync(path.join(raiz, '.next-prod/BUILD_ID'), 'abc')
  fs.utimesSync(path.join(raiz, '.next-prod/BUILD_ID'), hace(edadBuild), hace(edadBuild))
  fs.writeFileSync(path.join(raiz, '.next-prod/server/chunks/a.js'), js)
  if (map) fs.writeFileSync(path.join(raiz, '.next-prod/server/chunks/a.js.map'), JSON.stringify(map))
  return raiz
}

test('build actual con positivos y sin marcadores: sin problemas', () => {
  assert.deepEqual(comprobarBuild(crearArbol()), [])
})

test('build más viejo que una fuente de intake: falla', () => {
  const problemas = comprobarBuild(crearArbol({ edadBuild: 500, edadFuentes: 100 }))
  assert.ok(problemas.length >= 1)
  for (const problema of problemas) assert.match(problema, /obsoleto/)
})

test('marcador en un .js: falla', () => {
  const problemas = comprobarBuild(crearArbol({ js: 'x="mensaje omitido";y="campos_no_permitidos";z="intake-pg-check"' }))
  assert.equal(problemas.length, 1)
  assert.match(problemas[0], /intake-pg-check/)
})

test('marcador sólo en el .map: pasa', () => {
  const raiz = crearArbol()
  fs.writeFileSync(path.join(raiz, '.next-prod/server/chunks/a.js.map'), JSON.stringify({ sources: ['../../../src/lib/intake/fallos.ts'], sourcesContent: ["'intake-log-crudo' 'intake-fuera'"] }))
  assert.deepEqual(comprobarBuild(raiz), [])
})

test('sin el literal positivo de log.ts: falla', () => {
  const problemas = comprobarBuild(crearArbol({ js: 'y="campos_no_permitidos"' }))
  assert.equal(problemas.length, 1)
  assert.match(problemas[0], /mensaje omitido/)
})

test('sin el literal positivo del manejador: falla', () => {
  const problemas = comprobarBuild(crearArbol({ js: 'x="mensaje omitido"' }))
  assert.equal(problemas.length, 1)
  assert.match(problemas[0], /campos_no_permitidos/)
})

test('hay .map pero ninguno lista fallos.ts: falla', () => {
  const problemas = comprobarBuild(crearArbol({ map: { sources: ['../../../src/lib/intake/log.ts'] } }))
  assert.equal(problemas.length, 1)
  assert.match(problemas[0], /fallos\.ts/)
})

test('el build no emite .map de servidor: pasa con BUILD_ID y literales positivos', () => {
  assert.deepEqual(comprobarBuild(crearArbol({ map: null })), [])
})

test('sin .next-prod/server: falla', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'comprobar-build-vacio-'))
  const problemas = comprobarBuild(raiz)
  assert.equal(problemas.length, 1)
  assert.match(problemas[0], /falta .*\.next-prod\/server/)
})

test('sin BUILD_ID: falla', () => {
  const raiz = crearArbol()
  fs.rmSync(path.join(raiz, '.next-prod/BUILD_ID'))
  assert.ok(comprobarBuild(raiz).some((p) => /BUILD_ID/.test(p)))
})
