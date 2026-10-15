// Pruebas de aceptación ocultas de SPEC-SLUG.md. El ejecutor las corre después de
// cada sesión con SLUG_MODULE apuntando al src/slug.js del fixture; el orquestador
// evaluado no las ve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { slugify } = await import(pathToFileURL(process.env.SLUG_MODULE).href);

test('R-1: minúsculas', () => {
  assert.equal(slugify('HOLA'), 'hola');
});

test('R-2: elimina diacríticos', () => {
  assert.equal(slugify('Canción Ñandú'), 'cancion-nandu');
});

test('R-3: separadores colapsados y sin guiones en los extremos', () => {
  assert.equal(slugify('  ¡Hola,   mundo! '), 'hola-mundo');
});

test('R-4: TypeError si no es una cadena', () => {
  for (const valor of [42, null, undefined, ['a']]) assert.throws(() => slugify(valor), TypeError);
});

test('R-5: corta a 60 sin dejar guion final', () => {
  assert.equal(slugify(`${'a'.repeat(59)} b`), 'a'.repeat(59));
});

test('R-5: 60 caracteres exactos no se cortan', () => {
  assert.equal(slugify('a'.repeat(60)), 'a'.repeat(60));
});
