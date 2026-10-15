import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { auditFixture, makeTree, runBin, runInProcess, tempDir } from '../test-support/fixture.js';

async function env(t) {
  const base = await tempDir(t);
  const home = join(base, 'home');
  await makeTree(base, { 'trabajo/': { dir: true } });
  await auditFixture(home);
  return { home, cwd: join(base, 'trabajo'), env: { HOME: home, PATH: process.env.PATH } };
}

test('--help, skills --help y --version', async (t) => {
  const e = await env(t);
  for (const args of [['--help'], ['skills', '--help']]) {
    const help = runBin(args, e);
    assert.equal(help.code, 0, args.join(' '));
    assert.match(help.stdout, /Uso: jz-ai <comando> \[--json\]/);
    assert.equal(help.stderr, '');
  }
  assert.deepEqual(runBin(['--version'], e), { code: 0, stdout: 'jz-ai 0.1.0\n', stderr: '' });
});

test('la ayuda no inspecciona nada', async () => {
  const explode = () => { throw new Error('no debería inspeccionar'); };
  const ctx = new Proxy({}, { get: explode });
  for (const args of [['--help'], ['skills', '--help']]) {
    const result = await runInProcess(args, ctx);
    assert.equal(result.code, 0, args.join(' '));
    assert.equal(result.stderr, '');
  }
});

test('uso inválido devuelve 2 sin inspeccionar', async (t) => {
  const e = await env(t);
  const invalid = [
    [], ['nada'], ['skills', 'extra'], ['skills', '--offline'], ['skills', '--probe-versions'], ['--json'], ['skills', '--json=1'],
    ['-h'], ['--help', 'skills'], ['--help', '--json'], ['skills', '--help', '--json'], ['skills', '--json', '--help'], ['nada', '--help'],
    ['skills', '--version'], ['nada', '--version'], ['--help', '--version'], ['--version', '--version'], ['--help', '--help'],
    ['skills', '--\x1b[2J'],
  ];
  for (const args of invalid) {
    const result = runBin(args, e);
    assert.equal(result.code, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Uso: jz-ai/);
    assert.ok(!result.stderr.includes('\x1b'));
  }
});

test('skills --json es JSON válido y determinista', async (t) => {
  const e = await env(t);
  const first = runBin(['skills', '--json'], e);
  const second = runBin(['skills', '--json'], e);
  assert.equal(first.code, 0);
  assert.equal(first.stdout, second.stdout);
  assert.equal(JSON.parse(first.stdout).schemaVersion, 1);
  assert.equal(first.stderr, '');
});

test('skills en texto es determinista', async (t) => {
  const e = await env(t);
  assert.equal(runBin(['skills'], e).stdout, runBin(['skills'], e).stdout);
});

test('fallo interno: documento de error con mensaje fijo y código 3', async (t) => {
  const e = await env(t);
  const ctx = createContext({ env: e.env, cwd: e.cwd });
  const fail = (error) => ({ ...ctx, fs: { ...ctx.fs, lstat: async () => { throw error; } } });
  const leaky = fail(new Error(`boom ${e.home} JZAI-CANARY-err \x1b[31m`));
  const result = await runInProcess(['skills', '--json'], leaky);
  assert.equal(result.code, 3);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1, command: 'skills', tool: { name: 'jz-ai', version: '0.1.0' }, completeness: 'failed',
    error: { code: 'INTERNAL', message: 'Fallo interno inesperado.' },
  });
  const text = await runInProcess(['skills'], leaky);
  assert.deepEqual(text, { code: 3, stdout: '', stderr: 'jz-ai skills: fallo interno inesperado.\n' });
  const withCode = await runInProcess(['skills', '--json'], fail(Object.assign(new Error('x'), { code: 'EIO' })));
  assert.equal(JSON.parse(withCode.stdout).error.message, 'Fallo interno inesperado (EIO).');
  for (const out of [result, text, withCode]) assert.ok(!`${out.stdout}${out.stderr}`.includes('JZAI-CANARY-err'));
});
