// Regla de la Local API: en la web pública sólo se accede a Payload a través de src/lib/publico.ts,
// y allí cada llamada lleva `overrideAccess: false` literal (el valor por defecto de la Local API es true).
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(__dirname, '../..')
const src = path.join(raiz, 'src')

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? archivos(p) : /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) ? [p] : []
  })
}

const publicos = [...archivos(path.join(src, 'app/(frontend)')), path.join(src, 'app/sitemap.ts')].filter((f) => fs.existsSync(f))
const publico = path.join(src, 'lib/publico.ts')

function recorrer(nodo: ts.Node, visita: (n: ts.Node) => void) {
  visita(nodo)
  ts.forEachChild(nodo, (h) => recorrer(h, visita))
}

/** Violaciones de la regla para un texto de módulo público (exportada para poder probarla). */
export function violacionesPublicas(f: string, texto: string): string[] {
  const sf = ts.createSourceFile(f, texto, ts.ScriptTarget.ES2022, true)
  const v: string[] = []
  for (const s of sf.statements) {
    if (ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && /^use (client|server)$/.test(s.expression.text)) {
      v.push(`directiva '${s.expression.text}'`)
    }
  }
  recorrer(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const m = n.moduleSpecifier.text
      if (m === 'payload' || m.startsWith('payload/') || m === '@payload-config' || m.includes('payload.config')) {
        v.push(`importa «${m}» (sólo se permite vía src/lib/publico.ts)`)
      }
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'getPayload') v.push('llama a getPayload')
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require') v.push('usa require')
  })
  return v
}

/** Violaciones en publico.ts: cada payload.<op>(…) lleva overrideAccess:false y nada de showHiddenFields. */
export function violacionesPublico(texto: string): string[] {
  const sf = ts.createSourceFile('publico.ts', texto, ts.ScriptTarget.ES2022, true)
  const v: string[] = []
  recorrer(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return
    const objeto = n.expression.expression
    if (!ts.isIdentifier(objeto) || objeto.text !== 'payload') return
    const op = n.expression.name.text
    if (op === 'auth') return
    const arg = n.arguments[0]
    const props: readonly ts.ObjectLiteralElementLike[] = arg && ts.isObjectLiteralExpression(arg) ? arg.properties : []
    const prop = (nombre: string) =>
      props.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === nombre)
    if (props.some((p) => ts.isSpreadAssignment(p))) v.push(`payload.${op}: no se permite spread en los argumentos`)
    const oa = prop('overrideAccess')
    if (!oa || oa.initializer.kind !== ts.SyntaxKind.FalseKeyword) v.push(`payload.${op}: falta overrideAccess: false literal`)
    if (prop('showHiddenFields')) v.push(`payload.${op}: showHiddenFields prohibido`)
  })
  return v
}

describe('regla de la Local API (estática)', () => {
  it('hay rutas públicas que analizar y existe publico.ts', () => {
    expect(publicos.length).toBeGreaterThanOrEqual(6)
    expect(fs.existsSync(publico)).toBe(true)
  })

  it('las rutas públicas no importan payload ni usan directivas de cliente/servidor', () => {
    const todas = publicos.flatMap((f) => violacionesPublicas(f, fs.readFileSync(f, 'utf8')).map((m) => `${path.relative(raiz, f)}: ${m}`))
    expect(todas).toEqual([])
  })

  it('publico.ts: cada llamada payload.<op> lleva overrideAccess:false', () => {
    expect(violacionesPublico(fs.readFileSync(publico, 'utf8'))).toEqual([])
  })

  it('el analizador detecta infracciones sintéticas', () => {
    expect(violacionesPublico('payload.find({ collection: "proyectos" })')).toHaveLength(1)
    expect(violacionesPublico('payload.find({ overrideAccess: true })')).toHaveLength(1)
    expect(violacionesPublico('payload.find({ overrideAccess: false, showHiddenFields: true })')).toHaveLength(1)
    expect(violacionesPublico('payload.find({ ...a, overrideAccess: false })')).toHaveLength(1)
    expect(violacionesPublico('payload.find({ overrideAccess: false })')).toEqual([])
    expect(violacionesPublicas('x.tsx', `'use client'\nimport { getPayload } from 'payload'\ngetPayload({})`)).toHaveLength(3)
    expect(violacionesPublicas('x.tsx', `import { f } from '@/lib/publico'`)).toEqual([])
  })
})
