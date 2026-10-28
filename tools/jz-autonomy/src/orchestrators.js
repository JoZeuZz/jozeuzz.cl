import { mkdir, readFile as nativeReadFile, rm, writeFile } from 'node:fs/promises';
import { execFile as nativeExecFile, spawn as nativeSpawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildClaudeEnv, claudeResultFailed, findBinary, runEngineProcess } from './engines.js';
import { buildOpenCodeEnv, createOpenCodeAdapters, openCodeAgentMode } from './opencode.js';
import { bootId, carriesToken, holders, identify, LEASE_ENV, processStart, sameProcess } from './proc.js';

// Adaptadores reales de jz-coord: lanzan Claude Code u OpenCode con su perfil de orquestador (jz-orchestrator),
// que delega en sus propios subagentes jz-*. El resto (checks, inspección, huella, commit, push) reutiliza los
// adaptadores de jz-autonomy.

const ORCHESTRATOR = 'jz-orchestrator';
const FALLBACK = /Falling back to default agent/;
const gitEnv = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' };

export function toObjective(goal) {
  return {
    schema: 'jz-autonomy-objective-v1', unit: goal.id, objective: goal.objective, workspace: '.', branch: goal.branch, agent: 'jz-implementer',
    criteria: goal.criteria, allowedPaths: goal.allowedPaths, checks: goal.checks, commit: goal.commit, push: goal.push, maxCorrections: 0
  };
}

// Texto final del turno. Claude (--output-format json): campo result del último objeto. OpenCode (--format
// json): partes de texto de los eventos, la última que no esté vacía.
export function extractText(engine, stdout) {
  const lines = String(stdout ?? '').split('\n').filter((line) => line.trim().startsWith('{'));
  if (engine === 'claude') {
    for (const line of lines.reverse()) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.type === 'result') return { text: typeof parsed.result === 'string' ? parsed.result : '', failed: claudeResultFailed(line) };
      } catch {}
    }
    return { text: '', failed: true };
  }
  const texts = [];
  let failed = false;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === 'text' && typeof parsed.part?.text === 'string' && parsed.part.text.trim()) texts.push(parsed.part.text);
      if (parsed?.type === 'error') failed = true;
    } catch {}
  }
  return { text: texts.at(-1) ?? '', failed };
}

// Un grupo de procesos terminó si ni el líder ni el grupo responden a la señal 0.
export function groupTerminated(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  for (const target of [-pid, pid]) {
    try {
      kill(target, 0);
      return false;
    } catch (error) {
      if (error?.code === 'EPERM') return false;
    }
  }
  return true;
}

// El titular de un lease terminó si ningún proceso lleva su token y ni él ni su grupo siguen vivos. Con la
// identidad registrada, un pid que hoy es otro proceso (otro starttime) o de otro arranque cuenta como
// terminado: el kernel sólo reutiliza un pid cuando ya no es el pgid de ningún grupo, así que el grupo del
// motor tampoco existe. Si el líder no existe pero su grupo sí, no se puede descartar: sigue vivo.
export function holderTerminated({ pid, identity, token }, kill = process.kill) {
  if (identity?.boot && identity.boot !== bootId()) return true;
  if (holders(token).length) return false;
  if (!Number.isInteger(pid) || pid <= 0) return true;
  if (identity) {
    const start = processStart(pid);
    if (start) return start !== identity.start;
  }
  return groupTerminated(pid, kill);
}

export async function isOrchestrator(pid, readFile = nativeReadFile) {
  try {
    const argv = String(await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
    return argv.includes(ORCHESTRATOR) && argv.includes('--agent');
  } catch {
    return false;
  }
}

export function createCoordAdapters(options) {
  const root = options.root;
  const stateDir = options.stateDir;
  const spawn = options.spawn ?? nativeSpawn;
  const readFile = options.readFile ?? nativeReadFile;
  const execFile = options.execFile ?? ((file, argv, opts) => new Promise((resolve) => {
    const child = nativeExecFile(file, argv, { ...opts, maxBuffer: 64 * 1024 * 1024, encoding: opts.encoding ?? 'utf8' }, (error, stdout, stderr) => resolve({ rc: error ? (Number.isInteger(error.code) ? error.code : 1) : 0, stdout, stderr }));
    if (opts.input !== undefined) child.stdin.end(opts.input);
  }));
  const base = createOpenCodeAdapters({ ...options, execFile: options.execFile });
  const bins = {
    claude: options.claudeBin ?? findBinary('claude', process.env.PATH, [join(process.env.HOME ?? '/root', '.local/bin')]),
    opencode: options.opencodeBin ?? findBinary('opencode', process.env.PATH, [join(process.env.HOME ?? '/root', '.opencode/bin')])
  };
  const git = (args, extra = {}) => execFile('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], { cwd: root, env: { ...gitEnv, ...extra.env, PWD: root }, ...(extra.input !== undefined ? { input: extra.input } : {}), encoding: extra.encoding });
  let policy;
  const loadPolicy = async () => (policy ??= await import(pathToFileURL(join(root, '.jz/policy/policy.mjs')).href));

  async function runTurn({ engine, role, prompt, n, timeoutMs, fault, onSpawn, token }) {
    // Cuota simulada sin lanzar el motor: el turno no llega a empezar.
    if (fault && !fault.afterMs) return { rc: 75, text: '', tail: `simulated ${fault.kind}`, pid: null };
    const bin = bins[engine];
    if (!bin) return { rc: 127, text: '', tail: `${engine} not installed` };
    let args;
    let env;
    if (engine === 'claude') {
      args = ['-p', '--agent', ORCHESTRATOR, '--permission-mode', 'dontAsk', '--output-format', 'json', prompt];
      env = buildClaudeEnv(options.env ?? process.env);
    } else {
      const mode = await openCodeAgentMode(root, ORCHESTRATOR, readFile);
      if (mode !== 'primary' && mode !== 'all') return { rc: 78, text: '', tail: `opencode agent ${ORCHESTRATOR} mode ${mode ?? 'missing'}` };
      args = ['run', '--dir', root, '--agent', ORCHESTRATOR, '--format', 'json', prompt];
      env = buildOpenCodeEnv(options.env ?? process.env);
    }
    if (token) env = { ...env, [LEASE_ENV]: token };
    const stdoutPath = join(stateDir, `turn-${n}-${engine}-${role}.stdout.log`);
    const stderrPath = join(stateDir, `turn-${n}-${engine}-${role}.stderr.log`);
    const out = await runEngineProcess({
      spawn, bin, args, cwd: root, env, stdoutPath, stderrPath,
      // Con un fallo simulado a mitad de turno, el plazo es el del fallo: el motor real muere trabajando.
      timeoutMs: fault?.afterMs || timeoutMs, killGraceMs: options.killGraceMs, setTimer: options.setTimer, clearTimer: options.clearTimer,
      abortOn: engine === 'opencode' ? FALLBACK : null,
      // La identidad se lee en el acto: el hijo aún no se ha recogido, así que su /proc/<pid>/stat es el suyo.
      onSpawn: typeof onSpawn === 'function' ? (pid) => onSpawn(pid, identify(pid)) : null
    });
    // Los streams se vacían al cerrar; el texto completo se lee del log, no del final acotado en memoria.
    await new Promise((resolve) => setTimeout(resolve, 50));
    let stdout = '';
    try { stdout = await readFile(stdoutPath, 'utf8'); } catch {}
    const { text, failed } = extractText(engine, stdout);
    return { ...out, text, failed: failed || out.aborted, stdoutPath };
  }

  // Árbol git con todo el contenido del worktree (sin confirmar incluido) en un índice temporal: no toca el
  // índice real, las ramas ni el árbol de trabajo. El patch queda en el state-dir para restaurar o auditar.
  async function snapshot({ n }) {
    const index = join(stateDir, `.snapshot-${process.pid}-${n}.index`);
    const env = { GIT_INDEX_FILE: index };
    try {
      const head = await git(['rev-parse', 'HEAD']);
      if (head.rc !== 0) return { rc: 1 };
      for (const args of [['read-tree', 'HEAD'], ['add', '-A', '--', '.']]) {
        const out = await git(args, { env });
        if (out.rc !== 0) return { rc: 1 };
      }
      const tree = await git(['write-tree'], { env });
      if (tree.rc !== 0) return { rc: 1 };
      const sha = String(tree.stdout).trim();
      const names = await git(['diff-tree', '-r', '--name-only', '--no-renames', 'HEAD', sha]);
      const out = { rc: 0, head: String(head.stdout).trim(), tree: sha, paths: String(names.stdout).split('\n').filter(Boolean) };
      if (n > 0 && out.paths.length > 0) {
        const patch = await git(['diff-tree', '-p', '--binary', '--no-renames', 'HEAD', sha]);
        await mkdir(join(stateDir, 'checkpoints'), { recursive: true, mode: 0o700 });
        out.patch = join(stateDir, 'checkpoints', `cp-${n}.patch`);
        await writeFile(out.patch, patch.stdout, { mode: 0o600 });
      }
      return out;
    } finally {
      await rm(index, { force: true });
    }
  }

  // Restaura desde el checkpoint sólo las rutas indicadas (las que jz-coord comprobó que sólo perdieron su
  // cambio): el patch HEAD..checkpoint de esas rutas se aplica sobre un árbol que en ellas es igual a HEAD.
  async function restore({ tree, head, paths }) {
    if (!Array.isArray(paths) || paths.length === 0) return { rc: 1 };
    const patch = await git(['diff-tree', '-p', '--binary', '--no-renames', head, tree, '--', ...paths.map((p) => `:(literal)${p}`)]);
    if (patch.rc !== 0 || !String(patch.stdout).trim()) return { rc: 1 };
    const applied = await git(['apply', '--whitespace=nowarn'], { input: patch.stdout });
    return { rc: applied.rc };
  }

  async function compare({ from, to }) {
    const out = await git(['diff-tree', '-r', '--name-only', '--no-renames', from, to]);
    return out.rc === 0 ? { rc: 0, paths: String(out.stdout).split('\n').filter(Boolean) } : { rc: 1, paths: [] };
  }

  return {
    preflight: ({ goal }) => base.preflight({ objective: toObjective(goal) }),
    inspectChanges: ({ goal }) => base.inspectChanges({ objective: toObjective(goal) }),
    runCheck: ({ goal, check }) => base.runCheck({ objective: toObjective(goal), check }),
    fingerprint: ({ goal }) => base.fingerprint({ objective: toObjective(goal) }),
    acquire: ({ runId }) => base.acquire({ objective: { workspace: '.', agent: 'jz-coord', unit: 'jz-coord-verify' }, runId }),
    release: () => base.release(),
    commit: ({ goal, op }) => base.commit({ objective: toObjective(goal), op }),
    push: ({ goal }) => base.push({ objective: toObjective(goal) }),
    async checkpoint({ goal, kind, next }) {
      const out = await execFile(join(root, '.jz/bin/jz-checkpoint'), ['--unit', goal.id, '--state', kind, '--next', next], { cwd: root, env: { ...gitEnv, JZ_ENGINE: 'jz-coord', PWD: root } });
      return { rc: out.rc };
    },
    runTurn,
    terminated: async (holder) => holderTerminated(holder),
    // Sólo se mata lo que se demuestra del turno: el líder con su identidad (starttime y boot) y el token del
    // lease en su entorno, todo su grupo; y cualquier proceso que lleve el token. Un pid reciclado no se toca.
    async kill({ pid, identity, token }) {
      const targets = holders(token).map((h) => h.pid);
      const leader = Number.isInteger(pid) && pid > 0 && identity && sameProcess(identity) && carriesToken(pid, token) && await isOrchestrator(pid, readFile);
      if (leader) { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} } }
      for (const target of targets) { try { process.kill(target, 'SIGKILL'); } catch {} }
      if (leader || targets.length) await new Promise((resolve) => setTimeout(resolve, 200));
    },
    async writer() {
      const p = await loadPolicy();
      const cur = p.readLock(root);
      return { held: Boolean(cur), alive: Boolean(cur) && p.pidAlive(cur.pid), holder: cur ? `${cur.agent} (${cur.engine}, pid ${cur.pid})` : null };
    },
    snapshot,
    restore,
    compare
  };
}
