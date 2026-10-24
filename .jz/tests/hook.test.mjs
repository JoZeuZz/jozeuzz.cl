// Pruebas del hook PreToolUse de Claude Code (.jz/hooks/claude-policy.mjs) ante fallos: política ausente,
// política que lanza al importarse, error interno, entrada inválida y denegación explícita. Cada caso usa
// una copia desechable del hook en el directorio temporal; la política real no se toca.
// Ejecutar: .jz/bin/jz-run node --test .jz/tests/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../..');
const roots = [];
after(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

// policy: 'real' copia la política del repositorio; null la omite; una cadena es el contenido del módulo.
function fixture(policy = 'real') {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jz-hook-')));
  roots.push(repo);
  fs.mkdirSync(path.join(repo, '.jz/hooks'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.jz/policy'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src'));
  fs.copyFileSync(path.join(SRC, '.jz/hooks/claude-policy.mjs'), path.join(repo, '.jz/hooks/claude-policy.mjs'));
  if (policy === 'real') {
    fs.copyFileSync(path.join(SRC, '.jz/policy/policy.mjs'), path.join(repo, '.jz/policy/policy.mjs'));
  } else if (policy !== null) {
    fs.writeFileSync(path.join(repo, '.jz/policy/policy.mjs'), policy);
  }
  return repo;
}

function hook(repo, input) {
  const r = spawnSync('node', [path.join(repo, '.jz/hooks/claude-policy.mjs')], {
    cwd: repo, encoding: 'utf8', timeout: 10_000, env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    input: typeof input === 'string' ? input : JSON.stringify(input),
  });
  let decision = null;
  if (r.stdout.trim()) decision = JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision ?? null;
  // Bloquea si sale con 2 (error bloqueante) o si sale con 0 y deniega por JSON.
  return { rc: r.status, decision, blocked: r.status === 2 || (r.status === 0 && decision === 'deny'), out: r.stdout + r.stderr };
}

const bash = (command, agent) => ({
  hook_event_name: 'PreToolUse', session_id: 's1', tool_use_id: 't1', tool_name: 'Bash', tool_input: { command },
  ...(agent ? { agent_type: agent } : {}),
});
const delegation = { hook_event_name: 'PreToolUse', session_id: 's1', tool_use_id: 't2', tool_name: 'Agent',
  tool_input: { subagent_type: 'jz-implementer', prompt: 'x' } };

test('política ausente: un rol jz-* y una delegación se bloquean', () => {
  const repo = fixture(null);
  const r = hook(repo, bash('ls', 'jz-implementer'));
  assert.ok(r.blocked, `rol jz-*: ${JSON.stringify(r)}`);
  const d = hook(repo, delegation);
  assert.ok(d.blocked, `delegación: ${JSON.stringify(d)}`);
  assert.equal(fs.existsSync(path.join(repo, '.jz-state/writer.lock')), false, 'sin bloqueo de escritor');
});

test('política que lanza al importarse: se bloquea', () => {
  const repo = fixture("throw new Error('fallo sintético al importar');\n");
  const r = hook(repo, bash('ls', 'jz-implementer'));
  assert.ok(r.blocked, JSON.stringify(r));
  assert.ok(hook(repo, delegation).blocked, 'delegación');
});

test('política con exportaciones incompletas: se bloquea', () => {
  const repo = fixture('export const roleOf = (a) => a;\n');
  const r = hook(repo, bash('ls', 'jz-implementer'));
  assert.ok(r.blocked, JSON.stringify(r));
});

test('error interno de la política durante la decisión: se bloquea', () => {
  const src = fs.readFileSync(path.join(SRC, '.jz/policy/policy.mjs'), 'utf8')
    .replace('export function checkBash(cmd, role, ctx) {', "export function checkBash(cmd, role, ctx) {\n  throw new Error('fallo sintético');");
  const repo = fixture(src);
  const r = hook(repo, bash('ls', 'jz-implementer'));
  assert.ok(r.blocked, JSON.stringify(r));
});

test('entrada inválida: se bloquea con código 2', () => {
  const repo = fixture();
  for (const input of ['no es json', '', 'null', '[]', '"PreToolUse"', '{"hook_event_name":']) {
    const r = hook(repo, input);
    assert.equal(r.rc, 2, `${JSON.stringify(input)}: ${JSON.stringify(r)}`);
  }
});

test('denegación explícita de la política', () => {
  const repo = fixture();
  for (const cmd of ['git push', 'git add -A', 'npm test']) {
    const r = hook(repo, bash(cmd, 'jz-implementer'));
    assert.equal(r.rc, 0, r.out);
    assert.equal(r.decision, 'deny', `${cmd}: ${r.out}`);
  }
  assert.equal(hook(repo, bash('ls', 'jz-fantasma')).decision, 'deny', 'rol jz-* desconocido sin shell');
});

test('sesión principal y agentes que no son jz-*: sin capacidades autónomas por omisión', () => {
  for (const policy of ['real', null]) {
    const repo = fixture(policy);
    for (const agent of [undefined, 'Explore', 'general-purpose', 'claude']) {
      for (const cmd of ['ls', 'rm -rf src', 'git add -A']) {
        const r = hook(repo, bash(cmd, agent));
        assert.notEqual(r.decision, 'allow', `${policy ?? 'sin política'} ${agent ?? 'principal'} ${cmd}: ${r.out}`);
      }
    }
  }
});

test('settings.json: los hooks PreToolUse bloquean si fallan, no arrancan o agotan el tiempo', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(SRC, '.claude/settings.json'), 'utf8'));
  const hooks = (settings.hooks?.PreToolUse ?? []).flatMap((m) => m.hooks ?? []);
  assert.ok(hooks.length > 0, 'hay hooks PreToolUse');
  for (const h of hooks) {
    assert.equal(h.type, 'command');
    assert.equal(h.onFailure, 'block', `onFailure en ${h.command}`);
    assert.ok(Number.isInteger(h.timeout) && h.timeout > 0, 'timeout explícito');
    assert.notEqual(h.async, true, 'onFailure no se aplica a hooks asíncronos');
  }
});
