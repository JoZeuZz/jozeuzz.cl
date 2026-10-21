import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { integer, PgDialect, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import {
  BLOQUE_ORIGINAL,
  cargarPushSchemaCorregido,
  comprobarHuella,
  comprobarVersion,
  conCorreccionPushSchema,
  consultaPg,
  corregirFuente,
  HUELLA_API_JS,
  VERSION_DRIZZLE_KIT,
} from './correccion-push'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const rutaApi = path.join(raiz, 'node_modules/drizzle-kit/api.js')
const fuenteReal = readFileSync(rutaApi, 'utf8')

type PushSchema = (
  imports: Record<string, unknown>,
  drizzle: unknown,
  schemaFilters?: string[],
) => Promise<{ hasDataLoss: boolean; statementsToExecute: string[] }>

const intakeLimite = pgTable(
  'intake_limite',
  {
    claveHmac: text('clave_hmac').notNull(),
    tipo: text('tipo').notNull(),
    ventana: timestamp('ventana', { withTimezone: true, precision: 3 }).notNull(),
    n: integer('n').notNull(),
  },
  (t) => [primaryKey({ columns: [t.claveHmac, t.tipo, t.ventana] })],
)

const PK = 'intake_limite_clave_hmac_tipo_ventana_pk'

function columna(nombre: string, tipo: string, adicional: string, udt: string) {
  return {
    table_name: 'intake_limite',
    column_name: nombre,
    is_nullable: 'NO',
    array_dimensions: 0,
    data_type: tipo,
    seq_name: null,
    column_default: null,
    additional_dt: adicional,
    enum_name: udt,
    is_generated: 'NEVER',
    generation_expression: null,
    is_identity: 'NO',
    identity_generation: null,
    identity_start: null,
    identity_increment: null,
    identity_maximum: null,
    identity_minimum: null,
    identity_cycle: 'NO',
    type_schema: 'pg_catalog',
  }
}

function responder(texto: string): unknown[] {
  if (texto.includes('$1::regnamespace')) return [{ primary_key: PK }]
  if (texto.includes('a.attrelid::regclass')) {
    return [
      columna('clave_hmac', 'text', 'text', 'text'),
      columna('tipo', 'text', 'text', 'text'),
      columna('ventana', 'timestamp(3) with time zone', 'timestamp with time zone', 'timestamptz'),
      columna('n', 'integer', 'integer', 'int4'),
    ]
  }
  if (texto.includes('constraint_column_usage')) {
    return ['clave_hmac', 'tipo', 'ventana'].map((c) => ({
      column_name: c,
      data_type: 'text',
      constraint_type: 'PRIMARY KEY',
      constraint_name: PK,
      constraint_schema: 'public',
    }))
  }
  if (texto.includes('AS table_schema') && texto.includes('relkind IN')) {
    return [{ table_schema: 'public', table_name: 'intake_limite', type: 'table', rls_enabled: false }]
  }
  return []
}

// Doble de PostgreSQL: rechaza «$n» sin parámetros igual que el servidor real.
function crearDrizzleFalso() {
  const dialecto = new PgDialect()
  const ejecutadas: { texto: string; params: unknown[] }[] = []
  const cliente: { texto: string; params: unknown[] }[] = []
  const instancia = {
    execute: async (consulta: Parameters<PgDialect['sqlToQuery']>[0]) => {
      const { sql: texto, params } = dialecto.sqlToQuery(consulta)
      ejecutadas.push({ texto, params })
      if (/\$1\b/.test(texto) && params.length === 0) {
        throw Object.assign(new Error('there is no parameter $1'), { code: '42P02' })
      }
      return { rows: responder(texto) }
    },
    $client: {
      query: async (texto: string, params: unknown[]) => {
        cliente.push({ texto, params })
        return { rows: responder(texto) }
      },
    },
  }
  return { instancia, ejecutadas, cliente }
}

describe('pushSchema de drizzle-kit con PK compuesta', () => {
  it('el api.js original rechaza con 42P02 (caracteriza el defecto)', async () => {
    const original = createRequire(import.meta.url)(rutaApi).pushSchema as PushSchema
    const { instancia } = crearDrizzleFalso()
    await expect(original({ intakeLimite }, instancia)).rejects.toMatchObject({ code: '42P02' })
  })

  it('el pushSchema corregido reenvía los parámetros al cliente pg', async () => {
    const corregido = cargarPushSchemaCorregido({ raiz }) as unknown as PushSchema
    const { instancia, ejecutadas, cliente } = crearDrizzleFalso()

    const resultado = await corregido({ intakeLimite }, instancia)

    expect(resultado.hasDataLoss).toBe(false)
    expect(resultado.statementsToExecute).toEqual([])
    expect(cliente.length).toBeGreaterThan(0)
    for (const llamada of cliente) expect(llamada.params).toEqual(['public', 'intake_limite'])
    expect(ejecutadas.filter((e) => /\$1\b/.test(e.texto))).toEqual([])
  })

  it('no modifica api.js en disco', () => {
    cargarPushSchemaCorregido({ raiz })
    const huella = createHash('sha256').update(readFileSync(rutaApi)).digest('hex')
    expect(huella).toBe(HUELLA_API_JS)
  })

  it('cachea la compilación por ruta', () => {
    expect(cargarPushSchemaCorregido({ raiz })).toBe(cargarPushSchemaCorregido({ raiz }))
  })

  it('falla si no existe el api.js', () => {
    expect(() => cargarPushSchemaCorregido({ raiz: path.join(raiz, 'no-existe') })).toThrow()
  })
})

describe('corregirFuente', () => {
  it('sustituye exactamente el bloque pg y deja intactos mysql y singlestore', () => {
    const corregida = corregirFuente(fuenteReal)
    expect(corregida).not.toContain(BLOQUE_ORIGINAL)
    expect(corregida).toContain('__jzConsultaPg(drizzleInstance, sql3, query, params)')
    expect(corregida.split('__jzConsultaPg').length - 1).toBe(1)
    const resto = 'const res = await drizzleInstance.execute(sql3.raw(query));'
    expect(corregida.split(resto).length - 1).toBe(fuenteReal.split(resto).length - 1 - 1)
    expect(corregida.split('return res[0];').length).toBe(fuenteReal.split('return res[0];').length)
  })

  it('falla con cero apariciones', () => {
    expect(() => corregirFuente(fuenteReal.replace(BLOQUE_ORIGINAL, 'otra cosa'))).toThrow(/0/)
  })

  it('falla con dos apariciones', () => {
    expect(() => corregirFuente(`${fuenteReal}\n${BLOQUE_ORIGINAL}`)).toThrow(/2/)
  })
})

describe('huella y versión', () => {
  it('acepta los bytes reales', () => {
    expect(() => comprobarHuella(readFileSync(rutaApi))).not.toThrow()
  })

  it('rechaza bytes alterados', () => {
    const alterados = Buffer.from(`${fuenteReal}\n`)
    expect(() => comprobarHuella(alterados)).toThrow(/huella/i)
  })

  it('acepta la versión fijada y rechaza otra', () => {
    expect(() => comprobarVersion(VERSION_DRIZZLE_KIT)).not.toThrow()
    expect(() => comprobarVersion('0.31.8')).toThrow(/versi/i)
    expect(() => comprobarVersion(undefined)).toThrow(/versi/i)
  })
})

describe('consultaPg', () => {
  const sql = { raw: (texto: string) => ({ texto }) }

  it('sin parámetros usa execute como el original', async () => {
    const execute = vi.fn(async () => ({ rows: [{ a: 1 }] }))
    const query = vi.fn()
    const filas = await consultaPg({ execute, $client: { query } }, sql, 'select 1', undefined)
    expect(filas).toEqual([{ a: 1 }])
    expect(execute).toHaveBeenCalledWith({ texto: 'select 1' })
    expect(query).not.toHaveBeenCalled()
    await consultaPg({ execute, $client: { query } }, sql, 'select 1', [])
    expect(query).not.toHaveBeenCalled()
  })

  it('con parámetros usa $client.query y devuelve rows', async () => {
    const execute = vi.fn()
    const query = vi.fn(async () => ({ rows: [{ b: 2 }] }))
    const filas = await consultaPg({ execute, $client: { query } }, sql, 'select $1', ['x'])
    expect(filas).toEqual([{ b: 2 }])
    expect(query).toHaveBeenCalledWith('select $1', ['x'])
    expect(execute).not.toHaveBeenCalled()
  })

  it('con parámetros y sin $client falla cerrado', async () => {
    const execute = vi.fn()
    await expect(consultaPg({ execute }, sql, 'select $1', ['x'])).rejects.toThrow(/\$client/)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('conCorreccionPushSchema', () => {
  function crearBase() {
    const generateDrizzleJson = vi.fn()
    const generateMigration = vi.fn()
    const upSnapshot = vi.fn()
    const pushOriginal = vi.fn()
    const requireDrizzleKit = vi.fn(() => ({
      generateDrizzleJson,
      generateMigration,
      pushSchema: pushOriginal,
      upSnapshot,
    }))
    const init = vi.fn(() => ({ requireDrizzleKit, otra: 'conservada' }))
    const base = { name: 'postgres', allowIDOnCreate: false, defaultIDType: 'number', init }
    return { base, init, generateDrizzleJson, generateMigration, upSnapshot, pushOriginal }
  }

  type Kit = {
    generateDrizzleJson: unknown
    generateMigration: unknown
    upSnapshot: unknown
    pushSchema: PushSchema
  }
  const iniciar = (adaptador: { init: unknown }) =>
    (adaptador.init as (args: unknown) => { otra: string; requireDrizzleKit: () => Kit })({ payload: {} })

  it('conserva metadatos y funciones distintas de pushSchema', () => {
    const f = crearBase()
    const envuelto = conCorreccionPushSchema(f.base as never) as unknown as typeof f.base
    expect(envuelto.name).toBe('postgres')
    expect(envuelto.allowIDOnCreate).toBe(false)
    expect(envuelto.defaultIDType).toBe('number')

    const instancia = iniciar(envuelto)
    expect(instancia.otra).toBe('conservada')
    const kit = instancia.requireDrizzleKit()
    expect(kit.generateDrizzleJson).toBe(f.generateDrizzleJson)
    expect(kit.generateMigration).toBe(f.generateMigration)
    expect(kit.upSnapshot).toBe(f.upSnapshot)
    expect(kit.pushSchema).not.toBe(f.pushOriginal)
    expect(typeof kit.pushSchema).toBe('function')
  })

  it('falla si la instancia no expone requireDrizzleKit', () => {
    const base = { name: 'postgres', init: () => ({}) }
    const envuelto = conCorreccionPushSchema(base as never) as unknown as typeof base
    expect(() => envuelto.init()).toThrow(/requireDrizzleKit/)
  })

  it('no lee api.js hasta invocar pushSchema', async () => {
    const f = crearBase()
    const inexistente = path.join(raiz, 'no-existe')
    const envuelto = conCorreccionPushSchema(f.base as never, { raiz: inexistente }) as unknown as typeof f.base
    const kit = iniciar(envuelto).requireDrizzleKit()
    await expect(kit.pushSchema({ intakeLimite }, crearDrizzleFalso().instancia)).rejects.toThrow()
    expect(f.pushOriginal).not.toHaveBeenCalled()
  })

  it('al invocar pushSchema usa el api.js real corregido', async () => {
    const f = crearBase()
    const envuelto = conCorreccionPushSchema(f.base as never, { raiz }) as unknown as typeof f.base
    const kit = iniciar(envuelto).requireDrizzleKit()
    const { instancia, cliente } = crearDrizzleFalso()
    await kit.pushSchema({ intakeLimite }, instancia)
    expect(cliente.length).toBeGreaterThan(0)
    expect(f.pushOriginal).not.toHaveBeenCalled()
  })
})
