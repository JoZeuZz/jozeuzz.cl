import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHECK_SEVERITY, FINDING_SEVERITY } from '../src/findings.js';

const SPEC = readFileSync(new URL('../../../docs/superpowers/specs/2026-10-14-jz-ai-m0-design.md', import.meta.url), 'utf8');

function tableRows(heading) {
  const start = SPEC.indexOf(heading);
  assert.notEqual(start, -1, heading);
  const next = SPEC.indexOf('\n### ', start + heading.length);
  const body = SPEC.slice(start, next === -1 ? undefined : next);
  return Object.fromEntries([...body.matchAll(/^\| `([^`]+)` \| `?(info|warn|error)`? \|/gm)].map((m) => [m[1], m[2]]));
}

test('catálogo de hallazgos = spec §6.8', () => {
  assert.deepEqual(tableRows('### 6.8 Catálogo de códigos de hallazgo'), { ...FINDING_SEVERITY });
});

test('catálogo de checks = spec §10.2', () => {
  const spec = Object.fromEntries(Object.entries(tableRows('### 10.2 Checks')).map(([id, sev]) => [id.replace('paths.<id>.', 'paths.*.'), sev]));
  assert.deepEqual(spec, { ...CHECK_SEVERITY });
});
