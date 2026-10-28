import assert from 'node:assert/strict';
import test from 'node:test';
import { CASOS } from '../casos/index.mjs';
import { assertDriverShape } from '../driver.mjs';
import crearDriver from '../referencia/driver.mjs';
import { runCases } from '../runner.mjs';

test('el oráculo cumple la forma del driver', async () => {
  assert.equal(assertDriverShape(await crearDriver()), true);
});

test('assertDriverShape explica qué falta', async () => {
  const d = await crearDriver();
  delete d.logs;
  assert.throws(() => assertDriverShape(d), /falta o es incorrecto «logs»/);
  const sinCanales = { ...(await crearDriver()), canalesPublicos: [] };
  assert.throws(() => assertDriverShape(sinCanales), /canalesPublicos/);
  assert.throws(() => assertDriverShape(null), /driver/);
});

test('hay 51 casos con identificadores únicos', () => {
  assert.equal(CASOS.length, 51);
  assert.equal(new Set(CASOS.map((c) => c.id)).size, CASOS.length);
});

test('todos los casos pasan contra el oráculo', async () => {
  const resultados = await runCases(crearDriver, CASOS);
  assert.equal(resultados.length, CASOS.length);
  const fallos = resultados.filter((r) => !r.ok).map((r) => `${r.id}: ${r.error}`);
  assert.deepEqual(fallos, []);
});

test('el filtro de runCases limita los casos ejecutados', async () => {
  const resultados = await runCases(crearDriver, CASOS, { filtro: ['ES-01', 'MO-01'] });
  assert.deepEqual(resultados.map((r) => r.id), ['ES-01', 'MO-01']);
});
