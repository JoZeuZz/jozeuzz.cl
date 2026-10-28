import assert from 'node:assert/strict';
import test from 'node:test';

import { formatTimeline } from '../src/timeline.js';

test('formatea eventos en orden con hora UTC y detalle específico', () => {
  const events = [
    { at: '2026-10-27T01:02:03.456Z', event: 'agent', phase: 'implementation', engine: 'opencode', rc: 0 },
    { at: '2026-10-27T01:02:04.000Z', event: 'check', id: 'timeline-focal', rc: 1 },
    { at: '2026-10-27T01:02:05.999Z', event: 'inspect', paths: 3 },
    { at: '2026-10-27T01:02:06.000Z', event: 'commit', head: 'abcdef1234567890' },
    { at: '2026-10-27T01:02:07.000Z', event: 'push', rc: 0 },
    { at: '2026-10-27T01:02:08.000Z', event: 'closed', reason: 'completed' },
    { at: '2026-10-27T01:02:09.000Z', event: 'started', result: 'running' }
  ];

  assert.equal(
    formatTimeline(events),
    [
      '01:02:03 agent phase=implementation engine=opencode rc=0',
      '01:02:04 check id=timeline-focal rc=1',
      '01:02:05 inspect paths=3',
      '01:02:06 commit head=abcdef1',
      '01:02:07 push rc=0',
      '01:02:08 closed reason=completed',
      '01:02:09 started'
    ].join('\n')
  );
});

test('omite campos de detalle ausentes sin agregar espacios', () => {
  const events = [
    { at: '2026-10-27T01:02:03Z', event: 'agent', engine: 'opencode' },
    { at: '2026-10-27T01:02:04Z', event: 'check', rc: 0 },
    { at: '2026-10-27T01:02:05Z', event: 'inspect' },
    { at: '2026-10-27T01:02:06Z', event: 'commit', head: 'abc' },
    { at: '2026-10-27T01:02:07Z', event: 'push' },
    { at: '2026-10-27T01:02:08Z', event: 'closed' }
  ];

  assert.equal(
    formatTimeline(events),
    [
      '01:02:03 agent engine=opencode',
      '01:02:04 check rc=0',
      '01:02:05 inspect',
      '01:02:06 commit head=abc',
      '01:02:07 push',
      '01:02:08 closed'
    ].join('\n')
  );
});

test('es pura: no muta eventos y devuelve la misma salida para misma entrada', () => {
  const events = Object.freeze([
    Object.freeze({ at: '2026-10-27T01:02:03Z', event: 'agent', phase: 'implementation', engine: 'opencode', rc: 0 })
  ]);

  assert.equal(formatTimeline(events), formatTimeline(events));
  assert.deepEqual(events, [
    { at: '2026-10-27T01:02:03Z', event: 'agent', phase: 'implementation', engine: 'opencode', rc: 0 }
  ]);
});

for (const [name, value] of [
  ['no es array', undefined],
  ['es null', null],
  ['es string', 'events'],
  ['es objeto', {}],
  ['evento es null', [null]],
  ['evento sin at', [{ event: 'agent' }]],
  ['at no es string ISO', [{ at: 'ayer', event: 'agent' }]],
  ['at ISO inválido', [{ at: '2026-02-30T01:02:03Z', event: 'agent' }]],
  ['evento sin event', [{ at: '2026-10-27T01:02:03Z' }]],
  ['event no es string', [{ at: '2026-10-27T01:02:03Z', event: 1 }]]
]) {
  test(`TypeError cuando ${name}`, () => {
    assert.throws(() => formatTimeline(value), TypeError);
  });
}
