import { access, realpath } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { relative, resolve, sep, join } from 'node:path';
import { execFile as nativeExecFile, spawn as nativeSpawn } from 'node:child_process';

const hostEnv = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
const gitEnv = { ...hostEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' };
const checkEnv = { ...hostEnv, JZ_ENGINE: 'opencode' };

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
  if (verdicts.length !== 1 || !changes) throw new Error('invalid state format');
  return { verdict: verdicts[0][1], paths: parseChangeLines(changes[1]) };
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
  return JSON.stringify({ objective: objective.objective, criteria: objective.criteria, workflow: objective.workflow ?? 'standard', phase, instructions, allowedPaths: objective.allowedPaths, checks: objective.checks, failures: phase === 'correction' ? structured : [] });
}

export function createOpenCodeAdapters(options) {
  const execFile = options.execFile ?? ((file, argv, opts) => new Promise((resolve) => nativeExecFile(file, argv, opts, (error, stdout, stderr) => resolve({ rc: error?.code ?? 0, stdout, stderr }))));
  const spawn = options.spawn ?? nativeSpawn;
  const exists = options.exists ?? (async (path) => access(path, constants.X_OK).then(() => true, () => false));
  const real = options.realpath ?? realpath;
  const root = options.root;
  const stateDir = options.stateDir;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const workspaceFor = (objective) => resolveWorkspace({ root, workspace: objective.workspace, realpath: real });
  const exec = (file, argv, cwd, env = {}) => resultOf(execFile(file, argv, { cwd, env: { ...env, PWD: cwd } }));

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
    async inspectChanges({ objective }) {
      const workspace = await workspaceFor(objective);
      const state = await exec(join(workspace, '.jz/bin/jz-state'), [], workspace, gitEnv);
      if (state.rc !== 0) throw new Error('tree status failed');
      const parsed = parseJzState(state.stdout);
      if (parsed.verdict !== 'REANUDABLE') throw new Error('state blocked');
      return { paths: parsed.paths };
    },
    async runAgent({ objective, phase, failures }) {
      const workspace = await workspaceFor(objective);
      const prompt = buildAgentPrompt({ objective, phase, failures });
      const args = ['run', '--dir', workspace, '--agent', objective.agent, '--format', 'json', prompt];
      const child = spawn('opencode', args, { cwd: workspace, env: { ...buildOpenCodeEnv(process.env), PWD: workspace } });
      const stdoutPath = join(stateDir, `agent-${phase}.stdout.log`);
      const stderrPath = join(stateDir, `agent-${phase}.stderr.log`);
      if (child?.stdout?.pipe) child.stdout.pipe(createWriteStream(stdoutPath, { mode: 0o600 }));
      if (child?.stderr?.pipe) child.stderr.pipe(createWriteStream(stderrPath, { mode: 0o600 }));
      if (typeof child?.then === 'function') return resultOf(child);
      return new Promise((resolve) => {
        let closed = false;
        let timedOut = false;
        let timeout;
        let grace;
        const finish = (rc) => {
          if (closed) return;
          closed = true;
          clearTimer(timeout);
          clearTimer(grace);
          resolve({ rc: Number.isInteger(rc) ? rc : 1, evidence: { stdoutPath, stderrPath } });
        };
        timeout = setTimer(() => {
          timedOut = true;
          child.kill('SIGTERM');
          grace = setTimer(() => {
            child.kill('SIGKILL');
            finish(124);
          }, options.killGraceMs ?? 5000);
        }, options.timeoutMs ?? 120000);
        child.once('error', () => finish(1));
        child.once('close', (rc) => finish(timedOut ? 124 : rc));
      });
    },
    async runCheck({ objective, check }) {
      const workspace = await workspaceFor(objective);
      const output = await exec(join(workspace, '.jz/bin/jz-run'), check.argv, workspace, checkEnv);
      const log = `${output.stdout ?? ''}\n${output.stderr ?? ''}`.match(/(?:^|\n)log=([^\s]+)/)?.[1] ?? '';
      return { rc: output.rc, log, evidence: check.id };
    },
    async commit({ objective }) {
      const workspace = await workspaceFor(objective);
      const helper = join(workspace, '.jz/bin/jz-git');
      if (!await exists(helper)) return { rc: 78, evidence: 'capability missing' };
      const argv = ['commit', '--branch', objective.branch, '--message', objective.commit.message, ...objective.allowedPaths.flatMap((path) => ['--path', path])];
      const output = await exec(helper, argv, workspace, gitEnv);
      try {
        const parsed = JSON.parse(String(output.stdout ?? ''));
        if (parsed && typeof parsed === 'object') {
          return {
            rc: output.rc,
            ...(typeof parsed.head === 'string' ? { head: parsed.head } : {}),
            evidence: typeof parsed.evidence === 'string' ? parsed.evidence : 'jz-git'
          };
        }
      } catch {}
      return { rc: output.rc, evidence: 'jz-git' };
    },
    async checkpoint({ result, state }) {
      const workspace = await workspaceFor(state.objective);
      const output = await exec(join(workspace, '.jz/bin/jz-checkpoint'), ['--unit', state.objective.unit, '--state', 'incompleto', '--next', `operational result: ${result}`], workspace, gitEnv);
      return { rc: output.rc };
    }
  };
}
