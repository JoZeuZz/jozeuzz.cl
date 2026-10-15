import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { runSkills } from '../src/skills.js';
import { NOTE, renderSkillsText } from '../src/render.js';
import { auditFixture, makeTree, runInProcess, skillMd, tempDir } from '../test-support/fixture.js';

async function setup(t) {
  const base = await tempDir(t);
  const home = join(base, 'home');
  const cwd = join(base, 'trabajo');
  await makeTree(base, { 'trabajo/': { dir: true } });
  await auditFixture(home);
  return { home, cwd, ctx: createContext({ env: { HOME: home }, cwd }) };
}

test('reproduce 3 variantes de caveman y 2 de cavecrew', async (t) => {
  const { ctx } = await setup(t);
  const doc = await runSkills(ctx);
  const groups = Object.fromEntries(doc.groups.map((g) => [g.name, g]));
  assert.equal(groups.caveman.status, 'divergent');
  assert.equal(groups.caveman.variants.length, 3);
  assert.equal(groups.cavecrew.status, 'divergent');
  assert.equal(groups.cavecrew.variants.length, 2);
  assert.equal(doc.completeness, 'complete');
  assert.deepEqual(doc.summary, { roots: 4, rootsPresent: 4, manifests: 8, uniqueFiles: 6, names: 2, divergentNames: 2, info: 2, warn: 2, error: 0 });
  const pluginSkill = doc.skills.find((s) => s.rootId === 'claude-plugins' && s.name === 'caveman');
  assert.equal(pluginSkill.plugin.installed, 'yes');
  assert.equal(pluginSkill.plugin.enabled, 'unknown');
  assert.equal(pluginSkill.plugin.loaded, 'unverified');
  assert.equal(doc.skills.find((s) => s.rootId === 'agents' && s.name === 'caveman').provenance.source, 'JuliusBrussee/caveman');
});

test('orden de claves de primer nivel', async (t) => {
  const { ctx } = await setup(t);
  assert.deepEqual(Object.keys(await runSkills(ctx)), ['schemaVersion', 'command', 'tool', 'completeness', 'roots', 'skills', 'groups', 'findings', 'summary']);
});

test('texto: nota fija, tabla TSV y rutas con ~', async (t) => {
  const { ctx, home } = await setup(t);
  const text = renderSkillsText(await runSkills(ctx), home);
  assert.ok(text.includes(NOTE));
  assert.ok(text.includes('NAME\tHOST\tROOT\tSHA256\tLINK\tPLUGIN\tPATH'));
  assert.ok(text.includes('~/.claude/skills/caveman/SKILL.md'));
  assert.ok(!text.includes(home));
});

const UNSAFE = /[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out);
  return out;
}

test('nombres con tabulador, salto de línea y ANSI no rompen la salida', async (t) => {
  const { ctx, home } = await setup(t);
  await makeTree(home, { '.agents/skills/raro\tnom\nbre\x1b[31m/SKILL.md': skillMd('x\x1b[2Jy') });
  const doc = await runSkills(ctx);
  const text = renderSkillsText(doc, home);
  assert.ok(!text.includes('\x1b'));
  for (const line of text.split('\n').filter((l) => l.startsWith('xy\t'))) assert.equal(line.split('\t').length, 7);
  assert.ok(doc.skills.some((s) => s.name === 'xy'));
});

test('JSON: ningún valor contiene controles, ANSI ni bidi, venga de donde venga', async (t) => {
  const { cwd, home } = await setup(t);
  await makeTree(home, {
    '.agents/skills/ruta\x1b]0;t\x07\u202E/SKILL.md': skillMd('n\x9b1m', 'cuerpo'),
    '.claude/plugins/cache/mk\x1b[2J/pl\x07/v\u2066/skills/s/SKILL.md': skillMd('s'),
    '.claude/skills/enlace\x1b[1m': { link: '../../.agents/skills/no-existe' },
  });
  const result = await runInProcess(['skills', '--json'], createContext({ env: { HOME: home }, cwd }));
  assert.notEqual(result.code, 3, result.stderr);
  for (const value of strings(JSON.parse(result.stdout))) assert.doesNotMatch(value, UNSAFE, JSON.stringify(value));
});

test('HOME no definido, vacío o relativo: HOME_UNSET, parcial y código 1', async (t) => {
  const { cwd } = await setup(t);
  for (const [env, motivo] of [[{}, 'no definida'], [{ HOME: '' }, 'vacía'], [{ HOME: 'rel' }, 'relativa']]) {
    const result = await runInProcess(['skills', '--json'], createContext({ env, cwd }));
    const doc = JSON.parse(result.stdout);
    assert.equal(result.code, 1);
    assert.equal(doc.completeness, 'partial');
    assert.equal(doc.findings[0].code, 'HOME_UNSET');
    assert.match(doc.findings[0].message, new RegExp(motivo));
  }
});
