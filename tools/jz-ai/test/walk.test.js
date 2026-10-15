import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { discoverSkills, LIMITS } from '../src/discover.js';
import { FRONTMATTER_HEAD_BYTES } from '../src/frontmatter.js';
import { isInside, skillRoots } from '../src/paths.js';
import { instrumentFs, makeTree, skillMd, tempDir } from '../test-support/fixture.js';

async function entriesFixture(t) {
  const base = await tempDir(t);
  const home = join(base, 'home');
  await makeTree(base, {
    'home/.agents/skills/caveman/SKILL.md': skillMd('caveman'),
    'home/.agents/skills/caveman/scripts/x.js': 'process.exit(1)',
    'home/.agents/skills/node_modules/dep/SKILL.md': skillMd('dep'),
    'home/.agents/skills/trampa/SKILL.md': { link: '../../../.claude/.credentials.json' },
    'home/.agents/skills/fuera-md/SKILL.md': { link: '../../../../fuera/skill/SKILL.md' },
    'home/.agents/skills/manifiesto-dir/SKILL.md': { dir: true },
    'home/.claude/.credentials.json': '{"token":"JZAI-CANARY-walk"}',
    'home/.claude/skills/caveman': { link: '../../.agents/skills/caveman' },
    'home/.claude/skills/roto': { link: '../../.agents/skills/no-existe' },
    'home/.claude/skills/externo': { link: '../../../fuera/skill' },
    'home/.claude/skills/ciclo-padre': { link: '..' },
    'home/.claude/skills/ciclo-propio': { link: '.' },
    'home/.claude/skills/bucle': { link: 'bucle' },
    'home/.claude/skills/archivo': { link: '../../.agents/skills/caveman/SKILL.md' },
    'home/.config/opencode/skills': 'no soy un directorio',
    'fuera/skill/SKILL.md': skillMd('externo'),
  });
  return { base, home };
}

const codesFor = (result, subject) => result.findings.filter((f) => f.subject === subject).map((f) => f.code);

test('symlink de entrada válido hacia otra raíz autorizada', async (t) => {
  const { home } = await entriesFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null));
  const viaLink = result.manifests.find((m) => m.entryPath === join(home, '.claude/skills/caveman/SKILL.md'));
  const direct = result.manifests.find((m) => m.entryPath === join(home, '.agents/skills/caveman/SKILL.md'));
  assert.equal(viaLink.realPath, join(home, '.agents/skills/caveman/SKILL.md'));
  assert.equal(viaLink.linkTarget, join(home, '.agents/skills/caveman'));
  assert.equal(viaLink.sha256, direct.sha256);
  assert.equal(direct.linkTarget, null);
  assert.equal(direct.siblingFiles, 1);
  assert.equal(direct.scriptLike, true);
});

test('enlaces rotos, externos y cíclicos se reportan sin leerse', async (t) => {
  const { base, home } = await entriesFixture(t);
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs);
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, skillRoots(home, null));
  assert.deepEqual(codesFor(result, 'roto'), ['BROKEN_LINK']);
  assert.deepEqual(codesFor(result, 'externo'), ['LINK_OUTSIDE_ROOTS']);
  assert.deepEqual(codesFor(result, 'ciclo-padre'), ['LINK_CYCLE']);
  assert.deepEqual(codesFor(result, 'ciclo-propio'), ['LINK_CYCLE']);
  assert.deepEqual(codesFor(result, 'bucle'), ['LINK_CYCLE']);
  assert.deepEqual(codesFor(result, 'archivo'), ['ENTRY_NOT_DIRECTORY']);
  assert.ok(spy.reads.every((p) => !isInside(p, join(base, 'fuera'))), 'no se lee fuera de las raíces');
  assert.equal(result.partial, false);
});

test('SKILL.md enlazado a un secreto o fuera de raíces no se lee', async (t) => {
  const { home } = await entriesFixture(t);
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs);
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, skillRoots(home, null));
  assert.deepEqual(codesFor(result, 'trampa'), ['SENSITIVE_PATH_SKIPPED']);
  assert.deepEqual(codesFor(result, 'fuera-md'), ['LINK_OUTSIDE_ROOTS']);
  assert.equal(result.manifests.find((m) => m.dirName === 'trampa').readProblem, 'sensitive');
  assert.ok(!spy.reads.some((p) => p.endsWith('.credentials.json')));
  assert.ok(!JSON.stringify(result).includes('JZAI-CANARY-walk'));
});

test('SKILL.md que no es archivo regular', async (t) => {
  const { home } = await entriesFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null));
  assert.deepEqual(codesFor(result, 'manifiesto-dir'), ['ENTRY_NOT_FILE']);
});

test('raíces ausentes, raíz que es archivo y exclusiones', async (t) => {
  const { home } = await entriesFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null));
  const status = Object.fromEntries(result.roots.map((r) => [r.id, r.status]));
  assert.deepEqual(status, { 'claude-user': 'ok', 'claude-plugins': 'missing', agents: 'ok', 'opencode-user': 'not-directory' });
  assert.deepEqual(codesFor(result, 'claude-plugins'), ['ROOT_MISSING']);
  assert.deepEqual(codesFor(result, 'opencode-user'), ['ROOT_NOT_DIRECTORY']);
  assert.ok(!result.manifests.some((m) => m.entryPath.includes('node_modules')));
});

test('SKILL.md ilegible y raíz ilegible marcan resultado parcial', async (t) => {
  const { home } = await entriesFixture(t);
  const ctx = createContext({ env: { HOME: home } });
  const target = join(home, '.agents/skills/caveman/SKILL.md');
  const spy = instrumentFs(ctx.fs, { fail: { readBounded: { [target]: 'EACCES' }, readdir: { [join(home, '.claude/skills')]: 'EACCES' } } });
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, skillRoots(home, null));
  assert.equal(result.partial, true);
  assert.ok(result.findings.some((f) => f.code === 'UNREADABLE' && f.subject === 'caveman'));
  assert.ok(result.findings.some((f) => f.code === 'UNREADABLE' && f.subject === 'claude-user'));
  assert.equal(result.manifests.find((m) => m.realPath === target).readProblem, 'unreadable');
});

test('SKILL.md demasiado grande', async (t) => {
  const { home } = await entriesFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null), { ...LIMITS, skillBytes: 10 });
  assert.ok(result.findings.some((f) => f.code === 'TOO_LARGE' && f.subject === 'caveman'));
  assert.equal(result.manifests.find((m) => m.dirName === 'caveman').sha256, null);
});

test('muchos archivos en una skill no consumen el presupuesto de descubrimiento', async (t) => {
  const { home } = await entriesFixture(t);
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`.agents/skills/caveman/assets/f${i}.txt`, 'x']));
  await makeTree(home, many);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null), { ...LIMITS, maxEntries: 20 });
  assert.ok(!result.findings.some((f) => f.code === 'LIMIT_REACHED'));
  assert.equal(result.partial, false);
  assert.equal(result.manifests.find((m) => m.entryPath === join(home, '.agents/skills/caveman/SKILL.md')).siblingFiles, 41);
});

test('tope de hermanos por skill: SIBLINGS_TRUNCATED, sin resultado parcial', async (t) => {
  const { home } = await entriesFixture(t);
  await makeTree(home, { '.agents/skills/caveman/a.txt': 'x', '.agents/skills/caveman/b.txt': 'x', '.agents/skills/caveman/c.txt': 'x' });
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null), { ...LIMITS, siblingEntries: 2 });
  const direct = result.manifests.find((m) => m.entryPath === join(home, '.agents/skills/caveman/SKILL.md'));
  assert.ok(direct.siblingFiles <= 2);
  assert.ok(result.findings.some((f) => f.code === 'SIBLINGS_TRUNCATED' && f.severity === 'info' && f.subject === 'caveman'));
  assert.equal(result.partial, false);
});

test('el manifiesto conserva sólo la cabecera; el hash cubre el archivo completo', async (t) => {
  const { home } = await entriesFixture(t);
  const big = `${skillMd('caveman')}${'relleno\n'.repeat(12000)}JZAI-CANARY-body\n`;
  await makeTree(home, { '.agents/skills/caveman/SKILL.md': big });
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null));
  const direct = result.manifests.find((m) => m.entryPath === join(home, '.agents/skills/caveman/SKILL.md'));
  assert.equal(direct.head.length, FRONTMATTER_HEAD_BYTES);
  assert.equal(direct.sha256, createHash('sha256').update(big).digest('hex'));
  assert.equal(direct.size, Buffer.byteLength(big));
  assert.ok(!direct.head.includes('JZAI-CANARY-body'));
  assert.equal(Object.hasOwn(direct, 'text'), false);
});
