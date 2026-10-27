import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createOpenCodeAdapters } from './opencode.js';
import { runObjective } from './runner.js';

const maxObjectiveBytes = 64 * 1024;
const usage = 'usage: jz-autonomy run --objective <file> --state-dir <dir> [--root <absolute>]\n';

function inside(base, target) {
  const path = relative(base, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function parse(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  if (argv.length === 1 && argv[0] === '--version') return { version: true };
  if (argv[0] !== 'run') return null;
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--objective', '--state-dir', '--root'].includes(key) || !value || values[key]) return null;
    values[key] = value;
  }
  return values['--objective'] && values['--state-dir'] ? { objective: values['--objective'], stateDir: values['--state-dir'], root: values['--root'] } : null;
}

async function regular(path, io) {
  const info = await io.lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('invalid file');
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
    if (isAbsolute(command.objective)) throw new Error('objective');
    const objectivePath = resolve(root, command.objective);
    if (!inside(root, objectivePath)) throw new Error('objective');
    await regular(objectivePath, io);
    const objectiveReal = await io.realpath(objectivePath);
    if (!inside(root, objectiveReal)) throw new Error('objective');
    const raw = await io.readFile(objectiveReal);
    if (raw.byteLength > maxObjectiveBytes) throw new Error('objective');
    let objective;
    try { objective = JSON.parse(raw.toString('utf8')); } catch { throw new Error('objective'); }
    if (!objective || typeof objective !== 'object' || Array.isArray(objective)) throw new Error('objective');

    if (isAbsolute(command.stateDir) || command.stateDir === '.') throw new Error('state');
    const stateRoot = join(root, '.jz-state');
    const stateBase = join(stateRoot, 'autonomy');
    const stateDir = resolve(stateBase, command.stateDir);
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

    const adapters = io.createOpenCodeAdapters({ root, stateDir });
    const result = await io.runObjective(objective, adapters, { stateDir });
    const final = { result: result.result, corrections: result.corrections, checks: result.checks, commit: result.commit, paths: result.paths };
    io.stdout.write(`${JSON.stringify(final)}\n`);
    return result.result === 'completed' ? 0 : result.result === 'failed' ? 1 : 2;
  } catch (error) {
    const input = error instanceof SyntaxError || ['root', 'objective', 'state', 'invalid file'].includes(error?.message);
    io.stderr.write(input ? 'invalid input\n' : 'internal error\n');
    return input ? 2 : 3;
  }
}
