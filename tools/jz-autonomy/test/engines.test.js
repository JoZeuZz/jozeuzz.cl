import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { buildClaudeEnv, claudeResultFailed, createClaudeRunner, createFailover, ENGINE_UNAVAILABLE, quotaExhausted } from '../src/engines.js';

const objective = {
  unit: 'U', objective: 'o', branch: 'feat/x', agent: 'jz-implementer', criteria: ['c'], allowedPaths: ['src'],
  checks: [{ id: 'unit', argv: ['node', '--test'] }], commit: { message: 'm' }
};

function fakeSpawn(calls, { rc = 0, stdout = '' } = {}) {
  return (file, argv, options) => {
    calls.push({ file, argv, options });
    const child = new EventEmitter();
    child.kill = () => {};
    child.stdout = new EventEmitter();
    child.stdout.pipe = () => {};
    queueMicrotask(() => { child.stdout.emit('data', Buffer.from(stdout)); child.emit('close', rc); });
    return child;
  };
}

test('quota detection covers Claude and OpenCode limit messages', () => {
  for (const text of ['Claude AI usage limit reached', 'Error: 429 Too Many Requests', 'insufficient_quota', 'rate_limit_error']) assert.equal(quotaExhausted(text), true, text);
  assert.equal(quotaExhausted('tests failed: 2'), false);
});

test('Claude env keeps only host locations and tags the engine', () => {
  const env = buildClaudeEnv({ HOME: '/root', PATH: '/evil', ANTHROPIC_API_KEY: 'CANARY', CLAUDE_CODE_SESSION_ID: 's', XDG_CONFIG_HOME: 'rel' });
  assert.deepEqual(env, { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', JZ_ENGINE: 'claude-code', HOME: '/root' });
});

test('Claude result parsing treats non-success JSON as failure', () => {
  assert.equal(claudeResultFailed('{"type":"result","subtype":"success","is_error":false}'), false);
  assert.equal(claudeResultFailed('{"type":"result","subtype":"error_max_turns","is_error":true}'), true);
  assert.equal(claudeResultFailed('not json'), true);
});

test('Claude runner launches the agent headless in the workspace with dontAsk', async () => {
  const calls = [];
  const run = createClaudeRunner({ bin: '/bin/claude', spawn: fakeSpawn(calls, { stdout: '{"type":"result","subtype":"success","is_error":false}' }), timeoutMs: 1000, env: { HOME: '/root' } });
  const out = await run({ objective, phase: 'implementation', failures: [], workspace: '/wt', stateDir: '/tmp', attempt: 1 });
  assert.deepEqual(out, { rc: 0, engine: 'claude' });
  assert.equal(calls[0].file, '/bin/claude');
  assert.deepEqual(calls[0].argv.slice(0, 7), ['-p', '--agent', 'jz-implementer', '--permission-mode', 'dontAsk', '--output-format', 'json']);
  assert.equal(calls[0].options.cwd, '/wt');
  assert.equal(calls[0].options.env.PWD, '/wt');
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('Claude runner reports quota as unavailable and refuses OpenCode-only agents', async () => {
  const quota = createClaudeRunner({ bin: '/bin/claude', spawn: fakeSpawn([], { rc: 1, stdout: '{"type":"result","is_error":true,"result":"Claude AI usage limit reached"}' }), timeoutMs: 1000 });
  assert.equal((await quota({ objective, phase: 'implementation', workspace: '/wt', stateDir: '/tmp', attempt: 1 })).unavailable, true);
  const copilot = createClaudeRunner({ bin: '/bin/claude', spawn: () => { throw new Error('must not spawn'); } });
  assert.equal((await copilot({ objective: { ...objective, agent: 'jz-implementer-copilot' }, phase: 'implementation', workspace: '/wt', stateDir: '/tmp' })).rc, ENGINE_UNAVAILABLE);
});

test('failover moves to the next engine on quota and keeps it for later phases', async () => {
  const calls = [];
  const runners = {
    claude: async ({ phase }) => { calls.push(`claude:${phase}`); return { rc: ENGINE_UNAVAILABLE, unavailable: true }; },
    opencode: async ({ phase }) => { calls.push(`opencode:${phase}`); return { rc: 0 }; }
  };
  const run = createFailover(runners, ['claude', 'opencode']);
  assert.deepEqual(await run({ phase: 'implementation' }), { rc: 0, engine: 'opencode' });
  assert.deepEqual(await run({ phase: 'correction' }), { rc: 0, engine: 'opencode' });
  assert.deepEqual(calls, ['claude:implementation', 'opencode:implementation', 'opencode:correction']);
  const none = createFailover({ claude: runners.claude }, ['claude']);
  assert.equal((await none({ phase: 'implementation' })).unavailable, true);
});
