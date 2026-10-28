import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { createStateDir, loadCommittedJson, objectiveCommitted, openStateDir } from './cli.js';
import { parseSimulate, runGoal } from './coord.js';
import { createCoordAdapters } from './orchestrators.js';

const usage = 'usage: jz-coord lead --goal <file> --state-dir <dir> [--root <absolute>] [--engines claude,opencode] [--simulate kind:engine@turn[+Ns],...] [--cooldown-minutes N]\n'
  + '       jz-coord resume --state-dir <dir> [--root <absolute>] [--cooldown-minutes N]\n'
  + '       jz-coord status --state-dir <dir> [--root <absolute>]\n';
const flags = {
  lead: ['--goal', '--state-dir', '--root', '--engines', '--simulate', '--cooldown-minutes'],
  resume: ['--state-dir', '--root', '--cooldown-minutes'],
  status: ['--state-dir', '--root']
};

function parse(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  const allowed = flags[argv[0]];
  if (!allowed) return null;
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.includes(key) || !value || values[key]) return null;
    values[key] = value;
  }
  if (!values['--state-dir'] || (argv[0] === 'lead' && !values['--goal'])) return null;
  let engines;
  if (values['--engines']) {
    engines = values['--engines'].split(',');
    if (engines.some((name) => !['claude', 'opencode'].includes(name)) || new Set(engines).size !== engines.length) return null;
  }
  let cooldownMs;
  if (values['--cooldown-minutes']) {
    if (!/^\d{1,3}$/.test(values['--cooldown-minutes'])) return null;
    cooldownMs = Number(values['--cooldown-minutes']) * 60_000;
  }
  let simulate = [];
  try { simulate = parseSimulate(values['--simulate']); } catch { return null; }
  return { command: argv[0], goal: values['--goal'], stateDir: values['--state-dir'], root: values['--root'], engines, simulate, cooldownMs };
}

function report(result, io) {
  io.stdout.write(`${JSON.stringify(result)}\n`);
  return result.status === 'completed' ? 0 : result.status === 'failed' ? 1 : 2;
}

// Resumen legible del estado compartido: liderazgo, turnos, tareas, checkpoints y commit.
export function formatStatus(state) {
  const lines = [`goal ${state.goal.id} run ${state.runId}: ${state.status}${state.reason ? ` (${state.reason})` : ''}`];
  lines.push(`leader ${state.leader}; leadership ${state.leadership.map((l) => `${l.engine}[${l.reason}]`).join(' -> ')}`);
  for (const [name, health] of Object.entries(state.engines)) lines.push(`engine ${name}: ${health.status}${health.reason ? ` (${health.reason}, retry ${health.retryAt ? new Date(health.retryAt).toISOString() : '-'})` : ''}`);
  for (const t of state.turns) lines.push(`turn ${t.n} ${t.engine} ${t.role}${t.task ? `:${t.task}` : ''} ${t.outcome}${t.simulated ? ' [simulated]' : ''} actions=${t.actions.map((a) => a.type).join(',') || '-'}`);
  for (const t of Object.values(state.tasks)) lines.push(`task ${t.id} ${t.from}->${t.to} ${t.status}${t.result?.summary ? `: ${t.result.summary.slice(0, 120)}` : ''}`);
  const cp = state.checkpoints.at(-1);
  if (cp) lines.push(`checkpoint ${cp.n} (${cp.reason}) head ${cp.head.slice(0, 12)} tree ${cp.tree.slice(0, 12)} paths ${cp.paths.join(',') || '-'}`);
  if (state.lease) lines.push(`lease ${state.lease.holder} turn ${state.lease.turn ?? state.lease.token} pid ${state.lease.pid ?? '-'}${state.lease.identity ? ` (start ${state.lease.identity.start})` : ''} until ${state.lease.expiresAt}`);
  if (state.committing) lines.push(`commit pending: ${state.committing.op}`);
  if (state.commit) lines.push(`commit ${state.commit.head?.slice(0, 12) ?? '-'} rc=${state.commit.rc}${state.commit.reused ? ' (reused)' : ''}`);
  return `${lines.join('\n')}\n`;
}

export async function runCoordCli(argv, injected = {}) {
  const io = { cwd: () => process.cwd(), stdout: process.stdout, stderr: process.stderr, realpath, lstat, readFile, mkdir, objectiveCommitted, createCoordAdapters, runGoal, ...injected };
  const command = parse(argv);
  if (command?.help) {
    io.stdout.write(usage);
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
    if (command.command === 'lead') {
      const goal = await loadCommittedJson(root, command.goal, io);
      // jz-state lo crea al primer uso; jz-coord puede ser lo primero que se ejecuta en un worktree nuevo.
      await io.mkdir(join(root, '.jz-state'), { mode: 0o700 }).catch((error) => { if (error?.code !== 'EEXIST') throw error; });
      const stateDir = await createStateDir(root, command.stateDir, io, 'coord');
      const adapters = io.createCoordAdapters({ root, stateDir });
      return report(await io.runGoal(goal, adapters, { stateDir, engines: command.engines, simulate: command.simulate, cooldownMs: command.cooldownMs }), io);
    }
    const { realDir, saved } = await openStateDir(root, command.stateDir, io, 'coord');
    if (command.command === 'status') {
      io.stdout.write(formatStatus(saved));
      return 0;
    }
    const adapters = io.createCoordAdapters({ root, stateDir: realDir });
    return report(await io.runGoal(saved.goal, adapters, { stateDir: realDir, resume: saved, cooldownMs: command.cooldownMs }), io);
  } catch (error) {
    const input = error instanceof SyntaxError || ['root', 'objective', 'state', 'invalid file'].includes(error?.message) || /^Invalid (goal|resume)/.test(error?.message ?? '');
    io.stderr.write(input ? `invalid input${error?.message?.startsWith('Invalid') ? `: ${error.message}` : ''}\n` : `internal error: ${error?.message ?? ''}\n`);
    return input ? 2 : 3;
  }
}
