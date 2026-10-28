import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Recuperación real de jz-coord: un controlador en su propio proceso (fixtures/coord-child.mjs) que se mata
// con SIGKILL, un motor sintético vivo en su propio grupo de procesos, git real (snapshot, restauración) y
// jz-git real (commit con Jz-Op y push a un remoto local). Se verifica con git, no con lo que dice el estado.

const here = dirname(fileURLToPath(import.meta.url));
const child = join(here, 'fixtures', 'coord-child.mjs');
const engine = join(here, 'fixtures', 'coord-engine.mjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

const progress = [{ type: 'progress', note: 'step done' }];
const pause = [{ type: 'blocked', reason: 'pause' }];
const complete = [{ type: 'complete', summary: 'done' }];
// Turno 1: cambios de los tres tipos (modificado, nuevo en un directorio nuevo, borrado).
const changes = { write: { 'src/a.txt': 'changed\n', 'src/sub/new.txt': 'new\n' }, delete: ['src/del.txt'], reply: progress };
const checkTest = `import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
test('changes', () => {
  assert.equal(readFileSync('src/a.txt', 'utf8'), 'changed\\n');
  assert.equal(readFileSync('src/sub/new.txt', 'utf8'), 'new\\n');
  assert.equal(existsSync('src/del.txt'), false);
});
`;

function sh(cmd, argv, opts = {}) {
  const out = spawnSync(cmd, argv, { encoding: 'utf8', ...opts });
  return { rc: out.status ?? 1, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}

function fixture(t, { push = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'jz-coord-real-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'repo');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  const git = (...args) => sh('git', ['-C', root, ...args]);
  git('init', '-q', '-b', 'feat/text-utils');
  git('config', 'user.name', 'jz-test');
  git('config', 'user.email', 'jz-test@localhost');
  writeFileSync(join(root, 'src', 'a.txt'), 'base\n');
  writeFileSync(join(root, 'src', 'del.txt'), 'delete me\n');
  writeFileSync(join(root, 'src', 'keep.txt'), 'keep\n');
  writeFileSync(join(root, 'test', 'check.test.js'), checkTest);
  writeFileSync(join(root, '.gitignore'), '.jz-state/\n');
  const goal = {
    schema: 'jz-coord-goal-v1', id: 'real-recovery', objective: 'Apply the scripted changes', criteria: ['checks green'], branch: 'feat/text-utils',
    allowedPaths: ['src'], checks: [{ id: 'unit', argv: ['node', '--test', 'test/check.test.js'] }], commit: { message: 'feat: scripted changes' },
    engines: ['claude'], maxTurns: 8, timeoutMinutes: 5, push
  };
  writeFileSync(join(root, 'goal.json'), `${JSON.stringify(goal)}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  let policy;
  if (push) {
    const remote = join(base, 'remote.git');
    sh('git', ['init', '-q', '--bare', remote]);
    git('remote', 'add', 'origin', remote);
    policy = join(base, 'gitops.json');
    writeFileSync(policy, JSON.stringify({ schema: 'jz-gitops-policy-v1', push: { remotes: { origin: remote }, branches: ['feat/*'] } }));
  }
  const bin = join(base, 'claude');
  writeFileSync(bin, `#!/bin/sh\nexec '${process.execPath}' '${engine}' "$@"\n`);
  chmodSync(bin, 0o755);
  mkdirSync(join(root, '.jz-state', 'coord'), { recursive: true });
  const stateDir = join(root, '.jz-state', 'coord', 'run');
  const f = {
    base, root, stateDir, git, policy, bin,
    head: git('rev-parse', 'HEAD').stdout.trim(),
    script: (steps) => writeFileSync(join(root, '.jz-state', 'engine.json'), JSON.stringify(steps)),
    state: () => JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf8')),
    commits: () => Number(git('rev-list', '--count', `${f.head}..HEAD`).stdout.trim()),
    run: (mode, env = {}) => new Promise((resolve) => {
      const proc = spawn(process.execPath, [child, root, stateDir, mode, bin, policy ?? ''], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d) => { out += d; });
      proc.stderr.on('data', (d) => { err += d; });
      proc.on('close', (rc, signal) => {
        let json = null;
        try { json = JSON.parse(out.trim().split('\n').at(-1)); } catch {}
        resolve({ rc, signal, json, err });
      });
      f.last = proc;
    })
  };
  return f;
}

async function waitFor(check, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await sleep(50);
  }
  return false;
}

test('controller killed with the engine still alive: resume refuses to write until the engine is gone, then recovers', async (t) => {
  const f = fixture(t);
  const pidFile = join(f.base, 'engine.pid');
  f.script({ 1: changes, 2: { hang: true, pidFile }, 3: { reply: complete } });
  const running = f.run('lead');
  assert.ok(await waitFor(() => existsSync(pidFile)), 'the engine of turn 2 started');
  const enginePid = Number(readFileSync(pidFile, 'utf8'));
  t.after(() => { try { process.kill(-enginePid, 'SIGKILL'); } catch {} });
  await waitFor(() => f.state().lease?.pid === enginePid);
  f.last.kill('SIGKILL');
  const killed = await running;
  assert.equal(killed.signal, 'SIGKILL');
  assert.ok(alive(enginePid), 'the engine survives the controller (own process group)');

  const blocked = await f.run('resume');
  assert.equal(blocked.rc, 2);
  assert.match(blocked.json.reason, new RegExp(`lease held by claude \\(pid ${enginePid}\\)`));
  assert.ok(alive(enginePid), 'a live lease holder is not killed before the lease expires');
  const kept = f.state();
  assert.equal(kept.lease?.pid, enginePid, 'the lease survives the blocked resume');
  assert.equal(kept.lease.identity.pid, enginePid);
  assert.ok(kept.lease.token, 'the lease token is recorded');

  process.kill(-enginePid, 'SIGKILL');
  assert.ok(await waitFor(() => !alive(enginePid)));
  const done = await f.run('resume');
  assert.equal(done.rc, 0, done.err || JSON.stringify(done.json));
  const state = f.state();
  assert.deepEqual(state.turns.map((x) => x.outcome), ['ok', 'interrupted', 'ok']);
  assert.equal(f.commits(), 1);
  assert.equal(f.git('show', 'HEAD:src/a.txt').stdout, 'changed\n');
  assert.equal(f.git('status', '--porcelain').stdout, '');
});

test('two simultaneous resumes: one runs, the other is refused without touching the state', async (t) => {
  const f = fixture(t);
  f.script({ 1: changes, 2: { reply: pause }, 3: { waitMs: 1500, reply: complete } });
  assert.equal((await f.run('lead')).rc, 2);
  const first = f.run('resume');
  assert.ok(await waitFor(() => existsSync(join(f.stateDir, 'controller.lock'))));
  const second = await f.run('resume');
  assert.equal(second.rc, 2);
  assert.match(second.json.reason, /controller pid \d+ active/);
  const result = await first;
  assert.equal(result.rc, 0, result.err);
  assert.equal(f.commits(), 1);
  assert.equal(f.state().turns.length, 3);
  assert.ok(!existsSync(join(f.stateDir, 'controller.lock')));
});

test('changes lost after a valid checkpoint are restored exactly: modified, new and deleted files', async (t) => {
  for (const loss of ['all', 'partial']) {
    const f = fixture(t);
    f.script({ 1: changes, 2: { reply: pause }, 3: { reply: complete } });
    assert.equal((await f.run('lead')).rc, 2);
    const cp = f.state().checkpoints.at(-1);
    assert.deepEqual([...cp.paths].sort(), ['src/a.txt', 'src/del.txt', 'src/sub/new.txt']);
    if (loss === 'all') {
      f.git('checkout', '--', '.');
      f.git('clean', '-fdq', '--', 'src');
    } else {
      f.git('checkout', '--', 'src/a.txt');
    }
    assert.equal(readFileSync(join(f.root, 'src', 'a.txt'), 'utf8'), 'base\n');
    const done = await f.run('resume');
    assert.equal(done.rc, 0, `${loss}: ${done.err || JSON.stringify(done.json)}`);
    const state = f.state();
    assert.ok(state.events.some((e) => e.event === 'restored'), `${loss}: restored event`);
    assert.equal(f.commits(), 1);
    assert.equal(f.git('rev-parse', 'HEAD:src').stdout, f.git('rev-parse', `${cp.tree}:src`).stdout, `${loss}: the commit has exactly the checkpoint tree`);
  }
});

test('a divergent tree blocks the resume and is left byte for byte as found', async (t) => {
  const f = fixture(t);
  f.script({ 1: changes, 2: { reply: pause }, 3: { reply: complete } });
  assert.equal((await f.run('lead')).rc, 2);
  writeFileSync(join(f.root, 'src', 'a.txt'), 'edited by someone else\n');
  rmSync(join(f.root, 'src', 'sub', 'new.txt'));
  const before = f.git('status', '--porcelain', '-uall').stdout;
  const result = await f.run('resume');
  assert.equal(result.rc, 2);
  assert.match(result.json.reason, /worktree changed since checkpoint \d+: src\/a.txt/);
  assert.equal(readFileSync(join(f.root, 'src', 'a.txt'), 'utf8'), 'edited by someone else\n');
  assert.equal(existsSync(join(f.root, 'src', 'sub', 'new.txt')), false);
  assert.equal(f.git('status', '--porcelain', '-uall').stdout, before);
  assert.equal(f.commits(), 0);
});

test('a checkpoint that cannot be written blocks the run before the next turn', async (t) => {
  const f = fixture(t);
  f.script({ 1: changes, 2: { reply: pause }, 3: { write: { 'src/b.txt': 'b\n' }, reply: progress }, 4: { reply: complete } });
  assert.equal((await f.run('lead')).rc, 2);
  rmSync(join(f.stateDir, 'checkpoints'), { recursive: true, force: true });
  writeFileSync(join(f.stateDir, 'checkpoints'), 'not a directory');
  const result = await f.run('resume');
  assert.equal(result.rc, 2);
  assert.match(result.json.reason, /checkpoint failed after turn 3/);
  assert.equal(f.state().turns.length, 3, 'no turn after the failed checkpoint');
  assert.equal(f.commits(), 0);
  assert.equal(readFileSync(join(f.root, 'src', 'b.txt'), 'utf8'), 'b\n', 'the work of the turn stays in the tree');
});

test('a controller killed right after the commit resumes without a second commit or another engine turn', async (t) => {
  const f = fixture(t);
  f.script({ 1: changes, 2: { reply: complete } });
  const crashed = await f.run('lead', { JZ_TEST_CRASH: 'after-commit' });
  assert.equal(crashed.signal, 'SIGKILL');
  assert.equal(f.commits(), 1);
  assert.equal(f.state().commit, null, 'the commit was not recorded before the crash');
  const done = await f.run('resume');
  assert.equal(done.rc, 0, done.err || JSON.stringify(done.json));
  const state = f.state();
  assert.equal(f.commits(), 1, 'jz-git reuses the Jz-Op commit');
  assert.equal(state.commit.reused, true);
  assert.equal(state.turns.length, 2, 'no engine turn after the crash');
  assert.equal(f.git('log', '-1', '--format=%(trailers:key=Jz-Op,valueonly)').stdout.trim(), `real-recovery:${state.runId}:commit`);
});

test('a controller killed right after the push resumes into the push only and verifies the remote SHA', async (t) => {
  const f = fixture(t, { push: true });
  f.script({ 1: changes, 2: { reply: complete } });
  const crashed = await f.run('lead', { JZ_TEST_CRASH: 'after-push' });
  assert.equal(crashed.signal, 'SIGKILL');
  const head = f.git('rev-parse', 'HEAD').stdout.trim();
  assert.equal(f.git('ls-remote', 'origin', 'refs/heads/feat/text-utils').stdout.split(/\s/)[0], head);
  const done = await f.run('resume');
  assert.equal(done.rc, 0, done.err || JSON.stringify(done.json));
  const state = f.state();
  assert.equal(f.commits(), 1);
  assert.equal(state.turns.length, 2);
  assert.equal(state.push.remoteSha, head);
  assert.ok(statSync(join(f.stateDir, 'state.json')).isFile());
});
