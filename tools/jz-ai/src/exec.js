import { execFile } from 'node:child_process';

export const GIT_PREFIX = ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null'];

// Sin `status`: ejecuta filtros clean del repositorio (spec §10.1).
export const ALLOWED_GIT_ARGS = [
  ['--version'],
  ['rev-parse', '--abbrev-ref', 'HEAD'],
  ['rev-parse', '--verify', 'HEAD'],
];

export const GIT_CHILD_PATH = '/usr/bin:/bin';

// Entorno construido desde cero: nada del padre llega al hijo salvo el HOME ya validado.
export function gitEnv(home) {
  const out = {
    PATH: GIT_CHILD_PATH,
    LANG: 'C',
    LC_ALL: 'C',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  if (home) out.HOME = home;
  return out;
}

function isAllowed(args) {
  return ALLOWED_GIT_ARGS.some((allowed) => allowed.length === args.length && allowed.every((value, index) => value === args[index]));
}

export function createGitRunner({ gitPath, home, timeoutMs = 5000, maxBuffer = 1024 * 1024 }) {
  return function runGit(args, cwd) {
    if (!isAllowed(args)) return Promise.resolve({ ok: false, reason: 'not-allowed' });
    const fullArgs = args[0] === '--version' ? args : [...GIT_PREFIX, ...args];
    const options = { cwd, env: gitEnv(home), timeout: timeoutMs, maxBuffer, killSignal: 'SIGKILL', shell: false, windowsHide: true, encoding: 'utf8' };
    return new Promise((resolve) => {
      execFile(gitPath, fullArgs, options, (error, stdout) => {
        if (!error) return resolve({ ok: true, stdout });
        if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return resolve({ ok: false, reason: 'output-too-large' });
        if (error.killed) return resolve({ ok: false, reason: 'timeout' });
        return resolve({ ok: false, reason: 'failed' });
      });
    });
  };
}
