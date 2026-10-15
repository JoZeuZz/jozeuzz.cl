import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { discoverSkills, LIMITS } from '../src/discover.js';
import { skillRoots } from '../src/paths.js';
import { instrumentFs, makeTree, skillMd, tempDir } from '../test-support/fixture.js';

async function cacheFixture(t) {
  const home = await tempDir(t);
  await makeTree(home, {
    '.claude/plugins/cache/mk/plug/1.0.0/skills/uno/SKILL.md': skillMd('uno', 'v1'),
    '.claude/plugins/cache/mk/plug/0.9.0/skills/uno/SKILL.md': skillMd('uno', 'v0'),
    '.claude/plugins/cache/mk/plug/1.0.0/skills/enlace': { link: '../../0.9.0/skills/uno' },
    '.claude/plugins/cache/mk/plug/1.0.0/node_modules/dep/SKILL.md': skillMd('dep'),
    '.claude/plugins/marketplaces/mk/skills/dos/SKILL.md': skillMd('dos'),
  });
  return home;
}

test('detecta plugin, marketplace y versión de caché', async (t) => {
  const home = await cacheFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null));
  const uno = result.manifests.filter((m) => m.dirName === 'uno').map((m) => m.plugin.cacheVersion).sort();
  assert.deepEqual(uno, ['0.9.0', '1.0.0']);
  const plugin = result.manifests.find((m) => m.plugin?.cacheVersion === '1.0.0').plugin;
  assert.deepEqual(plugin, {
    marketplace: 'mk', name: 'plug', cacheVersion: '1.0.0',
    versionDir: join(home, '.claude/plugins/cache/mk/plug/1.0.0'),
  });
});

test('no sigue symlinks en la caché, excluye node_modules y marketplaces', async (t) => {
  const home = await cacheFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null));
  assert.ok(result.findings.some((f) => f.code === 'SYMLINK_NOT_FOLLOWED' && f.paths[0].endsWith('/skills/enlace')));
  assert.ok(!result.manifests.some((m) => m.dirName === 'dep' || m.dirName === 'dos' || m.dirName === 'enlace'));
  assert.equal(result.partial, false);
});

test('límite de profundidad produce LIMIT_REACHED y resultado parcial', async (t) => {
  const home = await cacheFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null), { ...LIMITS, pluginDepth: 3 });
  assert.equal(result.partial, true);
  assert.equal(result.findings.filter((f) => f.code === 'LIMIT_REACHED').length, 1);
});

test('límite de entradas produce un único LIMIT_REACHED', async (t) => {
  const home = await cacheFixture(t);
  const result = await discoverSkills(createContext({ env: { HOME: home } }), skillRoots(home, null), { ...LIMITS, maxEntries: 3 });
  assert.equal(result.partial, true);
  assert.equal(result.findings.filter((f) => f.code === 'LIMIT_REACHED').length, 1);
});

const CACHE = '.claude/plugins/cache';
const cacheOnly = (home) => skillRoots(home, null).filter((r) => r.id === 'claude-plugins');

test('SKILL.md symlink en la caché no se sigue aunque apunte a otra raíz autorizada', async (t) => {
  const home = await tempDir(t);
  const target = join(home, '.agents/skills/real/SKILL.md');
  await makeTree(home, {
    '.agents/skills/real/SKILL.md': skillMd('real'),
    [`${CACHE}/mk/plug/1.0.0/skills/enl/SKILL.md`]: { link: target },
  });
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs);
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, skillRoots(home, null).filter((r) => r.id === 'claude-plugins' || r.id === 'agents'));
  const link = join(home, CACHE, 'mk/plug/1.0.0/skills/enl/SKILL.md');
  assert.deepEqual(spy.reads.filter((p) => p === target), [target], 'el destino sólo se lee desde su propia raíz');
  assert.ok(result.findings.some((f) => f.code === 'SYMLINK_NOT_FOLLOWED' && f.paths.includes(link)));
  assert.ok(!result.manifests.some((m) => m.entryPath === link));
  assert.equal(result.partial, false);
});

test('presupuesto de descubrimiento: el SKILL.md de la caché consume una entrada', async (t) => {
  const home = await tempDir(t);
  await makeTree(home, { [`${CACHE}/mk/plug/1.0.0/skills/uno/SKILL.md`]: skillMd('uno') });
  // Entradas: mk, plug, 1.0.0, skills, uno, SKILL.md = 6.
  const run = async (maxEntries) => {
    const ctx = createContext({ env: { HOME: home } });
    const spy = instrumentFs(ctx.fs);
    const result = await discoverSkills({ ...ctx, fs: spy.fs }, cacheOnly(home), { ...LIMITS, maxEntries });
    return { result, spy };
  };
  const exact = await run(6);
  assert.equal(exact.result.manifests.length, 1);
  assert.equal(exact.result.partial, false);
  assert.ok(!exact.result.findings.some((f) => f.code === 'LIMIT_REACHED'));
  const over = await run(5);
  assert.deepEqual(over.spy.reads, [], 'no se lee un manifiesto fuera del presupuesto');
  assert.deepEqual(over.result.manifests, []);
  assert.equal(over.result.partial, true);
  assert.equal(over.result.findings.filter((f) => f.code === 'LIMIT_REACHED').length, 1);
});

test('sólo se inventarían manifiestos dentro de <marketplace>/<plugin>/<versión>', async (t) => {
  const home = await tempDir(t);
  await makeTree(home, {
    [`${CACHE}/SKILL.md`]: skillMd('raiz'),
    [`${CACHE}/mk/SKILL.md`]: skillMd('mercado'),
    [`${CACHE}/mk/plug/SKILL.md`]: skillMd('plugin'),
    [`${CACHE}/mk/plug/1.0.0/SKILL.md`]: skillMd('version'),
    [`${CACHE}/mk/plug/1.0.0/skills/uno/SKILL.md`]: skillMd('uno'),
  });
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs);
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, cacheOnly(home));
  const versionDir = join(home, CACHE, 'mk/plug/1.0.0');
  assert.deepEqual(result.manifests.map((m) => m.realPath).sort(), [join(versionDir, 'SKILL.md'), join(versionDir, 'skills/uno/SKILL.md')]);
  assert.ok(result.manifests.every((m) => m.plugin?.versionDir === versionDir));
  assert.ok(spy.reads.every((p) => p.startsWith(`${versionDir}/`)), 'no se leen manifiestos fuera del árbol de versión');
  assert.equal(result.partial, false);
});

test('profundidad 12 se recorre; 13 produce LIMIT_REACHED sin leerse', async (t) => {
  const home = await tempDir(t);
  const d12 = 'mk/plug/1.0.0/a/b/c/d/e/f/g/h/i';
  await makeTree(home, {
    [`${CACHE}/${d12}/SKILL.md`]: skillMd('i'),
    [`${CACHE}/${d12}/j/SKILL.md`]: skillMd('j'),
  });
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs);
  const result = await discoverSkills({ ...ctx, fs: spy.fs }, cacheOnly(home));
  assert.deepEqual(result.manifests.map((m) => m.dirName), ['i']);
  assert.ok(!spy.reads.some((p) => p.includes('/i/j/')));
  const limit = result.findings.filter((f) => f.code === 'LIMIT_REACHED');
  assert.equal(limit.length, 1);
  assert.deepEqual(limit[0].paths, [join(home, CACHE, d12, 'j')]);
  assert.equal(result.partial, true);
});
