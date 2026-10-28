// Controlador jz-coord en un proceso propio para test/coord-real.test.js:
//   node coord-child.mjs <root> <stateDir> lead|resume <claudeBin> [policyFile]
// Usa runGoal y los adaptadores reales de procesos, snapshot y restauración (orchestrators.js), y jz-git real
// para commit y push. Sustituye sólo lo que necesita el plano de control instalado (jz-run, jz-state,
// jz-checkpoint, bloqueo de escritor). JZ_TEST_CRASH=after-commit|after-push mata el controlador (SIGKILL)
// justo después de esa operación, antes de registrarla.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runGoal } from '../../src/coord.js';
import { createCoordAdapters } from '../../src/orchestrators.js';
import { commit as gitCommit, push as gitPush } from '../../../jz-gitops/jz-git.mjs';

const [root, stateDir, mode, claudeBin, policyFile] = process.argv.slice(2);
const crash = process.env.JZ_TEST_CRASH ?? '';
const git = (args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const status = () => git(['status', '--porcelain', '-uall', '--no-renames']).stdout.split('\n').filter(Boolean).map((line) => line.slice(3));
const gitopsResult = (run) => {
  try { return { rc: 0, ...run() }; } catch (error) { return { rc: error?.code ?? 1, evidence: error?.message ?? 'jz-git' }; }
};

const real = createCoordAdapters({ root, stateDir, claudeBin, killGraceMs: 500 });
const adapters = {
  ...real,
  preflight: async () => ({ status: status().length ? 'blocked' : 'clean' }),
  inspectChanges: async () => ({ paths: status() }),
  runCheck: async ({ check }) => ({ rc: spawnSync(check.argv[0], check.argv.slice(1), { cwd: root }).status ?? 1, log: '' }),
  fingerprint: async () => { const snap = await real.snapshot({ n: 0 }); return { rc: snap.rc, fingerprint: snap.tree }; },
  acquire: async () => ({ rc: 0 }),
  release: async () => {},
  writer: async () => ({ alive: false }),
  checkpoint: async () => ({ rc: 0 }),
  async commit({ goal, op }) {
    const out = gitopsResult(() => gitCommit({ repo: root, branch: goal.branch, message: goal.commit.message, paths: goal.allowedPaths, op }, { PATH: process.env.PATH, HOME: process.env.HOME ?? '/' }));
    if (crash === 'after-commit') process.kill(process.pid, 'SIGKILL');
    return out;
  },
  async push({ goal }) {
    const out = gitopsResult(() => gitPush({ repo: root, branch: goal.branch, policyFile }, { PATH: process.env.PATH, HOME: process.env.HOME ?? '/' }));
    if (crash === 'after-push') process.kill(process.pid, 'SIGKILL');
    return out;
  }
};

const goal = JSON.parse(readFileSync(join(root, 'goal.json'), 'utf8'));
const resume = mode === 'resume' ? JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf8')) : undefined;
const result = await runGoal(goal, adapters, { stateDir, resume });
process.stdout.write(`${JSON.stringify({ status: result.status, reason: result.reason })}\n`);
process.exitCode = result.status === 'completed' ? 0 : 2;
