import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ALCANCES, CASOS } from '../casos/index.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const correr = (...args) => spawnSync(process.execPath, [path.join(raiz, 'run.mjs'), ...args], { encoding: 'utf8' });
const driver = path.join(raiz, 'referencia', 'driver.mjs');

const totales = (casos) =>
  `casos ${casos.length} · ${ALCANCES.map((a) => `${a} ${casos.filter((c) => c.alcance === a).length}`).join(' · ')}`;
const lineasDe = (casos) => [...casos.map((c) => `${c.id}\t${c.alcance}\t${c.titulo}`), totales(casos)];

test('--listar sin --driver sale con 0 y lista todos los casos en orden con totales', () => {
  const r = correr('--listar');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(r.stdout.trimEnd().split('\n'), lineasDe(CASOS));
});

test('la línea final de totales tiene el formato esperado', () => {
  const r = correr('--listar');
  const ultima = r.stdout.trimEnd().split('\n').at(-1);
  assert.match(ultima, /^casos \d+ · poc-1a \d+ · poc-1b \d+ · poc-3 \d+$/);
});

test('--listar no carga ningún driver', () => {
  const r = correr('--listar');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout + r.stderr, /Sin implementación|No se pudo cargar el driver/);
});

test('--listar --alcance poc-1b lista sólo ese alcance y el total', () => {
  const r = correr('--listar', '--alcance', 'poc-1b');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const filtrados = CASOS.filter((c) => c.alcance === 'poc-1b');
  assert.ok(filtrados.length > 0);
  const lineas = r.stdout.trimEnd().split('\n');
  assert.deepEqual(lineas.slice(0, -1), lineasDe(filtrados).slice(0, -1));
  assert.match(lineas.at(-1), new RegExp(`^casos ${filtrados.length} · `));
  assert.ok(lineas.slice(0, -1).every((l) => l.split('\t')[1] === 'poc-1b'));
});

test('--listar con --alcance desconocido sale con 2', () => {
  const r = correr('--listar', '--alcance', 'nada');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--alcance desconocido «nada»/);
});

for (const extra of [['--driver', driver], ['--solo', 'ES-01'], ['--json']]) {
  test(`--listar combinado con ${extra[0]} sale con 2 y avisa`, () => {
    const r = correr('--listar', ...extra);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--listar/);
    assert.match(r.stderr, new RegExp(extra[0]));
    assert.equal(r.stdout, '');
  });
}
