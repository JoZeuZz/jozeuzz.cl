import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeRun } from '../src/summary.js';

test('formatea result, corrections y checks pasados/total', () => {
  const out = summarizeRun({
    result: 'success',
    corrections: 1,
    checks: [{ id: 'a', rc: 0 }, { id: 'b', rc: 1 }, { id: 'c', rc: 0 }]
  });
  assert.equal(out, 'result=success corrections=1 checks=2/3');
});

test('sin checks produce 0/0', () => {
  assert.equal(summarizeRun({ result: 'blocked', corrections: 0, checks: [] }), 'result=blocked corrections=0 checks=0/0');
});

test('salida estable: misma entrada, misma cadena', () => {
  const input = { result: 'success', corrections: 2, checks: [{ id: 'a', rc: 0 }] };
  assert.equal(summarizeRun(input), summarizeRun({ ...input }));
});

test('no muta la entrada', () => {
  const input = Object.freeze({ result: 'success', corrections: 0, checks: Object.freeze([Object.freeze({ id: 'a', rc: 0 })]) });
  assert.doesNotThrow(() => summarizeRun(input));
});

for (const [name, value] of [
  ['undefined', undefined],
  ['null', null],
  ['string', 'success'],
  ['number', 1],
  ['array', []],
  ['sin result', { corrections: 0, checks: [] }],
  ['result no string', { result: 1, corrections: 0, checks: [] }],
  ['corrections no entero', { result: 'success', corrections: 1.5, checks: [] }],
  ['corrections negativo', { result: 'success', corrections: -1, checks: [] }],
  ['corrections string', { result: 'success', corrections: '1', checks: [] }],
  ['checks no array', { result: 'success', corrections: 0, checks: 'x' }],
  ['check no objeto', { result: 'success', corrections: 0, checks: [null] }],
  ['check sin rc entero', { result: 'success', corrections: 0, checks: [{ id: 'a' }] }]
]) {
  test(`TypeError para input inválido: ${name}`, () => {
    assert.throws(() => summarizeRun(value), TypeError);
  });
}
