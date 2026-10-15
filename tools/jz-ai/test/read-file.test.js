import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFsRead, readBounded, readdirBounded } from '../src/fs-read.js';
import { createContext, envValue, resolveHome } from '../src/context.js';
import { countingOpendir, makeTree, tempDir } from '../test-support/fixture.js';

test('readBounded lee un archivo regular', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { 'a.md': 'hola' });
  assert.deepEqual(await readBounded(join(dir, 'a.md'), 10), { ok: true, bytes: Buffer.from('hola') });
});

test('readBounded no sigue un symlink final (O_NOFOLLOW)', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { 'a.md': 'hola', 'l.md': { link: 'a.md' } });
  await assert.rejects(readBounded(join(dir, 'l.md'), 10), { code: 'ELOOP' });
});

test('readBounded no bloquea con un FIFO', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { fifo: { fifo: true } });
  assert.deepEqual(await readBounded(join(dir, 'fifo'), 10), { ok: false, reason: 'not-file' });
});

test('readBounded rechaza directorios', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { sub: { dir: true } });
  assert.deepEqual(await readBounded(join(dir, 'sub'), 10), { ok: false, reason: 'not-file' });
});

test('readBounded respeta el límite exacto', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { justo: 'x'.repeat(10), grande: 'x'.repeat(11) });
  assert.equal((await readBounded(join(dir, 'justo'), 10)).ok, true);
  assert.deepEqual(await readBounded(join(dir, 'grande'), 10), { ok: false, reason: 'too-large' });
});

test('la fachada no expone enumeración sin límite', () => {
  assert.deepEqual(Object.keys(createFsRead()).sort(), ['lstat', 'readBounded', 'readdirBounded', 'realpath']);
});

test('createContext toma HOME del entorno, no lo inventa y exige ruta absoluta', () => {
  assert.equal(createContext({ env: { HOME: '/h' }, cwd: '/c' }).home, '/h');
  const ctx = createContext({ env: {}, cwd: '/c' });
  assert.deepEqual([ctx.home, ctx.homeProblem], [null, 'no definida']);
  assert.equal(ctx.cwd, '/c');
  assert.equal(ctx.gitPath, '/usr/bin/git');
  assert.match(ctx.runtime.node, /^v\d+\.\d+\.\d+/);
  assert.deepEqual(resolveHome({ HOME: '' }), { home: null, homeProblem: 'vacía' });
  assert.deepEqual(resolveHome({ HOME: 'rel/home' }), { home: null, homeProblem: 'relativa' });
  assert.deepEqual(resolveHome({ HOME: undefined }), { home: null, homeProblem: 'no definida' });
});

test('envValue distingue definida vacía de ausente y no lee heredadas', () => {
  assert.equal(envValue({ A: '' }, 'A'), '');
  assert.equal(envValue({}, 'A'), null);
  assert.equal(envValue({ A: undefined }, 'A'), null);
  assert.equal(envValue({}, 'constructor'), null);
});

test('readdirBounded ordena y no trunca en la frontera exacta', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { b: '', B: '', a: '' });
  const counter = countingOpendir();
  assert.deepEqual(await readdirBounded(dir, 3, () => false, counter.opendir), { names: ['B', 'a', 'b'], truncated: false });
  assert.equal(counter.stats.total(), 3);
  assert.equal(counter.stats.closed, 1);
});

test('readdirBounded se detiene al superar el máximo y no devuelve un subconjunto', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ''])));
  const counter = countingOpendir();
  assert.deepEqual(await readdirBounded(dir, 3, () => false, counter.opendir), { names: [], truncated: true });
  assert.equal(counter.stats.total(), 4, 'materializa a lo sumo max + 1 entradas');
  assert.equal(counter.stats.closed, 1);
});

test('readdirBounded: los nombres omitidos no consumen el máximo', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { a: '', node_modules: { dir: true }, b: '' });
  const result = await readdirBounded(dir, 2, (name) => name === 'node_modules');
  assert.deepEqual(result, { names: ['a', 'b'], truncated: false });
});

test('readdirBounded cierra el directorio si la lectura falla', async () => {
  let closed = 0;
  let reads = 0;
  const opendir = async () => ({
    async read() {
      reads += 1;
      if (reads === 2) throw Object.assign(new Error('EIO'), { code: 'EIO' });
      return { name: `n${reads}` };
    },
    async close() { closed += 1; },
  });
  await assert.rejects(readdirBounded('/x', 10, () => false, opendir), { code: 'EIO' });
  assert.equal(closed, 1);
});
