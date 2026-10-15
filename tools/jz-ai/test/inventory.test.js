import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInventory } from '../src/inventory.js';

const NO_PROVENANCE = { skillLock: null, plugins: null };
const md = (text) => Buffer.from(text, 'utf8');
let counter = 0;
function manifest(overrides) {
  counter += 1;
  return {
    rootId: 'agents', host: 'agents', entryPath: `/e${counter}/SKILL.md`, realPath: `/r${counter}/SKILL.md`, linkTarget: null,
    dirName: 'x', plugin: null, head: md('---\nname: x\n---\n'), sha256: 'a'.repeat(64), size: 10,
    readProblem: null, siblingFiles: 0, scriptLike: false, ...overrides,
  };
}
const build = (manifests) => buildInventory({ manifests, provenance: NO_PROVENANCE, agentsRoot: null });
const codes = (inv) => inv.findings.map((f) => f.code).sort();

test('registro con orden de claves de la spec', () => {
  const inv = build([manifest({})]);
  assert.deepEqual(Object.keys(inv.skills[0]), [
    'name', 'nameSource', 'description', 'rootId', 'host', 'entryPath', 'realPath', 'linkTarget', 'sha256', 'size',
    'siblingFiles', 'scriptLike', 'manifest', 'plugin', 'provenance', 'availability',
  ]);
  assert.equal(inv.skills[0].availability, 'unverified');
  assert.equal(inv.groups[0].status, 'single');
});

test('aliased: dos entradas, misma ruta canónica', () => {
  const inv = build([manifest({ realPath: '/same/SKILL.md' }), manifest({ realPath: '/same/SKILL.md' })]);
  assert.equal(inv.groups[0].status, 'aliased');
  assert.deepEqual(codes(inv), ['SAME_REALPATH']);
});

test('identical: rutas distintas, mismo hash', () => {
  const inv = build([manifest({}), manifest({})]);
  assert.equal(inv.groups[0].status, 'identical');
  assert.deepEqual(codes(inv), ['NAME_COLLISION_IDENTICAL']);
});

test('divergent: hashes distintos', () => {
  const inv = build([manifest({}), manifest({ sha256: 'b'.repeat(64) })]);
  assert.equal(inv.groups[0].status, 'divergent');
  assert.equal(inv.groups[0].variants.length, 2);
  assert.deepEqual(codes(inv), ['NAME_COLLISION_DIVERGENT']);
});

test('undetermined e incompleto cuando falta un hash', () => {
  const inv = build([manifest({}), manifest({ sha256: null, head: null, readProblem: 'unreadable' })]);
  assert.equal(inv.groups[0].status, 'undetermined');
  assert.equal(inv.groups[0].incomplete, true);
  assert.equal(inv.groups[0].variants.at(-1).sha256, null);
});

test('nombre desde el directorio y MANIFEST_INVALID', () => {
  const inv = build([manifest({ dirName: 'sin-fm', head: md('# sin frontmatter') })]);
  assert.equal(inv.skills[0].name, 'sin-fm');
  assert.equal(inv.skills[0].nameSource, 'directory');
  assert.deepEqual(inv.skills[0].manifest, { valid: false, problems: ['missing-opening-delimiter'] });
  assert.deepEqual(codes(inv), ['MANIFEST_INVALID']);
});

test('MANIFEST_NAME_MISMATCH', () => {
  const inv = build([manifest({ dirName: 'carpeta', head: md('---\nname: otro\n---\n') })]);
  assert.deepEqual(codes(inv), ['MANIFEST_NAME_MISMATCH']);
});

test('SKILL.md vacío o con bytes no UTF-8 no lanza', () => {
  const inv = build([
    manifest({ dirName: 'vacio', head: md(''), size: 0 }),
    manifest({ dirName: 'binario', head: Buffer.from([0xff, 0xfe, 0x00, 0x41]) }),
  ]);
  assert.deepEqual(inv.skills.map((s) => s.name), ['binario', 'vacio']);
  assert.equal(inv.findings.filter((f) => f.code === 'MANIFEST_INVALID').length, 2);
});

test('frontmatter con bytes no UTF-8: MANIFEST_INVALID por invalid-utf8', () => {
  const head = Buffer.concat([md('---\nname: x'), Buffer.from([0xc3]), md('\n---\n')]);
  const inv = build([manifest({ dirName: 'x', head })]);
  assert.deepEqual(inv.skills[0].manifest, { valid: false, problems: ['invalid-utf8'] });
  assert.deepEqual(codes(inv), ['MANIFEST_INVALID']);
});

test('el registro público no contiene la cabecera del manifiesto', () => {
  const inv = build([manifest({ head: md('---\nname: x\ntoken: JZAI-CANARY-fm\n---\nJZAI-CANARY-fm\n') })]);
  assert.ok(!JSON.stringify(inv).includes('JZAI-CANARY-fm'));
});

test('forma de la auditoría: 3 variantes de caveman y 2 de cavecrew', () => {
  const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64), X = 'd'.repeat(64), Y = 'e'.repeat(64);
  const cm = (o) => manifest({ dirName: 'caveman', head: md('---\nname: caveman\n---\n'), ...o });
  const cc = (o) => manifest({ dirName: 'cavecrew', head: md('---\nname: cavecrew\n---\n'), ...o });
  const inv = build([
    cm({ rootId: 'claude-plugins', sha256: A }),
    cm({ rootId: 'agents', sha256: B, realPath: '/agents/caveman/SKILL.md' }),
    cm({ rootId: 'claude-user', sha256: B, realPath: '/agents/caveman/SKILL.md' }),
    cm({ rootId: 'opencode-user', sha256: C }),
    cc({ rootId: 'claude-plugins', sha256: X }),
    cc({ rootId: 'agents', sha256: Y }),
    cc({ rootId: 'opencode-user', sha256: X }),
  ]);
  const byName = Object.fromEntries(inv.groups.map((g) => [g.name, g]));
  assert.equal(byName.caveman.status, 'divergent');
  assert.equal(byName.caveman.variants.length, 3);
  assert.equal(byName.cavecrew.status, 'divergent');
  assert.equal(byName.cavecrew.variants.length, 2);
  assert.ok(inv.findings.some((f) => f.code === 'SAME_REALPATH' && f.subject === 'caveman'));
});

test('PLUGIN_CACHE_NOT_INSTALLED una vez por versión de caché', () => {
  const plugin = { marketplace: 'mk', name: 'plug', cacheVersion: '0.9.0', versionDir: '/c/0.9.0' };
  const plugins = new Map([['plug@mk', [{ installPath: '/c/1.0.0', installRealPath: '/c/1.0.0' }]]]);
  const inv = buildInventory({
    manifests: [manifest({ dirName: 'uno', head: md('---\nname: uno\n---\n'), plugin }), manifest({ dirName: 'dos', head: md('---\nname: dos\n---\n'), plugin })],
    provenance: { skillLock: null, plugins },
    agentsRoot: null,
  });
  assert.equal(inv.findings.filter((f) => f.code === 'PLUGIN_CACHE_NOT_INSTALLED').length, 1);
  assert.equal(inv.skills[0].plugin.installed, 'no');
});
