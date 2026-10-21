import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificarTexto } from './verificar-docs.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(AQUI, 'verificar-docs.mjs');
const RUTA = '/w/docs/h0b/doc.md';

const reglas = (hallazgos) => hallazgos.map((h) => h.regla);
const verificar = (texto, opts = {}) =>
  verificarTexto(texto, { ruta: RUTA, existe: () => true, exigirPropuesta: false, ...opts });
const capturar = (texto) => {
  const vistos = [];
  verificar(texto, { existe: (p) => (vistos.push(p), true) });
  return vistos;
};

// enlace-roto
test('enlace-roto: reporta destino relativo inexistente con linea 1-based', () => {
  const h = verificar('# T\n\n[a](falta.md)\n', { existe: () => false });
  assert.deepEqual(reglas(h), ['enlace-roto']);
  assert.equal(h[0].linea, 3);
  assert.match(h[0].detalle, /falta\.md/);
});

test('enlace-roto: resuelve respecto del directorio de ruta', () => {
  assert.deepEqual(capturar('[a](../x/y.md)'), [path.resolve('/w/docs/x/y.md')]);
});

test('enlace-roto: enlace existente no genera hallazgo', () => {
  assert.deepEqual(verificar('[a](ok.md)'), []);
});

test('enlace-roto: ancla se quita antes de comprobar existencia', () => {
  assert.deepEqual(capturar('[a](otro.md#sec)'), [path.resolve('/w/docs/h0b/otro.md')]);
});

test('enlace-roto: titulo opcional no forma parte del destino', () => {
  assert.deepEqual(capturar('[a](otro.md "Un titulo")'), [path.resolve('/w/docs/h0b/otro.md')]);
});

test('enlace-roto: %20 se decodifica a espacio', () => {
  assert.deepEqual(capturar('[a](mi%20doc.md)'), [path.resolve('/w/docs/h0b/mi doc.md')]);
});

test('enlace-roto: ignora http, https, mailto y anclas locales', () => {
  const texto = '[a](http://x.cl) [b](https://x.cl/p) [c](mailto:a@b.cl) [d](#seccion)';
  assert.deepEqual(verificar(texto, { existe: () => false }), []);
});

test('enlace-roto: ignora enlaces en bloque cercado con ``` y ~~~', () => {
  const texto = '```\n[a](falta.md)\n```\n~~~md\n[b](falta2.md)\n~~~\n';
  assert.deepEqual(verificar(texto, { existe: () => false }), []);
});

test('enlace-roto: tras cerrar el bloque cercado vuelve a verificar', () => {
  const h = verificar('```\n[a](x.md)\n```\n[b](y.md)\n', { existe: () => false });
  assert.deepEqual(h.map((x) => x.linea), [4]);
});

test('enlace-roto: ignora enlaces dentro de span de codigo en linea', () => {
  assert.deepEqual(verificar('Usa `[a](falta.md)` asi.', { existe: () => false }), []);
});

test('enlace-roto: detecta varios enlaces en una linea', () => {
  const h = verificar('[a](x.md) y [b](y.md)', { existe: () => false });
  assert.equal(h.length, 2);
});

// estado-propuesta
test('estado-propuesta: sin exigirPropuesta no se comprueba', () => {
  assert.deepEqual(verificar('# T\n'), []);
});

test('estado-propuesta: falta estado reporta en linea 1', () => {
  const h = verificar('# T\n\nTexto\n', { exigirPropuesta: true });
  assert.deepEqual(reglas(h), ['estado-propuesta']);
  assert.equal(h[0].linea, 1);
});

test('estado-propuesta: acepta markdown con negritas y cita', () => {
  assert.deepEqual(verificar('# T\n\n> **Estado:** **Propuesta**\n', { exigirPropuesta: true }), []);
});

test('estado-propuesta: acepta Propuesto y propuesta', () => {
  assert.deepEqual(verificar('Estado: Propuesto\n', { exigirPropuesta: true }), []);
  assert.deepEqual(verificar('Estado: en propuesta\n', { exigirPropuesta: true }), []);
});

test('estado-propuesta: Estado sin Propuesta en la misma linea falla', () => {
  const h = verificar('Estado: Aprobado\nPropuesta\n', { exigirPropuesta: true });
  assert.deepEqual(reglas(h), ['estado-propuesta']);
});

test('estado-propuesta: solo cuentan las primeras 12 lineas', () => {
  const fuera = `${Array(12).fill('x').join('\n')}\nEstado: Propuesta\n`;
  assert.deepEqual(reglas(verificar(fuera, { exigirPropuesta: true })), ['estado-propuesta']);
  const dentro = `${Array(11).fill('x').join('\n')}\nEstado: Propuesta\n`;
  assert.deepEqual(verificar(dentro, { exigirPropuesta: true }), []);
});

// marcador-prohibido
test('marcador-prohibido: detecta cada marcador con su linea', () => {
  for (const marca of ['TU_URL', 'Lorem Ipsum', 'USD', 'US$', '$20', 'tu_url']) {
    const h = verificar(`ok\nPrecio ${marca} aqui\n`);
    assert.deepEqual(reglas(h), ['marcador-prohibido'], marca);
    assert.equal(h[0].linea, 2, marca);
  }
});

test('marcador-prohibido: $ sin digito y CLP no generan hallazgo', () => {
  assert.deepEqual(verificar('Cuesta $ o 20.000 CLP, o $ 5'), []);
});

test('marcador-prohibido: ignorado en codigo cercado y en linea', () => {
  const texto = '```\nTU_URL USD $20\n```\nCita `US$` y `lorem ipsum`.\n';
  assert.deepEqual(verificar(texto), []);
});

test('marcador-prohibido: no confunde palabras que contienen usd', () => {
  assert.deepEqual(verificar('Texto con ausdito.'), []);
});

// CLI
const correr = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const fx = (...p) => path.join(AQUI, 'fixtures', ...p);

test('CLI: directorio limpio sale con 0 y resumen', () => {
  const r = correr('--exigir-propuesta', fx('limpio'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verificar-docs: 2 archivos, 0 hallazgos/);
});

test('CLI: hallazgos salen con 1 e imprimen ruta:linea: regla: detalle', () => {
  const r = correr(fx('con-hallazgos', 'malo.md'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /malo\.md:3: enlace-roto: /);
  assert.match(r.stdout, /malo\.md:3: marcador-prohibido: /);
  assert.match(r.stdout, /verificar-docs: 1 archivos, 2 hallazgos/);
});

test('CLI: --exigir-propuesta activa la regla de estado', () => {
  const r = correr('--exigir-propuesta', fx('con-hallazgos', 'malo.md'));
  assert.match(r.stdout, /malo\.md:1: estado-propuesta: /);
});

test('CLI: uso invalido sale con 2', () => {
  assert.equal(correr().status, 2);
  assert.equal(correr(fx('no-existe.md')).status, 2);
  assert.equal(correr('--rara', fx('limpio')).status, 2);
});
