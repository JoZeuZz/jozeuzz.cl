import { isAbsolute } from 'node:path';
import { createGitRunner } from './exec.js';
import { createFsRead } from './fs-read.js';

export const GIT_PATH = '/usr/bin/git';

export function envValue(env, name) {
  return Object.hasOwn(env, name) && typeof env[name] === 'string' ? env[name] : null;
}

export function resolveHome(env) {
  const value = envValue(env, 'HOME');
  if (value === null) return { home: null, homeProblem: 'no definida' };
  if (value === '') return { home: null, homeProblem: 'vacía' };
  if (!isAbsolute(value)) return { home: null, homeProblem: 'relativa' };
  return { home: value, homeProblem: null };
}

export function createContext({ env = process.env, cwd = process.cwd(), gitPath = GIT_PATH } = {}) {
  const { home, homeProblem } = resolveHome(env);
  return {
    fs: createFsRead(),
    env,
    cwd,
    home,
    homeProblem,
    gitPath,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    createGitRunner: (gitPath) => createGitRunner({ gitPath, home }),
  };
}
