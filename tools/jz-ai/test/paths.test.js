import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFsRead } from '../src/fs-read.js';
import { ENV_PRESENCE, findRepoRoot, isInside, isSensitiveName, knownConfigPaths, provenanceFiles, skillRoots } from '../src/paths.js';
import { makeTree, tempDir } from '../test-support/fixture.js';

test('skillRoots respeta el orden y omite lo que falta', () => {
  assert.deepEqual(skillRoots('/h', '/r').map((r) => `${r.id}:${r.path}:${r.layout}`), [
    'claude-user:/h/.claude/skills:entries',
    'claude-plugins:/h/.claude/plugins/cache:plugin-cache',
    'agents:/h/.agents/skills:entries',
    'opencode-user:/h/.config/opencode/skills:entries',
    'project-claude:/r/.claude/skills:entries',
    'project-opencode:/r/.opencode/skills:entries',
  ]);
  assert.deepEqual(skillRoots(null, '/r').map((r) => r.id), ['project-claude', 'project-opencode']);
  assert.deepEqual(skillRoots('/h', null).length, 4);
});

test('isSensitiveName por naturaleza del archivo', () => {
  for (const name of ['auth.json', '.credentials.json', 'server.pem', 'x.key', 'id_rsa', 'id_ed25519.pub', '.env', '.env.local', '.netrc', 'cookies.sqlite', 'gh_token', 'client-secret.txt', 'credentials']) {
    assert.equal(isSensitiveName(name), true, name);
  }
  for (const name of ['SKILL.md', 'README.md', 'settings.json', 'environment.md']) assert.equal(isSensitiveName(name), false, name);
});

test('knownConfigPaths clasifica por naturaleza', () => {
  const byId = Object.fromEntries(knownConfigPaths('/h', '/r').map((p) => [p.id, p]));
  assert.equal(byId['claude-credentials'].path, '/h/.claude/.credentials.json');
  assert.equal(byId['claude-settings'].sensitive, 'yes');
  assert.equal(byId['opencode-config-jsonc'].sensitive, 'yes');
  assert.equal(byId['opencode-agents-md'].sensitive, 'no');
  assert.equal(byId['project-claude-settings-local'].path, '/r/.claude/settings.local.json');
  assert.equal(knownConfigPaths(null, null).length, 0);
});

test('provenanceFiles', () => {
  assert.deepEqual(provenanceFiles('/h'), {
    skillLock: '/h/.agents/.skill-lock.json',
    installedPlugins: '/h/.claude/plugins/installed_plugins.json',
  });
  assert.deepEqual(provenanceFiles(null), { skillLock: null, installedPlugins: null });
});

test('ENV_PRESENCE está ordenada y no contiene duplicados', () => {
  assert.deepEqual([...ENV_PRESENCE].sort(), ENV_PRESENCE);
  assert.equal(new Set(ENV_PRESENCE).size, ENV_PRESENCE.length);
});

test('isInside', () => {
  assert.equal(isInside('/a/b', '/a'), true);
  assert.equal(isInside('/a', '/a'), true);
  assert.equal(isInside('/ab', '/a'), false);
  assert.equal(isInside('/x', '/'), true);
});

test('findRepoRoot encuentra .git como directorio o archivo', async (t) => {
  const dir = await tempDir(t);
  await makeTree(dir, { 'repo/.git': { dir: true }, 'repo/a/b': { dir: true }, 'wt/.git': 'gitdir: /x', 'nada/c': { dir: true } });
  const fs = createFsRead();
  assert.equal(await findRepoRoot(fs, join(dir, 'repo/a/b')), join(dir, 'repo'));
  assert.equal(await findRepoRoot(fs, join(dir, 'wt')), join(dir, 'wt'));
  assert.equal(await findRepoRoot(fs, join(dir, 'nada/c')), null);
});
