import test from 'node:test';
import assert from 'node:assert/strict';
import { FRONTMATTER_HEAD_BYTES, MAX_FRONTMATTER_BYTES, parseFrontmatter } from '../src/frontmatter.js';

const fm = (text) => parseFrontmatter(Buffer.from(text, 'utf8'));

test('frontmatter válido', () => {
  assert.deepEqual(fm('---\nname: caveman\ndescription: Estilo breve\n---\ncuerpo'), {
    ok: true, fields: { name: 'caveman', description: 'Estilo breve' }, problem: null,
  });
});

test('comillas simples y dobles, comentarios finales', () => {
  const r = fm(`---\nname: "a \\"b\\""\ndescription: 'it''s' # nota\n---\n`);
  assert.deepEqual(r.fields, { name: 'a "b"', description: "it's" });
});

test('BOM y CRLF', () => {
  assert.equal(fm('﻿---\r\nname: x\r\n---\r\n').fields.name, 'x');
});

test('cierre al final del archivo sin salto de línea', () => {
  assert.equal(fm('---\nname: x\n---').fields.name, 'x');
});

test('sin delimitador de apertura', () => {
  assert.deepEqual(fm('# Título\nname: x'), { ok: false, fields: {}, problem: 'missing-opening-delimiter' });
});

test('sin cierre dentro del límite', () => {
  const r = fm(`---\nname: x\n${'y: z\n'.repeat(3000)}---\n`);
  assert.deepEqual(r, { ok: false, fields: {}, problem: 'missing-closing-delimiter' });
});

// Documento cuyo cuerpo empieza justo después de la línea de cierre.
const doc = (n, eol = '\n', bom = '') => Buffer.from(`${bom}---${eol}name: x${eol}description: ${'a'.repeat(n)}${eol}---${eol}cuerpo`, 'utf8');

test('el límite de 8 192 bytes es exacto y cuenta BOM y CRLF', () => {
  const n = MAX_FRONTMATTER_BYTES - doc(0).indexOf('cuerpo');
  assert.equal(doc(n).indexOf('cuerpo'), MAX_FRONTMATTER_BYTES, 'el \\n de cierre es el byte 8 192');
  assert.equal(parseFrontmatter(doc(n)).ok, true);
  assert.equal(parseFrontmatter(doc(n + 1)).problem, 'missing-closing-delimiter');
  assert.equal(parseFrontmatter(doc(n, '\r\n')).problem, 'missing-closing-delimiter');
  assert.equal(parseFrontmatter(doc(n - 4, '\r\n')).ok, true);
  assert.equal(parseFrontmatter(doc(n, '\n', '﻿')).problem, 'missing-closing-delimiter');
  assert.equal(parseFrontmatter(doc(n - 3, '\n', '﻿')).ok, true);
});

test('la cabecera recortada que conserva el descubrimiento da el mismo resultado', () => {
  const n = MAX_FRONTMATTER_BYTES - doc(0).indexOf('cuerpo');
  for (const bytes of [doc(n), doc(n + 1), doc(n - 4, '\r\n')]) {
    assert.deepEqual(parseFrontmatter(bytes.subarray(0, FRONTMATTER_HEAD_BYTES)), parseFrontmatter(bytes));
  }
});

test('un ---- cortado por el límite no cuenta como cierre', () => {
  const n = MAX_FRONTMATTER_BYTES - doc(0).indexOf('cuerpo');
  const bytes = Buffer.from(`---\nname: x\ndescription: ${'a'.repeat(n + 1)}\n----más\n`, 'utf8');
  assert.equal(parseFrontmatter(bytes.subarray(0, FRONTMATTER_HEAD_BYTES)).problem, 'missing-closing-delimiter');
});

test('bytes no UTF-8 en el frontmatter: invalid-utf8; en el cuerpo: se ignoran', () => {
  const bad = Buffer.concat([Buffer.from('---\nname: x'), Buffer.from([0xff, 0xfe]), Buffer.from('\n---\n')]);
  assert.deepEqual(parseFrontmatter(bad), { ok: false, fields: {}, problem: 'invalid-utf8' });
  const body = Buffer.concat([Buffer.from('---\nname: x\n---\n'), Buffer.from([0xff, 0xfe, 0x00])]);
  assert.equal(parseFrontmatter(body).fields.name, 'x');
  assert.equal(parseFrontmatter(Buffer.from([0xff, 0xfe, 0x00, 0x41])).problem, 'missing-opening-delimiter');
});

test('multibyte válido', () => {
  assert.equal(fm('---\nname: café\ndescription: «ñ» 🦴\n---\n').fields.description, '«ñ» 🦴');
});

test('archivo vacío', () => {
  assert.deepEqual(parseFrontmatter(Buffer.alloc(0)), { ok: false, fields: {}, problem: 'missing-opening-delimiter' });
});

test('sin name: ok true y fields sin name', () => {
  assert.deepEqual(fm('---\ndescription: d\n---\n'), { ok: true, fields: { description: 'd' }, problem: null });
});

test('YAML complejo se ignora sin error y no se interpreta', () => {
  const text = '---\nname: &ancla x\ndescription: >\n  multilínea\nmeta:\n  name: anidado\ntags: [a, b]\n---\n';
  assert.deepEqual(fm(text), { ok: true, fields: {}, problem: null });
});

test('tags YAML no se interpretan', () => {
  assert.deepEqual(fm('---\nname: !!js/function x\n---\n').fields, {});
});

test('la primera aparición gana', () => {
  assert.equal(fm('---\nname: a\nname: b\n---\n').fields.name, 'a');
});
