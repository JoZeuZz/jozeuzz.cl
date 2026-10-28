import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { classifyTurn, parseReply, parseSimulate, runGoal, validateGoal } from '../src/coord.js';

function goal(overrides = {}) {
  return {
    schema: 'jz-coord-goal-v1', id: 'text-utils', objective: 'Implement slugify and wordCount', criteria: ['checks green'],
    branch: 'feat/text-utils', allowedPaths: ['src', 'test'], checks: [{ id: 'unit', argv: ['node', '--test', 'test/'] }],
    commit: { message: 'feat: add text utils' }, ...overrides
  };
}

const reply = (actions) => `INFORME-JZ ...\nJZ-COORD ${JSON.stringify({ actions })}`;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 40);

// Mundo sintético: un árbol de archivos, un HEAD y motores guionizados que leen el prompt real.
function world({ scripts, checks = () => 0 }) {
  const w = { files: {}, head: {}, commits: [], turns: [], prompts: [], killed: [], alive: new Set(), ops: new Set(), lock: null, checkpoints: [], pushes: 0, remote: null, controllers: new Set() };
  const tree = (files) => hash(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
  const headSha = () => (w.commits.at(-1)?.sha ?? 'base');
  const changed = () => Object.keys({ ...w.files, ...w.head }).filter((p) => w.files[p] !== w.head[p]).sort();
  w.adapters = {
    preflight: async () => ({ status: changed().length ? 'blocked' : 'clean' }),
    runTurn: async ({ engine, role, prompt, n, fault }) => {
      const parsed = JSON.parse(prompt);
      w.prompts.push(parsed);
      w.turns.push(`${n}:${engine}:${role}`);
      if (fault && !fault.afterMs) return { rc: 75, text: '', tail: 'simulated', pid: null };
      const script = scripts[engine];
      const out = await script({ prompt: parsed, files: w.files, n });
      return { rc: 0, pid: 1000 + n, ...out };
    },
    terminated: async ({ pid, token }) => !w.alive.has(pid) && !w.alive.has(token),
    kill: async ({ pid, token }) => { w.killed.push(pid); w.alive.delete(pid); w.alive.delete(token); },
    writer: async () => ({ alive: Boolean(w.lock), holder: w.lock }),
    snapshot: async () => ({ rc: 0, head: headSha(), tree: tree(w.files), paths: changed() }),
    restore: async ({ tree: t, paths: only }) => {
      const cp = w.saved[t];
      if (!cp) return { rc: 1 };
      for (const p of only) { if (p in cp) w.files[p] = cp[p]; else delete w.files[p]; }
      return { rc: 0 };
    },
    compare: async ({ from, to }) => {
      const a = w.saved[from] ?? {};
      const b = w.saved[to] ?? {};
      return { rc: 0, paths: Object.keys({ ...a, ...b }).filter((p) => a[p] !== b[p]).sort() };
    },
    inspectChanges: async () => ({ paths: changed() }),
    runCheck: async ({ check }) => ({ rc: checks({ check, files: w.files }), log: 'log' }),
    fingerprint: async () => ({ rc: 0, fingerprint: tree(w.files) }),
    acquire: async () => ({ rc: 0 }),
    release: async () => {},
    commit: async ({ op }) => {
      if (w.ops.has(op)) return { rc: 0, head: headSha(), reused: true };
      w.ops.add(op);
      const sha = hash({ files: w.files, n: w.commits.length });
      w.commits.push({ sha, files: { ...w.files }, op });
      w.head = { ...w.files };
      return { rc: 0, head: sha };
    },
    push: async () => { w.pushes += 1; w.remote = headSha(); return { rc: 0, remoteSha: headSha() }; },
    checkpoint: async ({ kind }) => { w.checkpoints.push(kind); return { rc: 0 }; }
  };
  w.saved = {};
  const snap = w.adapters.snapshot;
  w.adapters.snapshot = async (args) => { const out = await snap(args); w.saved[out.tree] = { ...w.files }; return out; };
  return w;
}

// Orquestador sintético: un paso por turno. Escribe slugify, luego wordCount (o lo delega) y pide complete.
function orchestrator({ delegateWordCount = false } = {}) {
  return async ({ prompt, files }) => {
    if (prompt.role === 'delegate') {
      files['src/words.js'] = 'export const wordCount = (s) => s.split(/\\s+/).filter(Boolean).length;\n';
      return { text: reply([{ type: 'result', task: prompt.task.id, status: 'done', summary: 'wordCount implemented', paths: ['src/words.js'], evidence: ['node --test rc=0'] }]) };
    }
    if (!files['src/slug.js']) {
      files['src/slug.js'] = 'export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");\n';
      return { text: reply([{ type: 'progress', note: 'slugify written' }]) };
    }
    if (!files['src/words.js']) {
      if (delegateWordCount && !prompt.tasks.some((t) => t.id === 'word-count')) {
        const peer = prompt.peers[0].engine;
        return { text: reply([{ type: 'delegate', to: peer, task: { id: 'word-count', title: 'wordCount', instructions: 'Create src/words.js exporting wordCount', kind: 'write', allowedPaths: ['src'] } }]) };
      }
      files['src/words.js'] = 'export const wordCount = (s) => s.split(" ").length;\n';
      return { text: reply([{ type: 'progress', note: 'wordCount written' }]) };
    }
    return { text: reply([{ type: 'complete', summary: 'both functions done' }]) };
  };
}

async function stateDir() {
  return mkdtemp(join(tmpdir(), 'jz-coord-test-'));
}

// Controlador simulado: identidad propia y una vida que el test termina (caída) a voluntad.
function controller(w, pid) {
  w.controllers.add(pid);
  return { self: { pid, start: String(pid), boot: 'test-boot' }, alive: (holder) => w.controllers.has(holder.pid) };
}
const crash = (w, pid) => w.controllers.delete(pid);
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const readState = async (dir) => JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));

for (const lead of ['claude', 'opencode']) {
  test(`${lead} leads a full cycle alone: plan, implement, verify, commit and checkpoint`, async () => {
    const w = world({ scripts: { [lead]: orchestrator() } });
    const result = await runGoal(goal({ engines: [lead] }), w.adapters, { stateDir: await stateDir() });
    assert.equal(result.status, 'completed');
    assert.deepEqual(w.turns, [`1:${lead}:lead`, `2:${lead}:lead`, `3:${lead}:lead`]);
    assert.equal(w.commits.length, 1);
    assert.deepEqual(Object.keys(w.commits[0].files).sort(), ['src/slug.js', 'src/words.js']);
    assert.deepEqual(w.checkpoints, ['incompleto']);
  });
}

for (const [lead, peer] of [['claude', 'opencode'], ['opencode', 'claude']]) {
  test(`${lead} delegates to ${peer} and receives a structured result in its inbox`, async () => {
    const w = world({ scripts: { [lead]: orchestrator({ delegateWordCount: true }), [peer]: orchestrator() } });
    const result = await runGoal(goal({ engines: [lead, peer] }), w.adapters, { stateDir: await stateDir() });
    assert.equal(result.status, 'completed');
    assert.deepEqual(w.turns, [`1:${lead}:lead`, `2:${lead}:lead`, `3:${peer}:delegate`, `4:${lead}:lead`]);
    const delegated = w.prompts[2];
    assert.equal(delegated.role, 'delegate');
    assert.equal(delegated.task.id, 'word-count');
    assert.equal(delegated.task.from, lead);
    const inbox = w.prompts[3].inbox;
    assert.equal(inbox.length, 1);
    assert.deepEqual({ from: inbox[0].from, kind: inbox[0].kind, task: inbox[0].task, status: inbox[0].status, paths: inbox[0].paths },
      { from: peer, kind: 'result', task: 'word-count', status: 'done', paths: ['src/words.js'] });
    assert.equal(result.tasks['word-count'].status, 'done');
    assert.equal(w.commits.length, 1);
  });
}

test('quota of the active leader transfers the partially done goal; the peer verifies and finishes with one commit', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const dir = await stateDir();
  const result = await runGoal(goal(), w.adapters, { stateDir: dir, simulate: parseSimulate('quota:claude@2') });
  assert.equal(result.status, 'completed');
  assert.deepEqual(w.turns, ['1:claude:lead', '2:claude:lead', '3:opencode:lead', '4:opencode:lead']);
  assert.deepEqual(result.leadership.map((l) => [l.engine, l.reason]), [['claude', 'initial'], ['opencode', 'claude quota']]);
  const transfer = w.prompts[2].inbox.find((m) => m.kind === 'transfer');
  assert.ok(transfer, 'the new leader receives a transfer message');
  assert.deepEqual(transfer.checkpoint.paths, ['src/slug.js'], 'the checkpoint lists the uncommitted work of the previous leader');
  assert.equal(w.commits.length, 1);
  assert.ok(w.commits[0].files['src/slug.js'], 'the work of the previous leader is in the commit');
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  assert.equal(state.engines.claude.status, 'down');
  assert.equal(state.turns[1].simulated, true);
  const events = (await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.event === 'engine-down' && e.engine === 'claude' && e.outcome === 'quota'));
});

test('leadership returns in the reverse direction once the first engine is back', async () => {
  let now = Date.parse('2026-10-27T10:00:00Z');
  const later = async (ctx) => { now += 10 * 60_000; return orchestrator()(ctx); };
  const w = world({ scripts: { claude: orchestrator(), opencode: later } });
  const dir = await stateDir();
  const first = await runGoal(goal(), w.adapters, { stateDir: dir, now: () => now, simulate: parseSimulate('quota:claude@2,quota:opencode@4') });
  assert.equal(first.status, 'blocked');
  assert.equal(first.reason, 'no engine available');
  assert.deepEqual(w.checkpoints, ['cuota']);
  assert.equal(w.commits.length, 0);
  now += 21 * 60_000;
  const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  const second = await runGoal(saved.goal, w.adapters, { stateDir: dir, now: () => now, resume: saved });
  assert.equal(second.status, 'completed');
  assert.deepEqual(second.leadership.map((l) => l.engine), ['claude', 'opencode', 'claude']);
  assert.deepEqual(w.turns, ['1:claude:lead', '2:claude:lead', '3:opencode:lead', '4:opencode:lead', '5:claude:lead']);
  assert.equal(w.commits.length, 1);
  assert.ok(w.commits[0].files['src/slug.js'] && w.commits[0].files['src/words.js']);
});

test('a yield action hands leadership over voluntarily with a transfer message', async () => {
  const yielding = async (ctx) => (ctx.prompt.turn === 2 ? { text: reply([{ type: 'yield', to: 'opencode', reason: 'peer better suited' }]) } : orchestrator()(ctx));
  const w = world({ scripts: { claude: yielding, opencode: orchestrator() } });
  const result = await runGoal(goal(), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'completed');
  assert.equal(result.leadership.at(-1).engine, 'opencode');
  assert.match(result.leadership.at(-1).reason, /^yield/);
});

test('no transfer while the previous writer holds a valid lease; an expired holder is killed and verified first', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const dir = await stateDir();
  let now = Date.parse('2026-10-27T10:00:00Z');
  const base = { stateDir: dir, now: () => now };
  // Caída del controlador durante el turno 1: el turno no vuelve nunca y el motor (pid 4242) sigue vivo.
  w.alive.add(4242);
  runGoal(goal(), { ...w.adapters, runTurn: ({ onSpawn }) => { onSpawn(4242); return new Promise(() => {}); } }, { ...base, controller: controller(w, 1) });
  await settle();
  crash(w, 1);
  const saved = await readState(dir);
  assert.equal(saved.inflight.pid, 4242);
  assert.equal(saved.lease.pid, 4242);
  w.files['src/slug.js'] = 'partial';
  const blocked = await runGoal(saved.goal, w.adapters, { ...base, resume: structuredClone(saved), controller: controller(w, 2) });
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.reason, /lease held by claude \(pid 4242\)/);
  assert.deepEqual(w.killed, []);
  // Plazo del lease: timeoutMinutes (30) más el margen de 60 s.
  now += 32 * 60_000;
  const resumed = await runGoal(saved.goal, w.adapters, { ...base, resume: await readState(dir), controller: controller(w, 3) });
  assert.deepEqual(w.killed, [4242], 'the expired holder is killed before anyone else writes');
  assert.equal(resumed.status, 'completed');
});

test('resume after a controller crash marks the in-flight turn interrupted and does not repeat finished work', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const dir = await stateDir();
  runGoal(goal(), { ...w.adapters, runTurn: (args) => {
    if (args.n === 2) { args.onSpawn(777); return new Promise(() => {}); }
    return w.adapters.runTurn(args);
  } }, { stateDir: dir, controller: controller(w, 1) });
  await settle();
  crash(w, 1);
  const state = await readState(dir);
  assert.equal(state.inflight.n, 2);
  w.turns = [];
  w.prompts = [];
  const result = await runGoal(state.goal, w.adapters, { stateDir: dir, resume: state, controller: controller(w, 2) });
  assert.equal(result.status, 'completed');
  assert.deepEqual(w.turns, ['3:claude:lead', '4:claude:lead']);
  assert.ok(w.prompts[0].inbox.some((m) => m.kind === 'info' && /interrupted/.test(m.body)));
});

test('changes lost from the worktree are restored from the checkpoint before the new leader starts', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const restore = w.adapters.restore;
  const runTurn = w.adapters.runTurn;
  w.adapters.runTurn = async (args) => {
    if (args.n === 2) { w.files = {}; return { rc: 75, text: '', tail: 'usage limit reached', pid: null }; }
    return runTurn(args);
  };
  let restored = 0;
  w.adapters.restore = async (args) => { restored += 1; return restore(args); };
  const result = await runGoal(goal(), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'completed');
  assert.equal(restored, 0, 'the turn-2 checkpoint already captured the empty tree; nothing to restore');
});

test('a dirty tree that differs from the checkpoint blocks the handover', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const runTurn = w.adapters.runTurn;
  const snapshot = w.adapters.snapshot;
  let tamper = false;
  w.adapters.runTurn = async (args) => {
    if (args.n === 2) { tamper = true; return { rc: 75, text: '', tail: 'usage limit reached' }; }
    return runTurn(args);
  };
  w.adapters.snapshot = async (args) => {
    const out = await snapshot(args);
    if (tamper && args.n === 0) return { ...out, tree: 'other', paths: ['src/slug.js', 'src/x.js'] };
    return out;
  };
  const result = await runGoal(goal(), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /worktree changed since checkpoint/);
});

test('failed checks go back to the leader as structured failures; a second complete commits once', async () => {
  let red = true;
  const w = world({ scripts: { claude: orchestrator() }, checks: () => (red ? 1 : 0) });
  const runTurn = w.adapters.runTurn;
  w.adapters.runTurn = async (args) => {
    const out = await runTurn(args);
    if (JSON.parse(args.prompt).inbox.some((m) => m.kind === 'failures')) red = false;
    return out;
  };
  const result = await runGoal(goal({ engines: ['claude'] }), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'completed');
  const failures = w.prompts.find((p) => p.inbox.some((m) => m.kind === 'failures')).inbox.find((m) => m.kind === 'failures');
  assert.deepEqual(failures.failures.map((f) => [f.id, f.rc]), [['unit', 1]]);
  assert.equal(w.commits.length, 1);
});

test('a resumed run with the commit already recorded closes without committing again', async () => {
  const w = world({ scripts: { claude: orchestrator() } });
  const dir = await stateDir();
  await runGoal(goal({ engines: ['claude'] }), w.adapters, { stateDir: dir });
  const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  saved.status = 'blocked';
  const again = await runGoal(saved.goal, w.adapters, { stateDir: dir, resume: saved });
  assert.equal(again.status, 'completed');
  assert.equal(w.commits.length, 1);
});

test('a delegate that writes outside the goal blocks the run', async () => {
  const rogue = async ({ prompt, files }) => {
    files['docs/x.md'] = 'x';
    return { text: reply([{ type: 'result', task: prompt.task.id, status: 'done', summary: 's' }]) };
  };
  const w = world({ scripts: { claude: orchestrator({ delegateWordCount: true }), opencode: rogue } });
  const result = await runGoal(goal(), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /opencode delegate turn changed paths outside the goal: docs\/x.md/);
});

test('a missing JZ-COORD reply is retried once, then the engine is replaced', async () => {
  const silent = async () => ({ text: 'I did things' });
  const w = world({ scripts: { claude: silent, opencode: orchestrator() } });
  const result = await runGoal(goal(), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'completed');
  assert.deepEqual(w.turns.slice(0, 3), ['1:claude:lead', '2:claude:lead', '3:opencode:lead']);
  assert.equal(result.leadership.at(-1).reason, 'claude protocol');
});

test('parseReply validates actions, roles, targets and paths', () => {
  const g = validateGoal(goal());
  assert.deepEqual(parseReply('no marker').error, 'missing JZ-COORD reply');
  assert.match(parseReply('JZ-COORD {bad').error, /not valid JSON/);
  assert.deepEqual(parseReply(reply([{ type: 'progress', note: 'x' }]), { goal: g, role: 'lead', engine: 'claude' }).actions, [{ type: 'progress', note: 'x' }]);
  assert.match(parseReply(reply([{ type: 'complete' }]), { goal: g, role: 'delegate', engine: 'claude', task: { id: 't' } }).error, /delegate may only reply with result/);
  assert.match(parseReply(reply([{ type: 'delegate', to: 'claude', task: { id: 't', instructions: 'x' } }]), { goal: g, role: 'lead', engine: 'claude' }).error, /peer engine/);
  assert.match(parseReply(reply([{ type: 'delegate', to: 'opencode', task: { id: 't', instructions: 'x', allowedPaths: ['.jz'] } }]), { goal: g, role: 'lead', engine: 'claude' }).error, /outside the goal/);
  assert.match(parseReply(reply([{ type: 'result', task: 'other', status: 'done' }]), { goal: g, role: 'delegate', engine: 'opencode', task: { id: 't' } }).error, /another task/);
  const nested = `text JZ-COORD {"actions":[{"type":"message","to":"opencode","body":"a } brace \\" quote"}]} trailing`;
  assert.equal(parseReply(nested, { goal: g, role: 'lead', engine: 'claude' }).actions[0].body, 'a } brace " quote');
});

test('classifyTurn distinguishes quota, provider errors, session loss, timeouts and abnormal exits', () => {
  assert.equal(classifyTurn({ rc: 1, text: '', tail: 'Claude AI usage limit reached' }), 'quota');
  assert.equal(classifyTurn({ rc: 0, text: '', tail: 'insufficient_quota' }), 'quota');
  assert.equal(classifyTurn({ rc: 1, text: '', tail: 'API Error: 529 overloaded' }), 'quota');
  assert.equal(classifyTurn({ rc: 1, text: '', tail: 'API Error: 500 Internal server error' }), 'provider');
  assert.equal(classifyTurn({ rc: 124, timedOut: true, text: '' }), 'timeout');
  assert.equal(classifyTurn({ rc: null, signal: 'SIGKILL', text: '' }), 'session-lost');
  assert.equal(classifyTurn({ rc: 0, text: '' }), 'session-lost');
  assert.equal(classifyTurn({ rc: 2, text: 'boom' }), 'abnormal');
  assert.equal(classifyTurn({ rc: 0, text: 'JZ-COORD {}' }), 'ok');
  assert.equal(classifyTurn({ rc: 0, text: 'x', simulated: 'quota' }), 'quota');
});

test('validateGoal reuses the objective guards for control-plane and supervisor paths', () => {
  assert.throws(() => validateGoal(goal({ allowedPaths: ['.jz'] })), /Invalid objective: path/);
  assert.throws(() => validateGoal(goal({ allowedPaths: ['tools/jz-gitops'] })), /supervisor path/);
  assert.throws(() => validateGoal(goal({ branch: 'main' })), /branch/);
  assert.throws(() => validateGoal(goal({ lead: 'gpt' })), /lead/);
  assert.equal(validateGoal(goal()).lead, 'claude');
  assert.throws(() => parseSimulate('quota:gpt@1'), /Invalid simulate/);
});

test('a lone leader retried after a timeout is told its previous turn was lost', async () => {
  const w = world({ scripts: { claude: orchestrator() } });
  const runTurn = w.adapters.runTurn;
  w.adapters.runTurn = async (args) => (args.n === 2 ? { rc: 124, timedOut: true, text: '', pid: null } : runTurn(args));
  const result = await runGoal(goal({ engines: ['claude'] }), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'completed');
  const info = w.prompts[1].inbox.find((m) => m.kind === 'info');
  assert.match(info.body, /previous turn 2 ended timeout/);
});

test('isOrchestrator only accepts jz-orchestrator engine processes', async () => {
  const { isOrchestrator } = await import('../src/orchestrators.js');
  const fake = (text) => async () => text;
  assert.equal(await isOrchestrator(1, fake('claude\0-p\0--agent\0jz-orchestrator\0')), true);
  assert.equal(await isOrchestrator(1, fake('sshd\0-D\0')), false);
  assert.equal(await isOrchestrator(1, async () => { throw new Error('ENOENT'); }), false);
});

test('a lead turn that writes outside the goal blocks before any further turn', async () => {
  const rogue = async ({ files }) => { files['README.md'] = 'x'; return { text: reply([{ type: 'progress', note: 'x' }]) }; };
  const w = world({ scripts: { claude: rogue, opencode: orchestrator() } });
  const result = await runGoal(goal(), w.adapters, { stateDir: await stateDir() });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /claude lead turn changed paths outside the goal: README.md/);
  assert.deepEqual(w.turns, ['1:claude:lead']);
});

// ---- Hardening de concurrencia y recuperación ----

test('a blocked resume keeps the live lease and the in-flight turn: a later resume still refuses to write', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const dir = await stateDir();
  w.alive.add(4242);
  runGoal(goal(), { ...w.adapters, runTurn: ({ onSpawn }) => { onSpawn(4242); return new Promise(() => {}); } }, { stateDir: dir, controller: controller(w, 1) });
  await settle();
  crash(w, 1);
  const first = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(first.status, 'blocked');
  const kept = await readState(dir);
  assert.equal(kept.lease?.pid, 4242, 'close() must not drop the lease of a live holder');
  assert.equal(kept.inflight?.pid, 4242, 'close() must not forget the in-flight turn of a live holder');
  const second = await runGoal(kept.goal, w.adapters, { stateDir: dir, resume: kept, controller: controller(w, 3) });
  assert.equal(second.status, 'blocked');
  assert.match(second.reason, /lease held by claude \(pid 4242\)/);
  assert.equal(w.turns.length, 0, 'no engine turn runs while the holder is alive');
  assert.equal(w.commits.length, 0);
});

test('a lease whose pid was never recorded still blocks while a process carries its token', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const dir = await stateDir();
  // Caída del controlador entre el inicio del turno y el registro del pid: el motor vive, sólo con su token.
  runGoal(goal(), { ...w.adapters, runTurn: ({ token }) => { w.alive.add(token); return new Promise(() => {}); } }, { stateDir: dir, controller: controller(w, 1) });
  await settle();
  crash(w, 1);
  const saved = await readState(dir);
  assert.equal(saved.lease.pid, null);
  assert.ok(saved.lease.token, 'the lease token is persisted before the engine starts');
  const result = await runGoal(saved.goal, w.adapters, { stateDir: dir, resume: saved, controller: controller(w, 2) });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /lease held by claude/);
  assert.equal(w.turns.length, 0);
});

test('a second controller on the same state-dir is refused without touching the state while the first is alive', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const dir = await stateDir();
  runGoal(goal(), { ...w.adapters, runTurn: (args) => (args.n === 2 ? new Promise(() => {}) : w.adapters.runTurn(args)) }, { stateDir: dir, controller: controller(w, 1) });
  await settle();
  const before = await readFile(join(dir, 'state.json'), 'utf8');
  const events = await readFile(join(dir, 'events.jsonl'), 'utf8');
  const second = await runGoal(JSON.parse(before).goal, w.adapters, { stateDir: dir, resume: JSON.parse(before), controller: controller(w, 2) });
  assert.equal(second.status, 'blocked');
  assert.match(second.reason, /controller .*active/);
  assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), before, 'the refused controller does not write state.json');
  assert.equal(await readFile(join(dir, 'events.jsonl'), 'utf8'), events, 'nor events.jsonl');
  assert.deepEqual(w.turns, ['1:claude:lead'], 'the refused controller runs no turn');
});

test('a stale controller lock is recovered only once its holder is proven dead, keeping the old lock as evidence', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const dir = await stateDir();
  runGoal(goal(), { ...w.adapters, runTurn: (args) => (args.n === 2 ? new Promise(() => {}) : w.adapters.runTurn(args)) }, { stateDir: dir, controller: controller(w, 1) });
  await settle();
  crash(w, 1);
  const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(result.status, 'completed');
  const { readdir } = await import('node:fs/promises');
  const names = await readdir(dir);
  assert.ok(names.some((n) => n.startsWith('controller.lock.stale-')), 'the dead holder lock is kept, not deleted');
  assert.ok(!names.includes('controller.lock'), 'the lock is released at the end');
  const events = (await readState(dir)).events;
  assert.ok(events.some((e) => e.event === 'controller-recovered' && e.holder.pid === 1));
});

test('an unreadable controller lock is never removed blindly', async () => {
  const w = world({ scripts: { claude: orchestrator() } });
  const dir = await stateDir();
  await runGoal(goal({ engines: ['claude'] }), { ...w.adapters, runTurn: async (args) => (args.n === 1 ? { rc: 0, text: reply([{ type: 'blocked', reason: 'pause' }]), pid: 1 } : w.adapters.runTurn(args)) }, { stateDir: dir, controller: controller(w, 1) });
  const { writeFile: write } = await import('node:fs/promises');
  await write(join(dir, 'controller.lock'), '{"pid":');
  const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /controller lock unreadable/);
  assert.equal(await readFile(join(dir, 'controller.lock'), 'utf8'), '{"pid":');
});

test('resume repairs events.jsonl from state.json after a crash between both writes (missing and torn lines)', async () => {
  const w = world({ scripts: { claude: orchestrator() } });
  const dir = await stateDir();
  await runGoal(goal({ engines: ['claude'] }), { ...w.adapters, runTurn: async (args) => (args.n === 2 ? { rc: 0, text: reply([{ type: 'blocked', reason: 'pause' }]), pid: 2 } : w.adapters.runTurn(args)) }, { stateDir: dir, controller: controller(w, 1) });
  const lines = (await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n');
  const { writeFile: write } = await import('node:fs/promises');
  // La última línea nunca llegó y la anterior quedó a medias.
  await write(join(dir, 'events.jsonl'), `${lines.slice(0, -2).join('\n')}\n${lines.at(-2).slice(0, 20)}`);
  const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(result.status, 'completed');
  const state = await readState(dir);
  const log = (await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log, state.events, 'events.jsonl mirrors the authoritative state.json events');
  assert.ok(state.events.some((e) => e.event === 'events-repaired'));
});

test('persists are serialized: a slow early write never overwrites a later state', async () => {
  const w = world({ scripts: { claude: orchestrator() } });
  const dir = await stateDir();
  const fsp = await import('node:fs/promises');
  let delayed = false;
  const fs = {
    rename: async (from, to) => {
      const text = await fsp.readFile(from, 'utf8').catch(() => '');
      if (!delayed && /"inflight":\{[^}]*"pid":1001/.test(text)) { delayed = true; await new Promise((resolve) => setTimeout(resolve, 80)); }
      return fsp.rename(from, to);
    }
  };
  const runTurn = w.adapters.runTurn;
  const result = await runGoal(goal({ engines: ['claude'] }), { ...w.adapters, runTurn: async (args) => { if (args.n === 1) args.onSpawn(1001, null); return runTurn(args); } }, { stateDir: dir, controller: controller(w, 1), fs });
  assert.equal(result.status, 'completed');
  await new Promise((resolve) => setTimeout(resolve, 150));
  const state = await readState(dir);
  assert.ok(delayed);
  assert.equal(state.status, 'completed', 'state.json is the final state, not the delayed early write');
  assert.equal(state.inflight, null);
});

test('a failed checkpoint after a turn blocks the run before any other turn or transfer', async () => {
  const w = world({ scripts: { claude: orchestrator(), opencode: orchestrator() } });
  const snapshot = w.adapters.snapshot;
  w.adapters.snapshot = async (args) => (args.n === 2 ? { rc: 1 } : snapshot(args));
  const result = await runGoal(goal(), w.adapters, { stateDir: await stateDir(), controller: controller(w, 1) });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /checkpoint failed after turn 1/);
  assert.deepEqual(w.turns, ['1:claude:lead']);
});

test('a checkpoint adapter that throws at start blocks without running any turn', async () => {
  const w = world({ scripts: { claude: orchestrator() } });
  w.adapters.snapshot = async () => { throw new Error('ENOTDIR'); };
  const result = await runGoal(goal({ engines: ['claude'] }), w.adapters, { stateDir: await stateDir(), controller: controller(w, 1) });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /checkpoint failed at start/);
  assert.deepEqual(w.turns, []);
});

// El líder pide una pausa en el turno indicado (una vez): el run se cierra con checkpoint y se reanuda después.
function pausing(at) {
  let paused = false;
  return async (ctx) => {
    if (!paused && ctx.prompt.turn === at) { paused = true; return { text: reply([{ type: 'blocked', reason: 'pause' }]) }; }
    return orchestrator()(ctx);
  };
}

test('resume restores changes lost after a valid checkpoint even when the leader does not change', async () => {
  const w = world({ scripts: { claude: pausing(2) } });
  const dir = await stateDir();
  const first = await runGoal(goal({ engines: ['claude'] }), w.adapters, { stateDir: dir, controller: controller(w, 1) });
  assert.equal(first.status, 'blocked');
  const expected = { ...w.files };
  w.files = {};
  const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(result.status, 'completed');
  const state = await readState(dir);
  assert.ok(state.events.some((e) => e.event === 'restored'), 'the lost work is restored from the checkpoint');
  assert.equal(w.commits[0].files['src/slug.js'], expected['src/slug.js']);
  assert.deepEqual(w.turns, ['1:claude:lead', '2:claude:lead', '3:claude:lead', '4:claude:lead']);
});

test('a partial loss is restored path by path when every differing path only lost its change', async () => {
  const w = world({ scripts: { claude: pausing(3) } });
  const dir = await stateDir();
  await runGoal(goal({ engines: ['claude'] }), w.adapters, { stateDir: dir, controller: controller(w, 1) });
  const expected = { ...w.files };
  delete w.files['src/slug.js'];
  const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(result.status, 'completed');
  assert.deepEqual(w.commits[0].files, expected);
  assert.ok((await readState(dir)).events.some((e) => e.event === 'restored'));
  assert.deepEqual(w.turns, ['1:claude:lead', '2:claude:lead', '3:claude:lead', '4:claude:lead'], 'the restored work is not redone');
});

test('a divergent tree on resume blocks and is left exactly as found', async () => {
  const w = world({ scripts: { claude: pausing(3) } });
  const dir = await stateDir();
  await runGoal(goal({ engines: ['claude'] }), w.adapters, { stateDir: dir, controller: controller(w, 1) });
  delete w.files['src/slug.js'];
  w.files['src/words.js'] = 'someone else edited this';
  const found = { ...w.files };
  const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /worktree changed since checkpoint/);
  assert.deepEqual(w.files, found, 'nothing is overwritten');
  assert.equal(w.commits.length, 0);
});

test('a controller crash during the commit resumes into verification and commits exactly once, without an engine turn', async () => {
  for (const when of ['before', 'after']) {
    const w = world({ scripts: { claude: orchestrator() } });
    const dir = await stateDir();
    const commit = w.adapters.commit;
    runGoal(goal({ engines: ['claude'] }), { ...w.adapters, commit: async (args) => { if (when === 'after') await commit(args); return new Promise(() => {}); } }, { stateDir: dir, controller: controller(w, 1) });
    await settle();
    crash(w, 1);
    const turns = [...w.turns];
    const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
    assert.equal(result.status, 'completed', when);
    assert.equal(w.commits.length, 1, `${when}: one commit`);
    assert.deepEqual(w.turns, turns, `${when}: no extra engine turn after the crash`);
    assert.equal(result.commit.reused, when === 'after');
  }
});

test('a controller crash during the push resumes into the push only, without a second commit or turn', async () => {
  const w = world({ scripts: { claude: orchestrator() } });
  const dir = await stateDir();
  const push = w.adapters.push;
  runGoal(goal({ engines: ['claude'], push: true }), { ...w.adapters, push: async (args) => { await push(args); return new Promise(() => {}); } }, { stateDir: dir, controller: controller(w, 1) });
  await settle();
  crash(w, 1);
  const turns = [...w.turns];
  const result = await runGoal((await readState(dir)).goal, w.adapters, { stateDir: dir, resume: await readState(dir), controller: controller(w, 2) });
  assert.equal(result.status, 'completed');
  assert.equal(w.commits.length, 1);
  assert.equal(w.pushes, 2, 'the push is retried (jz-git push is idempotent)');
  assert.deepEqual(w.turns, turns);
  assert.equal(result.push.remoteSha, w.commits[0].sha);
});
