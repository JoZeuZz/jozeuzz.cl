import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createOpenCodeAdapters } from './opencode.js';
import { runObjective } from './runner.js';

const maxObjectiveBytes = 64 * 1024;
const usage = 'usage: jz-autonomy run --objective <file> --state-dir <dir> [--root <absolute>] [--engines claude,opencode]\n'
  + '       jz-autonomy resume --state-dir <dir> [--root <absolute>]\n';
const engineNames = new Set(['claude', 'opencode']);

export function inside(base, target) {
  const path = relative(base, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function parse(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  if (argv.length === 1 && argv[0] === '--version') return { version: true };
  if (argv[0] !== 'run' && argv[0] !== 'resume') return null;
  const allowed = argv[0] === 'run' ? ['--objective', '--state-dir', '--root', '--engines'] : ['--state-dir', '--root'];
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.includes(key) || !value || values[key]) return null;
    values[key] = value;
  }
  let engines;
  if (values['--engines']) {
    engines = values['--engines'].split(',');
    if (engines.some((name) => !engineNames.has(name)) || new Set(engines).size !== engines.length) return null;
  }
  if (argv[0] === 'resume') return values['--state-dir'] ? { resume: true, stateDir: values['--state-dir'], root: values['--root'] } : null;
  return values['--objective'] && values['--state-dir'] ? { objective: values['--objective'], stateDir: values['--state-dir'], root: values['--root'], engines } : null;
}

function timeoutOf(objective) {
  return Number.isInteger(objective?.timeoutMinutes) ? objective.timeoutMinutes * 60_000 : 30 * 60_000;
}

function report(result, io) {
  const final = { result: result.result, runId: result.runId, reason: result.reason, corrections: result.corrections, checks: result.checks, commit: result.commit, push: result.push, paths: result.paths };
  io.stdout.write(`${JSON.stringify(final)}\n`);
  return result.result === 'completed' ? 0 : result.result === 'failed' ? 1 : 2;
}

// Reanuda un state-dir existente: reutiliza el journal y no repite los pasos ya registrados.
// Abre un state-dir existente de .jz-state/<kind>/ y devuelve su ruta real y el estado guardado.
export async function openStateDir(root, name, io, kind = 'autonomy') {
  if (isAbsolute(name) || name === '.') throw new Error('state');
  const stateBase = join(root, '.jz-state', kind);
  const stateDir = resolve(stateBase, name);
  if (!inside(stateBase, stateDir) || stateDir === stateBase) throw new Error('state');
  const realDir = await io.realpath(stateDir).catch(() => { throw new Error('state'); });
  if (!inside(await io.realpath(stateBase), realDir)) throw new Error('state');
  const statePath = join(realDir, 'state.json');
  await regular(statePath, io).catch(() => { throw new Error('state'); });
  let saved;
  try { saved = JSON.parse((await io.readFile(statePath)).toString('utf8')); } catch { throw new Error('state'); }
  return { realDir, saved };
}

async function resume(command, root, io) {
  const { realDir, saved } = await openStateDir(root, command.stateDir, io);
  if (saved?.result === 'completed') return report({ ...saved, paths: saved.paths }, io);
  const adapters = io.createOpenCodeAdapters({ root, stateDir: realDir, engines: saved?.objective?.engines, timeoutMs: timeoutOf(saved?.objective) });
  const result = await io.runObjective(saved.objective, adapters, { stateDir: realDir, resume: saved });
  return report(result, io);
}

// SEC-2: el objetivo debe estar versionado y sin cambios respecto de HEAD, así un worker no puede reescribir
// el que relanzará el humano.
export function objectiveCommitted(root, rel) {
  const env = { PATH: '/usr/bin:/bin', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' };
  const git = (args) => new Promise((done) => execFile('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], { env }, (error, stdout) => done({ rc: error ? 1 : 0, stdout })));
  return Promise.all([git(['ls-files', '--error-unmatch', '--', rel]), git(['status', '--porcelain', '--', rel])])
    .then(([tracked, status]) => tracked.rc === 0 && status.rc === 0 && status.stdout.trim() === '');
}

export async function regular(path, io) {
  const info = await io.lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('invalid file');
}

// Lee un JSON versionado y sin cambios respecto de HEAD dentro de root (objetivos y metas).
export async function loadCommittedJson(root, rel, io) {
  if (isAbsolute(rel)) throw new Error('objective');
  const objectivePath = resolve(root, rel);
  if (!inside(root, objectivePath)) throw new Error('objective');
  await regular(objectivePath, io);
  const objectiveReal = await io.realpath(objectivePath);
  if (!inside(root, objectiveReal)) throw new Error('objective');
  if (!await io.objectiveCommitted(root, relative(root, objectiveReal))) throw new Error('objective');
  const raw = await io.readFile(objectiveReal);
  if (raw.byteLength > maxObjectiveBytes) throw new Error('objective');
  let objective;
  try { objective = JSON.parse(raw.toString('utf8')); } catch { throw new Error('objective'); }
  if (!objective || typeof objective !== 'object' || Array.isArray(objective)) throw new Error('objective');
  return objective;
}

// Crea un state-dir nuevo en .jz-state/<kind>/ sin seguir enlaces fuera de él.
export async function createStateDir(root, name, io, kind = 'autonomy') {
  if (isAbsolute(name) || name === '.') throw new Error('state');
  const stateRoot = join(root, '.jz-state');
  const stateBase = join(stateRoot, kind);
  const stateDir = resolve(stateBase, name);
  if (!inside(stateBase, stateDir) || stateDir === stateBase) throw new Error('state');
  const realStateRoot = await io.realpath(stateRoot);
  await io.mkdir(stateBase, { recursive: true, mode: 0o700 }).catch((error) => { if (error?.code !== 'EEXIST') throw error; });
  let realBase;
  try { realBase = await io.realpath(stateBase); } catch (error) {
    if (error?.code === 'ENOENT') realBase = stateBase;
    else throw error;
  }
  if (!inside(realStateRoot, realBase)) throw new Error('state');
  const stateDirParent = dirname(stateDir);
  if (stateDirParent !== stateBase) {
    let realParent;
    try { realParent = await io.realpath(stateDirParent); } catch (error) {
      if (error?.code === 'ENOENT') throw new Error('state');
      throw error;
    }
    if (!inside(realBase, realParent)) throw new Error('state');
  }
  try { await io.mkdir(stateDir, { recursive: false, mode: 0o700 }); } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('state');
    throw error;
  }
  try {
    const target = await io.lstat(stateDir);
    if (!target.isDirectory() || target.isSymbolicLink()) throw new Error('state');
  } catch (error) {
    if (error?.message === 'state') throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  let realDir;
  try { realDir = await io.realpath(stateDir); } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('state');
    throw error;
  }
  if (!inside(realBase, realDir)) throw new Error('state');
  return stateDir;
}

export async function runCli(argv, injected = {}) {
  const io = {
    cwd: () => process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
    realpath,
    lstat,
    readFile,
    mkdir,
    createOpenCodeAdapters,
    runObjective,
    objectiveCommitted,
    ...injected
  };
  const command = parse(argv);
  if (command?.help) {
    io.stdout.write(usage);
    return 0;
  }
  if (command?.version) {
    io.stdout.write('0.1.0\n');
    return 0;
  }
  if (!command) {
    io.stderr.write('invalid arguments\n');
    return 2;
  }
  try {
    const requestedRoot = command.root ?? io.cwd();
    if (!isAbsolute(requestedRoot)) throw new Error('root');
    const root = await io.realpath(requestedRoot);
    if (command.resume) return await resume(command, root, io);
    const objective = await loadCommittedJson(root, command.objective, io);
    const stateDir = await createStateDir(root, command.stateDir, io);
    const adapters = io.createOpenCodeAdapters({ root, stateDir, engines: command.engines, timeoutMs: timeoutOf(objective) });
    const result = await io.runObjective(objective, adapters, { stateDir });
    return report(result, io);
  } catch (error) {
    const input = error instanceof SyntaxError || ['root', 'objective', 'state', 'invalid file'].includes(error?.message);
    io.stderr.write(input ? 'invalid input\n' : 'internal error\n');
    return input ? 2 : 3;
  }
}
