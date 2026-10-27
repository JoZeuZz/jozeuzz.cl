import { access, readFile as nativeReadFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { relative, resolve, sep, join } from 'node:path';
import { execFile as nativeExecFile, spawn as nativeSpawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClaudeRunner, createFailover, ENGINE_UNAVAILABLE, findBinary, quotaExhausted, runEngineProcess } from './engines.js';

// jz-git de la misma instalación que el supervisor: una copia fuera del worktree no la modifica un worker.
export const defaultGitops = fileURLToPath(new URL('../../jz-gitops/jz-git.mjs', import.meta.url));

const hostEnv = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
const gitEnv = { ...hostEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' };
const checkEnv = { ...hostEnv, JZ_ENGINE: 'jz-autonomy' };

function resultOf(run) {
  return Promise.resolve(run).catch((error) => ({ rc: Number.isInteger(error?.code) ? error.code : 1, stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' }));
}

export async function resolveWorkspace({ root, workspace, realpath: real = realpath }) {
  const realRoot = await real(root);
  const target = await real(resolve(realRoot, workspace));
  const rel = relative(realRoot, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(realRoot, rel) !== target) throw new Error('workspace escapes root');
  return target;
}

function parseChangeLines(text) {
  return String(text).split('\n').flatMap((line) => {
    const match = line.match(/^(?:\s*[A-Z?]{1,2}\s+)(.+)$/);
    if (!match) return [];
    const value = match[1].trim();
    if (value.startsWith('"')) {
      try { return [JSON.parse(value)]; } catch { return []; }
    }
    return [value];
  });
}

export function parseJzState(text) {
  const verdicts = [...String(text).matchAll(/^## Veredicto: (REANUDABLE|BLOQUEADO)$/gm)];
  const changes = String(text).match(/^## Cambios sin confirmar\n```\n([\s\S]*?)\n```/m);
  const clean = /^## Cambios sin confirmar\nNinguno \(árbol limpio\)\.$/m.test(String(text));
  if (verdicts.length !== 1 || (!changes && !clean)) throw new Error('invalid state format');
  return { verdict: verdicts[0][1], paths: changes ? parseChangeLines(changes[1]) : [] };
}

export function buildOpenCodeEnv(source = {}) {
  const env = { ...hostEnv };
  for (const name of ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME']) {
    if (typeof source[name] === 'string' && source[name].startsWith('/')) env[name] = source[name];
  }
  return env;
}

export function buildAgentPrompt({ objective, phase, failures = [] }) {
  const structured = failures.map(({ kind, phase: failedPhase, id, argv, rc, log, evidence }) => ({ kind, phase: failedPhase, id, argv, rc, log, evidence }));
  const instructions = objective.workflow === 'split-tdd'
    ? phase === 'implementation'
      ? 'Write only tests within allowedPaths. Run the focal check to produce RED. No production implementation may be created or modified. Stop and report evidence.'
      : 'Implement minimum implementation to resolve structured failures and leave checks green.'
    : 'Implement the objective within allowedPaths and report structured evidence.';
  const supervision = 'Supervised by jz-autonomy: it holds the writer lock for you, reruns the checks and commits through GitOps. Do not commit or run jz-checkpoint. Finish with INFORME-JZ.';
  return JSON.stringify({ supervision, objective: objective.objective, criteria: objective.criteria, workflow: objective.workflow ?? 'standard', phase, instructions, allowedPaths: objective.allowedPaths, checks: objective.checks, failures: phase === 'correction' ? structured : [] });
}

// OpenCode ejecuta el agente por defecto, sin la política jz, si el perfil pedido es sólo subagente
// ("Falling back to default agent"). Se exige un perfil primario antes de lanzar y se mata el proceso si aun
// así aparece el aviso.
const FALLBACK = /Falling back to default agent/;

export async function openCodeAgentMode(workspace, agent, readFile = nativeReadFile) {
  if (!/^jz-[a-z-]+$/.test(agent)) return null;
  try {
    const text = String(await readFile(join(workspace, '.opencode/agents', `${agent}.md`), 'utf8'));
    const front = text.match(/^---\n([\s\S]*?)\n---/);
    return front?.[1].match(/^mode:\s*([a-z]+)\s*$/m)?.[1] ?? 'all';
  } catch {
    return null;
  }
}

export function createOpenCodeRunner(options) {
  const bin = options.bin ?? findBinary('opencode', process.env.PATH, [join(process.env.HOME ?? '/root', '.opencode/bin')]) ?? 'opencode';
  return async ({ objective, phase, failures, workspace, stateDir, attempt = 0 }) => {
    const mode = await openCodeAgentMode(workspace, objective.agent, options.readFile);
    if (mode !== 'primary' && mode !== 'all') {
      return { rc: ENGINE_UNAVAILABLE, unavailable: true, engine: 'opencode', reason: `opencode agent ${objective.agent} mode ${mode ?? 'missing'}` };
    }
    const prompt = buildAgentPrompt({ objective, phase, failures });
    const args = ['run', '--dir', workspace, '--agent', objective.agent, '--format', 'json', prompt];
    const out = await runEngineProcess({
      spawn: options.spawn ?? nativeSpawn, bin, args, cwd: workspace, env: buildOpenCodeEnv(options.env ?? process.env),
      stdoutPath: join(stateDir, `agent-${attempt}-opencode-${phase}.stdout.log`),
      stderrPath: join(stateDir, `agent-${attempt}-opencode-${phase}.stderr.log`),
      timeoutMs: options.timeoutMs ?? 120000, killGraceMs: options.killGraceMs, setTimer: options.setTimer, clearTimer: options.clearTimer,
      abortOn: FALLBACK
    });
    if (out.aborted) return { rc: ENGINE_UNAVAILABLE, unavailable: true, engine: 'opencode', reason: 'opencode fell back to the default agent' };
    // OpenCode reintenta sin fin con la cuota agotada: un timeout con el error de cuota en la salida descarta el motor.
    if (out.rc !== 0 && quotaExhausted(out.tail)) return { rc: ENGINE_UNAVAILABLE, unavailable: true, engine: 'opencode', reason: 'quota or usage limit' };
    return { rc: out.rc, engine: 'opencode' };
  };
}

export function createOpenCodeAdapters(options) {
  const execFile = options.execFile ?? ((file, argv, opts) => new Promise((resolve) => nativeExecFile(file, argv, { ...opts, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ rc: error ? (Number.isInteger(error.code) ? error.code : 1) : 0, stdout, stderr }))));
  const real = options.realpath ?? realpath;
  const root = options.root;
  const stateDir = options.stateDir;
  const node = options.node ?? process.execPath;
  const gitops = options.gitops ?? defaultGitops;
  const exists = options.exists ?? (async (path) => access(path, constants.R_OK).then(() => true, () => false));
  const workspaceFor = (objective) => resolveWorkspace({ root, workspace: objective.workspace, realpath: real });
  const exec = (file, argv, cwd, env = {}) => resultOf(execFile(file, argv, { cwd, env: { ...env, PWD: cwd } }));
  const runners = options.runners ?? {
    opencode: createOpenCodeRunner(options),
    claude: createClaudeRunner({ spawn: options.spawn, timeoutMs: options.timeoutMs, setTimer: options.setTimer, clearTimer: options.clearTimer, bin: options.claudeBin })
  };
  let attempt = 0;
  let failover;
  let held = null;

  return {
    async preflight({ objective }) {
      const workspace = await workspaceFor(objective);
      const state = await exec(join(workspace, '.jz/bin/jz-state'), [], workspace, gitEnv);
      const branch = await exec('git', ['branch', '--show-current'], workspace, gitEnv);
      try {
        const parsed = state.rc === 0 ? parseJzState(state.stdout) : null;
        const blocked = !parsed || parsed.verdict !== 'REANUDABLE' || branch.rc !== 0 || String(branch.stdout).trim() !== objective.branch || parsed.paths.length > 0;
        return blocked ? { status: 'blocked', dirty: Boolean(parsed?.paths.length) } : { status: 'clean' };
      } catch { return { status: 'blocked' }; }
    },
    // Con el bloqueo de escritor del supervisor tomado, jz-state no se puede usar como oráculo: la lista de
    // cambios sale de .jz/lib/tree.mjs (plano de control, sin filtros ni fsmonitor del repositorio).
    async inspectChanges({ objective }) {
      const workspace = await workspaceFor(objective);
      const tree = await exec(node, [join(workspace, '.jz/lib/tree.mjs'), 'status', workspace], workspace, gitEnv);
      if (tree.rc !== 0) throw new Error('tree status failed');
      return { paths: parseChangeLines(tree.stdout) };
    },
    async acquire({ objective, runId }) {
      const workspace = await workspaceFor(objective);
      const policy = await import(pathToFileURL(join(workspace, '.jz/policy/policy.mjs')).href);
      held = { workspace, policy, match: { pid: process.pid, session: runId } };
      const r = policy.acquireWriter(workspace, { engine: 'jz-autonomy', pid: process.pid, session: runId, agent: objective.agent, call: objective.unit });
      if (r.decision !== 'allow') { held = null; return { rc: 1, reason: r.reason }; }
      return { rc: 0 };
    },
    async release() {
      if (held) held.policy.releaseWriter(held.workspace, held.match);
      held = null;
    },
    async runAgent({ objective, phase, failures }) {
      const workspace = await workspaceFor(objective);
      failover ??= createFailover(runners, objective.engines ?? options.engines ?? ['opencode']);
      attempt += 1;
      return failover({ objective, phase, failures, workspace, stateDir, attempt });
    },
    async runCheck({ objective, check }) {
      const workspace = await workspaceFor(objective);
      const output = await exec(join(workspace, '.jz/bin/jz-run'), check.argv, workspace, checkEnv);
      const log = `${output.stdout ?? ''}\n${output.stderr ?? ''}`.match(/(?:^|\s)log=([^\s]+)/)?.[1] ?? '';
      return { rc: output.rc, log, evidence: check.id };
    },
    async commit({ objective, op }) {
      const workspace = await workspaceFor(objective);
      if (!await exists(gitops)) return { rc: 78, evidence: 'capability missing' };
      const argv = [gitops, 'commit', '--repo', workspace, '--branch', objective.branch, '--message', objective.commit.message,
        ...(op ? ['--op', op] : []), ...objective.allowedPaths.flatMap((path) => ['--path', path])];
      return parseGitops(await exec(node, argv, workspace, gitopsEnv(options.env ?? process.env)));
    },
    async push({ objective }) {
      const workspace = await workspaceFor(objective);
      if (!await exists(gitops)) return { rc: 78, evidence: 'capability missing' };
      return parseGitops(await exec(node, [gitops, 'push', '--repo', workspace, '--branch', objective.branch], workspace, gitopsEnv(options.env ?? process.env)));
    },
    async checkpoint({ result, state }) {
      const workspace = await workspaceFor(state.objective);
      const output = await exec(join(workspace, '.jz/bin/jz-checkpoint'), ['--unit', state.objective.unit, '--state', result === 'blocked' && /unavailable/.test(state.reason ?? '') ? 'cuota' : result === 'blocked' ? 'bloqueado' : 'incompleto', '--next', `jz-autonomy ${state.runId ?? ''} result: ${result}${state.reason ? ` (${state.reason})` : ''}`], workspace, { ...gitEnv, JZ_ENGINE: 'jz-autonomy' });
      return { rc: output.rc };
    }
  };
}

// GitOps necesita HOME para la identidad del autor y el helper de credenciales de la configuración global.
function gitopsEnv(source) {
  const env = { ...hostEnv };
  for (const name of ['HOME', 'XDG_CONFIG_HOME']) if (typeof source[name] === 'string' && source[name].startsWith('/')) env[name] = source[name];
  return env;
}

function parseGitops(output) {
  try {
    const parsed = JSON.parse(String(output.stdout ?? '').trim().split('\n').at(-1));
    if (parsed && typeof parsed === 'object') {
      return {
        rc: output.rc,
        ...(typeof parsed.head === 'string' ? { head: parsed.head } : {}),
        ...(typeof parsed.remoteSha === 'string' ? { remoteSha: parsed.remoteSha } : {}),
        evidence: typeof parsed.evidence === 'string' ? parsed.evidence : typeof parsed.error === 'string' ? parsed.error : 'jz-git'
      };
    }
  } catch {}
  return { rc: output.rc, evidence: 'jz-git' };
}
