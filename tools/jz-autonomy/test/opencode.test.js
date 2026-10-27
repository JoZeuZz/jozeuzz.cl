import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { buildAgentPrompt, buildOpenCodeEnv, createOpenCodeAdapters, parseJzState, resolveWorkspace } from '../src/opencode.js';

const objective = {
  unit: 'JZ-AUTONOMY-V2-I2-ADAPTER',
  objective: 'Use injected OpenCode adapters',
  branch: 'feat/autonomy-adapter',
  agent: 'jz-implementer',
  criteria: ['Adapters have no global state'],
  allowedPaths: ['src', 'test'],
  checks: [{ id: 'unit', argv: ['node', '--test', 'test/'] }],
  commit: { message: 'feat(autonomy): add adapters' }
};

test('resolves workspace only inside real root', async () => {
  assert.equal(await resolveWorkspace({ root: '/root', workspace: '.', realpath: async (path) => path }), '/root');
  assert.equal(await resolveWorkspace({ root: '/root', workspace: 'work', realpath: async (path) => path }), '/root/work');
  await assert.rejects(
    resolveWorkspace({ root: '/root', workspace: 'work', realpath: async (path) => path === '/root' ? path : '/outside' }),
    /escapes/
  );
});

test('parses tree status paths including JSON quoted paths', () => {
  assert.deepEqual(parseJzState('## Cambios sin confirmar\n```\n M src/a.js\n?? "test/name with space.js"\n```\n\n## Veredicto: REANUDABLE\n').paths, ['src/a.js', 'test/name with space.js']);
  assert.throws(() => parseJzState('## Veredicto: MAYBE\n'), /state format/);
  assert.deepEqual(parseJzState('## Cambios sin confirmar\nNinguno (árbol limpio).\n\n## Escritor\nNinguno.\n\n## Veredicto: REANUDABLE\n'), { verdict: 'REANUDABLE', paths: [] });
});

test('preflight uses exact argv cwd PWD and blocks branch, dirty and BLOQUEADO', async () => {
  for (const [branch, tree, expected] of [
    ['fix/nope', 'clean\n', 'blocked'],
    [objective.branch, 'M src/a.js\n', 'blocked'],
    [objective.branch, 'clean\n', 'blocked']
  ]) {
    const calls = [];
    const adapters = createOpenCodeAdapters({
      root: '/repo', stateDir: '/state', realpath: async (path) => path,
      execFile: async (file, argv, options) => {
        calls.push({ file, argv, options });
        if (argv[0] === 'branch') return { rc: 0, stdout: `${branch}\n` };
        if (file.endsWith('jz-state')) return { rc: 0, stdout: expected === 'blocked' && branch === objective.branch && tree === 'clean\n' ? '## Cambios sin confirmar\n```\n\n```\n\n## Veredicto: BLOQUEADO\n' : tree === 'clean\n' ? '## Cambios sin confirmar\n```\n\n```\n\n## Veredicto: REANUDABLE\n' : '## Cambios sin confirmar\n```\nM src/a.js\n```\n\n## Veredicto: REANUDABLE\n' };
        return { rc: 0, stdout: expected === 'blocked' && branch === objective.branch && tree === 'clean\n' ? 'BLOQUEADO\n' : 'REANUDABLE\n' };
      }
    });
    const result = await adapters.preflight({ objective: { ...objective, workspace: 'tools/app' } });
    assert.equal(result.status, 'blocked');
    assert.equal(calls[0].file, '/repo/tools/app/.jz/bin/jz-state');
    assert.deepEqual(calls[1].argv, ['branch', '--show-current']);
    assert.equal(calls[1].options.cwd, '/repo/tools/app');
    assert.equal(calls[1].options.env.PWD, '/repo/tools/app');
    assert.equal(calls[1].options.env.PATH, '/usr/sbin:/usr/bin:/sbin:/bin');
    assert.equal(calls[1].options.env.LANG, 'C.UTF-8');
    assert.equal(calls[1].options.env.LC_ALL, 'C.UTF-8');
  }
});

test('OpenCode environment allowlists host locations but excludes canaries', () => {
  const env = buildOpenCodeEnv({ HOME: '/home/me', XDG_CONFIG_HOME: '/config', API_TOKEN: 'TOKEN_CANARY', SECRET_KEY: 'KEY_CANARY', PATH: 'bad' });
  assert.equal(env.PATH, '/usr/sbin:/usr/bin:/sbin:/bin');
  assert.equal(env.HOME, '/home/me');
  assert.equal(JSON.stringify(env).includes('CANARY'), false);
});

test('buildOpenCodeEnv exact allowlist: four host vars, relative and unknown keys excluded', () => {
  const full = buildOpenCodeEnv({
    HOME: '/home/me',
    XDG_CONFIG_HOME: '/xdg/config',
    XDG_DATA_HOME: '/xdg/data',
    XDG_CACHE_HOME: '/xdg/cache',
    XDG_RUNTIME_DIR: '/xdg/runtime',
    NODE_OPTIONS: '--inspect',
    ANTHROPIC_API_KEY: 'sk-CANARY',
    HOME_RELATIVE: 'relative/path'
  });
  assert.deepEqual(full, {
    PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    HOME: '/home/me',
    XDG_CONFIG_HOME: '/xdg/config',
    XDG_DATA_HOME: '/xdg/data',
    XDG_CACHE_HOME: '/xdg/cache'
  });
  // relative values and unknown vars not included
  const sparse = buildOpenCodeEnv({ HOME: '/home/me', XDG_DATA_HOME: 'relative/not/abs' });
  assert.ok(!Object.prototype.hasOwnProperty.call(sparse, 'XDG_DATA_HOME'));
  assert.ok(!Object.prototype.hasOwnProperty.call(sparse, 'HOME_RELATIVE'));
});

test('runAgent terminates then kills on injected timeout', async () => {
  const timers = [];
  const child = new EventEmitter();
  const kills = [];
  child.kill = (signal) => kills.push(signal);
  const adapters = createOpenCodeAdapters({
    root: '/repo', stateDir: '/state', realpath: async (path) => path,
    spawn: () => child, setTimer: (fn) => { timers.push(fn); return fn; }, clearTimer: () => {}, timeoutMs: 1, killGraceMs: 1
  });
  const pending = adapters.runAgent({ objective: { ...objective, workspace: 'tools/app' }, phase: 'implementation', failures: [] });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  timers[0]();
  timers[1]();
  assert.equal((await pending).rc, 124);
  assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
});

test('inspectChanges rejects failed tree status instead of reporting clean paths', async () => {
  const adapters = createOpenCodeAdapters({
    root: '/repo', stateDir: '/state', realpath: async (path) => path,
    execFile: async () => ({ rc: 1, stderr: 'tree failure' })
  });
  await assert.rejects(adapters.inspectChanges({ objective: { ...objective, workspace: 'tools/app' } }), /tree status/);
});

test('correction prompt contains structured failures but not agent output canary', () => {
  const prompt = buildAgentPrompt({ objective, phase: 'correction', failures: [{ kind: 'agent', rc: 1, output: 'RAW_AGENT_CANARY' }] });
  assert.match(prompt, /correction/);
  assert.equal(prompt.includes('RAW_AGENT_CANARY'), false);
});

test('split-tdd prompt includes criteria and phase-specific supervised instructions', () => {
  const split = { ...objective, workflow: 'split-tdd', criteria: ['stable output'] };
  const implementation = buildAgentPrompt({ objective: split, phase: 'implementation' });
  assert.match(implementation, /stable output/);
  assert.match(implementation, /only tests/i);
  assert.match(implementation, /RED/);
  assert.match(implementation, /no production implementation/i);
  const correction = buildAgentPrompt({ objective: split, phase: 'correction', failures: [{ kind: 'check', id: 'unit', rc: 1, output: 'RAW_AGENT_CANARY' }] });
  assert.match(correction, /minimum implementation/i);
  assert.match(correction, /green/i);
  assert.equal(correction.includes('RAW_AGENT_CANARY'), false);
});

test('commit returns capability missing and calls the installed jz-git with the manifest and op', async () => {
  const absent = createOpenCodeAdapters({ root: '/repo', stateDir: '/state', realpath: async (path) => path, exists: async () => false });
  assert.deepEqual(await absent.commit({ objective: { ...objective, workspace: 'tools/app' } }), { rc: 78, evidence: 'capability missing' });

  const calls = [];
  const present = createOpenCodeAdapters({
    root: '/repo', stateDir: '/state', realpath: async (path) => path, exists: async () => true, node: '/usr/bin/node', gitops: '/opt/jz/jz-git.mjs',
    env: { HOME: '/home/u', ANTHROPIC_API_KEY: 'CANARY' },
    execFile: async (file, argv, options) => { calls.push({ file, argv, options }); return { rc: 0, stdout: '{"ok":true,"head":"abc123","evidence":"commit-proof"}\n' }; }
  });
  assert.deepEqual(await present.commit({ objective: { ...objective, workspace: 'tools/app' }, op: 'U:run:commit' }), { rc: 0, head: 'abc123', evidence: 'commit-proof' });
  assert.equal(calls[0].file, '/usr/bin/node');
  assert.deepEqual(calls[0].argv, ['/opt/jz/jz-git.mjs', 'commit', '--repo', '/repo/tools/app', '--branch', objective.branch, '--message', objective.commit.message, '--op', 'U:run:commit', '--path', 'src', '--path', 'test']);
  assert.equal(calls[0].options.env.HOME, '/home/u');
  assert.equal(JSON.stringify(calls[0].options.env).includes('CANARY'), false);
});

test('push returns remote SHA; malformed helper output and checkpoint keep only rc-safe fields', async () => {
  const adapters = createOpenCodeAdapters({
    root: '/repo', stateDir: '/state', realpath: async (path) => path, exists: async () => true, node: '/usr/bin/node', gitops: '/opt/jz/jz-git.mjs',
    execFile: async (file, argv) => argv[1] === 'push' ? { rc: 0, stdout: '{"ok":true,"head":"abc","remoteSha":"abc","evidence":"origin ok"}' }
      : argv[1] === 'commit' ? { rc: 0, stdout: 'RAW_COMMIT_CANARY' } : { rc: 7, stdout: 'RAW_CHECKPOINT_CANARY' }
  });
  assert.deepEqual(await adapters.push({ objective: { ...objective, workspace: 'tools/app' } }), { rc: 0, head: 'abc', remoteSha: 'abc', evidence: 'origin ok' });
  assert.deepEqual(await adapters.commit({ objective: { ...objective, workspace: 'tools/app' } }), { rc: 0, evidence: 'jz-git' });
  assert.deepEqual(await adapters.checkpoint({ result: 'completed', state: { objective: { ...objective, workspace: 'tools/app' } } }), { rc: 7 });
});

test('runCheck extracts stderr log path without persisting raw output', async () => {
  const adapters = createOpenCodeAdapters({
    root: '/repo', stateDir: '/state', realpath: async (path) => path,
    execFile: async () => ({ rc: 1, stdout: 'RAW_CHECK_CANARY', stderr: 'log=/state/run.log\n' })
  });
  const result = await adapters.runCheck({ objective: { ...objective, workspace: 'tools/app' }, check: objective.checks[0] });
  assert.deepEqual(result, { rc: 1, log: '/state/run.log', evidence: 'unit' });
  assert.equal(JSON.stringify(result).includes('RAW_CHECK_CANARY'), false);
});

test('runAgent uses workspace cwd and resolves spawn error exactly once', async () => {
  const calls = [];
  const child = new EventEmitter();
  child.on('error', () => {});
  const adapters = createOpenCodeAdapters({
    root: '/repo', stateDir: '/state', realpath: async (path) => path,
    spawn: (file, argv, options) => {
      calls.push({ file, argv, options });
      queueMicrotask(() => {
        child.emit('error', new Error('missing opencode'));
        child.emit('close', 0);
      });
      return child;
    }
  });
  const result = await adapters.runAgent({ objective: { ...objective, workspace: 'tools/app' }, phase: 'implementation', failures: [] });
  assert.equal(result.rc, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cwd, '/repo/tools/app');
  assert.equal(calls[0].options.env.PWD, '/repo/tools/app');
  assert.equal(calls[0].options.env.PATH, '/usr/sbin:/usr/bin:/sbin:/bin');
});
