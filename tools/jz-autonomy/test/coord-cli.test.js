import assert from 'node:assert/strict';
import test from 'node:test';

import { formatStatus } from '../src/coord-cli.js';

const state = {
  goal: { id: 'g' }, runId: 'r', status: 'blocked', reason: 'lease held by claude (pid 4242) until 2026-10-27T10:31:00.000Z', leader: 'claude',
  leadership: [{ engine: 'claude', reason: 'initial' }], engines: { claude: { status: 'available', reason: null } }, turns: [], tasks: {}, checkpoints: [], commit: null,
  lease: { holder: 'claude', turn: 2, pid: 4242, identity: { pid: 4242, start: '99', boot: 'b' }, token: 't', expiresAt: '2026-10-27T10:31:00.000Z' },
  committing: { op: 'g:r:commit', at: '2026-10-27T10:00:00.000Z' }
};

test('status shows a kept lease and a pending commit so a human knows why the run waits', () => {
  const text = formatStatus(state);
  assert.match(text, /^lease claude turn 2 pid 4242 \(start 99\) until 2026-10-27T10:31:00.000Z$/m);
  assert.match(text, /^commit pending: g:r:commit$/m);
});
