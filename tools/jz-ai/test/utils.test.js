import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareBy, compareText } from '../src/order.js';
import { cell, cleanDeep, cleanText, redactUrl, safeErrorCode, tildify } from '../src/sanitize.js';
import { check, checkSeverity, countBySeverity, finding, sortChecks, sortFindings } from '../src/findings.js';
import { TOOL } from '../src/tool.js';

const HOSTILE = [
  'a\x1b[31mrojo\x1b[0m',          // CSI
  '\x1b]0;título\x07',              // OSC con BEL
  '\x1b]8;;https://x\x1b\\enlace',  // hipervínculo OSC 8 con ST
  '\x9b31mC1',                      // CSI de 8 bits
  'nul\x00del\x7f',                 // NUL y DEL
  'bidi\u202Etxt.exe\u2066x\u2069', // controles bidireccionales
  'lone\x1b',                       // ESC suelto
];
const UNSAFE = /[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

test('compareText ordena por unidades de código y deja null al final', () => {
  assert.deepEqual(['b', null, 'B', 'a', 'á'].sort(compareText), ['B', 'a', 'b', 'á', null]);
});

test('compareBy encadena claves', () => {
  const rows = [{ a: 'x', b: '2' }, { a: 'x', b: '1' }, { a: 'w', b: '9' }];
  assert.deepEqual(rows.sort(compareBy((r) => r.a, (r) => r.b)).map((r) => r.a + r.b), ['w9', 'x1', 'x2']);
});

test('cleanText elimina ANSI, C0, DEL, C1 y bidi', () => {
  assert.equal(cleanText('a\x1b[31mrojo\x1b[0m\x07b\x9bc'), 'arojobc');
  for (const value of HOSTILE) assert.doesNotMatch(cleanText(value), UNSAFE, JSON.stringify(value));
});

test('cleanDeep sanea toda cadena anidada sin tocar otros tipos ni crear __proto__', () => {
  const doc = JSON.parse('{"a":"x\\u001b[2Jy","b":[1,"\\u009b",null,true],"c":{"__proto__":"p\\u0007"}}');
  const clean = cleanDeep(doc);
  assert.deepEqual(clean.a, 'xy');
  assert.deepEqual(clean.b, [1, '', null, true]);
  assert.equal(Object.getPrototypeOf(clean.c), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(clean.c, '__proto__').value, 'p');
  assert.doesNotMatch(JSON.stringify(cleanDeep(HOSTILE)), /\\u00[01]|\\u007f|\\u009/);
});

test('cell escapa tabuladores y saltos de línea, sanea y usa - para null', () => {
  assert.equal(cell('a\tb\nc\r\nd'), 'a\\tb\\nc\\nd');
  assert.equal(cell(null), '-');
  assert.equal(cell(undefined), '-');
  assert.equal(cell(0), '0');
  for (const value of HOSTILE) assert.doesNotMatch(cell(value), UNSAFE);
});

test('redactUrl oculta usuario, contraseña y consulta', () => {
  assert.equal(redactUrl('https://user:tok@github.com/x.git'), 'https://[redacted]@github.com/x.git');
  assert.equal(redactUrl('https://u:p@ss@github.com/x'), 'https://[redacted]@github.com/x');
  assert.equal(redactUrl('https://github.com/x.git?token=abc#frag'), 'https://github.com/x.git?[redacted]#frag');
  assert.equal(redactUrl('https://github.com/@scope/x'), 'https://github.com/@scope/x');
  assert.equal(redactUrl('JuliusBrussee/caveman'), 'JuliusBrussee/caveman');
});

test('safeErrorCode sólo acepta códigos de sistema', () => {
  assert.equal(safeErrorCode(Object.assign(new Error('x'), { code: 'EACCES' })), 'EACCES');
  assert.equal(safeErrorCode(Object.assign(new Error('x'), { code: 'EACCES /root/.claude' })), null);
  assert.equal(safeErrorCode(Object.assign(new Error('x'), { code: 'ERR_\x1b' })), null);
  assert.equal(safeErrorCode(new Error('sin código')), null);
  assert.equal(safeErrorCode('texto'), null);
});

test('tildify abrevia sólo rutas bajo HOME', () => {
  assert.equal(tildify('/root/.claude', '/root'), '~/.claude');
  assert.equal(tildify('/root', '/root'), '~');
  assert.equal(tildify('/rootx/y', '/root'), '/rootx/y');
  assert.equal(tildify('/a', null), '/a');
});

test('finding toma la severidad del catálogo, sanea y ordena las rutas', () => {
  const f = finding('NAME_COLLISION_DIVERGENT', 'n\x1b[1m', ['/b', '/a'], 'm\x07');
  assert.deepEqual(f, { severity: 'warn', code: 'NAME_COLLISION_DIVERGENT', subject: 'n', paths: ['/a', '/b'], message: 'm' });
  assert.throws(() => finding('NO_EXISTE', 's', [], 'm'), /desconocido/);
  assert.throws(() => finding('toString', 's', [], 'm'), /desconocido/);
});

test('sortFindings ordena por severidad, código, sujeto y primera ruta', () => {
  const list = [
    finding('SAME_REALPATH', 's', ['/1'], ''),
    finding('LIMIT_REACHED', 's', ['/1'], ''),
    finding('BROKEN_LINK', 't', ['/1'], ''),
    finding('BROKEN_LINK', 's', ['/2'], ''),
    finding('BROKEN_LINK', 's', ['/1'], ''),
  ];
  assert.deepEqual(sortFindings(list).map((f) => `${f.severity}:${f.code}:${f.subject}:${f.paths[0]}`), [
    'error:LIMIT_REACHED:s:/1', 'warn:BROKEN_LINK:s:/1', 'warn:BROKEN_LINK:s:/2', 'warn:BROKEN_LINK:t:/1', 'info:SAME_REALPATH:s:/1',
  ]);
});

test('checkSeverity resuelve paths.<id>.* aunque el id contenga puntos', () => {
  assert.equal(checkSeverity('repo.outside'), 'info');
  assert.equal(checkSeverity('paths.claude-credentials.permissive'), 'warn');
  assert.equal(checkSeverity('paths.repo-env:.env.local.unexpected-type'), 'warn');
  assert.equal(checkSeverity('paths.x.otra-cosa'), null);
  assert.equal(checkSeverity('constructor'), null);
  assert.throws(() => check('repo.inventado', 'm'), /desconocido/);
});

test('check, sortChecks y countBySeverity', () => {
  const checks = [check('repo.outside', 'x'), check('runtime.node', 'y'), check('env.provider-keys', 'z')];
  assert.deepEqual(sortChecks(checks).map((c) => `${c.id}:${c.severity}`), ['env.provider-keys:info', 'repo.outside:info', 'runtime.node:error']);
  assert.deepEqual(Object.keys(checks[0]), ['id', 'severity', 'message']);
  assert.deepEqual(countBySeverity(checks), { info: 2, warn: 0, error: 1 });
});

test('TOOL coincide con package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(TOOL, { name: pkg.name, version: pkg.version });
});
