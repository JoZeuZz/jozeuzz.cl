import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ALLOWED_GIT_ARGS, createGitRunner, gitEnv, GIT_PREFIX } from '../src/exec.js';
import { inspectRepo, parseGitVersion } from '../src/git.js';
import { gitFixture, makeTree, tempDir } from '../test-support/fixture.js';

const GIT = '/usr/bin/git';
const runner = (opts = {}) => createGitRunner({ gitPath: GIT, home: '/nonexistent', ...opts });
const isRoot = process.getuid?.() === 0;

test('parseGitVersion', () => {
  assert.equal(parseGitVersion('git version 2.47.3\n'), '2.47.3');
  assert.equal(parseGitVersion('otra cosa'), null);
});

test('gitEnv construye el entorno desde cero, con PATH fijo y sin configuración global', () => {
  assert.deepEqual(gitEnv('/h'), {
    PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/h',
  });
  assert.equal(Object.hasOwn(gitEnv(null), 'HOME'), false);
  assert.deepEqual(GIT_PREFIX, ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null']);
});

test('la lista cerrada no contiene status', () => {
  assert.deepEqual(ALLOWED_GIT_ARGS, [['--version'], ['rev-parse', '--abbrev-ref', 'HEAD'], ['rev-parse', '--verify', 'HEAD']]);
});

test('git --version funciona con el entorno aislado', async () => {
  const result = await runner()(['--version'], '/');
  assert.equal(result.ok, true);
  assert.match(parseGitVersion(result.stdout), /^\d+\.\d+\.\d+$/);
});

test('el ejecutor rechaza argumentos fuera de la lista, incluido status', async () => {
  for (const args of [['fetch'], ['status', '--porcelain=v1', '-z', '--no-renames'], ['status'], ['rev-parse', 'HEAD']]) {
    assert.deepEqual(await runner()(args, '/'), { ok: false, reason: 'not-allowed' }, args.join(' '));
  }
});

test('repositorio: rama, HEAD y working tree sin inspeccionar', async (t) => {
  const dir = await tempDir(t);
  gitFixture(dir);
  await makeTree(dir, { 'a.txt': 'cambio\n', 'c.txt': 'sin seguimiento\n' });
  const { repo, checks, partial } = await inspectRepo(runner(), dir);
  assert.deepEqual(Object.keys(repo), ['inside', 'root', 'branch', 'head', 'detached', 'workingTree']);
  assert.equal(repo.inside, 'yes');
  assert.equal(repo.branch, 'main');
  assert.match(repo.head, /^[0-9a-f]{40}$/);
  assert.equal(repo.detached, 'no');
  assert.equal(repo.workingTree, 'not-inspected');
  assert.deepEqual(checks, []);
  assert.equal(partial, false);
});

test('HEAD separado', async (t) => {
  const dir = await tempDir(t);
  const git = gitFixture(dir);
  git('checkout', '-q', '--detach');
  const { repo, checks } = await inspectRepo(runner(), dir);
  assert.equal(repo.detached, 'yes');
  assert.equal(repo.branch, null);
  assert.ok(checks.some((c) => c.id === 'repo.detached' && c.severity === 'warn'));
});

test('repositorio sin commits: head-unavailable sin error', async (t) => {
  const dir = await tempDir(t);
  gitFixture(dir, { commit: false });
  const { repo, checks, partial } = await inspectRepo(runner(), dir);
  assert.deepEqual([repo.head, repo.branch, repo.detached, repo.workingTree], [null, null, 'unknown', 'not-inspected']);
  assert.deepEqual(checks.map((c) => `${c.id}:${c.severity}`), ['repo.head-unavailable:warn']);
  assert.equal(partial, false);
});

test('fuera de repositorio', async () => {
  const { repo, checks } = await inspectRepo(runner(), null);
  assert.equal(repo.inside, 'no');
  assert.equal(repo.workingTree, null);
  assert.deepEqual(checks.map((c) => `${c.id}:${c.severity}`), ['repo.outside:info']);
});

test('la configuración global del usuario no se lee', async (t) => {
  const dir = await tempDir(t);
  const home = join(dir, 'home');
  const repo = join(dir, 'repo');
  await makeTree(dir, { 'repo/': { dir: true }, 'home/.gitconfig': '[core\n' });
  gitFixture(repo);
  assert.equal((await createGitRunner({ gitPath: GIT, home })(['rev-parse', '--verify', 'HEAD'], repo)).ok, true);
  // Control: sin aislamiento, git lee el ~/.gitconfig inválido y falla.
  assert.throws(() => execFileSync(GIT, ['rev-parse', '--verify', 'HEAD'], { cwd: repo, env: { PATH: '/usr/bin:/bin', HOME: home }, stdio: 'pipe' }));
});

test('repositorio de otro propietario: head-unavailable sin excepción', { skip: !isRoot && 'requiere root para chown' }, async (t) => {
  const dir = await tempDir(t);
  gitFixture(dir);
  execFileSync('chown', ['-R', '65534:65534', dir]);
  const { repo, checks, partial } = await inspectRepo(runner(), dir);
  assert.equal(repo.head, null);
  assert.ok(checks.some((c) => c.id === 'repo.head-unavailable'));
  assert.equal(partial, false);
});

test('timeout y salida excesiva', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, {
    lento: { file: '#!/bin/sh\nsleep 5\n', mode: 0o755 },
    verboso: { file: '#!/bin/sh\nhead -c 4096 /dev/zero\n', mode: 0o755 },
  });
  assert.deepEqual(await createGitRunner({ gitPath: join(dir, 'lento'), home: null, timeoutMs: 200 })(['--version'], dir), { ok: false, reason: 'timeout' });
  assert.deepEqual(await createGitRunner({ gitPath: join(dir, 'verboso'), home: null, maxBuffer: 100 })(['--version'], dir), { ok: false, reason: 'output-too-large' });
});

test('timeout de rev-parse produce repo.git-failed y resultado parcial', async () => {
  const slow = async () => ({ ok: false, reason: 'timeout' });
  const { repo, checks, partial } = await inspectRepo(slow, '/repo');
  assert.equal(partial, true);
  assert.equal(repo.head, null);
  assert.deepEqual(checks.map((c) => `${c.id}:${c.severity}`), ['repo.git-failed:error']);
});
