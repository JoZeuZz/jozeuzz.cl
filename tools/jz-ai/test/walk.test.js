import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { createFsRead } from '../src/fs-read.js';
import { discoverSkills, LIMITS } from '../src/discover.js';
import { FRONTMATTER_HEAD_BYTES } from '../src/frontmatter.js';
import { isInside, skillRoots } from '../src/paths.js';
import { countingOpendir, instrumentFs, makeTree, skillMd, tempDir } from '../test-support/fixture.js';

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
  const spy = instrumentFs(ctx.fs, { fail: { readBounded: { [target]: 'EACCES' }, readdirBounded: { [join(home, '.claude/skills')]: 'EACCES' } } });
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

test('recuento de hermanos exacto en el tope y al superarlo', async (t) => {
  const { home } = await entriesFixture(t);
  const skill = join(home, '.agents/skills/caveman/SKILL.md');
  // Hermanos de caveman: scripts/ y scripts/x.js = 2 entradas.
  const run = async (siblingEntries) => discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null), { ...LIMITS, siblingEntries });
  const exact = await run(2);
  assert.equal(exact.manifests.find((m) => m.entryPath === skill).siblingFiles, 1);
  assert.ok(!exact.findings.some((f) => f.code === 'SIBLINGS_TRUNCATED' && f.subject === 'caveman'));
  await makeTree(home, { '.agents/skills/caveman/a.txt': 'x', '.agents/skills/caveman/b.txt': 'x' });
  // Orden: a.txt, b.txt, scripts, scripts/x.js; con tope 3 se cuentan a.txt, b.txt y scripts/.
  const over = await run(3);
  assert.equal(over.manifests.find((m) => m.entryPath === skill).siblingFiles, 2);
  assert.equal(over.findings.filter((f) => f.code === 'SIBLINGS_TRUNCATED' && f.subject === 'caveman').length, 2, 'uno por entrada (directa y vía enlace)');
  assert.equal(over.partial, false);
});

test('scriptLike puede ser falso negativo tras truncar el recuento', async (t) => {
  const { home } = await entriesFixture(t);
  await makeTree(home, { '.agents/skills/caveman/a.txt': 'x' });
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null), { ...LIMITS, siblingEntries: 1 });
  const direct = result.manifests.find((m) => m.entryPath === join(home, '.agents/skills/caveman/SKILL.md'));
  // a.txt y scripts/ no caben en el tope de 1: el directorio no se cuenta y scripts/x.js queda sin ver.
  assert.equal(direct.siblingFiles, 0);
  assert.equal(direct.scriptLike, false);
  assert.ok(result.findings.some((f) => f.code === 'SIBLINGS_TRUNCATED' && f.subject === 'caveman'));
});

test('symlink de entrada cuyo destino es exactamente otra raíz autorizada', async (t) => {
  const { home } = await entriesFixture(t);
  await makeTree(home, { '.claude/skills/raiz': { link: '../../.agents/skills' } });
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null));
  assert.deepEqual(codesFor(result, 'raiz'), ['LINK_CYCLE']);
  assert.ok(!result.manifests.some((m) => m.dirName === 'raiz'));
});

test('errores inyectados al resolver enlaces de entrada y de manifiesto', async (t) => {
  const { home } = await entriesFixture(t);
  await makeTree(home, { '.agents/skills/enlazada/SKILL.md': { link: '../caveman/SKILL.md' } });
  const ctx = createContext({ env: { HOME: home } });
  const entryLink = join(home, '.claude/skills/caveman');
  const manifestLink = join(home, '.agents/skills/enlazada/SKILL.md');
  const spy = instrumentFs(ctx.fs, { fail: { realpath: { [entryLink]: 'EACCES', [manifestLink]: 'EACCES' } } });
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, skillRoots(home, null));
  assert.deepEqual(codesFor(result, 'caveman'), ['UNREADABLE']);
  assert.deepEqual(codesFor(result, 'enlazada'), ['UNREADABLE']);
  assert.equal(result.manifests.find((m) => m.dirName === 'enlazada').readProblem, 'unreadable');
  assert.equal(result.partial, true);
});

test('lstat inyectado con EACCES en la caché de plugins marca resultado parcial', async (t) => {
  const { home } = await entriesFixture(t);
  const manifest = join(home, '.claude/plugins/cache/mk/plug/1.0.0/SKILL.md');
  await makeTree(home, { '.claude/plugins/cache/mk/plug/1.0.0/SKILL.md': skillMd('plug') });
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs, { fail: { lstat: { [manifest]: 'EACCES' } } });
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, skillRoots(home, null));
  assert.ok(result.findings.some((f) => f.code === 'UNREADABLE' && f.subject === 'claude-plugins' && f.paths.includes(manifest)));
  assert.ok(!spy.reads.includes(manifest));
  assert.equal(result.partial, true);
});

async function countedRun(home, roots, limits) {
  const counter = countingOpendir();
  const ctx = { ...createContext({ env: { HOME: home } }), fs: createFsRead({ opendir: counter.opendir }) };
  const result = await discoverSkills(ctx, roots, { ...LIMITS, ...limits });
  return { result, stats: counter.stats };
}

const manySkills = (prefix, count) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}/s${String(i).padStart(3, '0')}/SKILL.md`, skillMd(`s${i}`)]));
const agentsOnly = (home) => skillRoots(home, null).filter((r) => r.id === 'agents');
const limitCount = (result) => result.findings.filter((f) => f.code === 'LIMIT_REACHED').length;

test('directorio mayor que el presupuesto: LIMIT_REACHED sin subconjunto ni enumeración completa', async (t) => {
  const home = await tempDir(t);
  await makeTree(home, manySkills('.agents/skills', 40));
  const root = join(home, '.agents/skills');
  const { result, stats } = await countedRun(home, agentsOnly(home), { maxEntries: 10 });
  assert.deepEqual(result.manifests, [], 'no se inventaría un subconjunto dependiente del orden del sistema de archivos');
  assert.equal(result.partial, true);
  assert.equal(limitCount(result), 1);
  assert.deepEqual(result.findings.find((f) => f.code === 'LIMIT_REACHED').paths, [root]);
  assert.deepEqual(stats.opened, [root], 'no se abre ningún directorio de skill');
  assert.equal(stats.materialized.get(root), 11, 'materializa presupuesto + 1');
  assert.equal(stats.closed, stats.opened.length);
});

test('presupuesto de descubrimiento: frontera exacta en una raíz de entradas', async (t) => {
  const home = await tempDir(t);
  await makeTree(home, manySkills('.agents/skills', 10));
  const exact = await countedRun(home, agentsOnly(home), { maxEntries: 10 });
  assert.equal(exact.result.manifests.length, 10);
  assert.equal(exact.result.partial, false);
  assert.equal(limitCount(exact.result), 0);
  const over = await countedRun(home, agentsOnly(home), { maxEntries: 9 });
  assert.deepEqual(over.result.manifests, []);
  assert.equal(over.result.partial, true);
  assert.equal(limitCount(over.result), 1);
});

test('presupuesto agotado: las raíces posteriores no se enumeran', async (t) => {
  const home = await tempDir(t);
  await makeTree(home, {
    ...manySkills('.claude/skills', 30),
    ...manySkills('.agents/skills', 5),
    '.claude/plugins/cache/mk/plug/1.0.0/skills/uno/SKILL.md': skillMd('uno'),
  });
  const { result, stats } = await countedRun(home, skillRoots(home, null), { maxEntries: 10 });
  assert.deepEqual(stats.opened, [join(home, '.claude/skills')], 'sólo se abre la primera raíz');
  assert.equal(stats.total(), 11);
  assert.deepEqual(result.manifests, []);
  assert.equal(limitCount(result), 1);
  assert.equal(result.partial, true);
});

test('presupuesto consumido exactamente: la raíz siguiente materializa a lo sumo una entrada', async (t) => {
  const home = await tempDir(t);
  await makeTree(home, { ...manySkills('.claude/skills', 10), ...manySkills('.agents/skills', 5) });
  const roots = skillRoots(home, null).filter((r) => r.id === 'claude-user' || r.id === 'agents');
  const { result, stats } = await countedRun(home, roots, { maxEntries: 10 });
  assert.equal(stats.materialized.get(join(home, '.agents/skills')), 1);
  assert.deepEqual(result.manifests.map((m) => m.rootId), Array(10).fill('claude-user'));
  assert.equal(limitCount(result), 1);
  assert.equal(result.partial, true);
});

test('tope de hermanos: no enumera el directorio completo ni cuenta un subconjunto arbitrario', async (t) => {
  const home = await tempDir(t);
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`.agents/skills/grande/f${i}.sh`, 'x']));
  await makeTree(home, { '.agents/skills/grande/SKILL.md': skillMd('grande'), ...many });
  const skillDir = join(home, '.agents/skills/grande');
  const { result, stats } = await countedRun(home, agentsOnly(home), { siblingEntries: 10 });
  const manifest = result.manifests.find((m) => m.dirName === 'grande');
  assert.ok(stats.materialized.get(skillDir) <= 12, 'tope + 1 + SKILL.md');
  assert.equal(manifest.siblingFiles, 0, 'cota inferior determinista');
  assert.equal(manifest.scriptLike, false);
  assert.ok(result.findings.some((f) => f.code === 'SIBLINGS_TRUNCATED' && f.subject === 'grande'));
  assert.equal(result.partial, false);
  assert.equal(stats.closed, stats.opened.length);
});

test('tope de hermanos: frontera exacta sin truncar', async (t) => {
  const home = await tempDir(t);
  const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`.agents/skills/justa/f${i}.txt`, 'x']));
  await makeTree(home, { '.agents/skills/justa/SKILL.md': skillMd('justa'), ...many });
  const { result } = await countedRun(home, agentsOnly(home), { siblingEntries: 10 });
  assert.equal(result.manifests.find((m) => m.dirName === 'justa').siblingFiles, 10);
  assert.ok(!result.findings.some((f) => f.code === 'SIBLINGS_TRUNCATED'));
});
