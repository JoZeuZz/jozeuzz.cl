import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumar, promedio } from '../src/numeros.js';

test('sumar suma los valores', () => {
  assert.equal(sumar([1, 2, 3]), 6);
});

test('promedio de una lista vacía es 0', () => {
  assert.equal(promedio([]), 0);
});
