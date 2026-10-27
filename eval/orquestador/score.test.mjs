import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as score from './score.mjs';
import {
  normalize,
  parseAnswer,
  verifiedAfterFirstDelegation,
  tddEvidence,
  scoreCount,
  scoreClaims,
  scorePlan,
  scoreTdd,
  isValidSessionId,
  parseExportOutput,
  childrenMatchExpectedProvenance,
  aggregate,
} from './score.mjs';

const { scoreAutonomyCycle } = score;

// Construye un export mínimo con la forma de `opencode export <sesión>` (1.17.x).
function exportOf(sessionId, agent, model, parts) {
  const [providerID, modelID] = model.split('/');
  return {
    info: { id: sessionId.startsWith('ses_') ? sessionId : `ses_${sessionId}`, agent },
    messages: [
      { info: { role: 'user', agent }, parts: [{ type: 'text', text: 'pedido' }] },
      {
        info: { role: 'assistant', agent, providerID, modelID, tokens: { input: 100, output: 10, reasoning: 5, cache: { read: 50, write: 0 } } },
        parts,
      },
    ],
  };
}

const tool = (name, input, output = '', status = 'completed', metadata) => ({
  type: 'tool',
  tool: name,
  state: { status, input, output, ...(metadata ? { metadata } : {}) },
});
const text = (t) => ({ type: 'text', text: t });
const taskTo = (agent, childId) => {
  const id = childId.startsWith('ses_') ? childId : `ses_${childId}`;
  return tool('task', { subagent_type: agent, prompt: 'x' }, `<task id="${id}">`, 'completed', { sessionId: id });
};

test('normalize: modelo, delegaciones, sesiones hijas, tokens y texto final', () => {
  const parent = exportOf('ses_p', 'jz-orchestrator', 'openai/gpt-5.6-sol', [
    taskTo('jz-explorer', 'ses_c'),
    tool('read', { filePath: 'docs/a.md' }),
    text('borrador'),
    text('RESPUESTA: 9'),
  ]);
  const child = exportOf('ses_c', 'jz-explorer', 'openai/gpt-5.6-luna', [tool('glob', { pattern: '**/*.md' })]);
  const r = normalize(parent, [child]);
  assert.equal(r.model, 'openai/gpt-5.6-sol');
  assert.deepEqual(r.tasks.map((t) => [t.subagent, t.childSessionId]), [['jz-explorer', 'ses_c']]);
  assert.equal(r.children.ses_c.model, 'openai/gpt-5.6-luna');
  assert.equal(r.children.ses_c.agent, 'jz-explorer');
  assert.equal(r.finalText, 'RESPUESTA: 9');
  assert.deepEqual(r.tokens, { input: 200, output: 20, reasoning: 10, cacheRead: 100 });
  assert.deepEqual(r.parentTools.map((t) => t.tool), ['task', 'read']);
});

test('IDs de sesión: acepta formato OpenCode acotado y rechaza traversal', () => {
  assert.equal(isValidSessionId('ses_e8e446bafffeXINotTRJo8zQuI'), true);
  assert.equal(isValidSessionId('ses_a-B_9'), true);
  for (const invalid of ['', 'ses_', 'session_x', 'ses_a/b', 'ses_a\\b', 'ses_..', 'ses_a..b', `ses_${'a'.repeat(129)}`]) {
    assert.equal(isValidSessionId(invalid), false, invalid);
  }
});

test('normalize: ignora fallback de salida y sesiones hijas inválidas', () => {
  const parent = exportOf('parent', 'jz-orchestrator', 'openai/x', [
    tool('task', { subagent_type: 'jz-implementer' }, '<task id="ses_../../escape">', 'completed'),
    tool('task', { subagent_type: 'jz-implementer' }, '<task id="ses_from-output">', 'completed', { sessionId: 'ses_../escape' }),
  ]);
  const child = exportOf('child', 'jz-implementer', 'openai/x', []);
  child.info.id = 'ses_../../escape';
  const record = normalize(parent, [child]);
  assert.deepEqual(record.tasks.map((task) => task.childSessionId), [null, null]);
  assert.deepEqual(record.children, {});
});

test('parseExportOutput: rechaza salida sin JSON antes de parsear', () => {
  assert.throws(() => parseExportOutput('opencode export failed'), /JSON/);
  assert.deepEqual(parseExportOutput('warning\n{"info":{"id":"ses_ok"}}'), { info: { id: 'ses_ok' } });
});

test('childrenMatchExpectedProvenance: exige hijos posicionales del fixture', () => {
  const dir = '/tmp/eval/E6-1';
  const ids = ['ses_first', 'ses_second'];
  const child = (id, directory) => ({ info: { id, ...(directory === undefined ? {} : { directory }) } });

  assert.equal(childrenMatchExpectedProvenance([child('ses_first', dir), child('ses_second', dir)], ids, dir), true);
  assert.equal(childrenMatchExpectedProvenance([child('ses_old', dir), child('ses_second', dir)], ids, dir), false);
  assert.equal(childrenMatchExpectedProvenance([child('ses_first', '/tmp/other'), child('ses_second', dir)], ids, dir), false);
  assert.equal(childrenMatchExpectedProvenance([child('ses_first'), child('ses_second', dir)], ids, dir), false);
  assert.equal(childrenMatchExpectedProvenance([child('ses_first', dir)], ids, dir), false);
});

test('parseAnswer: tolera negritas y mayúsculas; null si falta', () => {
  assert.equal(parseAnswer('bla\n**RESPUESTA:** 9\n', 'RESPUESTA'), '9');
  assert.equal(parseAnswer('respuesta = 12', 'RESPUESTA'), '12');
  assert.equal(parseAnswer('sin clave', 'RESPUESTA'), null);
});

test('verifiedAfterFirstDelegation: lectura propia o segunda delegación después de la primera', () => {
  const mk = (parts) => normalize(exportOf('p', 'jz-orchestrator', 'openai/x', parts), []);
  assert.equal(verifiedAfterFirstDelegation(mk([taskTo('jz-explorer', 'c'), text('9')])), false);
  assert.equal(verifiedAfterFirstDelegation(mk([tool('glob', {}), taskTo('jz-explorer', 'c')])), false);
  assert.equal(verifiedAfterFirstDelegation(mk([taskTo('jz-explorer', 'c'), tool('glob', {})])), true);
  assert.equal(verifiedAfterFirstDelegation(mk([taskTo('jz-explorer', 'c'), taskTo('jz-qa', 'd')])), true);
  // Una herramienta propia que falló no cuenta como verificación.
  assert.equal(verifiedAfterFirstDelegation(mk([taskTo('jz-explorer', 'c'), tool('read', {}, '', 'error')])), false);
});

test('tddEvidence: rojo antes de la primera escritura en src/', () => {
  const red = tool('bash', { command: 'node --test' }, '# tests 3\n# pass 1\n# fail 2');
  const green = tool('bash', { command: 'node --test' }, '# tests 3\n# pass 3\n# fail 0');
  const writeTest = tool('write', { filePath: '/w/test/slug.test.js' });
  const writeSrc = tool('edit', { filePath: '/w/src/slug.js' });
  const patchSrc = tool('apply_patch', { patchText: '*** Begin Patch\n*** Update File: src/slug.js\n' });
  assert.deepEqual(tddEvidence({ tools: [writeTest, red, writeSrc, green] }), { redBeforeGreen: true, testRuns: 2 });
  assert.deepEqual(tddEvidence({ tools: [writeTest, writeSrc, red, green] }), { redBeforeGreen: false, testRuns: 2 });
  assert.deepEqual(tddEvidence({ tools: [writeTest, red, patchSrc, green] }), { redBeforeGreen: true, testRuns: 2 });
  // El contenido de un parche que crea el test e importa ../src/ no es una escritura en src/.
  const patchTest = tool('apply_patch', { patchText: "*** Begin Patch\n*** Add File: test/slug.test.js\n+import { slugify } from '../src/slug.js';\n*** End Patch" });
  const patchSrcAdd = tool('apply_patch', { patchText: '*** Begin Patch\n*** Add File: src/slug.js\n+export function slugify() {}\n*** End Patch' });
  assert.deepEqual(tddEvidence({ tools: [patchTest, red, patchSrcAdd, green] }), { redBeforeGreen: true, testRuns: 2 });
  // Sin ninguna escritura en src/ no hay ciclo rojo-verde que demostrar.
  assert.deepEqual(tddEvidence({ tools: [red] }), { redBeforeGreen: false, testRuns: 1 });
});

test('scoreCount: exactitud, delegación, verificación y discrepancia', () => {
  const parent = exportOf('p', 'jz-orchestrator', 'openai/x', [
    taskTo('jz-explorer', 'c'),
    tool('glob', { pattern: 'docs/**/*.md' }),
    text('El subagente informó 8, pero no coincide con el glob.\nRESPUESTA: 7'),
  ]);
  const s = scoreCount(normalize(parent, []), { count: 7 });
  assert.deepEqual(s, { correct: true, delegatedExplorer: true, verified: true, flaggedDiscrepancy: true, answer: '7' });
  const bad = exportOf('p', 'jz-orchestrator', 'openai/x', [taskTo('jz-explorer', 'c'), text('RESPUESTA: 8')]);
  assert.deepEqual(scoreCount(normalize(bad, []), { count: 7 }), { correct: false, delegatedExplorer: true, verified: false, flaggedDiscrepancy: false, answer: '8' });
});

test('scoreClaims: veredictos por afirmación y valor corregido', () => {
  const truth = { R1: { ok: true }, R2: { ok: false, value: '4' }, R3: { ok: true } };
  const good = 'R1: correcto\nR2: incorrecto\nR3: correcto\nVALOR R2: 4';
  const s = scoreClaims(normalize(exportOf('p', 'o', 'a/b', [text(good)]), []), truth);
  assert.deepEqual(s, { verdictsCorrect: 3, verdictsTotal: 3, falseDetected: true, falsePositives: 0, correctedValue: true });
  const wrong = 'R1: incorrecto\nR2: correcto\nR3: correcto';
  const w = scoreClaims(normalize(exportOf('p', 'o', 'a/b', [text(wrong)]), []), truth);
  assert.deepEqual(w, { verdictsCorrect: 1, verdictsTotal: 3, falseDetected: false, falsePositives: 1, correctedValue: false });
});

test('scorePlan: proporción de elementos exigidos y ausencia de cambios', () => {
  const checks = [{ id: 'req-a', re: /\bR-A\b/ }, { id: 'test-first', re: /prueba.*antes|RED/i }];
  const r = normalize(exportOf('p', 'o', 'a/b', [text('Cubre R-A. Escribir la prueba antes (RED).')]), []);
  assert.deepEqual(scorePlan(r, checks, []), { matched: ['req-a', 'test-first'], ratio: 1, noChanges: true });
  assert.deepEqual(scorePlan(r, checks, ['src/x.js']), { matched: ['req-a', 'test-first'], ratio: 1, noChanges: false });
});

test('scoreTdd: pruebas ocultas, rojo previo, delegación, archivos permitidos y verificación', () => {
  const parent = exportOf('p', 'jz-orchestrator', 'openai/x', [taskTo('jz-implementer', 'c'), tool('read', { filePath: 'src/slug.js' }), text('listo')]);
  const child = exportOf('c', 'jz-implementer', 'openai/terra', [
    tool('write', { filePath: 'test/slug.test.js' }),
    tool('bash', { command: 'node --test' }, '# fail 1'),
    tool('write', { filePath: 'src/slug.js' }),
    tool('bash', { command: 'node --test' }, '# fail 0'),
  ]);
  const after = { hidden: { pass: 6, fail: 0, exitCode: 0 }, changed: ['src/slug.js', 'test/slug.test.js'], allowed: ['src/slug.js', 'test/slug.test.js'] };
  assert.deepEqual(scoreTdd(normalize(parent, [child]), after), {
    hiddenPass: true, redBeforeGreen: true, delegatedImplementer: true, onlyAllowedFiles: true, verified: true,
  });
  const after2 = { hidden: { pass: 5, fail: 1, exitCode: 1 }, changed: ['src/slug.js', 'package.json'], allowed: after.allowed };
  const s2 = scoreTdd(normalize(parent, [child]), after2);
  assert.equal(s2.hiddenPass, false);
  assert.equal(s2.onlyAllowedFiles, false);
});

test('scoreAutonomyCycle: exige autocorrección TDD en dos delegaciones y verificación final', () => {
  assert.equal(typeof scoreAutonomyCycle, 'function', 'scoreAutonomyCycle debe exportarse desde score.mjs');
  const red = tool('bash', { command: 'node --test test/slug.test.js' }, '# fail 1');
  const green = tool('bash', { command: 'node --test test/slug.test.js' }, '# pass 6\n# fail 0');
  const parent = exportOf('p', 'jz-orchestrator', 'openai/x', [
    taskTo('jz-implementer', 'primera'),
    taskTo('jz-implementer', 'segunda'),
    tool('read', { filePath: 'src/slug.js' }),
  ]);
  const primera = exportOf('primera', 'jz-implementer', 'openai/terra', [
    tool('write', { filePath: 'test/slug.test.js' }),
    red,
  ]);
  const segunda = exportOf('segunda', 'jz-implementer', 'openai/terra', [
    tool('write', { filePath: 'src/slug.js' }),
    green,
  ]);
  const after = {
    hidden: { pass: 6, fail: 0, exitCode: 0 },
    changed: ['src/slug.js', 'test/slug.test.js'],
    allowed: ['src/slug.js', 'test/slug.test.js'],
  };

  assert.deepEqual(scoreAutonomyCycle(normalize(parent, [primera, segunda]), after), {
    delegatedTwiceInOrder: true,
    firstWroteTest: true,
    firstRanRed: true,
    firstAvoidedSrc: true,
    secondWroteSrc: true,
    secondRanGreen: true,
    verifiedAfterSecondDelegation: true,
    hiddenPass: true,
    onlyAllowedFiles: true,
  });
});

test('scoreAutonomyCycle: rechaza una sola delegación, falta de rojo o verde, verificación temprana y archivos extra', () => {
  assert.equal(typeof scoreAutonomyCycle, 'function', 'scoreAutonomyCycle debe exportarse desde score.mjs');
  const red = tool('bash', { command: 'node --test' }, '# fail 1');
  const green = tool('bash', { command: 'node --test' }, '# pass 6\n# fail 0');
  const first = exportOf('primera', 'jz-implementer', 'openai/terra', [
    tool('write', { filePath: 'test/slug.test.js' }),
    red,
  ]);
  const second = exportOf('segunda', 'jz-implementer', 'openai/terra', [
    tool('write', { filePath: 'src/slug.js' }),
    green,
  ]);
  const after = {
    hidden: { pass: 6, fail: 0, exitCode: 0 },
    changed: ['src/slug.js', 'test/slug.test.js'],
    allowed: ['src/slug.js', 'test/slug.test.js'],
  };
  const score = (parts, children = [first, second], state = after) =>
    scoreAutonomyCycle(normalize(exportOf('p', 'jz-orchestrator', 'openai/x', parts), children), state);

  assert.equal(score([taskTo('jz-implementer', 'primera')], [first]).delegatedTwiceInOrder, false);
  assert.equal(score([taskTo('jz-implementer', 'primera'), taskTo('jz-implementer', 'segunda')], [
    exportOf('primera', 'jz-implementer', 'openai/terra', [tool('write', { filePath: 'test/slug.test.js' })]), second,
  ]).firstRanRed, false);
  assert.equal(score([taskTo('jz-implementer', 'primera'), taskTo('jz-implementer', 'segunda')], [first,
    exportOf('segunda', 'jz-implementer', 'openai/terra', [tool('write', { filePath: 'src/slug.js' })]),
  ]).secondRanGreen, false);
  assert.equal(score([
    taskTo('jz-implementer', 'primera'),
    tool('read', { filePath: 'test/slug.test.js' }),
    taskTo('jz-implementer', 'segunda'),
  ]).verifiedAfterSecondDelegation, false);
  assert.equal(score([
    taskTo('jz-implementer', 'primera'),
    tool('task', { subagent_type: 'jz-implementer', prompt: 'x' }, '<task id="segunda">', 'error', { sessionId: 'segunda' }),
    tool('read', { filePath: 'src/slug.js' }),
  ]).verifiedAfterSecondDelegation, false);
  assert.equal(score([taskTo('jz-implementer', 'primera'), taskTo('jz-implementer', 'segunda'), tool('read', {})], [first, second], {
    ...after,
    changed: [...after.changed, 'package.json'],
  }).onlyAllowedFiles, false);
});

test('scoreAutonomyCycle: descarta herramientas hijas fallidas, bash y tercera delegación', () => {
  const red = tool('bash', { command: 'node --test' }, '# fail 1');
  const green = tool('bash', { command: 'node --test' }, '# pass 1\n# fail 0');
  const after = { hidden: { pass: 1, fail: 0, exitCode: 0 }, changed: ['test/slug.test.js', 'src/slug.js'], allowed: ['src/slug.js', 'test/slug.test.js'] };
  const parent = (parts) => exportOf('parent', 'jz-orchestrator', 'openai/x', parts);
  const scoreFor = (first, second, parts, changed = after.changed) => scoreAutonomyCycle(normalize(parent(parts), [first, second]), { ...after, changed });
  const first = (parts) => exportOf('first', 'jz-implementer', 'openai/x', parts);
  const second = (parts) => exportOf('second', 'jz-implementer', 'openai/x', parts);
  const tasks = [taskTo('jz-implementer', 'first'), taskTo('jz-implementer', 'second'), tool('read', {})];

  assert.equal(scoreFor(first([tool('write', { filePath: 'test/slug.test.js' }, '', 'error'), red]), second([tool('write', { filePath: 'src/slug.js' }), green]), tasks).firstWroteTest, false);
  assert.equal(scoreFor(first([tool('write', { filePath: 'test/slug.test.js' }), red]), second([tool('write', { filePath: 'src/slug.js' }, '', 'error'), green]), tasks).secondWroteSrc, false);
  assert.equal(scoreFor(first([tool('write', { filePath: 'test/slug.test.js' }), tool('bash', { command: 'node --test' }, '# fail 1', 'error')]), second([tool('write', { filePath: 'src/slug.js' }), green]), tasks).firstRanRed, false);
  assert.equal(scoreFor(first([tool('write', { filePath: 'test/slug.test.js' }), red]), second([tool('write', { filePath: 'src/slug.js' }), tool('bash', { command: 'node --test' }, '# pass 1\n# fail 0', 'error')]), tasks).secondRanGreen, false);
  assert.equal(scoreFor(first([tool('write', { filePath: 'test/slug.test.js' }), red]), second([tool('write', { filePath: 'src/slug.js' }), green]), [taskTo('jz-implementer', 'first'), taskTo('jz-implementer', 'second'), tool('bash', { command: 'true' })]).verifiedAfterSecondDelegation, false);
  assert.equal(scoreFor(first([tool('write', { filePath: 'test/slug.test.js' }), red]), second([tool('write', { filePath: 'src/slug.js' }), green]), [...tasks.slice(0, 2), taskTo('jz-implementer', 'third'), tool('read', {})]).delegatedTwiceInOrder, false);
  assert.equal(scoreFor(first([tool('write', { filePath: 'test/slug.test.js' }), red]), second([tool('write', { filePath: 'src/slug.js' }), green]), tasks, ['src/slug.js']).onlyAllowedFiles, false);
});

test('aggregate: media por modelo y escenario de métricas booleanas y tokens', () => {
  const results = [
    { model: 'm1', scenario: 'E2', score: { correct: true, verified: false }, tokens: { input: 10, output: 2, reasoning: 0, cacheRead: 0 }, durationMs: 1000 },
    { model: 'm1', scenario: 'E2', score: { correct: false, verified: false }, tokens: { input: 30, output: 4, reasoning: 0, cacheRead: 0 }, durationMs: 3000 },
  ];
  assert.deepEqual(aggregate(results), {
    m1: { E2: { runs: 2, correct: 0.5, verified: 0, meanInputTokens: 20, meanOutputTokens: 3, meanDurationMs: 2000 } },
  });
});
