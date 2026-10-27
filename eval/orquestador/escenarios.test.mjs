import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SCENARIOS,
  FIXTURE_DIR,
  HIDDEN_TESTS,
  truthFor,
  runHidden,
  parseHiddenResult,
  stageHidden,
  sabotageProfile,
  nonInteractiveOrchestrator,
} from './escenarios.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

test('los seis escenarios exigidos existen con id único', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);
  for (const s of SCENARIOS) assert.ok(s.prompt.length > 80, s.id);
});

test('E6 declara autocorrección tras fallo TDD', () => {
  const e6 = SCENARIOS.find((scenario) => scenario.id === 'E6');
  assert.ok(e6, 'E6 debe declararse');
  assert.equal(e6.title, 'Autocorrección autónoma');
  assert.match(e6.prompt, /dos delegaciones|segunda delegación/i);
  assert.match(e6.prompt, /roja|rojo/i);
  assert.match(e6.prompt, /verde/i);
  assert.match(e6.prompt, /verifica.*después|después.*verifica/i);
});

test('verdades calculadas sobre el fixture', () => {
  assert.equal(truthFor('E2', FIXTURE_DIR).count, 5); // .md bajo docs/, sin .md.bak ni .txt
  assert.equal(truthFor('E3', FIXTURE_DIR).count, 5); // export function en src/, sin export const
  assert.deepEqual(truthFor('E4', FIXTURE_DIR), { R1: { ok: true }, R2: { ok: false, value: '4' }, R3: { ok: true } });
});

test('sólo E3 usa el explorador saboteado', () => {
  assert.deepEqual(SCENARIOS.filter((s) => s.sabotage).map((s) => s.id), ['E3']);
  const perfil = sabotageProfile('---\nmode: subagent\n---\n\nEres jz-explorer.\n');
  assert.match(perfil, /^---\nmode: subagent\n---/);
  assert.match(perfil, /uno más/);
});

test('hidden se ejecuta con jz-run aislado, cwd fixture y entorno mínimo', async () => {
  const calls = [];
  const result = await runHidden('/fixture', (executable, args, options, callback) => {
    calls.push({ executable, args, options });
    callback(null, '# pass 6\n# fail 0\n');
  });
  assert.deepEqual(result, { pass: 6, fail: 0, exitCode: 0 });
  assert.deepEqual(calls, [{
    executable: '/fixture/.jz/bin/jz-run',
    args: ['node', '--test', '.jz-state/hidden/slug.oculta.mjs'],
    options: {
      cwd: '/fixture',
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      timeout: 60_000,
    },
  }]);
});

test('hidden resuelve siempre src/slug.js desde cwd, sin SLUG_MODULE', () => {
  const hidden = fs.readFileSync(here('./ocultas/slug.oculta.mjs'), 'utf8');
  assert.doesNotMatch(hidden, /SLUG_MODULE/);
  assert.match(hidden, /path\.join\(process\.cwd\(\), 'src\/slug\.js'\)/);
});

test('parser hidden rechaza fallo, timeout y rc no cero', async () => {
  assert.deepEqual(parseHiddenResult('# pass 6\n# fail 1\n'), { pass: 6, fail: 1, exitCode: 1 });
  assert.deepEqual(parseHiddenResult('', { code: 124 }), { pass: 0, fail: 0, exitCode: 124 });
  assert.deepEqual(parseHiddenResult('', { signal: 'SIGTERM' }), { pass: 0, fail: 0, exitCode: 1 });
});

test('hidden se stagea en .jz-state sólo después de calcular changedFiles', () => {
  const calls = [];
  const destination = stageHidden('/fixture', {
    mkdirSync: (...args) => calls.push(['mkdirSync', ...args]),
    copyFileSync: (...args) => calls.push(['copyFileSync', ...args]),
  });
  assert.equal(destination, '/fixture/.jz-state/hidden/slug.oculta.mjs');
  assert.deepEqual(calls, [
    ['mkdirSync', '/fixture/.jz-state/hidden', { recursive: true }],
    ['copyFileSync', HIDDEN_TESTS, destination],
  ]);
  const runner = fs.readFileSync(here('./run.mjs'), 'utf8');
  assert.ok(runner.indexOf('const changed = changedFiles(dir);') < runner.lastIndexOf('stageHidden(dir);'));
});

test('orquestador no interactivo: ask pasa a deny sólo en edit y bash, sin tocar task', () => {
  const perfil = [
    '---',
    'mode: primary',
    'permission:',
    '  edit: ask',
    '  bash: ask',
    '  webfetch: deny',
    '  task:',
    '    "*": deny',
    '    "jz-*": allow',
    '---',
    '',
    'Pide confirmación (ask) antes de editar.',
    '',
  ].join('\n');
  const out = nonInteractiveOrchestrator(perfil);
  assert.match(out, /^  edit: deny$/m);
  assert.match(out, /^  bash: deny$/m);
  assert.match(out, /^    "jz-\*": allow$/m);
  assert.match(out, /Pide confirmación \(ask\) antes de editar\./);
  assert.throws(() => nonInteractiveOrchestrator('---\nmode: primary\n---\n'), /edit: ask/);
});
