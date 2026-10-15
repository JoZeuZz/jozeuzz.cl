import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { REPO_ROOT_ENTRIES, findExecutable, inferClaudeVersion, inspectGit, runDoctor } from '../src/doctor.js';
import { renderDoctorText } from '../src/render.js';
import { createFsRead } from '../src/fs-read.js';
import { gitFixture, makeTree, runBin, runInProcess, tempDir } from '../test-support/fixture.js';

const isRoot = process.getuid?.() === 0;

async function setup(t, extraEnv = {}, contextOptions = {}) {
  const base = await tempDir(t);
  const home = join(base, 'home');
  await makeTree(base, {
    'home/.local/share/claude/versions/2.1.300': { file: '#!/bin/sh\ntouch "$0.ejecutado"\n', mode: 0o755 },
    'bin/claude': { link: '../home/.local/share/claude/versions/2.1.300' },
    'bin/opencode': { file: '#!/bin/sh\ntouch "$0.ejecutado"\n', mode: 0o755 },
    'home/.claude/.credentials.json': { file: '{"t":"JZAI-CANARY-doc"}', mode: 0o644 },
    'home/.claude/settings.real.json': '{}',
    'home/.claude/settings.json': { link: 'settings.real.json' },
    'trabajo/': { dir: true },
  });
  const env = { HOME: home, PATH: join(base, 'bin'), ...extraEnv };
  return { base, home, env, ctx: createContext({ env, cwd: join(base, 'trabajo'), ...contextOptions }) };
}

const ids = (doc) => doc.checks.map((c) => `${c.id}:${c.severity}`);
const markers = (base) => execFileSync('sh', ['-c', `find "${base}" -name '*.ejecutado'`], { encoding: 'utf8' });

test('versiones verificadas, inferidas y desconocidas sin ejecutar Claude ni OpenCode', async (t) => {
  const { base, ctx } = await setup(t);
  const doc = await runDoctor(ctx);
  const tools = Object.fromEntries(doc.tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(doc.tools.map((tool) => tool.name), ['git', 'node', 'claude', 'opencode']);
  assert.equal(tools.git.version.confidence, 'verified');
  assert.equal(tools.node.version.source, 'process.version');
  assert.deepEqual(tools.claude.version, { value: '2.1.300', confidence: 'inferred', source: 'realpath' });
  assert.deepEqual(tools.opencode.version, { value: null, confidence: 'unknown', source: null });
  assert.equal(tools.git.path, '/usr/bin/git');
  assert.ok(ids(doc).includes('tool.opencode.version-unknown:info'));
  assert.equal(markers(base), '');
});

test('claude y opencode ausentes', async (t) => {
  const { ctx } = await setup(t, { PATH: '/nonexistent' });
  const doc = await runDoctor(ctx);
  assert.ok(ids(doc).includes('tool.claude.missing:info'));
  assert.ok(ids(doc).includes('tool.opencode.missing:info'));
});

test('rutas sensibles: sólo metadata, permisos amplios y symlink', async (t) => {
  const { ctx } = await setup(t);
  const doc = await runDoctor(ctx);
  const cred = doc.paths.find((p) => p.id === 'claude-credentials');
  assert.deepEqual(cred, { id: 'claude-credentials', path: cred.path, category: 'credentials', sensitive: 'yes', exists: 'yes', type: 'file', mode: '0644', ownerUid: cred.ownerUid, contentRead: 'no' });
  assert.equal(doc.paths.find((p) => p.id === 'claude-settings').type, 'symlink');
  const ids = doc.checks.map((c) => `${c.id}:${c.severity}`);
  assert.ok(ids.includes('paths.claude-credentials.permissive:warn'));
  assert.ok(ids.includes('paths.claude-settings.unexpected-type:warn'));
  assert.ok(!JSON.stringify(doc).includes('JZAI-CANARY-doc'));
});

test('variables de entorno: sólo presencia', async (t) => {
  const { ctx } = await setup(t, { ANTHROPIC_API_KEY: 'JZAI-CANARY-env' });
  const doc = await runDoctor(ctx);
  assert.deepEqual(doc.env.find((e) => e.name === 'ANTHROPIC_API_KEY'), { name: 'ANTHROPIC_API_KEY', set: 'yes' });
  assert.ok(doc.checks.some((c) => c.id === 'env.provider-keys'));
  assert.ok(!JSON.stringify(doc).includes('JZAI-CANARY-env'));
});

test('variable definida vacía cuenta como definida pero no como clave de proveedor', async (t) => {
  const { ctx } = await setup(t, { OPENAI_API_KEY: '' });
  const doc = await runDoctor(ctx);
  assert.deepEqual(doc.env.find((e) => e.name === 'OPENAI_API_KEY'), { name: 'OPENAI_API_KEY', set: 'yes' });
  assert.equal(doc.env.find((e) => e.name === 'ANTHROPIC_API_KEY').set, 'no');
  assert.ok(!doc.checks.some((c) => c.id === 'env.provider-keys'));
});

test('orden de claves y repositorio ausente', async (t) => {
  const { ctx } = await setup(t);
  const doc = await runDoctor(ctx);
  assert.deepEqual(Object.keys(doc), ['schemaVersion', 'command', 'tool', 'completeness', 'runtime', 'tools', 'repo', 'paths', 'env', 'checks']);
  assert.equal(doc.repo.inside, 'no');
  assert.equal(doc.completeness, 'complete');
});

test('Node antiguo y HOME ausente producen errores y código 1', async (t) => {
  const { ctx } = await setup(t);
  const old = await runInProcess(['doctor', '--json'], { ...ctx, runtime: { ...ctx.runtime, node: 'v18.0.0' } });
  assert.equal(old.code, 1);
  assert.ok(JSON.parse(old.stdout).checks.some((c) => c.id === 'runtime.node' && c.severity === 'error'));
  for (const [HOME, motivo] of [[undefined, 'no definida'], ['', 'vacía'], ['rel', 'relativa']]) {
    const noHome = await runInProcess(['doctor', '--json'], createContext({ env: { ...ctx.env, HOME }, cwd: ctx.cwd }));
    const doc = JSON.parse(noHome.stdout);
    assert.equal(noHome.code, 1);
    assert.equal(doc.completeness, 'partial');
    assert.ok(doc.checks.some((c) => c.id === 'env.home-unset' && c.message.includes(motivo)));
  }
});

test('git ausente fuera de un repositorio: error sin resultado parcial', async (t) => {
  const { ctx } = await setup(t, {}, { gitPath: '/nonexistent/git' });
  const doc = await runDoctor(ctx);
  assert.deepEqual(doc.tools[0], { name: 'git', found: 'no', path: null, version: { value: null, confidence: 'unknown', source: null } });
  assert.ok(ids(doc).includes('tool.git.missing:error'));
  assert.ok(ids(doc).includes('repo.outside:info'));
  assert.equal(doc.completeness, 'complete');
});

test('git ausente dentro de un repositorio: repo.git-unavailable y parcial', async (t) => {
  const { base, env } = await setup(t);
  gitFixture(join(base, 'trabajo'));
  const doc = await runDoctor(createContext({ env, cwd: join(base, 'trabajo'), gitPath: join(base, 'nada/git') }));
  assert.equal(doc.repo.inside, 'yes');
  assert.deepEqual([doc.repo.branch, doc.repo.head, doc.repo.detached, doc.repo.workingTree], [null, null, 'unknown', 'not-inspected']);
  assert.ok(ids(doc).includes('repo.git-unavailable:warn'));
  assert.equal(doc.completeness, 'partial');
});

test('git no validado: tool.git.untrusted y no se ejecuta', async (t) => {
  const { base, env } = await setup(t);
  await makeTree(base, { 'falso/git': { file: '#!/bin/sh\ntouch "$0.ejecutado"\n', mode: 0o777 } });
  const doc = await runDoctor(createContext({ env, cwd: join(base, 'trabajo'), gitPath: join(base, 'falso/git') }));
  assert.equal(doc.tools[0].found, 'yes');
  assert.equal(doc.tools[0].version.confidence, 'unknown');
  assert.ok(ids(doc).includes('tool.git.untrusted:error'));
  assert.equal(markers(base), '');
});

test('git --version irreconocible: tool.git.version-unknown', { skip: !isRoot && 'el fixture debe pertenecer a root' }, async (t) => {
  const { base, env } = await setup(t);
  await makeTree(base, { 'raro/git': { file: '#!/bin/sh\necho hola\n', mode: 0o755 } });
  const doc = await runDoctor(createContext({ env, cwd: join(base, 'trabajo'), gitPath: join(base, 'raro/git') }));
  assert.ok(ids(doc).includes('tool.git.version-unknown:warn'));
});

test('inspectGit exige archivo regular de root sin escritura de grupo u otros', async (t) => {
  const { base } = await setup(t);
  await makeTree(base, { 'g/ok': { file: '', mode: 0o755 }, 'g/abierto': { file: '', mode: 0o775 }, 'g/noexec': { file: '', mode: 0o644 }, 'g/dir/': { dir: true } });
  const fs = createFsRead();
  assert.equal((await inspectGit(fs, join(base, 'nada'))).status, 'missing');
  assert.equal((await inspectGit(fs, join(base, 'g/abierto'))).status, 'untrusted');
  assert.equal((await inspectGit(fs, join(base, 'g/noexec'))).status, 'untrusted');
  assert.equal((await inspectGit(fs, join(base, 'g/dir'))).status, 'untrusted');
  if (isRoot) assert.equal((await inspectGit(fs, join(base, 'g/ok'))).status, 'ok');
});

test('doctor y doctor --json son deterministas byte a byte', async (t) => {
  const { base, env } = await setup(t);
  const cwd = join(base, 'trabajo');
  gitFixture(cwd);
  for (const args of [['doctor'], ['doctor', '--json']]) {
    const first = runBin(args, { cwd, env });
    const second = runBin(args, { cwd, env });
    assert.notEqual(first.code, 3, first.stderr);
    assert.equal(first.stdout, second.stdout, args.join(' '));
    assert.equal(first.stderr, second.stderr);
  }
});

test('findExecutable e inferClaudeVersion', async (t) => {
  const { base } = await setup(t);
  const found = await findExecutable(createFsRead(), 'claude', [join(base, 'nada'), join(base, 'bin')]);
  assert.equal(found.path, join(base, 'bin/claude'));
  assert.equal(inferClaudeVersion(found.realPath), '2.1.300');
  assert.equal(inferClaudeVersion('/usr/bin/claude'), null);
});

test('doctor --help no inspecciona nada', async () => {
  const ctx = new Proxy({}, { get: () => { throw new Error('no debería inspeccionar'); } });
  const result = await runInProcess(['doctor', '--help'], ctx);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Uso: jz-ai/);
});

test('raíz del repositorio: lectura acotada; truncada o ilegible no afirma ausencia de .env*', async (t) => {
  const { base, env } = await setup(t);
  const cwd = join(base, 'trabajo');
  gitFixture(cwd);
  await makeTree(cwd, { '.env': 'JZAI-CANARY-dotenv' });
  const real = createContext({ env, cwd });
  const maxima = [];
  // Sustituye sólo la enumeración de la raíz; readdir sin límite no debe usarse.
  const withRoot = (outcome) => ({ ...real, fs: { ...real.fs,
    readdir: () => { throw new Error('enumeración sin límite'); },
    readdirBounded: async (path, max, skip) => {
      if (path !== cwd) return real.fs.readdirBounded(path, max, skip);
      maxima.push(max);
      if (outcome instanceof Error) throw outcome;
      return outcome ?? real.fs.readdirBounded(path, max, skip);
    },
  } });
  const scanChecks = (doc) => ids(doc).filter((id) => id.startsWith('repo.env-scan-'));

  const normal = await runDoctor(withRoot(null));
  assert.equal(REPO_ROOT_ENTRIES, 1000);
  assert.deepEqual(maxima, [1000]);
  assert.ok(normal.paths.some((p) => p.id === 'repo-env:.env'));
  assert.deepEqual(scanChecks(normal), []);

  const truncated = await runDoctor(withRoot({ names: [], truncated: true }));
  assert.ok(!truncated.paths.some((p) => p.id.startsWith('repo-env:')), 'sin subconjunto');
  assert.deepEqual(scanChecks(truncated), ['repo.env-scan-truncated:warn']);
  assert.equal(truncated.completeness, 'partial');

  const failed = await runDoctor(withRoot(Object.assign(new Error('JZAI-CANARY-err'), { code: 'EACCES' })));
  assert.ok(!failed.paths.some((p) => p.id.startsWith('repo-env:')));
  assert.deepEqual(scanChecks(failed), ['repo.env-scan-failed:warn']);
  assert.ok(failed.checks.find((c) => c.id === 'repo.env-scan-failed').message.includes('(EACCES)'));
  assert.equal(failed.completeness, 'partial');
  assert.ok(![normal, truncated, failed].some((doc) => /JZAI-CANARY-(dotenv|err)/.test(JSON.stringify(doc))));
});

test('texto de doctor', async (t) => {
  const { ctx, home } = await setup(t);
  const text = renderDoctorText(await runDoctor(ctx), home);
  for (const header of ['[runtime]', '[tools]', '[repo]', '[paths]', '[env]', '[checks]']) assert.ok(text.includes(header), header);
  assert.ok(text.includes('2.1.300\tinferred'));
  assert.ok(!text.includes('\x1b'));
});
