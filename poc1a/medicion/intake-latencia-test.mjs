// Nombre «-test.mjs» a propósito: `node --test medicion/` lo recoge y Playwright (medicion/ es su testDir) no.
import assert from 'node:assert/strict';
import test from 'node:test';

import { clasificar, indiceSintetico, mediana, medirSeries, p95, validarEntorno } from './intake-latencia.mjs';

test('mediana: impar, par, desordenada y no muta la entrada', () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  const entrada = [9, 1, 5];
  mediana(entrada);
  assert.deepEqual(entrada, [9, 1, 5]);
  assert.throws(() => mediana([]), /vacía/);
});

test('p95: rango más cercano (sobre 50 valores es el 48.º; sobre 150 el 143.º)', () => {
  const cincuenta = Array.from({ length: 50 }, (_, i) => i + 1);
  assert.equal(p95(cincuenta), 48);
  const cientoCincuenta = Array.from({ length: 150 }, (_, i) => 150 - i);
  assert.equal(p95(cientoCincuenta), 143);
  assert.equal(p95([7]), 7);
  assert.throws(() => p95([]), /vacía/);
});

test('clasificar: 201 creado; 4xx rechazo de un envío legítimo (falso positivo); el resto, error', () => {
  assert.equal(clasificar(201), 'creado');
  for (const s of [400, 403, 409, 422, 429]) assert.equal(clasificar(s), 'falso_positivo', String(s));
  for (const s of [200, 204, 302, 500, 502, 503, 0, undefined]) assert.equal(clasificar(s), 'error', String(s));
});

test('indiceSintetico: un índice distinto por envío, fuera del rango de la batería y de los tests HTTP', () => {
  const vistos = new Set();
  for (let serie = 0; serie < 3; serie++) {
    for (let i = 0; i < 50; i++) vistos.add(indiceSintetico(123456, serie, i));
  }
  assert.equal(vistos.size, 150);
  for (const n of vistos) {
    assert.ok(n >= 0x10000000, 'por encima de lo que la batería alcanza (origen-sintetico-1…)');
    assert.ok(n < 0xffff0000, 'el grupo ffff queda reservado a los tests HTTP');
  }
  assert.throws(() => indiceSintetico(0xfffffff0, 2, 49), /rango/);
});

test('validarEntorno: exige base https loopback y CA; prohíbe NODE_TLS_REJECT_UNAUTHORIZED=0', () => {
  const ca = '/x/poc1a/.tls/ca.crt';
  assert.equal(validarEntorno({ NODE_EXTRA_CA_CERTS: ca }).base, 'https://127.0.0.1:3444');
  assert.equal(validarEntorno({ NODE_EXTRA_CA_CERTS: ca, POC_BASE_URL: 'https://127.0.0.1:3443/' }).base, 'https://127.0.0.1:3443');
  assert.equal(validarEntorno({ NODE_EXTRA_CA_CERTS: ca }).tiempoMinimoMs, 200);
  assert.equal(validarEntorno({ NODE_EXTRA_CA_CERTS: ca, POC_INTAKE_TIEMPO_MINIMO_MS: '3000' }).tiempoMinimoMs, 3000);
  assert.throws(() => validarEntorno({}), /NODE_EXTRA_CA_CERTS/);
  assert.throws(() => validarEntorno({ NODE_EXTRA_CA_CERTS: '/otra/ca.crt' }), /NODE_EXTRA_CA_CERTS/);
  assert.throws(() => validarEntorno({ NODE_EXTRA_CA_CERTS: ca, NODE_TLS_REJECT_UNAUTHORIZED: '0' }), /prohibido/);
  assert.throws(() => validarEntorno({ NODE_EXTRA_CA_CERTS: ca, POC_BASE_URL: 'http://127.0.0.1:3444' }), /POC_BASE_URL/);
  assert.throws(() => validarEntorno({ NODE_EXTRA_CA_CERTS: ca, POC_BASE_URL: 'https://example.com' }), /POC_BASE_URL/);
  assert.throws(() => validarEntorno({ NODE_EXTRA_CA_CERTS: ca, POC_INTAKE_TIEMPO_MINIMO_MS: 'abc' }), /TIEMPO_MINIMO/);
});

test('medirSeries: 3×50 envíos, mediana de medianas, p95 y recuento de falsos positivos', async () => {
  const llamadas = [];
  const unEnvio = async (serie, i) => {
    llamadas.push([serie, i]);
    return { status: 201, ms: serie * 10 + (i % 5) }; // serie 0: medianas 2; serie 1: 12; serie 2: 22
  };
  const r = await medirSeries({ series: 3, porSerie: 50, unEnvio });
  assert.equal(llamadas.length, 150);
  assert.equal(r.enviados, 150);
  assert.equal(r.creados, 150);
  assert.equal(r.falsos_positivos, 0);
  assert.equal(r.errores, 0);
  assert.deepEqual(r.series.map((s) => s.mediana_ms), [2, 12, 22]);
  assert.equal(r.mediana_de_medianas_ms, 12);
  assert.equal(r.p95_ms, 24);
  assert.equal(r.ok, true);
});

test('medirSeries: un rechazo de envío legítimo (429) es falso positivo y deja ok=false', async () => {
  const unEnvio = async (serie, i) => ({ status: serie === 1 && i === 7 ? 429 : 201, ms: 5 });
  const r = await medirSeries({ series: 3, porSerie: 50, unEnvio });
  assert.equal(r.creados, 149);
  assert.equal(r.falsos_positivos, 1);
  assert.equal(r.ok, false);
});

test('medirSeries: un error de red o 5xx cuenta como error y deja ok=false', async () => {
  const unEnvio = async (serie, i) => {
    if (serie === 2 && i === 0) throw new Error('fallo de red');
    return { status: serie === 0 && i === 3 ? 500 : 201, ms: 5 };
  };
  const r = await medirSeries({ series: 3, porSerie: 50, unEnvio });
  assert.equal(r.errores, 2);
  assert.equal(r.creados, 148);
  assert.equal(r.ok, false);
});
