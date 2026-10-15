import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { MAX_PROVENANCE_BYTES, loadProvenance, lockEntryFor, pluginRecord } from '../src/provenance.js';
import { provenanceFiles } from '../src/paths.js';
import { makeTree, tempDir } from '../test-support/fixture.js';

const lock = {
  version: 3,
  skills: {
    caveman: {
      source: 'JuliusBrussee/caveman', sourceType: 'github', sourceUrl: 'https://user:tok@github.com/JuliusBrussee/caveman.git',
      skillPath: 'skills/caveman/SKILL.md', skillFolderHash: 'abc', installedAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z',
      secretField: 'JZAI-CANARY-prov', extra: { nested: true },
    },
    otra: {
      sourceUrl: 'https://github.com/x/y.git?access_token=JZAI-CANARY-query',
    },
  },
};

async function load(t, files) {
  const home = await tempDir(t);
  await makeTree(home, files);
  const ctx = createContext({ env: { HOME: home } });
  return { home, result: await loadProvenance(ctx, provenanceFiles(home)) };
}

test('lock válido: lista blanca y URL redactada', async (t) => {
  const { home, result } = await load(t, { '.agents/.skill-lock.json': JSON.stringify(lock) });
  assert.deepEqual(result.findings, []);
  const entry = lockEntryFor({ realPath: join(home, '.agents/skills/caveman/SKILL.md') }, join(home, '.agents/skills'), result.skillLock);
  assert.deepEqual(entry, {
    kind: 'skill-lock', source: 'JuliusBrussee/caveman', sourceType: 'github',
    sourceUrl: 'https://[redacted]@github.com/JuliusBrussee/caveman.git', skillPath: 'skills/caveman/SKILL.md',
    skillFolderHash: 'abc', installedAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z',
  });
  assert.ok(!JSON.stringify([...result.skillLock]).includes('JZAI-CANARY-prov'));
  assert.equal(result.skillLock.get('otra').sourceUrl, 'https://github.com/x/y.git?[redacted]');
  assert.equal(lockEntryFor({ realPath: '/otro/caveman/SKILL.md' }, join(home, '.agents/skills'), result.skillLock), null);
});

test('archivos ausentes: null sin hallazgos', async (t) => {
  const { result } = await load(t, { 'vacio/': { dir: true } });
  assert.deepEqual(result, { skillLock: null, plugins: null, findings: [] });
});

test('JSON inválido, demasiado grande o symlink producen PROVENANCE_INVALID', async (t) => {
  const { result } = await load(t, {
    '.agents/.skill-lock.json': '{no json',
    'real.json': '{}',
    '.claude/plugins/installed_plugins.json': { link: '../../real.json' },
  });
  assert.deepEqual(result.findings.map((f) => `${f.code}:${f.subject}`).sort(), [
    'PROVENANCE_INVALID:installed-plugins', 'PROVENANCE_INVALID:skill-lock',
  ]);
  const big = await load(t, { '.agents/.skill-lock.json': ' '.repeat(MAX_PROVENANCE_BYTES + 1) });
  assert.match(big.result.findings[0].message, /Supera/);
});

test('estructura hostil no contamina prototipos ni aborta', async (t) => {
  const hostile = '{"skills":{"__proto__":{"polluted":true},"a":[1,2],"b":"x","c":{"source":42}},"plugins":[]}';
  const { result } = await load(t, {
    '.agents/.skill-lock.json': hostile,
    '.claude/plugins/installed_plugins.json': '{"plugins":{"p@m":"no-array","q@m":[null,{"installPath":7}]}}',
  });
  assert.equal({}.polluted, undefined);
  assert.equal(result.skillLock.has('a'), false);
  assert.deepEqual(result.skillLock.get('c'), { source: null, sourceType: null, sourceUrl: null, skillPath: null, skillFolderHash: null, installedAt: null, updatedAt: null });
  assert.equal(result.plugins.has('p@m'), false);
  assert.deepEqual(result.plugins.get('q@m'), [{ scope: null, installPath: null, version: null, gitCommitSha: null, installedAt: null, lastUpdated: null, installRealPath: null }]);
  const wrongShape = await load(t, { '.agents/.skill-lock.json': '[1,2]' });
  assert.equal(wrongShape.result.findings[0].code, 'PROVENANCE_INVALID');
  assert.equal(wrongShape.result.skillLock, null);
});

test('installPath se compara por ruta canónica', async (t) => {
  const cache = '.claude/plugins/cache/mk/plug';
  const entry = (installPath) => ({ scope: 'user', installPath, version: 'v', gitCommitSha: 's', installedAt: 'i', lastUpdated: 'l' });
  const home = await tempDir(t);
  await makeTree(home, {
    [`${cache}/1.0.0/skills/uno/SKILL.md`]: 'x',
    [`${cache}/0.9.0/skills/uno/SKILL.md`]: 'x',
    'alias': { link: `${cache}/1.0.0` },
  });
  await makeTree(home, {
    '.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: {
      'plug@mk': [entry(join(home, 'alias')), entry(`${join(home, cache, '0.9.0')}/`)],
      'rel@mk': [entry(`${cache}/1.0.0`)],
      'gone@mk': [entry(join(home, 'no-existe'))],
    } }),
  });
  const { plugins } = await loadProvenance(createContext({ env: { HOME: home } }), provenanceFiles(home));
  const versionDir = (v) => join(home, cache, v);
  const record = (name, v) => pluginRecord({ marketplace: 'mk', name, cacheVersion: v, versionDir: versionDir(v) }, plugins);
  assert.equal(record('plug', '1.0.0').installed, 'yes', 'symlink hacia la versión');
  assert.equal(record('plug', '0.9.0').installed, 'yes', 'barra final');
  assert.equal(record('rel', '1.0.0').installed, 'no', 'ruta relativa');
  assert.equal(record('gone', '1.0.0').installed, 'no', 'ruta inexistente');
  assert.equal(plugins.get('rel@mk')[0].installRealPath, null);
});

test('pluginRecord separa instalado, habilitado y cargado', () => {
  const plugin = { marketplace: 'mk', name: 'plug', cacheVersion: '1.0.0', versionDir: '/c/mk/plug/1.0.0' };
  const registry = new Map([['plug@mk', [{ scope: 'user', installPath: '/x', installRealPath: '/c/mk/plug/1.0.0', version: '1.0.0', gitCommitSha: 'f00', installedAt: 'i', lastUpdated: 'l' }]]]);
  assert.deepEqual(pluginRecord(plugin, registry), {
    id: 'plug@mk', marketplace: 'mk', name: 'plug', cacheVersion: '1.0.0',
    installed: 'yes', enabled: 'unknown', loaded: 'unverified',
    registry: { version: '1.0.0', gitCommitSha: 'f00', installedAt: 'i', lastUpdated: 'l' },
  });
  assert.equal(pluginRecord({ ...plugin, cacheVersion: '0.9.0', versionDir: '/c/mk/plug/0.9.0' }, registry).installed, 'no');
  assert.equal(pluginRecord({ ...plugin, name: 'otro' }, registry).installed, 'no');
  assert.equal(pluginRecord(plugin, null).installed, 'unknown');
  assert.equal(pluginRecord(null, registry), null);
});
