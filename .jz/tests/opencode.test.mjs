// Pruebas del plugin de OpenCode (.opencode/plugins/jz-guard.js) y de los perfiles de .opencode/agents sin
// arrancar el motor: directorio de trabajo de Bash, permisos operativos que el plugin aplica al cargarse y
// base de sólo lectura que rige cuando el plugin no carga (--pure, ausente, error de importación o de
// inicialización; comportamiento real de OpenCode 1.17.18 caracterizado con .jz/tests/opencode-native.mjs).
// Ejecutar: .jz/bin/jz-run node --test .jz/tests/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkBash, GIT_DENIED_LONG } from '../policy/policy.mjs';

const SRC = path.resolve(import.meta.dirname, '../..');
const AGENTS = path.join(SRC, '.opencode/agents');
const PERMISSIONS = path.join(SRC, '.opencode/jz-permissions.json');
const roots = [];
after(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function tmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(d);
  return d;
}

async function guard({ worktree } = {}) {
  const repo = tmp('jz-opencode-');
  for (const p of ['.jz/bin', '.jz/lib', '.jz/policy', '.opencode/plugins', '.opencode/jz-permissions.json']) {
    if (fs.existsSync(path.join(SRC, p))) fs.cpSync(path.join(SRC, p), path.join(repo, p), { recursive: true });
  }
  fs.mkdirSync(path.join(repo, 'src'));
  fs.mkdirSync(path.join(repo, '.git'));
  const outside = tmp('jz-fuera-');
  fs.symlinkSync(outside, path.join(repo, 'fuera'));
  const { JzGuard } = await import(pathToFileURL(path.join(repo, '.opencode/plugins/jz-guard.js')).href);
  const hooks = await JzGuard({ client: { session: { abort: async () => {} } }, directory: repo, worktree: worktree ?? repo });
  return { repo, outside, hooks };
}

// Frontmatter de un perfil: claves de primer nivel de `permission` con su valor escalar o sus reglas.
function nativePermission(file) {
  const fm = fs.readFileSync(file, 'utf8').split('\n---\n')[0].split('\n');
  const start = fm.indexOf('permission:');
  assert.ok(start >= 0, `${file}: sin bloque permission`);
  const perm = {};
  let cur = null;
  for (const line of fm.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (/^\s*(#|$)/.test(line)) continue;
    const m = /^( +)("?[^":]+"?): ?(.*)$/.exec(line);
    assert.ok(m, `${file}: línea no reconocida: ${line}`);
    const [, indent, rawKey, value] = m;
    const key = rawKey.replace(/^"|"$/g, '');
    if (indent.length === 2) {
      cur = key;
      perm[key] = value === '' ? {} : value;
    } else {
      perm[cur][key] = value;
    }
  }
  return perm;
}

// Reglas de OpenCode: el comodín «*» admite cualquier secuencia (incluidos «/» y saltos de línea), un « *»
// final hace opcionales los argumentos y gana la última regla que coincide.
function wildcard(str, pattern) {
  let re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  if (re.endsWith(' .*')) re = `${re.slice(0, -3)}( .*)?`;
  return new RegExp(`^${re}$`, 's').test(str);
}
function evaluate(rules, value) {
  const list = typeof rules === 'string' ? [['*', rules]] : Object.entries(rules);
  let action = 'deny';
  for (const [pattern, a] of list) if (wildcard(value, pattern)) action = a;
  return action;
}

test('Bash: un workdir fuera del worktree se deniega antes de analizar el comando', async () => {
  const { repo, outside, hooks } = await guard();
  await hooks['chat.params']({ sessionID: 'orq', agent: 'jz-orchestrator' });
  const bash = (workdir) => hooks['tool.execute.before']({ tool: 'bash', sessionID: 'orq', callID: 'b1' },
    { args: { command: 'git status', ...(workdir === undefined ? {} : { workdir }) } });
  for (const w of [outside, '..', path.join(repo, '..'), 'src/../..', 'fuera', path.join(repo, 'fuera'), '/tmp/opencode']) {
    await assert.rejects(bash(w), /directorio de trabajo fuera del worktree/, `workdir ${w}`);
  }
  for (const w of [undefined, 'src', path.join(repo, 'src'), repo]) await bash(w);
});

// Revisión de seguridad: fuera de un repositorio git OpenCode pasa worktree "/", y con wt "/" todo queda
// «dentro» y el plano de control deja de coincidir. El plugin no debe cargar: rige la base de sólo lectura.
test('el plugin no se inicializa si el worktree no es el repositorio del directorio', async () => {
  await assert.rejects(guard({ worktree: '/' }), /worktree/);
  await assert.rejects(guard({ worktree: os.tmpdir() }), /worktree/);
});

test('herramientas no reconocidas se deniegan a los roles jz-*', async () => {
  const { hooks } = await guard();
  await hooks['chat.params']({ sessionID: 'imp', agent: 'jz-implementer' });
  const call = (tool) => hooks['tool.execute.before']({ tool, sessionID: 'imp', callID: 't' }, { args: {} });
  for (const t of ['multiedit', 'patch', 'lsp', 'mcp_algo']) await assert.rejects(call(t), /no está permitido|no reconocida/, t);
  for (const t of ['skill', 'todowrite', 'todoread', 'invalid']) await call(t);
});

test('al cargarse, el plugin aplica los permisos operativos sin tocar otros agentes', async () => {
  const { hooks } = await guard();
  const cfg = { agent: {
    'jz-implementer': { permission: { '*': 'deny', read: { '*': 'allow' }, edit: 'deny', bash: 'deny', task: 'deny' } },
    'jz-implementer-copilot': { permission: { '*': 'deny', edit: 'deny', bash: 'deny', task: 'deny' } },
    build: { permission: { bash: 'allow' } },
  } };
  await hooks.config(cfg);
  const p = cfg.agent['jz-implementer'].permission;
  assert.deepEqual(Object.keys(p), ['*', 'read', 'edit', 'bash', 'task'], 'el orden de las reglas se conserva');
  assert.equal(p.bash['.jz/bin/jz-run *'], 'allow');
  assert.equal(p.edit['.jz/*'], 'deny');
  assert.equal(p.task, 'deny');
  assert.deepEqual(cfg.agent.build.permission, { bash: 'allow' });
  const copilot = cfg.agent['jz-implementer-copilot'].permission;
  assert.deepEqual(copilot.edit, p.edit, 'el alias copilot recibe las reglas del implementador');
  assert.deepEqual(copilot.bash, p.bash);
  // QA R1: las reglas edit aplicadas, evaluadas con la semántica de OpenCode.
  for (const ok of ['src/a.ts', '.jz-state/notes/x.md', 'docs/a.md', '.env.example']) assert.equal(evaluate(p.edit, ok), 'allow', ok);
  for (const no of ['.jz/bin/jz-run', '.git/config', '.git', 'AGENTS.md', 'CLAUDE.md', 'src/.env', '.env.local',
    '.claude/settings.json', '.opencode/x', '.jz-state/runs.jsonl', 'opencode.json', '.mcp.json', '../x', '/etc/x']) {
    assert.equal(evaluate(p.edit, no), 'deny', no);
  }
});

test('sin el plugin, los perfiles jz-* de OpenCode son de sólo lectura', () => {
  const files = fs.readdirSync(AGENTS).filter((f) => /^jz-.*\.md$/.test(f));
  assert.ok(files.length >= 7, files.join(', '));
  for (const f of files) {
    const p = nativePermission(path.join(AGENTS, f));
    assert.equal(p['*'], 'deny', `${f}: "*"`);
    assert.equal(p.edit, 'deny', `${f}: edit`);
    assert.equal(p.bash, 'deny', `${f}: bash`);
    // Lectura: los mismos secretos que la política (con --pure no hay otra capa).
    for (const secret of ['.env', 'app/.env.local', 'certs/server.pem', 'k/server.key', 'a.p12', 'a.pfx',
      '/root/.ssh/id_ed25519', 'keys/id_rsa.pub', 'id_ecdsa']) {
      assert.equal(evaluate(p.read, secret), 'deny', `${f}: lectura de ${secret}`);
    }
    for (const ok of ['src/a.ts', '.env.example', 'docs/keys.md']) assert.equal(evaluate(p.read, ok), 'allow', `${f}: ${ok}`);
    const task = p.task ?? 'deny';
    for (const writer of ['jz-architect', 'jz-implementer', 'jz-implementer-copilot']) {
      assert.equal(evaluate(task, writer), 'deny', `${f}: delegación en ${writer} sin plugin`);
    }
  }
});

test('permisos operativos: los patrones nativos no aceptan prefijos ni metacaracteres peligrosos', () => {
  const perms = JSON.parse(fs.readFileSync(PERMISSIONS, 'utf8'));
  const dangerous = [
    'git difftool -x "touch MARK"', 'git difftool --extcmd=sh', 'git status > MARK', 'git log >> MARK',
    'echo x > AGENTS.md', 'echo x>AGENTS.md', 'git diff < /etc/hostname', 'echo `id`', 'echo $(id)', 'echo $HOME',
    'ls $HOME', 'ls /root', 'ls -la /root', 'ls ../otro', 'ls src/../..', 'ls ~', 'ls -la ~/.ssh',
    'git blame --contents=/etc/hostname AGENTS.md', 'git blame --contents /etc/hostname AGENTS.md',
    'git diff --ext-diff', 'git log --output=MARK', 'git diff --no-index /etc/hostname x',
    'git log --exclude-from=/etc/hostname', 'git ls-files --exclude-from=/etc/hostname',
    'git add -A', 'git commit -m x', 'git rm x', 'git mv a b', 'git restore .', 'git -C /tmp status',
    'git status; touch MARK', 'echo x & touch MARK',
    // Revisión de seguridad: rutas externas (diff sin índice implícito), abreviaturas y opciones cortas.
    'git diff /etc/hostname /dev/null', 'git diff src/a.ts /etc/hostname', 'git diff -- ../otro', 'git log -p -- ~/x',
    'git blame --cont=/etc/hostname AGENTS.md', 'git blame --conte /etc/hostname AGENTS.md',
    'git blame --ignore-revs-f=/etc/hostname AGENTS.md', 'git blame -S /etc/hostname AGENTS.md',
    'git ls-files --exclude-fr=/etc/hostname', 'git ls-files -X /etc/hostname', 'git diff -O/etc/hostname',
    'echo /root/.ssh/*', 'ls /ro?t',
  ];
  const legit = ['.jz/bin/jz-state', '.jz/bin/jz-lock status', 'ls', 'ls -la src', 'pwd', 'echo hola',
    'git status', 'git status --short', 'git diff', 'git diff HEAD~1 -- src', 'git log -1 --format=%h',
    'git show HEAD', 'git rev-parse HEAD', 'git ls-files', 'git blame src/a.ts', 'git branch --show-current',
    'git log main..HEAD', 'git log -S needle', 'git show HEAD:src/a.ts', 'git diff --stat'];
  const resolved = Object.entries(perms).filter(([k]) => !k.startsWith('$'))
    .map(([agent, v]) => [agent, typeof v === 'string' ? perms[v] : v]);
  assert.deepEqual(resolved.filter(([, r]) => r?.bash).map(([a]) => a).sort(),
    ['jz-implementer', 'jz-implementer-copilot', 'jz-orchestrator'], 'agentes con shell');
  for (const [agent, rules] of resolved) {
    if (!rules?.bash) continue;
    for (const cmd of dangerous) assert.equal(evaluate(rules.bash, cmd), 'deny', `${agent}: «${cmd}»`);
    for (const cmd of legit) assert.equal(evaluate(rules.bash, cmd), 'allow', `${agent}: «${cmd}»`);
  }
});

// QA R2: abreviaturas de las opciones prohibidas. La política deniega todo prefijo de cuatro o más caracteres;
// los patrones nativos, desde el primer prefijo que git no rechaza por ambiguo (NATIVE_STEM). Los más cortos
// sólo los deniega la política (git los rechaza por ambiguos, p. ej. --no- o --no-ind).
test('abreviaturas de las opciones de git prohibidas: política y patrones nativos', () => {
  const NATIVE_STEM = { '--output': '--ou', '--no-index': '--no-i', '--ext-diff': '--ext', '--exec': '--exe',
    '--upload-pack': '--up', '--receive-pack': '--rec', '--contents': '--con', '--exclude-from': '--exclude-f',
    '--pathspec-from-file': '--pathspec-f', '--ignore-revs-file': '--ignore-revs' };
  const wt = tmp('jz-abrev-');
  const perms = JSON.parse(fs.readFileSync(PERMISSIONS, 'utf8'));
  assert.deepEqual(Object.keys(NATIVE_STEM).sort(), [...GIT_DENIED_LONG].sort());
  for (const d of GIT_DENIED_LONG) {
    for (let n = 4; n <= d.length; n++) {
      const p = d.slice(0, n);
      for (const cmd of [`git diff ${p}=x`, `git log ${p} x`]) {
        assert.equal(checkBash(cmd, 'jz-implementer', { wt, cwd: wt }).decision, 'deny', `política: ${cmd}`);
        if (n >= NATIVE_STEM[d].length) {
          for (const a of ['jz-orchestrator', 'jz-implementer']) assert.equal(evaluate(perms[a].bash, cmd), 'deny', `${a}: ${cmd}`);
        }
      }
    }
  }
  for (const cmd of ['git log --oneline', 'git diff --color-words', 'git log --no-merges', 'git diff --exit-code']) {
    assert.equal(evaluate(perms['jz-orchestrator'].bash, cmd), 'allow', cmd);
  }
});
