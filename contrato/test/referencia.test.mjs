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

test('hay 56 casos con identificadores únicos', () => {
  assert.equal(CASOS.length, 56);
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

test('el alcance se reparte: 13 en poc-1a, el resto en poc-1b y poc-3', () => {
  const por = (a) => CASOS.filter((c) => c.alcance === a).map((c) => c.id);
  assert.deepEqual(new Set(por('poc-1a')), new Set(['CO-01', 'CO-02', 'CO-03', 'CO-04', 'CO-05', 'CO-06', 'CO-07', 'PR-04', 'PR-07', 'AU-05', 'AU-06', 'AU-07', 'CA-02']));
  assert.equal(por('poc-1a').length, 13);
  assert.equal(por('poc-3').length, 12);
  assert.equal(por('poc-1a').length + por('poc-1b').length + por('poc-3').length, CASOS.length);
});

test('la forma exige un canal sitemap', async () => {
  const d = await crearDriver();
  d.canalesPublicos = d.canalesPublicos.filter((c) => c.tipo !== 'sitemap');
  assert.throws(() => assertDriverShape(d), /sitemap/);
});

test('la forma exige cubrir cada tipo de canal: cerrado o noAplica justificado', async () => {
  const d = await crearDriver();
  d.canalesCerrados = [];
  assert.throws(() => assertDriverShape(d), /tipo de canal «graphql» sin cubrir/);
  d.noAplica = { graphql: '   ', accion: 'x' };
  assert.throws(() => assertDriverShape(d), /«graphql»/);
  d.noAplica = { graphql: 'no existe', accion: 'x' };
  assert.equal(assertDriverShape(d), true);
});

test('la forma exige baseUrl o enMemoria', async () => {
  const d = await crearDriver();
  delete d.enMemoria;
  assert.throws(() => assertDriverShape(d), /baseUrl/);
  d.baseUrl = 'http://127.0.0.1:1';
  assert.equal(assertDriverShape(d), true);
});
