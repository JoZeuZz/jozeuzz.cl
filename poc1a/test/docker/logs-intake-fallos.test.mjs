// POC-3 U7 (IN-12, T-05, T-06, T-09): ningún log de proxy, app, app-prod ni db contiene PII sintética ni IPs,
// ni siquiera con fallos reales inyectados. PRECONDICIÓN: `./poc.sh up-fallos-en poc3_intake` (app en 3443 con
// POC_FALLOS_INYECTABLES=1, proxy con IP sintética, db con los flags de logs de §5.5) y
// `NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt" node --test test/docker/logs-intake-fallos.test.mjs` desde poc1a/.
import assert from 'node:assert/strict'
import test from 'node:test'

import { buscarFugas, entorno, enviar, instanteInicial, ipSinteticaUnica, lineasDeEvento, lineasInternas, recogerLogs, solicitudValida, valorSintetico } from './ayuda-logs.mjs'

const destino = entorno(3443)
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

const correlaciones = new Map()
// pg_code que el manejador debe registrar (por correlación) para cada fallo; intake-fuera no tiene código de PostgreSQL asegurado.
const PG_ESPERADO = { 'intake-pg-check': '23514', 'intake-pg-tipo': '22P02', 'intake-log-crudo': '22P02' }

for (const fallo of ['intake-log-crudo', 'intake-pg-check', 'intake-pg-tipo', 'intake-fuera']) {
  test(`fallo inyectado ${fallo}: 500 interno genérico, sin eco de valores`, async () => {
    const { nombre, ip } = nuevoEnvio(fallo)
    const { status, json, correlacion } = await enviar(destino, { ip, cabeceras: { 'x-poc-fallo': fallo }, cuerpo: (token) => solicitudValida(nombre, token) })
    // Si la inyección no está activa el envío se crearía (201): la prueba debe fallar, no pasar en vacío.
    assert.equal(status, 500, `${fallo}: la inyección no está activa (¿se levantó con up-fallos-en?)`)
    assert.deepEqual(json, { error: 'interno' })
    assert.ok(correlacion, `${fallo}: la respuesta debe llevar x-correlacion`)
    correlaciones.set(fallo, correlacion)
  })
}

test('JSON roto con PII sintética: 400 cuerpo_invalido', async () => {
  const { nombre, ip } = nuevoEnvio('json-roto')
  const { status, json } = await enviar(destino, { ip, cuerpo: `{"nombre":"${nombre}","contacto":"${nombre}@example.invalid",` })
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
  assert.ok(eventos.length >= 1, 'debe haber al menos una línea con "evento":"intake" (si no, la prueba no vería nada)')
  assert.ok(eventos.some((linea) => linea.includes('"codigo":"interno"')), 'los fallos inyectados deben quedar registrados como codigo interno')
})

test('cada fallo inyectado deja su línea interna con el pg_code esperado, atada por correlación', async () => {
  const lineas = await recogerLogs(desde)
  assert.equal(correlaciones.size, 4, 'deben haberse ejecutado los cuatro fallos inyectados')
  for (const [fallo, correlacion] of correlaciones) {
    const internas = lineasInternas(lineas, correlacion)
    assert.equal(internas.length, 1, `${fallo}: debe haber exactamente una línea interna con la correlación ${correlacion}`)
    if (PG_ESPERADO[fallo]) assert.ok(internas[0].includes(`"pg_code":"${PG_ESPERADO[fallo]}"`), `${fallo}: falta "pg_code":"${PG_ESPERADO[fallo]}" en ${internas[0].slice(0, 240)}`)
  }
})

test('intake-log-crudo: el error crudo del logger de Payload sale saneado', async () => {
  const lineas = await recogerLogs(desde)
  const crudas = lineas.filter((linea) => linea.includes('"name":"payload"') && !linea.includes('"evento"') && linea.includes('"pg_code":"22P02"'))
  assert.ok(crudas.length >= 1, 'debe haber una línea del logger de payload con el error saneado ("err" con pg_code 22P02)')
  for (const linea of crudas) {
    assert.ok(linea.includes('"err":{'), `la línea saneada debe llevar err: ${linea.slice(0, 240)}`)
    assert.ok(!linea.includes('Failed query'), 'sin Failed query')
  }
  assert.ok(!lineas.some((linea) => linea.includes('Failed query')), 'ninguna línea contiene Failed query')
})
