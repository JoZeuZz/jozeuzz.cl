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
    workspace: 'tools/jz-autonomy',
    agent: 'jz-implementer',
    branch: 'feat/autonomy-runner',
    criteria: ['State persists before adapters run'],
    allowedPaths: ['tools/jz-autonomy'],
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
  assert.throws(() => validateObjective(objective({ workspace: '/tmp/workspace' })), /path/);
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

test('correction always runs full suite after affected red check', async () => {
  const calls = [];
  let unitRuns = 0;
  const result = await runObjective(
    objective(),
    greenAdapters(calls, async (check) => ({ rc: check.id === 'unit' && unitRuns++ < 2 ? 1 : 0, log: 'check' })),
    { stateDir: await stateDir() }
  );
  assert.equal(result.result, 'failed');
  assert.equal(calls.filter((call) => call === 'check:suite').length, 2);
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
    'agent:correction', 'inspect', 'check:unit', 'check:unit', 'check:suite',
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

test('result.checks preserves rc and order; correction runs affected then full suite once', async () => {
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
  // correction phase: affected(unit rc=0) + full suite(unit rc=0, suite rc=0)
  assert.equal(r2.id, 'unit'); assert.equal(r2.rc, 0);
  assert.equal(r3.id, 'unit'); assert.equal(r3.rc, 0);
  assert.equal(r4.id, 'suite'); assert.equal(r4.rc, 0);
  assert.equal(result.checks.length, 5);
  // verify same data persisted in state.json
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  assert.equal(state.checks.length, 5);
  assert.equal(state.checks[0].id, 'unit'); assert.equal(state.checks[0].rc, 1);
});
