import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

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
  assert.match(r.stdout, /casos 56 · ok 56 · fail 0/);
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

// Driver sintético: delega en el oráculo pero lanza NoImplementado en la operación indicada.
function driverQueLanza(operacion) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contrato-'));
  const ruta = path.join(dir, 'driver.mjs');
  const base = pathToFileURL(path.join(raiz, 'referencia', 'driver.mjs')).href;
  const errores = pathToFileURL(path.join(raiz, 'errores.mjs')).href;
  fs.writeFileSync(
    ruta,
    `import { crearDriverConOpciones } from '${base}';
import { NoImplementado } from '${errores}';
export default async function () {
  const d = await crearDriverConOpciones();
  ${operacion}
  return d;
}`,
  );
  return ruta;
}

test('--alcance poc-1a: NoImplementado en un caso del alcance (CO-01) es FAIL y sale con 1', () => {
  const ruta = driverQueLanza(`d.canalesPublicos = d.canalesPublicos.map((c) => c.tipo === 'html' ? { ...c, leer: async () => { throw new NoImplementado('html'); } } : c);`);
  const r = correr('--driver', ruta, '--alcance', 'poc-1a', '--solo', 'CO-01');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL \(no implementado\) CO-01/);
});

test('--alcance poc-1a: NoImplementado fuera del alcance (IN-01) es pendiente y sale con 0', () => {
  const ruta = driverQueLanza(`d.intake.preparar = async () => { throw new NoImplementado('POC-3'); };`);
  const r = correr('--driver', ruta, '--alcance', 'poc-1a', '--solo', 'IN-01');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pendiente \(poc-3\):/);
  assert.match(r.stdout, /pendiente IN-01/);
  assert.match(r.stdout, /casos 1 · ok 0 · fail 0 · pendiente 1/);
});

test('sin --alcance, NoImplementado sigue siendo fallo', () => {
  const ruta = driverQueLanza(`d.intake.preparar = async () => { throw new NoImplementado('POC-3'); };`);
  const r = correr('--driver', ruta, '--solo', 'IN-01');
  assert.equal(r.status, 1);
});

test('un FAIL real fuera del alcance sigue siendo FAIL con --alcance', () => {
  const r = correr('--driver', path.join(raiz, 'referencia', 'mutante-cli.mjs'), '--alcance', 'poc-1a', '--solo', 'ES-05');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL ES-05/);
});

test('el CLI imprime siempre las justificaciones de noAplica', () => {
  const r = correr('--driver', path.join(raiz, 'referencia', 'driver.mjs'), '--solo', 'CO-01');
  assert.match(r.stdout, /no aplica «accion»/);
});

test('--alcance desconocido sale con 2', () => {
  const r = correr('--driver', path.join(raiz, 'referencia', 'driver.mjs'), '--alcance', 'otro');
  assert.equal(r.status, 2);
});
