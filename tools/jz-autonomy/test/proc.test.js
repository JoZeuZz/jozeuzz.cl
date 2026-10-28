import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { bootId, holders, identify, sameProcess } from '../src/proc.js';
import { createCoordAdapters } from '../src/orchestrators.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Proceso real que parece un orquestador lanzado por jz-coord (argv con --agent jz-orchestrator).
function decoy(env = {}) {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', '--', '--agent', 'jz-orchestrator'], { detached: true, stdio: 'ignore', env: { ...process.env, ...env } });
  child.unref();
  return child;
}
const reap = (child) => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };

test('identify records pid, start time and boot id from /proc', () => {
  const self = identify(process.pid);
  assert.equal(self.pid, process.pid);
  assert.match(self.start, /^\d+$/);
  assert.equal(self.boot, bootId());
  assert.equal(identify(2 ** 22 + 7), null, 'a pid that does not exist has no identity');
});

test('sameProcess rejects a reused pid (different start time) and another boot', () => {
  const self = identify(process.pid);
  assert.equal(sameProcess(self), true);
  assert.equal(sameProcess({ ...self, start: String(Number(self.start) + 1) }), false, 'same pid, other process');
  assert.equal(sameProcess({ ...self, boot: '00000000-0000-0000-0000-000000000000' }), false, 'previous boot');
  assert.equal(sameProcess(null), false);
});

test('holders finds the processes that carry a lease token in their environment', async (t) => {
  const child = decoy({ JZ_COORD_LEASE: 'lease-abc' });
  t.after(() => reap(child));
  await sleep(100);
  assert.deepEqual(holders('lease-abc').map((h) => h.pid), [child.pid]);
  assert.deepEqual(holders('lease-other'), []);
});

test('kill refuses an orchestrator-looking process whose identity does not match the lease (pid reuse)', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'jz-proc-'));
  const adapters = createCoordAdapters({ root: dir, stateDir: dir });
  const child = decoy();
  t.after(() => reap(child));
  await sleep(100);
  const real = identify(child.pid);
  // El lease guardado es de otro proceso que tuvo el mismo pid: otro instante de arranque.
  const stale = { ...real, start: String(Number(real.start) - 100) };
  await adapters.kill({ pid: child.pid, identity: stale, token: 'lease-gone' });
  await sleep(100);
  assert.equal(alive(child.pid), true, 'a process whose identity is not proven must not be killed');
  assert.equal(await adapters.terminated({ pid: child.pid, identity: stale, token: 'lease-gone' }), true, 'the lease holder (other start time) is gone');
});

test('kill terminates the proven lease holder and its process group', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'jz-proc-'));
  const adapters = createCoordAdapters({ root: dir, stateDir: dir });
  const child = decoy({ JZ_COORD_LEASE: 'lease-live' });
  t.after(() => reap(child));
  await sleep(100);
  const identity = identify(child.pid);
  assert.equal(await adapters.terminated({ pid: child.pid, identity, token: 'lease-live' }), false);
  await adapters.kill({ pid: child.pid, identity, token: 'lease-live' });
  await sleep(200);
  assert.equal(await adapters.terminated({ pid: child.pid, identity, token: 'lease-live' }), true);
});

test('a token holder keeps the lease alive even when the recorded pid is unknown', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'jz-proc-'));
  const adapters = createCoordAdapters({ root: dir, stateDir: dir });
  const child = decoy({ JZ_COORD_LEASE: 'lease-nopid' });
  t.after(() => reap(child));
  await sleep(100);
  // Caída del controlador entre el inicio del turno y el registro del pid: sólo queda el token.
  assert.equal(await adapters.terminated({ pid: null, identity: null, token: 'lease-nopid' }), false);
  await adapters.kill({ pid: null, identity: null, token: 'lease-nopid' });
  await sleep(200);
  assert.equal(alive(child.pid), false, 'a process proven by its lease token can be killed');
});
