import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { discoverSkills } from '../src/discover.js';
import { MAX_PROVENANCE_BYTES, loadProvenance, lockEntryFor, pluginRecord } from '../src/provenance.js';
import { provenanceFiles, skillRoots } from '../src/paths.js';
import { instrumentFs, makeTree, skillMd, tempDir } from '../test-support/fixture.js';

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
  const unverifiable = { scope: null, installPath: null, version: null, gitCommitSha: null, installedAt: null, lastUpdated: null, installRealPath: null, installUnverifiable: true };
  assert.deepEqual(result.plugins.get('p@m'), [unverifiable]);
  assert.deepEqual(result.plugins.get('q@m'), [unverifiable, unverifiable]);
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

test('integración con HOME y raíz alias: rutas canónicas en discoverSkills y loadProvenance', async (t) => {
  const base = await tempDir(t);
  const real = join(base, 'real');
  const home = join(base, 'alias');
  const versionDir = join(real, '.claude/plugins/cache/mk/plug/1.0.0');
  await makeTree(base, {
    'real/.agents/skills/caveman/SKILL.md': skillMd('caveman'),
    'real/.claude/skills': { link: '../.agents/skills' },
    'real/.claude/plugins/cache/mk/plug/1.0.0/skills/uno/SKILL.md': skillMd('uno'),
    'real/.agents/.skill-lock.json': JSON.stringify({ skills: { caveman: { source: 'x/caveman' } } }),
    'real/.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: {
      'plug@mk': [{ installPath: join(home, '.claude/plugins/cache/mk/plug/1.0.0') }],
    } }),
    alias: { link: 'real' },
  });
  const ctx = createContext({ env: { HOME: home } });
  const roots = skillRoots(home, null);
  const discovered = await discoverSkills(ctx, roots);
  const provenance = await loadProvenance(ctx, provenanceFiles(home));
  assert.deepEqual(provenance.findings, []);
  const byRoot = Object.fromEntries(discovered.roots.map((r) => [r.id, r.realPath]));
  assert.equal(byRoot['claude-user'], join(real, '.agents/skills'), 'raíz alias de agents');
  assert.equal(byRoot.agents, join(real, '.agents/skills'));
  const cavemans = discovered.manifests.filter((m) => m.dirName === 'caveman');
  assert.deepEqual(cavemans.map((m) => m.entryPath).sort(), [join(home, '.agents/skills/caveman/SKILL.md'), join(home, '.claude/skills/caveman/SKILL.md')]);
  assert.ok(cavemans.every((m) => m.realPath === join(real, '.agents/skills/caveman/SKILL.md')));
  assert.ok(cavemans.every((m) => lockEntryFor(m, byRoot.agents, provenance.skillLock)?.source === 'x/caveman'));
  const uno = discovered.manifests.find((m) => m.dirName === 'uno');
  assert.equal(uno.entryPath, join(home, '.claude/plugins/cache/mk/plug/1.0.0/skills/uno/SKILL.md'));
  assert.equal(uno.plugin.versionDir, versionDir);
  assert.equal(pluginRecord(uno.plugin, provenance.plugins).installed, 'yes');
  assert.equal(discovered.partial, false);
});

test('installPath no verificable deja installed en unknown, no en no', async (t) => {
  const cache = '.claude/plugins/cache/mk';
  const home = await tempDir(t);
  const denied = join(home, 'JZAI-CANARY-denied/1.0.0');
  await makeTree(home, {
    [`${cache}/plug/1.0.0/skills/uno/SKILL.md`]: 'x',
    [`${cache}/otro/1.0.0/skills/uno/SKILL.md`]: 'x',
    'bucle': { link: 'bucle' },
    '.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: {
      'plug@mk': [{ installPath: denied }],
      'otro@mk': [{ installPath: denied }, { installPath: join(home, cache, 'otro/1.0.0') }],
      'ciclo@mk': [{ installPath: join(home, 'bucle') }],
    } }),
  });
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs, { fail: { realpath: { [denied]: 'EACCES' } } });
  const { plugins, findings } = await loadProvenance({ ...ctx, fs: spy.fs }, provenanceFiles(home));
  const record = (name) => pluginRecord({ marketplace: 'mk', name, cacheVersion: '1.0.0', versionDir: join(home, cache, name, '1.0.0') }, plugins);
  assert.equal(record('plug').installed, 'unknown', 'EACCES no prueba ausencia');
  assert.equal(record('otro').installed, 'yes', 'otra entrada verificada coincide');
  assert.equal(record('ciclo').installed, 'no', 'ELOOP es definitivo');
  assert.deepEqual(findings.map((f) => `${f.code}:${f.subject}`), ['PROVENANCE_INVALID:installed-plugins', 'PROVENANCE_INVALID:installed-plugins']);
  assert.ok(findings.every((f) => f.message.includes('(EACCES)')));
  assert.ok(!JSON.stringify(findings).includes('JZAI-CANARY-denied'), 'installPath no se publica');
});

test('registro de plugin con estructura inválida no se interpreta como ausencia', async (t) => {
  const cache = '.claude/plugins/cache/mk';
  const home = await tempDir(t);
  const versionDir = (name, v = '1.0.0') => join(home, cache, name, v);
  await makeTree(home, {
    [`${cache}/mezcla/0.9.0/SKILL.md`]: 'x',
    [`${cache}/gana/1.0.0/SKILL.md`]: 'x',
    [`${cache}/ok/0.9.0/SKILL.md`]: 'x',
    '.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: {
      'noarray@mk': { installPath: versionDir('noarray') },
      'vacio@mk': [],
      'noobj@mk': [null, 3, 'x', []],
      'sinpath@mk': [{ version: '1' }],
      'tipo@mk': [{ installPath: 7 }],
      'mezcla@mk': [null, { installPath: versionDir('mezcla', '0.9.0') }],
      'gana@mk': [{ installPath: 7 }, { installPath: versionDir('gana'), version: 'v-gana' }],
      'ok@mk': [{ installPath: versionDir('ok', '0.9.0') }],
    } }),
  });
  const { plugins, findings } = await loadProvenance(createContext({ env: { HOME: home } }), provenanceFiles(home));
  const record = (name) => pluginRecord({ marketplace: 'mk', name, cacheVersion: '1.0.0', versionDir: versionDir(name) }, plugins);
  for (const name of ['noarray', 'vacio', 'noobj', 'sinpath', 'tipo', 'mezcla']) {
    assert.equal(record(name).installed, 'unknown', `${name}: estructura inválida no prueba ausencia`);
  }
  assert.equal(record('gana').installed, 'yes', 'una coincidencia válida tiene prioridad');
  assert.equal(record('gana').registry.version, 'v-gana');
  assert.equal(record('ok').installed, 'no', 'registro válido sin coincidencia sí prueba ausencia');
  assert.equal(record('ausente').installed, 'no', 'plugin que no figura en un registro válido');
  const invalidIds = ['gana@mk', 'mezcla@mk', 'noarray@mk', 'noobj@mk', 'sinpath@mk', 'tipo@mk', 'vacio@mk'];
  assert.equal(findings.length, invalidIds.length, 'un PROVENANCE_INVALID por plugin con entradas no verificables');
  assert.ok(findings.every((f) => f.code === 'PROVENANCE_INVALID' && f.subject === 'installed-plugins'));
  assert.deepEqual(invalidIds.filter((id) => findings.some((f) => f.message.includes(id))), invalidIds);
});

test('un identificador de plugin no válido no llega a los mensajes', async (t) => {
  const home = await tempDir(t);
  const denied = join(home, 'denegado/1.0.0');
  const hostileId = '/root/.claude/.credentials.json JZAI-CANARY-id@mk';
  await makeTree(home, {
    '.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: {
      [hostileId]: [{ installPath: denied }],
      [`${'a'.repeat(300)}@mk`]: [{ installPath: denied }],
      'plug@mk': [{ installPath: denied }],
    } }),
  });
  const ctx = createContext({ env: { HOME: home } });
  const spy = instrumentFs(ctx.fs, { fail: { realpath: { [denied]: 'EACCES' } } });
  const { findings } = await loadProvenance({ ...ctx, fs: spy.fs }, provenanceFiles(home));
  assert.equal(findings.length, 3);
  const text = JSON.stringify(findings);
  assert.ok(!text.includes('JZAI-CANARY-id'), 'el identificador hostil no se publica');
  assert.ok(!text.includes('/root/'), 'ninguna ruta del identificador');
  assert.ok(!text.includes('a'.repeat(300)), 'identificador demasiado largo no se publica');
  assert.ok(findings.some((f) => f.message.includes('plug@mk')), 'un identificador válido sí se cita');
  assert.ok(findings.every((f) => f.message.includes('(EACCES)')));
});
