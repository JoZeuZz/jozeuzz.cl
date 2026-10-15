import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from '../src/context.js';
import { isInside } from '../src/paths.js';
import { auditFixture, gitFixture, instrumentFs, makeTree, runBin, runInProcess, skillMd, snapshotTree, tempDir } from '../test-support/fixture.js';

const CANARY = 'JZAI-CANARY-7f3a91';
const GUARD = fileURLToPath(new URL('../test-support/no-network.mjs', import.meta.url));
const UNSAFE = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/; // tabulador y \n son estructura

async function hostileWorld(t) {
  const base = await tempDir(t);
  const home = join(base, 'home');
  const repo = join(base, 'repo');
  const marker = join(base, 'MARKER');
  const writeMarker = (tag) => ({ file: `#!/bin/sh\necho ${tag} >> "${marker}"\n`, mode: 0o755 });
  await auditFixture(home);
  await makeTree(base, {
    'home/.claude/.credentials.json': `{"token":"${CANARY}"}`,
    'home/.claude.json': `{"oauth":"${CANARY}"}`,
    'home/.claude/settings.json': `{"env":{"KEY":"${CANARY}"}}`,
    'home/.config/opencode/opencode.json': `{"provider":{"key":"${CANARY}"}}`,
    'home/.config/opencode/opencode.jsonc': `// ${CANARY}`,
    'home/.local/share/opencode/auth.json': `{"t":"${CANARY}"}`,
    'home/.agents/skills/trampa/SKILL.md': { link: '../../../.claude/.credentials.json' },
    'home/.agents/skills/cuerpo/SKILL.md': `---\nname: cuerpo\ntoken: ${CANARY}\n---\n${CANARY}\n`,
    'home/.agents/skills/ruido\x1b]0;x\x07/SKILL.md': skillMd('ruido\x1b[2J'),
    'home/.agents/.skill-lock.json': JSON.stringify({ skills: { caveman: { source: 's', sourceUrl: `https://u:${CANARY}@h/x?t=${CANARY}`, extra: CANARY } } }),
    'home/.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: { 'otro@mk': [{ installPath: `/x/${CANARY}`, version: '1' }] } }),
    'home/.agents/skills/peligro/SKILL.md': skillMd('peligro'),
    'home/.agents/skills/peligro/scripts/postinstall.js': `require('fs').appendFileSync(${JSON.stringify(marker)}, 'skill')`,
    'home/.agents/skills/peligro/hooks/hook.sh': writeMarker('hook'),
    'home/.agents/skills/peligro/caveman-config.cjs': `require('fs').appendFileSync(${JSON.stringify(marker)}, 'cfg')`,
    'home/.local/share/claude/versions/2.1.300': writeMarker('claude'),
    'bin/claude': { link: '../home/.local/share/claude/versions/2.1.300' },
    'bin/opencode': writeMarker('opencode'),
    'bin/git': writeMarker('git-de-path'),
    'traps/fsmonitor': writeMarker('fsmonitor'),
    'repo/': { dir: true },
  });
  const git = gitFixture(repo);
  await makeTree(repo, { '.env': `TOKEN=${CANARY}`, '.git/hooks/post-index-change': writeMarker('post-index-change') });
  git('config', 'core.fsmonitor', join(base, 'traps/fsmonitor'));
  // Filtro clean con metadata desactualizada: un `git status` lo ejecutaría (spec §10.1).
  await makeTree(repo, { '.gitattributes': '*.txt filter=trap\n' });
  git('config', 'filter.trap.clean', `sh -c 'echo filter >> "${marker}"; cat'`);
  execFileSync('touch', ['-d', '2001-01-01', join(repo, 'a.txt')]);
  const env = { HOME: home, PATH: join(base, 'bin'), ANTHROPIC_API_KEY: CANARY, JZAI_NET_LOG: join(base, 'net.log') };
  return { base, home, repo, marker, env };
}

test('sin secretos en la salida, sin escrituras, sin ejecución y sin red', async (t) => {
  const world = await hostileWorld(t);
  const before = { home: await snapshotTree(world.home), repo: await snapshotTree(world.repo) };
  for (const args of [['doctor'], ['doctor', '--json'], ['skills'], ['skills', '--json']]) {
    const result = runBin(args, { cwd: world.repo, env: world.env, importModule: GUARD });
    assert.notEqual(result.code, 3, `${args.join(' ')}: ${result.stderr}`);
    assert.ok(!result.stdout.includes(CANARY) && !result.stderr.includes(CANARY), `canario en ${args.join(' ')}`);
    assert.doesNotMatch(result.stdout + result.stderr, UNSAFE, `control en ${args.join(' ')}`);
  }
  assert.equal(existsSync(world.marker), false, existsSync(world.marker) ? readFileSync(world.marker, 'utf8') : '');
  assert.equal(existsSync(world.env.JZAI_NET_LOG), false);
  assert.deepEqual(await snapshotTree(world.home), before.home);
  assert.deepEqual(await snapshotTree(world.repo), before.repo);
});

test('control positivo: las trampas de Git funcionan fuera de jz-ai', async (t) => {
  const world = await hostileWorld(t);
  execFileSync('git', ['status'], { cwd: world.repo, env: { PATH: process.env.PATH, HOME: world.repo } });
  const marker = readFileSync(world.marker, 'utf8');
  assert.match(marker, /fsmonitor/);
  assert.match(marker, /filter/, 'git status ejecuta el filtro clean: por eso M0 no lo usa');
});

test('control positivo: el guard de red registra cada vía de salida', async (t) => {
  const dir = await tempDir(t);
  const attempts = {
    'net.connect': "require('node:net').connect(65000, '127.0.0.1')",
    'net.Socket.connect': "new (require('node:net').Socket)().connect(65000, '127.0.0.1')",
    'http.get': "require('node:http').get('http://127.0.0.1:65000/')",
    'https.get': "require('node:https').get('https://127.0.0.1:65000/')",
    fetch: "fetch('http://127.0.0.1:65000/')",
    'dns.lookup': "require('node:dns').lookup('example.invalid', () => {})",
  };
  for (const [name, code] of Object.entries(attempts)) {
    const log = join(dir, `${name}.log`);
    spawnSync(process.execPath, ['--import', GUARD, '-e', `try { ${code} } catch {}`], { env: { JZAI_NET_LOG: log }, timeout: 10000 });
    assert.ok(existsSync(log) && readFileSync(log, 'utf8').length > 0, `${name} no quedó registrado`);
  }
});

test('sólo se lee contenido de SKILL.md autorizados y de los dos archivos de procedencia', async (t) => {
  const world = await hostileWorld(t);
  const ctx = createContext({ env: world.env, cwd: world.repo });
  const spy = instrumentFs(ctx.fs);
  const instrumented = { ...ctx, fs: spy.fs };
  await runInProcess(['skills', '--json'], instrumented);
  await runInProcess(['doctor', '--json'], instrumented);
  const allowedFiles = [join(world.home, '.agents/.skill-lock.json'), join(world.home, '.claude/plugins/installed_plugins.json')];
  const roots = ['.claude/skills', '.claude/plugins/cache', '.agents/skills', '.config/opencode/skills'].map((r) => join(world.home, r));
  for (const path of spy.reads) {
    const ok = allowedFiles.includes(path) || (path.endsWith('/SKILL.md') && roots.some((root) => isInside(path, root)));
    assert.ok(ok, `lectura no permitida: ${path}`);
  }
  assert.ok(spy.reads.length > 0);
});
