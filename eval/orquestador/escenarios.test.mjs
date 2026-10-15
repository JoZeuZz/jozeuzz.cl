import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, FIXTURE_DIR, truthFor, runHidden, sabotageProfile, nonInteractiveOrchestrator } from './escenarios.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

test('los cinco escenarios exigidos existen con id único', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['E1', 'E2', 'E3', 'E4', 'E5']);
  for (const s of SCENARIOS) assert.ok(s.prompt.length > 80, s.id);
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

test('las pruebas ocultas aceptan la referencia y rechazan una implementación sin R-2', async () => {
  assert.deepEqual(await runHidden(here('./referencia/slug.mjs')), { pass: 6, fail: 0, exitCode: 0 });
  const roto = await runHidden(here('./referencia/slug-sin-diacriticos.mjs'));
  assert.equal(roto.fail, 1);
  assert.notEqual(roto.exitCode, 0);
});

test('pruebas ocultas sin módulo: fallo, nunca aprobado', async () => {
  const r = await runHidden(here('./referencia/no-existe.mjs'));
  assert.notEqual(r.exitCode, 0);
  assert.equal(r.pass, 0);
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
