import { accessSync, constants, createWriteStream } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawn as nativeSpawn } from 'node:child_process';

import { buildAgentPrompt } from './opencode.js';

export const ENGINE_UNAVAILABLE = 75;
const QUOTA = /usage limit|rate[ _-]?limit|quota|insufficient_quota|credit balance|overloaded|\b429\b|limit reached|too many requests/i;
const CLAUDE_AGENTS = new Set(['jz-implementer']);

// Busca un ejecutable en el PATH del supervisor; el worker recibe la ruta absoluta y un PATH mínimo.
export function findBinary(name, path = process.env.PATH ?? '', extra = []) {
  for (const dir of [...path.split(delimiter), ...extra]) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

export function quotaExhausted(text) {
  return QUOTA.test(String(text ?? ''));
}

export function buildClaudeEnv(source = {}) {
  const env = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', JZ_ENGINE: 'claude-code' };
  for (const name of ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME']) {
    if (typeof source[name] === 'string' && source[name].startsWith('/')) env[name] = source[name];
  }
  return env;
}

// Lanza un proceso del motor con timeout y guarda stdout/stderr en el state-dir; nunca devuelve la salida cruda.
export function runEngineProcess({ spawn = nativeSpawn, bin, args, cwd, env, stdoutPath, stderrPath, timeoutMs, killGraceMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { cwd, env: { ...env, PWD: cwd }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve({ rc: 1, tail: '' });
      return;
    }
    let tail = '';
    const keep = (chunk) => { tail = (tail + chunk.toString()).slice(-8192); };
    if (child.stdout) { child.stdout.on('data', keep); child.stdout.pipe(createWriteStream(stdoutPath, { mode: 0o600 })); }
    if (child.stderr) { child.stderr.on('data', keep); child.stderr.pipe(createWriteStream(stderrPath, { mode: 0o600 })); }
    let closed = false;
    let timedOut = false;
    let grace;
    const finish = (rc) => {
      if (closed) return;
      closed = true;
      clearTimer(timeout);
      clearTimer(grace);
      resolve({ rc: Number.isInteger(rc) ? rc : 1, tail, timedOut });
    };
    const timeout = setTimer(() => {
      timedOut = true;
      child.kill('SIGTERM');
      grace = setTimer(() => { child.kill('SIGKILL'); finish(124); }, killGraceMs);
    }, timeoutMs);
    child.once('error', () => finish(1));
    child.once('close', (rc) => finish(timedOut ? 124 : rc));
  });
}

export function claudeResultFailed(tail) {
  // --output-format json termina con un objeto {"type":"result","is_error":...}.
  const line = String(tail).trim().split('\n').reverse().find((l) => l.trim().startsWith('{'));
  try {
    const parsed = JSON.parse(line ?? '');
    return parsed?.is_error === true || parsed?.subtype !== 'success';
  } catch {
    return true;
  }
}

export function createClaudeRunner(options) {
  const bin = options.bin ?? findBinary('claude', process.env.PATH, [join(process.env.HOME ?? '/root', '.local/bin')]);
  return async ({ objective, phase, failures, workspace, stateDir, attempt }) => {
    if (!bin) return { rc: ENGINE_UNAVAILABLE, unavailable: true, reason: 'claude not installed' };
    if (!CLAUDE_AGENTS.has(objective.agent)) return { rc: ENGINE_UNAVAILABLE, unavailable: true, reason: `agent ${objective.agent} not available in claude` };
    const prompt = buildAgentPrompt({ objective, phase, failures });
    const args = ['-p', '--agent', objective.agent, '--permission-mode', 'dontAsk', '--output-format', 'json', prompt];
    const out = await runEngineProcess({
      spawn: options.spawn, bin, args, cwd: workspace, env: buildClaudeEnv(options.env ?? process.env),
      stdoutPath: join(stateDir, `agent-${attempt}-claude-${phase}.stdout.log`),
      stderrPath: join(stateDir, `agent-${attempt}-claude-${phase}.stderr.log`),
      timeoutMs: options.timeoutMs, setTimer: options.setTimer, clearTimer: options.clearTimer
    });
    const failed = out.rc !== 0 || claudeResultFailed(out.tail);
    if (failed && quotaExhausted(out.tail)) return { rc: ENGINE_UNAVAILABLE, unavailable: true, engine: 'claude' };
    return { rc: failed ? (out.rc || 1) : 0, engine: 'claude' };
  };
}

// Recorre los motores en orden. Uno sin cuota queda descartado para el resto de la ejecución.
export function createFailover(runners, order) {
  const down = new Set();
  return async (request) => {
    for (const name of order) {
      if (down.has(name) || typeof runners[name] !== 'function') continue;
      const out = await runners[name](request);
      if (out?.unavailable) {
        down.add(name);
        continue;
      }
      return { ...out, engine: name };
    }
    return { rc: ENGINE_UNAVAILABLE, unavailable: true, engine: null };
  };
}
