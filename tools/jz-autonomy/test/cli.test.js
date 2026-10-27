import assert from 'node:assert/strict';
import test from 'node:test';

import { runCli } from '../src/cli.js';

function harness(overrides = {}) {
  const output = { stdout: [], stderr: [], adapters: [], runs: [] };
  const io = {
    cwd: () => '/repo',
    stdout: { write: (text) => output.stdout.push(text) },
    stderr: { write: (text) => output.stderr.push(text) },
    realpath: async (path) => path,
    lstat: async (path) => {
      if (path.includes('/.jz-state/autonomy/')) {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      }
      return { isFile: () => true, isSymbolicLink: () => false };
    },
    readFile: async () => Buffer.from(JSON.stringify({ objective: 'safe' })),
    mkdir: async () => {},
    createOpenCodeAdapters: (options) => { output.adapters.push(options); return { adapter: true }; },
    runObjective: async (objective, adapters, options) => {
      output.runs.push({ objective, adapters, options });
      return { result: 'completed', corrections: 0, checks: [], commit: null, paths: { state: '/state', events: '/events' } };
    },
    ...overrides
  };
  return { io, output };
}

const args = ['run', '--objective', 'objective.json', '--state-dir', 'slice-1'];

test('help and version return without filesystem inspection', async () => {
  const { io, output } = harness({ realpath: async () => { throw new Error('must not read'); } });
  assert.equal(await runCli(['--help'], io), 0);
  assert.equal(await runCli(['--version'], io), 0);
  assert.equal(output.stderr.length, 0);
});

test('creates a new controlled run directory and rejects existing or symlink race', async () => {
  const created = [];
  const { io } = harness({ mkdir: async (path, options) => { created.push({ path, options }); } });
  assert.equal(await runCli(args, io), 0);
  assert.equal(created.length, 2);

  const exists = harness({ mkdir: async () => { const error = new Error('exists'); error.code = 'EEXIST'; throw error; } });
  assert.equal(await runCli(args, exists.io), 2);
});

test('rejects invalid CLI arguments with usage code', async () => {
  const { io, output } = harness();
  assert.equal(await runCli(['run', '--objective', 'only.json'], io), 2);
  assert.match(output.stderr.join(''), /invalid arguments/);
});

test('rejects objective escape, symlink, and oversized file without raw content', async () => {
  for (const [argv, extra] of [
    [['run', '--objective', '../secret.json', '--state-dir', 'slice-1'], {}],
    [args, { lstat: async () => ({ isFile: () => false, isSymbolicLink: () => true }) }],
    [args, { readFile: async () => Buffer.alloc(65537, 'X') }],
    [args, { readFile: async () => Buffer.from('INVALID_JSON_CANARY') }]
  ]) {
    const { io, output } = harness(extra);
    assert.equal(await runCli(argv, io), 2);
    assert.equal(output.stderr.join('').includes('XXXXX'), false);
    assert.equal(output.stderr.join('').includes('INVALID_JSON_CANARY'), false);
  }
});

test('rejects state directories outside base, lexical escape, and symlink escape', async () => {
  for (const [stateDir, realpath] of [
    ['/tmp/state', async (path) => path],
    ['.', async (path) => path],
    ['../escape', async (path) => path],
    ['nested/run', async (path) => path === '/repo/.jz-state/autonomy/nested' ? '/outside' : path]
  ]) {
    const { io } = harness({ realpath });
    assert.equal(await runCli(['run', '--objective', 'objective.json', '--state-dir', stateDir], io), 2);
  }
});

test('allows missing autonomy base under existing jz-state', async () => {
  const missing = new Error('missing autonomy');
  missing.code = 'ENOENT';
  const { io } = harness({
    realpath: async (path) => {
      if (path === '/repo/.jz-state/autonomy') throw missing;
      return path;
    }
  });
  assert.equal(await runCli(args, io), 0);
});

test('rejects existing state destination dir, file, symlink and classifies mkdir EACCES as internal', async () => {
  // existing directory: mkdir succeeds (noop), lstat reports isDirectory → EEXIST semantics via mkdir mock
  const dir = harness({
    mkdir: async (path, options) => {
      if (!options?.recursive && path.endsWith('/slice-1')) {
        const error = new Error('exists'); error.code = 'EEXIST'; throw error;
      }
    }
  });
  assert.equal(await runCli(args, dir.io), 2);

  // existing file: mkdir noop, lstat says isFile → input error rc=2
  const file = harness({
    lstat: async (path) => path.endsWith('/slice-1')
      ? { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }
      : { isFile: () => true, isSymbolicLink: () => false }
  });
  assert.equal(await runCli(args, file.io), 2);

  // symlink: mkdir noop, lstat says isSymbolicLink → input error rc=2
  const sym = harness({
    lstat: async (path) => path.endsWith('/slice-1')
      ? { isFile: () => false, isDirectory: () => true, isSymbolicLink: () => true }
      : { isFile: () => true, isSymbolicLink: () => false }
  });
  assert.equal(await runCli(args, sym.io), 2);

  // mkdir EACCES on stateDir: internal error rc=3
  const denied = new Error('denied');
  denied.code = 'EACCES';
  const access = harness({
    mkdir: async (path, options) => {
      if (!options?.recursive && path.endsWith('/slice-1')) throw denied;
    }
  });
  assert.equal(await runCli(args, access.io), 3);
});

test('rejects state ancestor whose real path escapes jz-state', async () => {
  const { io } = harness({
    realpath: async (path) => path === '/repo/.jz-state/autonomy/nested' ? '/outside' : path
  });
  assert.equal(await runCli(['run', '--objective', 'objective.json', '--state-dir', 'nested/run'], io), 2);
});

test('wires parsed objective, adapters, and resolved state dir exactly', async () => {
  const objective = { schema: 'jz-autonomy-objective-v1', unit: 'UNIT' };
  const { io, output } = harness({ readFile: async () => Buffer.from(JSON.stringify(objective)) });
  assert.equal(await runCli(args, io), 0);
  assert.deepEqual(output.adapters, [{ root: '/repo', stateDir: '/repo/.jz-state/autonomy/slice-1', engines: undefined, timeoutMs: 1_800_000 }]);
  assert.deepEqual(output.runs, [{ objective, adapters: { adapter: true }, options: { stateDir: '/repo/.jz-state/autonomy/slice-1' } }]);
  assert.deepEqual(JSON.parse(output.stdout.join('')), { result: 'completed', corrections: 0, checks: [], commit: null, paths: { state: '/state', events: '/events' } });
});

test('passes --engines and rejects unknown or repeated engines', async () => {
  const { io, output } = harness();
  assert.equal(await runCli([...args, '--engines', 'claude,opencode'], io), 0);
  assert.deepEqual(output.adapters[0].engines, ['claude', 'opencode']);
  for (const bad of ['codex', 'claude,claude', '']) assert.equal(await runCli([...args, '--engines', bad], harness().io), 2);
});

test('resume reuses the saved journal and does not rerun a completed state', async () => {
  const saved = { schema: 'jz-autonomy-objective-v1', runId: 'r1', steps: [], events: [], result: 'blocked', objective: { unit: 'U', engines: ['claude'] } };
  const lstat = async () => ({ isFile: () => true, isSymbolicLink: () => false });
  const { io, output } = harness({ lstat, readFile: async () => Buffer.from(JSON.stringify(saved)) });
  assert.equal(await runCli(['resume', '--state-dir', 'slice-1'], io), 0);
  assert.equal(output.runs[0].options.resume.runId, 'r1');
  assert.deepEqual(output.adapters[0].engines, ['claude']);
  const done = harness({ lstat, readFile: async () => Buffer.from(JSON.stringify({ ...saved, result: 'completed' })) });
  assert.equal(await runCli(['resume', '--state-dir', 'slice-1'], done.io), 0);
  assert.equal(done.output.runs.length, 0);
  assert.equal(await runCli(['resume', '--state-dir', '../x'], harness({ lstat }).io), 2);
  assert.equal(await runCli(['resume', '--objective', 'o.json', '--state-dir', 's'], harness().io), 2);
});

test('maps runner completed, failed, blocked and internal errors to exit codes', async () => {
  for (const [result, code] of [['completed', 0], ['failed', 1], ['blocked', 2]]) {
    const { io } = harness({ runObjective: async () => ({ result, corrections: 0, checks: [], commit: null, paths: {} }) });
    assert.equal(await runCli(args, io), code);
  }
  const { io, output } = harness({ runObjective: async () => { throw new Error('INTERNAL_CANARY'); } });
  assert.equal(await runCli(args, io), 3);
  assert.equal(output.stderr.join('').includes('INTERNAL_CANARY'), false);
});
