import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHandoff } from '../src/handoff.js';

const base = () => ({
  branch: 'feat/handoff',
  sha: 'abc1234',
  changes: ['Añade buildHandoff', 'Añade tests'],
  tests: [{ command: 'node --test', result: 'pass' }],
  ci: 'verde',
  risks: ['Ninguno conocido en runtime'],
  ready: true
});

const HEADINGS = [
  '## Rama y SHA',
  '## Cambios funcionales',
  '## Pruebas y CI',
  '## Riesgos bloqueantes',
  '## Disponibilidad para integración'
];

test('empieza por "## Entrega"', () => {
  assert.ok(buildHandoff(base()).startsWith('## Entrega'));
});

test('contiene las cinco secciones en orden', () => {
  const out = buildHandoff(base());
  let last = -1;
  for (const h of HEADINGS) {
    const idx = out.indexOf(h);
    assert.ok(idx > last, `falta o desordenada: ${h}`);
    last = idx;
  }
});

test('Rama y SHA contiene <branch>@<sha>', () => {
  assert.ok(buildHandoff(base()).includes('`feat/handoff@abc1234`'));
});

test('acepta sha hexadecimal de 40 caracteres y mayúsculas', () => {
  assert.doesNotThrow(() => buildHandoff({ ...base(), sha: 'a'.repeat(40) }));
  assert.doesNotThrow(() => buildHandoff({ ...base(), sha: 'ABCDEF1' }));
});

test('lista cambios, riesgos, comandos, resultados y ci', () => {
  const out = buildHandoff(base());
  assert.ok(out.includes('- Añade buildHandoff'));
  assert.ok(out.includes('- Añade tests'));
  assert.ok(out.includes('- Ninguno conocido en runtime'));
  assert.ok(out.includes('node --test'));
  assert.ok(out.includes('pass'));
  assert.ok(out.includes('verde'));
});

test('listas vacías se escriben como "- Ninguno."', () => {
  const out = buildHandoff({ ...base(), changes: [], tests: [], risks: [] });
  const count = out.split('- Ninguno.').length - 1;
  assert.equal(count, 3);
});

test('cambios vacíos: "- Ninguno." bajo Cambios funcionales', () => {
  const out = buildHandoff({ ...base(), changes: [] });
  const from = out.indexOf('## Cambios funcionales');
  const to = out.indexOf('## Pruebas y CI');
  assert.ok(out.slice(from, to).includes('- Ninguno.'));
});

test('ready true escribe "Lista para integrar"', () => {
  const out = buildHandoff(base());
  assert.ok(out.includes('Lista para integrar'));
  assert.ok(!out.includes('No lista'));
});

test('ready false escribe "No lista"', () => {
  const out = buildHandoff({ ...base(), ready: false });
  assert.ok(out.includes('No lista'));
  assert.ok(!out.includes('Lista para integrar'));
});

test('es pura: no muta la entrada y es determinista', () => {
  const input = base();
  const copy = structuredClone(input);
  const a = buildHandoff(input);
  const b = buildHandoff(input);
  assert.equal(a, b);
  assert.deepEqual(input, copy);
});

test('TypeError si input no es objeto', () => {
  for (const bad of [null, undefined, 'x', 42, true, [], () => {}]) {
    assert.throws(() => buildHandoff(bad), TypeError);
  }
});

test('TypeError si branch es vacío o no string', () => {
  for (const bad of ['', '   ', undefined, 5, null]) {
    assert.throws(() => buildHandoff({ ...base(), branch: bad }), {
      name: 'TypeError',
      message: /branch/
    });
  }
});

test('TypeError si sha es inválido', () => {
  for (const bad of ['abc12', 'a'.repeat(41), 'xyz1234', 'abc 1234', '', undefined, 1234567]) {
    assert.throws(() => buildHandoff({ ...base(), sha: bad }), {
      name: 'TypeError',
      message: /sha/
    });
  }
});

test('TypeError si changes o risks no son arrays de strings', () => {
  for (const key of ['changes', 'risks']) {
    for (const bad of ['texto', undefined, null, [1], ['ok', null], [{}]]) {
      assert.throws(() => buildHandoff({ ...base(), [key]: bad }), {
        name: 'TypeError',
        message: new RegExp(key)
      });
    }
  }
});

test('TypeError si tests es inválido', () => {
  const bads = [
    'x',
    undefined,
    ['node --test'],
    [null],
    [{ command: 'a' }],
    [{ result: 'pass' }],
    [{ command: 1, result: 'pass' }],
    [{ command: 'a', result: 2 }]
  ];
  for (const bad of bads) {
    assert.throws(() => buildHandoff({ ...base(), tests: bad }), {
      name: 'TypeError',
      message: /tests/
    });
  }
});

test('TypeError si ready no es booleano', () => {
  for (const bad of ['true', 1, 0, null, undefined]) {
    assert.throws(() => buildHandoff({ ...base(), ready: bad }), {
      name: 'TypeError',
      message: /ready/
    });
  }
});
