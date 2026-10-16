// Pruebas de continuidad ante cuota agotada e interrupciones, sin consumir cuota de los motores:
// simulan el evento StopFailure de Claude Code y el reintento por cuota de OpenCode sobre un
// repositorio desechable con una copia del plano de control, y comprueban bloqueo, checkpoint y jz-state.
// Ejecutar: .jz/bin/jz-run node --test .jz/tests/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = path.resolve(import.meta.dirname, '../..');
const roots = [];
after(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function fixture() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jz-recovery-')));
  roots.push(repo);
  for (const p of ['.jz/bin', '.jz/hooks', '.jz/policy', '.opencode/plugins']) {
    fs.cpSync(path.join(SRC, p), path.join(repo, p), { recursive: true });
  }
  fs.writeFileSync(path.join(repo, '.gitignore'), '.jz-state/\n');
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=jz-test',
    '-c', 'user.email=jz-test@example.invalid', ...a], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  return repo;
}

const lockFile = (repo) => path.join(repo, '.jz-state/writer.lock');
const latest = (repo) => fs.readFileSync(path.join(repo, '.jz-state/LATEST.md'), 'utf8');
const jzState = (repo) => {
  const r = spawnSync(path.join(repo, '.jz/bin/jz-state'), [], { cwd: repo, encoding: 'utf8' });
  return { rc: r.status, out: r.stdout + r.stderr };
};
const writeLock = (repo, holder) => {
  fs.mkdirSync(path.dirname(lockFile(repo)), { recursive: true });
  fs.writeFileSync(lockFile(repo), JSON.stringify({ since: new Date().toISOString(), ...holder }) + '\n');
};

test('Claude Code: StopFailure por cuota libera el bloqueo y deja checkpoint "cuota"', () => {
  const repo = fixture();
  writeLock(repo, { engine: 'claude-code', pid: process.pid, session: 'sq', agent: 'jz-implementer', call: 'c1' });
  const r = spawnSync('node', [path.join(repo, '.jz/hooks/claude-policy.mjs')], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    input: JSON.stringify({ hook_event_name: 'StopFailure', session_id: 'sq', agent_type: 'jz-implementer',
      error: { type: 'rate_limit_error', message: 'usage limit reached' } }),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(lockFile(repo)), false, 'bloqueo liberado');
  assert.match(latest(repo), /- Motor: claude-code/);
  assert.match(latest(repo), /- Estado declarado: cuota/);
  const s = jzState(repo);
  assert.equal(s.rc, 0, s.out);
  assert.match(s.out, /Veredicto: REANUDABLE/);
});

test('Claude Code: StopFailure ajeno a la cuota queda como "incompleto" y no libera otra sesión', () => {
  const repo = fixture();
  writeLock(repo, { engine: 'claude-code', pid: process.pid, session: 'otra', agent: 'jz-implementer', call: 'c9' });
  spawnSync('node', [path.join(repo, '.jz/hooks/claude-policy.mjs')], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    input: JSON.stringify({ hook_event_name: 'StopFailure', session_id: 'sq', error: { message: 'socket hang up' } }),
  });
  assert.equal(fs.existsSync(lockFile(repo)), true, 'el bloqueo de otra sesión se conserva');
  assert.match(latest(repo), /- Estado declarado: incompleto/);
});

test('OpenCode: el reintento por cuota aborta la sesión, libera el bloqueo y deja checkpoint', async () => {
  const repo = fixture();
  const { JzGuard } = await import(pathToFileURL(path.join(repo, '.opencode/plugins/jz-guard.js')).href);
  const aborted = [];
  const hooks = await JzGuard({
    client: { session: { abort: async ({ path: p }) => aborted.push(p.id) } }, directory: repo, worktree: repo,
  });
  await hooks['chat.params']({ sessionID: 'orq', agent: 'jz-orchestrator' });
  await hooks['chat.params']({ sessionID: 'imp', agent: 'jz-implementer' });
  await hooks['tool.execute.before']({ tool: 'task', sessionID: 'orq', callID: 'k1' },
    { args: { subagent_type: 'jz-implementer' } });
  assert.equal(JSON.parse(fs.readFileSync(lockFile(repo), 'utf8')).engine, 'opencode', 'escritor adquirido');

  const retry = (attempt, message) => hooks.event({ event: { type: 'session.status',
    properties: { sessionID: 'imp', status: { type: 'retry', attempt, message } } } });
  await retry(1, 'Rate limit exceeded (429)');
  assert.deepEqual(aborted, [], 'un límite de velocidad aislado se tolera');
  assert.equal(fs.existsSync(lockFile(repo)), true);

  await retry(2, 'You exceeded your current quota, please check your plan and billing details');
  assert.deepEqual(aborted, ['imp'], 'sesión abortada sin más reintentos');
  assert.equal(fs.existsSync(lockFile(repo)), false, 'bloqueo liberado');
  assert.match(latest(repo), /- Motor: opencode/);
  assert.match(latest(repo), /- Estado declarado: cuota/);
  assert.match(latest(repo), /sesión OpenCode interrumpida \(jz-implementer\)/);

  await retry(3, 'insufficient_quota');
  assert.deepEqual(aborted, ['imp'], 'no repite la parada');
});

test('OpenCode: el plugin rechaza un segundo escritor mientras el primero sigue activo', async () => {
  const repo = fixture();
  const { JzGuard } = await import(pathToFileURL(path.join(repo, '.opencode/plugins/jz-guard.js')).href);
  const hooks = await JzGuard({ client: { session: { abort: async () => {} } }, directory: repo, worktree: repo });
  await hooks['chat.params']({ sessionID: 'orq', agent: 'jz-orchestrator' });
  const task = (callID) => hooks['tool.execute.before']({ tool: 'task', sessionID: 'orq', callID },
    { args: { subagent_type: 'jz-implementer' } });
  await task('w1');
  await assert.rejects(task('w2'), /otro escritor está activo/);
  await hooks['tool.execute.after']({ tool: 'task', callID: 'w1' });
  assert.equal(fs.existsSync(lockFile(repo)), false, 'el primero libera al terminar');
  await task('w3');
  assert.equal(JSON.parse(fs.readFileSync(lockFile(repo), 'utf8')).call, 'w3');
});

test('jz-state: BLOQUEADO con un escritor vivo de otro proceso; REANUDABLE cuando termina', async () => {
  const repo = fixture();
  const other = spawn('sleep', ['30']);
  try {
    writeLock(repo, { engine: 'opencode', pid: other.pid, session: 'x', agent: 'jz-implementer', call: 'k' });
    const busy = jzState(repo);
    assert.equal(busy.rc, 3, busy.out);
    assert.match(busy.out, /bloqueo de escritor vivo de otro proceso/);
  } finally {
    other.kill();
    await once(other, 'exit');
  }
  const free = jzState(repo);
  assert.equal(free.rc, 0, free.out);
  assert.match(free.out, /Huérfano \(el proceso ya no existe\)/);
});

test('jz-state: el bloqueo de la propia sesión no se presenta como otro escritor', () => {
  const repo = fixture();
  writeLock(repo, { engine: 'opencode', pid: process.pid, session: 's', agent: 'jz-implementer', call: 'k' });
  const own = jzState(repo);
  assert.equal(own.rc, 0, own.out);
  assert.match(own.out, /ACTIVO \(esta sesión; puedes escribir\)/);
});
