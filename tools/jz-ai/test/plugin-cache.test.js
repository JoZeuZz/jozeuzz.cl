import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { discoverSkills, LIMITS } from '../src/discover.js';
import { skillRoots } from '../src/paths.js';
import { makeTree, skillMd, tempDir } from '../test-support/fixture.js';

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
