#!/usr/bin/env node
// Hook de Claude Code (PreToolUse, PostToolUse, PostToolUseFailure, SessionEnd, StopFailure) que aplica
// .jz/policy/policy.mjs a los especialistas jz-*. La sesión principal sin --agent no se
// restringe aquí: la gobiernan el modo de permisos y las reglas de settings.json.
// Ante cualquier error con un rol jz-* la decisión es "deny" (falla cerrado).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  roleOf, checkRead, checkWrite, checkBash, checkDelegate, acquireWriter, releaseWriter, WRITER_ROLES,
} from '../policy/policy.mjs';

const READ_TOOLS = { Read: 'file_path', Grep: 'path', Glob: 'path' };
const WRITE_TOOLS = { Edit: 'file_path', MultiEdit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };
const NEUTRAL_TOOLS = new Set(['Skill', 'TodoWrite', 'SubagentHandback', 'ToolSearch']);

function claudePid() {
  let pid = process.ppid;
  for (let i = 0; i < 6 && pid > 1; i++) {
    try {
      if (fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() === 'claude') return pid;
      pid = Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1]);
    } catch {
      break;
    }
  }
  return process.ppid;
}

function emit(event, decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, permissionDecision: decision, permissionDecisionReason: `jz-policy: ${reason}` },
  }));
}

function preToolUse(input, wt) {
  const role = roleOf(input.agent_type);
  const tool = input.tool_name;
  const ti = input.tool_input ?? {};
  const ctx = { wt, cwd: input.cwd || wt };

  if (tool === 'Agent' || tool === 'Task') {
    const target = ti.subagent_type;
    if (role) {
      const r = checkDelegate(target, role, { background: ti.run_in_background === true });
      if (r.decision !== 'allow') return r;
    }
    if (WRITER_ROLES.has(target)) {
      return acquireWriter(wt, {
        engine: 'claude-code', pid: claudePid(), session: input.session_id, agent: target, call: input.tool_use_id,
      });
    }
    return role ? { decision: 'allow', reason: `delegación en ${target}` } : null;
  }
  if (!role) return null;
  if (READ_TOOLS[tool]) return checkRead(ti[READ_TOOLS[tool]], role, ctx);
  if (WRITE_TOOLS[tool]) return checkWrite(ti[WRITE_TOOLS[tool]], role, ctx);
  if (tool === 'Bash') return checkBash(ti.command, role, ctx);
  if (NEUTRAL_TOOLS.has(tool)) return { decision: 'allow', reason: tool };
  if (tool.startsWith('mcp__') || tool === 'WebFetch' || tool === 'WebSearch') {
    return { decision: 'deny', reason: `${tool} no está permitido para ${role}` };
  }
  return null;
}

let input = {};
let wt = process.cwd();
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
  wt = fs.realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  const event = input.hook_event_name;
  if (event === 'PreToolUse') {
    const r = preToolUse(input, wt);
    if (r) emit(event, r.decision, r.reason);
  } else if (event === 'PostToolUse' || event === 'PostToolUseFailure') {
    if (input.tool_name === 'Agent' || input.tool_name === 'Task') {
      releaseWriter(wt, { session: input.session_id, call: input.tool_use_id });
    }
  } else if (event === 'SessionEnd') {
    releaseWriter(wt, { session: input.session_id });
  } else if (event === 'StopFailure') {
    // El turno terminó por un error de la API (cuota, límite, servicio): no reintentar, dejar checkpoint.
    releaseWriter(wt, { session: input.session_id });
    const detail = JSON.stringify(input.error ?? input.error_details ?? input).slice(0, 300);
    const quota = /rate.?limit|usage|quota|billing|credit|overloaded/i.test(detail);
    spawnSync(path.join(wt, '.jz/bin/jz-checkpoint'), [
      '--unit', `sesión Claude Code interrumpida (${input.agent_type ?? 'principal'})`,
      '--state', quota ? 'cuota' : 'incompleto', '--issue', `error de API: ${detail}`,
      '--next', 'Verificar con .jz/bin/jz-state y reanudar (otro motor si no hay cuota); no repetir a ciegas la última tarea',
    ], { cwd: wt, env: { ...process.env, JZ_ENGINE: 'claude-code' }, timeout: 10_000 });
  }
  process.exit(0);
} catch (e) {
  if (input.hook_event_name === 'PreToolUse' && (roleOf(input.agent_type) || input.tool_name === 'Agent')) {
    emit('PreToolUse', 'deny', `error interno de la política (${e.message}); se deniega por seguridad`);
    process.exit(0);
  }
  process.stderr.write(`jz-policy: ${e.stack}\n`);
  process.exit(0);
}
