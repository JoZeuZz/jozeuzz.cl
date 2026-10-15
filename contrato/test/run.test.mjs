import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const correr = (...args) => spawnSync(process.execPath, [path.join(raiz, 'run.mjs'), ...args], { encoding: 'utf8' });

test('sin --driver sale con 2 y avisa', () => {
  const r = correr();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Sin implementación: indica --driver <ruta al módulo del driver>/);
});

test('con el oráculo sale con 0 y lista todos los casos', () => {
  const r = correr('--driver', path.join(raiz, 'referencia', 'driver.mjs'));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /casos 51 · ok 51 · fail 0/);
  assert.match(r.stdout, /^ok  IN-01 /m);
  assert.match(r.stdout, /medida CO-05 propagacion_ms/);
});

test('--solo filtra y --json imprime resultados', () => {
  const r = correr('--driver', path.join(raiz, 'referencia', 'driver.mjs'), '--solo', 'ES-01,MO-01', '--json');
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout).map((x) => x.id), ['ES-01', 'MO-01']);
});

test('un driver con casos fallidos sale con 1', () => {
  const r = correr('--driver', path.join(raiz, 'referencia', 'mutante-cli.mjs'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL /);
});
