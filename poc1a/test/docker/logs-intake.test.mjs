// POC-3 U7 (IN-12, T-05, T-09) sin fallos inyectados, contra app-prod (puerto 3444, producción real): ningún log de proxy,
// app, app-prod ni db contiene PII sintética ni IPs, con envíos válidos e inválidos. PRECONDICIÓN:
// `./poc.sh up-prod-pruebas-en poc3_intake` (proxy con IP sintética) y, desde poc1a/,
// `NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt" POC_BASE_URL=https://127.0.0.1:3444 node --test test/docker/logs-intake.test.mjs`.
import assert from 'node:assert/strict'
import test from 'node:test'

import { buscarFugas, entorno, enviar, instanteInicial, ipSinteticaUnica, lineasDeEvento, recogerLogs, solicitudValida, valorSintetico } from './ayuda-logs.mjs'

const destino = entorno(3444)
const desde = instanteInicial()
const valores = []
const ips = []

function nuevoEnvio(etiqueta) {
  const nombre = valorSintetico(etiqueta)
  const ip = ipSinteticaUnica()
  valores.push(nombre, `${nombre}@example.invalid`, `equipo ${nombre}`, `descripcion ${nombre}`)
  ips.push(ip)
  return { nombre, ip }
}

test('envío válido: 201', async () => {
  const { nombre, ip } = nuevoEnvio('valido')
  const { status, json } = await enviar(destino, { ip, cuerpo: (token) => solicitudValida(nombre, token) })
  assert.equal(status, 201)
  assert.deepEqual(json, { ok: true })
})

test('la cabecera x-poc-fallo no inyecta nada en producción', async () => {
  const { nombre, ip } = nuevoEnvio('sin-inyeccion')
  const { status } = await enviar(destino, { ip, cabeceras: { 'x-poc-fallo': 'intake-pg-check' }, cuerpo: (token) => solicitudValida(nombre, token) })
  assert.equal(status, 201)
})

test('datos inválidos con PII sintética: 400 datos_invalidos', async () => {
  const { nombre, ip } = nuevoEnvio('invalido')
  const { status, json } = await enviar(destino, { ip, cuerpo: (token) => ({ ...solicitudValida(nombre, token), contacto: '' }) })
  assert.equal(status, 400)
  assert.equal(json?.error, 'datos_invalidos')
})

test('campo no permitido con PII sintética: 400 campos_no_permitidos', async () => {
  const { nombre, ip } = nuevoEnvio('no-permitido')
  const { status, json } = await enviar(destino, { ip, cuerpo: (token) => ({ ...solicitudValida(nombre, token), estado: nombre }) })
  assert.equal(status, 400)
  assert.deepEqual(json, { error: 'campos_no_permitidos' })
})

test('CSRF inválido con PII sintética: 403 csrf_invalido', async () => {
  const { nombre, ip } = nuevoEnvio('csrf')
  const { status, json } = await enviar(destino, { ip, cuerpo: solicitudValida(nombre, 'token-falso') })
  assert.equal(status, 403)
  assert.deepEqual(json, { error: 'csrf_invalido' })
})

test('JSON roto con PII sintética: 400 cuerpo_invalido', async () => {
  const { nombre, ip } = nuevoEnvio('json-roto')
  const { status, json } = await enviar(destino, { ip, cuerpo: `{"nombre":"${nombre}",` })
  assert.equal(status, 400)
  assert.deepEqual(json, { error: 'cuerpo_invalido' })
})

test('cuerpo de 40 KiB con PII sintética: 413 cuerpo_demasiado_grande', async () => {
  const { nombre, ip } = nuevoEnvio('413')
  const { status, json } = await enviar(destino, { ip, cuerpo: (token) => JSON.stringify({ ...solicitudValida(nombre, token), descripcion: `descripcion ${nombre} ${'a'.repeat(40_000)}` }) })
  assert.equal(status, 413)
  assert.deepEqual(json, { error: 'cuerpo_demasiado_grande' })
})

test('los logs de proxy, app, app-prod y db no contienen PII, IPs, /64 ni textos de error', async () => {
  const lineas = await recogerLogs(desde)
  assert.deepEqual(buscarFugas(lineas, { valores, ips }), [])
  const eventos = lineasDeEvento(lineas)
  assert.ok(eventos.length >= 1, 'debe haber al menos una línea con "evento":"intake"')
  assert.ok(eventos.some((linea) => linea.includes('"codigo":"creada"')), 'el envío válido debe quedar registrado como creada')
})
