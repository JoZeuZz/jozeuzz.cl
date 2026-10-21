import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

import type { postgresAdapter } from '@payloadcms/db-postgres'

// Defecto: el pushSchema pg de drizzle-kit 0.31.7 descarta los parámetros de db.query(sql, params).
// La introspección de PK compuesta usa «$1::regnamespace» y falla con 42P02 (drizzle-orm#5557, payload#12858).
// Esta corrección está atada a la versión y a la huella de api.js: ante cualquier cambio falla cerrado.
export const VERSION_DRIZZLE_KIT = '0.31.7'
export const HUELLA_API_JS = 'c87f9e8db2d4948521fd557d8f3945d4e4db482b06d5a2305dd51cdc410b0574'

export const BLOQUE_ORIGINAL = [
  '  const db2 = {',
  '    query: async (query, params) => {',
  '      const res = await drizzleInstance.execute(sql3.raw(query));',
  '      return res.rows;',
  '    }',
  '  };',
].join('\n')

export const BLOQUE_SUSTITUTO = [
  '  const db2 = {',
  '    query: async (query, params) => __jzConsultaPg(drizzleInstance, sql3, query, params)',
  '  };',
].join('\n')

const INDICACION = 'Revisa si el defecto persiste en la nueva versión de drizzle-kit y actualiza o retira esta corrección.'

export function comprobarVersion(version: unknown): void {
  if (version !== VERSION_DRIZZLE_KIT) {
    throw new Error(`correccion_push_version_inesperada: drizzle-kit ${String(version)}, se esperaba ${VERSION_DRIZZLE_KIT}. ${INDICACION}`)
  }
}

export function comprobarHuella(bytes: Uint8Array): void {
  const huella = createHash('sha256').update(bytes).digest('hex')
  if (huella !== HUELLA_API_JS) {
    throw new Error(`correccion_push_huella_inesperada: api.js tiene sha256 ${huella}, se esperaba ${HUELLA_API_JS}. ${INDICACION}`)
  }
}

export function corregirFuente(fuente: string): string {
  const apariciones = fuente.split(BLOQUE_ORIGINAL).length - 1
  if (apariciones !== 1) {
    throw new Error(`correccion_push_patron_inesperado: el bloque pg aparece ${apariciones} veces, se esperaba 1. ${INDICACION}`)
  }
  return fuente.replace(BLOQUE_ORIGINAL, () => BLOQUE_SUSTITUTO)
}

type FilasPg = { rows: unknown[] }
type SqlTag = { raw: (texto: string) => unknown }
type InstanciaDrizzle = {
  execute: (consulta: never) => Promise<FilasPg>
  $client?: unknown
}

// Sin parámetros: comportamiento original de drizzle-kit. Con parámetros: directo al Pool de pg.
export async function consultaPg(
  instancia: InstanciaDrizzle,
  sql: SqlTag,
  consulta: string,
  params?: unknown[],
): Promise<unknown[]> {
  if (!params || params.length === 0) {
    const resultado = await instancia.execute(sql.raw(consulta) as never)
    return resultado.rows
  }
  const cliente = instancia.$client as { query?: unknown } | undefined
  if (typeof cliente?.query !== 'function') {
    throw new Error('correccion_push_sin_cliente: la consulta tiene parámetros y drizzle no expone $client.query')
  }
  const resultado = (await cliente.query(consulta, params)) as FilasPg
  return resultado.rows
}

type PushSchema = ReturnType<PostgresAdapterInstancia['requireDrizzleKit']>['pushSchema']

const cache = new Map<string, PushSchema>()

export function cargarPushSchemaCorregido({ raiz }: { raiz: string }): PushSchema {
  const rutaApi = path.join(raiz, 'node_modules/drizzle-kit/api.js')
  const enCache = cache.get(rutaApi)
  if (enCache) return enCache

  const paquete = JSON.parse(readFileSync(path.join(path.dirname(rutaApi), 'package.json'), 'utf8')) as { version?: unknown }
  comprobarVersion(paquete.version)
  const bytes = readFileSync(rutaApi)
  comprobarHuella(bytes)

  const fuente = corregirFuente(bytes.toString('utf8'))
  const envoltura = vm.compileFunction(
    fuente,
    ['exports', 'require', 'module', '__filename', '__dirname', '__jzConsultaPg'],
    { filename: rutaApi },
  )
  const modulo: { exports: { pushSchema?: unknown } } = { exports: {} }
  envoltura(modulo.exports, createRequire(rutaApi), modulo, rutaApi, path.dirname(rutaApi), consultaPg)

  const { pushSchema } = modulo.exports
  if (typeof pushSchema !== 'function') {
    throw new Error('correccion_push_sin_pushschema: api.js corregido no exporta pushSchema')
  }
  cache.set(rutaApi, pushSchema as PushSchema)
  return pushSchema as PushSchema
}

type AdaptadorPostgres = ReturnType<typeof postgresAdapter>
type PostgresAdapterInstancia = ReturnType<AdaptadorPostgres['init']>

// La carga de api.js es perezosa: en producción (sin push) nunca se lee ni se compila.
export function conCorreccionPushSchema(base: AdaptadorPostgres, opciones: { raiz: string }): AdaptadorPostgres {
  return {
    ...base,
    init: (args) => {
      const instancia = base.init(args)
      const original = instancia.requireDrizzleKit
      if (typeof original !== 'function') {
        throw new Error('correccion_push_sin_requireDrizzleKit: el adaptador no expone requireDrizzleKit')
      }
      instancia.requireDrizzleKit = () => ({
        ...original(),
        pushSchema: async (...argumentos) => cargarPushSchemaCorregido(opciones)(...argumentos),
      })
      return instancia
    },
  }
}
