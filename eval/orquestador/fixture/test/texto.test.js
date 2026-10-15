import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarPalabras, capitalizar, invertir } from '../src/texto.js';

test('contarPalabras cuenta palabras separadas por espacios', () => {
  assert.equal(contarPalabras('uno dos  tres'), 3);
});

test('contarPalabras devuelve 0 para texto vacío', () => {
  assert.equal(contarPalabras('   '), 0);
});

test('capitalizar pone en mayúscula la primera letra', () => {
  assert.equal(capitalizar('hola'), 'Hola');
});

test('invertir invierte el texto', () => {
  assert.equal(invertir('abc'), 'cba');
});
