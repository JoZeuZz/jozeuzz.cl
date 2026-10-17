// Ayudas comunes de las pruebas Docker de logs sin PII (POC-3, unidad 7). No es una prueba: no termina en .test.mjs.
// Corren en el Node del host contra el proxy TLS local; los logs se leen con `./poc.sh logs-since` (como el driver de contrato).
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as esperar } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const raizPoc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function entorno(puertoPorDefecto) {
  const base = (process.env.POC_BASE_URL ?? `https://127.0.0.1:${puertoPorDefecto}`).replace(/\/$/, '')
  if (!/^https:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('POC_BASE_URL debe tener forma https://127.0.0.1:<puerto>')
  if (!process.env.NODE_EXTRA_CA_CERTS?.endsWith('/.tls/ca.crt')) throw new Error('NODE_EXTRA_CA_CERTS debe terminar en /.tls/ca.crt')
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('NODE_TLS_REJECT_UNAUTHORIZED=0 está prohibido')
  return { base, esperaMinimaMs: Number(process.env.POC_INTAKE_TIEMPO_MINIMO_MS ?? 200) + 100 }
}

/** Valor sintético único por ejecución: nunca debe aparecer en ningún log. */
export const valorSintetico = (etiqueta) => `SNT-${etiqueta}-${randomBytes(6).toString('hex')}`

/** IP sintética única por ejecución y por envío; el grupo `ffff` está reservado a las pruebas (diseño §6). */
export const ipSinteticaUnica = () => `2001:db8:ffff:${(1 + Math.floor(Math.random() * 0xfffe)).toString(16)}::1`

/** Textos que identifican la IP y su /64 en cualquier representación habitual. */
export function huellasDeIp(ip) {
  const [a, b, c, d] = ip.split(':')
  return [ip, `${a}:${b}:${c}:${d}`, `${a}:${b.padStart(4, '0')}:${c.padStart(4, '0')}:${d.padStart(4, '0')}`]
}

export async function formulario(base, ip) {
  const respuesta = await fetch(`${base}/solicitar`, { headers: { connection: 'close', 'x-poc-ip-sintetica': ip } })
  const html = await respuesta.text()
  const token = /name="token" value="([^"]+)"/.exec(html)?.[1]
  const cookie = respuesta.headers.get('set-cookie')?.match(/__Host-intake=[^;]+/)?.[0]
  if (respuesta.status !== 200 || !token || !cookie) throw new Error(`GET /solicitar inesperado (${respuesta.status})`)
  return { token, cookie }
}

/** POST JSON a /api/intake con IP sintética propia. `cuerpo` puede ser un objeto o texto crudo (JSON roto). */
export async function enviar({ base, esperaMinimaMs }, { ip, cuerpo, formularioPrevio, cabeceras = {}, esperar: espera = true }) {
  const previo = formularioPrevio ?? await formulario(base, ip)
  if (espera) await esperar(esperaMinimaMs)
  const texto = typeof cuerpo === 'function' ? cuerpo(previo.token) : cuerpo
  const respuesta = await fetch(`${base}/api/intake`, {
    method: 'POST',
    headers: { connection: 'close', 'content-type': 'application/json', origin: base, cookie: previo.cookie, 'x-poc-ip-sintetica': ip, ...cabeceras },
    body: typeof texto === 'string' ? texto : JSON.stringify(texto),
  })
  const crudo = await respuesta.text()
  let json
  try { json = JSON.parse(crudo) } catch { json = undefined }
  return { status: respuesta.status, json, correlacion: respuesta.headers.get('x-correlacion') ?? undefined }
}

export const solicitudValida = (nombre, token) => ({
  nombre, contacto: `${nombre}@example.invalid`, tipo_equipo: `equipo ${nombre}`, descripcion: `descripcion ${nombre}`, sitio_web: '', token,
})

export const instanteInicial = () => new Date(Date.now() - 2000).toISOString()

/** Logs de proxy, app, app-prod y db desde `desde`. Falla si `poc.sh logs-since` sale con código ≠ 0. */
export async function recogerLogs(desde) {
  await esperar(2000)
  const r = spawnSync('./poc.sh', ['logs-since', desde], { cwd: raizPoc, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`logs-since falló (${r.status}): ${(r.stderr ?? '').slice(0, 200)}`)
  return `${r.stdout}\n${r.stderr}`.split('\n')
}

/** Líneas con fugas: valores sintéticos, IPs y /64, y textos de errores de Drizzle/PostgreSQL. */
export function buscarFugas(lineas, { valores, ips }) {
  const prohibidos = [
    ...valores.map((v) => ({ nombre: `valor ${v}`, prueba: (l) => l.includes(v) })),
    ...ips.flatMap(huellasDeIp).map((h) => ({ nombre: `ip ${h}`, prueba: (l) => l.toLowerCase().includes(h.toLowerCase()) })),
    { nombre: 'SNT-', prueba: (l) => l.includes('SNT-') },
    { nombre: 'Failed query', prueba: (l) => l.includes('Failed query') },
    { nombre: 'DETAIL', prueba: (l) => l.includes('DETAIL') },
    // Clave JSON "stack" o marco de pila («    at funcion (archivo:1:2)»); la palabra suelta («stack depth») no es una fuga.
    { nombre: 'stack', prueba: (l) => /"stack"\s*:|\s{2,}at\s+(?:\S+\s+\()?\S+:\d+/.test(l) },
  ]
  return lineas.flatMap((linea) => prohibidos.filter((p) => p.prueba(linea)).map((p) => `${p.nombre}: ${linea.slice(0, 240)}`))
}

export const lineasDeEvento = (lineas) => lineas.filter((l) => l.includes('"evento":"intake"'))

/** Líneas `"evento":"intake","codigo":"interno"` atadas a una petición por su `x-correlacion`. */
export const lineasInternas = (lineas, correlacion) =>
  lineasDeEvento(lineas).filter((l) => l.includes('"codigo":"interno"') && correlacion !== undefined && l.includes(`"correlacion":"${correlacion}"`))
