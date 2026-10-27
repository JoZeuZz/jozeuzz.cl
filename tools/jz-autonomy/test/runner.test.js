import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runObjective, validateObjective } from '../src/runner.js';

const canary = 'AGENT_RAW_SECRET_CANARY';

function objective(overrides = {}) {
  return {
    schema: 'jz-autonomy-objective-v1',
    unit: 'JZ-AUTONOMY-V2-I2-CORE',
    objective: 'Run isolated autonomy state machine',
    workspace: '.',
    agent: 'jz-implementer',
    branch: 'feat/autonomy-runner',
    criteria: ['State persists before adapters run'],
    allowedPaths: ['tools/jz-autonomy/src', 'tools/jz-autonomy/test'],
    checks: [
      { id: 'unit', argv: ['node', '--test', 'test/runner.test.js'] },
      { id: 'suite', argv: ['node', '--test', 'test/'] }
    ],
    maxCorrections: 1,
    commit: { message: 'feat(autonomy): add core runner' },
    ...overrides
  };
}

async function stateDir() {
  return mkdtemp(join(tmpdir(), 'jz-autonomy-test-'));
}

function greenAdapters(calls, runCheck = async () => ({ rc: 0, log: 'green', evidence: 'ok' })) {
  return {
    preflight: async () => {
      calls.push('preflight');
      return { status: 'clean' };
    },
    runAgent: async ({ phase }) => {
      calls.push(`agent:${phase}`);
      return { rc: 0, output: canary };
    },
    inspectChanges: async () => {
      calls.push('inspect');
      return { paths: ['tools/jz-autonomy/test/runner.test.js'] };
    },
    runCheck: async ({ check }) => {
      calls.push(`check:${check.id}`);
      return runCheck(check);
    },
    commit: async () => {
      calls.push('commit');
      return { rc: 0 };
    },
    checkpoint: async ({ result }) => {
      calls.push(`checkpoint:${result}`);
      return { rc: 0 };
    }
  };
}

test('validateObjective rejects malformed input and dangerous paths', () => {
  assert.throws(() => validateObjective(objective({ schema: 'other' })), /schema/);
  assert.throws(() => validateObjective(objective({ agent: 'other-agent' })), /agent/);
  assert.throws(() => validateObjective(objective({ branch: 'main' })), /branch/);
  assert.throws(() => validateObjective(objective({ branch: 'release/autonomy' })), /branch/);
  assert.throws(() => validateObjective(objective({ allowedPaths: [] })), /allowedPaths/);
  assert.throws(() => validateObjective(objective({ checks: [] })), /checks/);
  assert.throws(() => validateObjective(objective({ criteria: [] })), /criteria/);
  assert.throws(() => validateObjective(objective({ criteria: ['bad\0criterion'] })), /NUL/);
  assert.throws(() => validateObjective(objective({ criteria: [3] })), /criteria/);
  assert.throws(() => validateObjective(objective({ workflow: 'parallel' })), /workflow/);
  assert.throws(() => validateObjective(objective({ workflow: 'split-tdd' })), /testPaths/);
  assert.throws(() => validateObjective(objective({ workflow: 'split-tdd', testPaths: ['src/../secret'] })), /testPaths/);
  assert.throws(() => validateObjective(objective({ workflow: 'split-tdd', testPaths: ['outside/test.js'] })), /testPaths/);
  assert.throws(() => validateObjective(objective({ maxCorrections: 3 })), /maxCorrections/);
  assert.throws(() => validateObjective(objective({ workspace: '/tmp/workspace' })), /workspace/);
  assert.throws(() => validateObjective(objective({ allowedPaths: ['src/../secret'] })), /path/);
  assert.throws(() => validateObjective(objective({ allowedPaths: ['.jz/policy'] })), /path/);
  assert.throws(() => validateObjective(objective({ allowedPaths: ['.env'] })), /secret/);
  assert.throws(() => validateObjective(objective({ objective: `bad\0input` })), /NUL/);
});

test('split-tdd blocks implementation source changes before checks', async () => {
  const calls = [];
  const adapters = greenAdapters(calls);
  adapters.inspectChanges = async () => {
    calls.push('inspect');
    return { paths: ['tools/jz-autonomy/src/runner.js'] };
  };
  const result = await runObjective(objective({ workflow: 'split-tdd', testPaths: ['tools/jz-autonomy/test'] }), adapters, { stateDir: await stateDir() });
  assert.equal(result.result, 'blocked');
  assert.deepEqual(calls, ['preflight', 'agent:implementation', 'inspect', 'checkpoint:blocked']);
});

test('split-tdd fails when implementation phase produces no red check', async () => {
  const calls = [];
  const result = await runObjective(objective({ workflow: 'split-tdd', testPaths: ['tools/jz-autonomy/test'] }), greenAdapters(calls), { stateDir: await stateDir() });
  assert.equal(result.result, 'failed');
  assert.equal(calls.includes('agent:correction'), false);
  assert.equal(calls.includes('commit'), false);
});

test('canonical state includes transitions before JSONL projection', async () => {
  const dir = await stateDir();
  await runObjective(objective(), greenAdapters([]), { stateDir: dir });
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  assert.ok(Array.isArray(state.events));
  assert.ok(state.events.some((event) => event.event === 'initialized'));
  assert.ok(state.events.some((event) => event.event === 'checkpoint'));
});

test('correction skips the rest of the suite while an affected check stays red', async () => {
  const calls = [];
  let unitRuns = 0;
  const result = await runObjective(
    objective(),
    greenAdapters(calls, async (check) => ({ rc: check.id === 'unit' && unitRuns++ < 2 ? 1 : 0, log: 'check' })),
    { stateDir: await stateDir() }
  );
  assert.equal(result.result, 'failed');
  assert.equal(calls.filter((call) => call === 'check:suite').length, 1);
});

test('checkpoint failure blocks completed result and preserves commit evidence', async () => {
  const calls = [];
  const adapters = greenAdapters(calls);
  adapters.commit = async () => ({ rc: 0, evidence: 'commit-proof', head: 'abc123' });
  adapters.checkpoint = async ({ result }) => {
    calls.push(`checkpoint:${result}`);
    return { rc: 1 };
  };
  const result = await runObjective(objective(), adapters, { stateDir: await stateDir() });
  assert.equal(result.result, 'blocked');
  assert.deepEqual(result.commit, { rc: 0, evidence: 'commit-proof', head: 'abc123' });
  assert.equal(calls.at(-1), 'checkpoint:completed');
});

test('correction event preserves structured failure kind', async () => {
  const dir = await stateDir();
  let runs = 0;
  await runObjective(objective(), greenAdapters([], async () => ({ rc: runs++ === 0 ? 1 : 0, log: 'failed', evidence: 'proof' })), { stateDir: dir });
  const events = (await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const correction = events.find((event) => event.event === 'correction');
  assert.deepEqual(correction.failures[0], { kind: 'check', phase: 'check', id: 'unit', argv: ['node', '--test', 'test/runner.test.js'], rc: 1, log: 'failed', evidence: 'proof' });
});

test('validateObjective defaults standard workflow and validates real split-tdd objective', async () => {
  assert.equal(validateObjective(objective()).workflow, 'standard');
  const real = JSON.parse(await readFile(new URL('../objectives/i2-real-task.json', import.meta.url), 'utf8'));
  assert.equal(validateObjective(real).workflow, 'split-tdd');
});

test('runs fail correction green commit in exact adapter order and redacts raw agent output', async () => {
  const calls = [];
  let unitRuns = 0;
  const dir = await stateDir();
  const result = await runObjective(
    objective(),
    greenAdapters(calls, async (check) => {
      if (check.id === 'unit' && unitRuns++ === 0) return { rc: 1, log: 'unit failed', evidence: 'failure' };
      return { rc: 0, log: `${check.id} green`, evidence: 'pass' };
    }),
    { stateDir: dir, id: () => 'fixed', clock: () => '2026-10-25T00:00:00.000Z' }
  );

  assert.equal(result.result, 'completed');
  assert.equal(result.corrections, 1);
  assert.deepEqual(calls, [
    'preflight', 'agent:implementation', 'inspect', 'check:unit', 'check:suite',
    'agent:correction', 'inspect', 'check:unit', 'check:suite',
    'commit', 'checkpoint:completed'
  ]);
  const persisted = await readFile(join(dir, 'state.json'), 'utf8');
  const events = await readFile(join(dir, 'events.jsonl'), 'utf8');
  assert.ok(persisted.includes('"completed"'));
  assert.ok(events.split('\n').filter(Boolean).length > 1);
  assert.equal(`${persisted}\n${events}`.includes(canary), false);
});

test('agent rc 1 activates correction even when initial checks are green', async () => {
  const calls = [];
  const result = await runObjective(
    objective(),
    {
      ...greenAdapters(calls, async () => ({ rc: 0, log: 'check' })),
      runAgent: async ({ phase }) => {
        calls.push(`agent:${phase}`);
        return { rc: phase === 'implementation' ? 1 : 0, output: canary };
      }
    },
    { stateDir: await stateDir() }
  );

  assert.equal(result.result, 'completed');
  assert.equal(result.corrections, 1);
  assert.ok(calls.includes('agent:correction'));
});

test('blocks extra inspected path before checks or commit', async () => {
  const calls = [];
  const adapters = greenAdapters(calls);
  adapters.inspectChanges = async () => {
    calls.push('inspect');
    return { paths: ['outside/file.js'] };
  };
  const result = await runObjective(objective(), adapters, { stateDir: await stateDir() });

  assert.equal(result.result, 'blocked');
  assert.deepEqual(calls, ['preflight', 'agent:implementation', 'inspect', 'checkpoint:blocked']);
});

test('fails after correction budget is exhausted without commit', async () => {
  const calls = [];
  const result = await runObjective(
    objective(),
    greenAdapters(calls, async () => ({ rc: 1, log: 'still failing' })),
    { stateDir: await stateDir() }
  );

  assert.equal(result.result, 'failed');
  assert.equal(result.corrections, 1);
  assert.equal(calls.includes('commit'), false);
  assert.equal(calls.at(-1), 'checkpoint:failed');
});

test('blocks after green checks when commit capability is missing', async () => {
  const calls = [];
  const adapters = greenAdapters(calls);
  delete adapters.commit;
  const result = await runObjective(objective(), adapters, { stateDir: await stateDir() });

  assert.equal(result.result, 'blocked');
  assert.equal(calls.includes('commit'), false);
  assert.equal(calls.at(-1), 'checkpoint:blocked');
});

for (const [name, preflight] of [
  ['blocked', async () => ({ status: 'blocked', reason: 'lock held' })],
  ['BLOQUEADO', async () => ({ status: 'BLOQUEADO', reason: 'lock held' })],
  ['dirty', async () => ({ status: 'clean', dirty: true })]
]) {
  test(`preflight ${name} blocks without calling agent`, async () => {
    const calls = [];
    const adapters = greenAdapters(calls);
    adapters.preflight = async () => {
      calls.push('preflight');
      return preflight();
    };
    const result = await runObjective(objective(), adapters, { stateDir: await stateDir() });

    assert.equal(result.result, 'blocked');
    assert.deepEqual(calls, ['preflight', 'checkpoint:blocked']);
  });
}

test('state.json contains initialized event before events.jsonl append fails', async () => {
  const dir = await stateDir();
  // block appendFile by pre-creating events.jsonl as a directory
  await mkdir(join(dir, 'events.jsonl'));
  await assert.rejects(
    runObjective(objective(), greenAdapters([]), { stateDir: dir }),
    /EISDIR/
  );
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  assert.ok(Array.isArray(state.events));
  assert.ok(state.events.some((ev) => ev.event === 'initialized'));
});

test('result.checks preserves rc and order; correction runs affected then only the remaining checks', async () => {
  const dir = await stateDir();
  let unitRuns = 0;
  const result = await runObjective(
    objective(),
    greenAdapters([], async (check) => {
      if (check.id === 'unit' && unitRuns++ === 0) return { rc: 1, log: 'unit-failed', evidence: 'fail-proof' };
      return { rc: 0, log: `${check.id}-ok`, evidence: 'ok-proof' };
    }),
    { stateDir: dir }
  );
  assert.equal(result.result, 'completed');
  // initial phase: unit(rc=1) + suite(rc=0)
  const [r0, r1, r2, r3, r4] = result.checks;
  assert.equal(r0.id, 'unit'); assert.equal(r0.rc, 1);
  assert.equal(r1.id, 'suite'); assert.equal(r1.rc, 0);
  // correction phase: affected(unit rc=0) + remaining checks once (suite rc=0); unit is not rerun on the same tree
  assert.equal(r2.id, 'unit'); assert.equal(r2.rc, 0);
  assert.equal(r3.id, 'suite'); assert.equal(r3.rc, 0);
  assert.equal(r4, undefined);
  assert.equal(result.checks.length, 4);
  // verify same data persisted in state.json
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  assert.equal(state.checks.length, 4);
  assert.equal(state.checks[0].id, 'unit'); assert.equal(state.checks[0].rc, 1);
});

test('resume replays recorded steps and retries only the unauthorized push', async () => {
  const dir = await stateDir();
  const calls = [];
  let pushRc = 77;
  const adapters = {
    ...greenAdapters(calls),
    commit: async ({ op }) => { calls.push(`commit:${op}`); return { rc: 0, head: 'abc123' }; },
    push: async () => { calls.push('push'); return pushRc === 0 ? { rc: 0, remoteSha: 'abc123' } : { rc: pushRc }; }
  };
  const first = await runObjective(objective({ push: true }), adapters, { stateDir: dir, id: () => 'run-1' });
  assert.equal(first.result, 'blocked');
  assert.equal(first.reason, 'push not authorized');
  const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  calls.length = 0;
  pushRc = 0;
  const second = await runObjective(saved.objective, adapters, { stateDir: dir, resume: saved, id: () => 'run-2' });
  assert.equal(second.result, 'completed');
  assert.equal(second.runId, 'run-1');
  assert.deepEqual(calls, ['push', 'checkpoint:completed']);
  assert.equal(second.push.remoteSha, 'abc123');
});

test('resume after an interruption reruns only from the first unrecorded step', async () => {
  const dir = await stateDir();
  const calls = [];
  let hang = true;
  const adapters = {
    ...greenAdapters(calls),
    runCheck: async ({ check }) => {
      calls.push(`check:${check.id}`);
      // Simula un proceso cortado: el paso nunca termina ni queda registrado.
      if (hang && check.id === 'suite') return new Promise(() => {});
      return { rc: 0 };
    }
  };
  runObjective(objective(), adapters, { stateDir: dir, id: () => 'run-x' });
  for (let i = 0; i < 50 && !calls.includes('check:suite'); i++) await new Promise((r) => setTimeout(r, 10));
  hang = false;
  const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  calls.length = 0;
  const result = await runObjective(saved.objective, adapters, { stateDir: dir, resume: saved });
  assert.equal(result.result, 'completed');
  assert.deepEqual(calls, ['check:suite', 'commit', 'checkpoint:completed']);
});

test('all engines unavailable blocks without counting a correction', async () => {
  const calls = [];
  const adapters = { ...greenAdapters(calls), runAgent: async () => ({ rc: 75, unavailable: true }) };
  const result = await runObjective(objective(), adapters, { stateDir: await stateDir() });
  assert.equal(result.result, 'blocked');
  assert.equal(result.reason, 'engines unavailable');
  assert.equal(result.corrections, 0);
  assert.equal(calls.some((c) => c.startsWith('check:')), false);
});

test('writer lock is required, held during work and released before the checkpoint', async () => {
  const calls = [];
  const busy = { ...greenAdapters(calls), acquire: async () => ({ rc: 1, reason: 'otro escritor' }) };
  const blocked = await runObjective(objective(), busy, { stateDir: await stateDir() });
  assert.equal(blocked.result, 'blocked');
  assert.match(blocked.reason, /otro escritor/);
  assert.equal(calls.includes('agent:implementation'), false);
  calls.length = 0;
  const held = { ...greenAdapters(calls), acquire: async () => { calls.push('acquire'); return { rc: 0 }; }, release: async () => { calls.push('release'); } };
  const done = await runObjective(objective(), held, { stateDir: await stateDir() });
  assert.equal(done.result, 'completed');
  assert.deepEqual(calls.slice(0, 3), ['preflight', 'acquire', 'agent:implementation']);
  assert.deepEqual(calls.slice(-2), ['release', 'checkpoint:completed']);
});

test('validateObjective checks engines, push and timeout', () => {
  assert.throws(() => validateObjective(objective({ engines: [] })), /engines/);
  assert.throws(() => validateObjective(objective({ engines: ['claude', 'claude'] })), /engines/);
  assert.throws(() => validateObjective(objective({ engines: ['codex'] })), /engines/);
  assert.throws(() => validateObjective(objective({ push: 'yes' })), /push/);
  assert.throws(() => validateObjective(objective({ timeoutMinutes: 0 })), /timeoutMinutes/);
  assert.equal(validateObjective(objective({ engines: ['opencode', 'claude'], push: true, timeoutMinutes: 30 })).push, true);
});

test('agent event records engines skipped by failover', async () => {
  const dir = await stateDir();
  const adapters = { ...greenAdapters([]), runAgent: async () => ({ rc: 0, engine: 'claude', skipped: [{ engine: 'opencode', reason: 'opencode agent jz-implementer mode subagent' }] }) };
  await runObjective(objective(), adapters, { stateDir: dir });
  const events = (await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(events.find((e) => e.event === 'agent').skipped, [{ engine: 'opencode', reason: 'opencode agent jz-implementer mode subagent' }]);
});

test('SEC-1: workspace must be the worktree root', () => {
  assert.throws(() => validateObjective(objective({ workspace: 'tools/evil' })), /workspace/);
  assert.equal(validateObjective(objective({ workspace: '.' })).workspace, '.');
});

test('SEC-1/3: inspection blocks control-plane or secret names at any depth even inside allowedPaths', async () => {
  for (const bad of ['tools/jz-autonomy/evil/.jz/bin/jz-state', 'tools/jz-autonomy/.opencode/plugins/x.js', 'tools/jz-autonomy/.env.local', 'tools/jz-autonomy/k.pem', 'tools/jz-autonomy/sub/.git']) {
    const calls = [];
    const adapters = { ...greenAdapters(calls), inspectChanges: async () => ({ paths: [bad] }) };
    const result = await runObjective(objective({ workspace: '.' }), adapters, { stateDir: await stateDir() });
    assert.equal(result.result, 'blocked', bad);
    assert.match(result.reason, /protected path/, bad);
    assert.equal(calls.includes('commit'), false);
  }
});

test('SEC-5: commit is blocked when the tree changed after the checks, also on resume', async () => {
  const calls = [];
  let fp = 'tree-a';
  const adapters = { ...greenAdapters(calls), fingerprint: async () => { calls.push(`fp:${fp}`); return { rc: 0, fingerprint: fp }; } };
  adapters.runCheck = async ({ check }) => { calls.push(`check:${check.id}`); if (check.id === 'suite') fp = 'tree-b'; return { rc: 0 }; };
  const result = await runObjective(objective({ workspace: '.' }), adapters, { stateDir: await stateDir() });
  // La huella se toma tras inspect y se compara antes del commit.
  assert.equal(result.result, 'blocked');
  assert.match(result.reason, /tree changed/);
  assert.equal(calls.includes('commit'), false);
});

test('SEC-8: redaction strips credentials embedded in URLs', async () => {
  const adapters = { ...greenAdapters([]), commit: async () => ({ rc: 1, evidence: 'remoto origin no autorizado (https://jose:ghp_SECRETCANARY@github.com/x.git)' }) };
  const dir = await stateDir();
  await runObjective(objective({ workspace: '.' }), adapters, { stateDir: dir });
  const all = `${await readFile(join(dir, 'state.json'), 'utf8')}${await readFile(join(dir, 'events.jsonl'), 'utf8')}`;
  assert.equal(all.includes('ghp_SECRETCANARY'), false);
});

test('SEC-2: objectives cannot write the installer, GitOps or objectives', () => {
  for (const p of ['tools/jz-autonomy', 'tools', 'tools/jz-autonomy/bin/jz-install', 'tools/jz-gitops/jz-git.mjs', 'tools/jz-autonomy/objectives/', 'tools/jz-gitops']) {
    assert.throws(() => validateObjective(objective({ allowedPaths: [p] })), /supervisor path/, p);
  }
  assert.equal(validateObjective(objective({ allowedPaths: ['tools/jz-autonomy/src/x.js', 'contrato'] })).allowedPaths.length, 2);
});

test('resume refuses a journal from another journal version instead of re-deciding phases live', async () => {
  const dir = await stateDir();
  await runObjective(objective(), { ...greenAdapters([]), commit: async () => ({ rc: 1 }) }, { stateDir: dir });
  const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  assert.equal(saved.journalVersion, 2);
  const calls = [];
  const old = { ...saved };
  delete old.journalVersion;
  const result = await runObjective(old.objective, greenAdapters(calls), { stateDir: dir, resume: old });
  assert.equal(result.result, 'blocked');
  assert.match(result.reason, /journal version/);
  assert.deepEqual(calls, ['checkpoint:blocked']);
});

test('a diverging journal blocks instead of running live steps', async () => {
  const dir = await stateDir();
  await runObjective(objective(), { ...greenAdapters([]), commit: async () => ({ rc: 1 }) }, { stateDir: dir });
  const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  saved.steps[1].key = '1:check';
  const calls = [];
  const result = await runObjective(saved.objective, greenAdapters(calls), { stateDir: dir, resume: saved });
  assert.equal(result.result, 'blocked');
  assert.match(result.reason, /journal diverged/);
  assert.equal(calls.some((c) => c.startsWith('agent') || c.startsWith('check:')), false);
});
