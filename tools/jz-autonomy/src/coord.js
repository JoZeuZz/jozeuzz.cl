import * as nativeFs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { acquireController, releaseController } from './controller-lock.js';
import { quotaExhausted } from './engines.js';
import { identify as identifyProcess, sameProcess } from './proc.js';
import { protectedPath, validateObjective } from './runner.js';

// jz-coord: coordinación entre orquestadores pares (Claude Code y OpenCode). El controlador no razona: guarda
// objetivos, tareas, mensajes, resultados, el liderazgo y los checkpoints; arbitra quién escribe (lease); y
// verifica, confirma y publica. Cada motor decide con sus propios subagentes dentro de su turno.

export const goalSchema = 'jz-coord-goal-v1';
export const stateSchema = 'jz-coord-state-v1';
export const protocol = 'jz-coord-v1';
export const ENGINES = ['claude', 'opencode'];
const actionTypes = new Set(['delegate', 'result', 'message', 'progress', 'complete', 'yield', 'blocked']);
const taskId = /^[a-z0-9][a-z0-9._-]{0,40}$/;
const maxText = 4000;
// Tras un fallo el motor no vuelve a liderar hasta retryAt. Cuota: el proveedor no se recupera en minutos.
const cooldownByOutcome = { quota: 30 * 60_000, provider: 5 * 60_000, timeout: 0, 'session-lost': 0, abnormal: 0, protocol: 0 };

function fail(message) {
  throw new TypeError(`Invalid goal: ${message}`);
}

// El objetivo compartido reutiliza las validaciones de jz-autonomy (rutas, plano de control, secretos, checks,
// rama) a través de un objetivo equivalente.
export function validateGoal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('object');
  if (input.schema !== goalSchema) fail('schema');
  if (typeof input.id !== 'string' || !taskId.test(input.id)) fail('id');
  const objective = validateObjective({
    schema: 'jz-autonomy-objective-v1', unit: input.id, objective: input.objective, workspace: '.', branch: input.branch,
    agent: 'jz-implementer', criteria: input.criteria, allowedPaths: input.allowedPaths, checks: input.checks,
    commit: input.commit, push: input.push, timeoutMinutes: input.timeoutMinutes, maxCorrections: 0
  });
  const engines = input.engines ?? ENGINES;
  if (!Array.isArray(engines) || engines.length === 0 || new Set(engines).size !== engines.length || engines.some((e) => !ENGINES.includes(e))) fail('engines');
  if (input.lead !== undefined && !engines.includes(input.lead)) fail('lead');
  const maxTurns = input.maxTurns ?? 10;
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 30) fail('maxTurns');
  const maxCorrections = input.maxCorrections ?? 2;
  if (!Number.isInteger(maxCorrections) || maxCorrections < 0 || maxCorrections > 3) fail('maxCorrections');
  return {
    schema: goalSchema, id: input.id, objective: objective.objective, criteria: objective.criteria, branch: objective.branch,
    allowedPaths: objective.allowedPaths, checks: objective.checks, commit: objective.commit, push: objective.push === true,
    timeoutMinutes: objective.timeoutMinutes ?? 30, engines, lead: input.lead ?? engines[0], maxTurns, maxCorrections
  };
}

function clip(value, max = maxText) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function strings(value, max = 50) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, max).map((item) => clip(item, 500)) : [];
}

function within(path, allowed) {
  return allowed.some((root) => path === root || path.startsWith(`${root.replace(/\/+$/, '')}/`));
}

// Devuelve el objeto JSON balanceado que empieza en text[start] o null.
function balanced(text, start) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

// Respuesta de un turno: la última marca `JZ-COORD` seguida de un objeto {"actions": [...]}.
export function parseReply(text, { goal, role, engine, task } = {}) {
  const source = String(text ?? '');
  const at = source.lastIndexOf('JZ-COORD');
  if (at < 0) return { error: 'missing JZ-COORD reply' };
  const brace = source.indexOf('{', at);
  const raw = brace < 0 ? null : balanced(source, brace);
  let parsed;
  try { parsed = JSON.parse(raw ?? ''); } catch { return { error: 'JZ-COORD reply is not valid JSON' }; }
  if (!parsed || !Array.isArray(parsed.actions) || parsed.actions.length === 0 || parsed.actions.length > 8) return { error: 'JZ-COORD reply needs 1-8 actions' };
  const actions = [];
  for (const action of parsed.actions) {
    const type = action?.type;
    if (!actionTypes.has(type)) return { error: `unknown action ${String(type)}` };
    if (role === 'delegate' && type !== 'result') return { error: `delegate may only reply with result, got ${type}` };
    if (role === 'lead' && type === 'result') return { error: 'lead cannot reply with result' };
    if (type === 'delegate') {
      const t = action.task ?? {};
      const to = action.to;
      if (!ENGINES.includes(to) || to === engine || (goal && !goal.engines.includes(to))) return { error: 'delegate target must be a peer engine' };
      if (typeof t.id !== 'string' || !taskId.test(t.id)) return { error: 'delegate task id' };
      const kind = t.kind === 'read' ? 'read' : 'write';
      const allowedPaths = t.allowedPaths === undefined ? goal?.allowedPaths ?? [] : strings(t.allowedPaths);
      if (goal && allowedPaths.some((path) => !within(path, goal.allowedPaths) || protectedPath(path))) return { error: 'delegate allowedPaths outside the goal' };
      if (!clip(t.instructions)) return { error: 'delegate instructions' };
      actions.push({ type, to, task: { id: t.id, title: clip(t.title, 200) || t.id, instructions: clip(t.instructions), kind, allowedPaths } });
    } else if (type === 'result') {
      const status = ['done', 'failed', 'blocked'].includes(action.status) ? action.status : null;
      if (!status) return { error: 'result status' };
      if (task && action.task !== task.id) return { error: 'result for another task' };
      actions.push({ type, task: clip(action.task, 41), status, summary: clip(action.summary), paths: strings(action.paths), evidence: strings(action.evidence) });
    } else if (type === 'message' || type === 'yield') {
      if (!ENGINES.includes(action.to) || action.to === engine) return { error: `${type} target must be a peer engine` };
      actions.push({ type, to: action.to, ...(type === 'message' ? { body: clip(action.body) } : { reason: clip(action.reason, 500) }) });
    } else {
      actions.push({ type, ...(type === 'progress' ? { note: clip(action.note) } : type === 'complete' ? { summary: clip(action.summary) } : { reason: clip(action.reason, 500) }) });
    }
  }
  return { actions };
}

const PROVIDER = /\b5\d\d\b|internal server error|service unavailable|api error|provider error|bad gateway|ECONNRESET|ETIMEDOUT|ENOTFOUND|network error|fetch failed|socket hang up/i;

// Clasifica el final de un turno. Sólo `ok` transfiere resultados; el resto deja el motor fuera de servicio.
export function classifyTurn(out) {
  const text = `${out?.text ?? ''}\n${out?.tail ?? ''}`;
  const failed = out?.rc !== 0 || out?.failed === true;
  if (out?.simulated) return out.simulated;
  if ((failed || !out?.text) && quotaExhausted(text)) return 'quota';
  if (out?.timedOut) return 'timeout';
  if (failed && PROVIDER.test(text)) return 'provider';
  if (out?.signal || (Number.isInteger(out?.rc) && out.rc >= 128)) return 'session-lost';
  if (failed) return 'abnormal';
  if (!out?.text) return 'session-lost';
  return 'ok';
}

function rules(role) {
  const common = [
    'You are one of two peer orchestrators (Claude Code and OpenCode) coordinated by jz-coord. Decide with your own native jz-* subagents: jz-implementer writes (one writer at a time), jz-explorer/jz-qa/jz-security read.',
    'jz-coord keeps the shared state, runs the goal checks, commits through GitOps and pushes. Never commit, push or run jz-checkpoint yourself.',
    'Change files only inside allowedPaths. Never repeat finished work blindly: inspect git status and git diff first, especially after a transfer.',
    'The turn has a hard time budget (budgetMinutes); when it runs out your process is killed and the turn is lost. Reply well before it.',
    'Keep reviews proportional to risk: run jz-security or jz-qa only for sensitive or non-trivial changes and say why you skipped them; jz-coord re-runs the goal checks before committing anyway.',
    'End your final message with exactly one line: JZ-COORD {"actions":[...]} (valid JSON, no code fence).'
  ];
  if (role === 'delegate') {
    return [...common, 'You are executing a task delegated by the peer orchestrator. Do only that task. Reply with one action: {"type":"result","task":"<id>","status":"done|failed|blocked","summary":"...","paths":[...],"evidence":[...]}.'];
  }
  return [...common,
    'You lead this goal. Actions: {"type":"progress","note":"..."} ends the turn with partial work (you get another turn); {"type":"delegate","to":"<peer>","task":{"id":"...","title":"...","instructions":"...","kind":"write|read","allowedPaths":[...]}} sends a task to the peer engine, whose structured result arrives in your inbox next turn; {"type":"message","to":"<peer>","body":"..."}; {"type":"yield","to":"<peer>","reason":"..."} hands leadership over; {"type":"complete","summary":"..."} asks jz-coord to verify the checks and commit; {"type":"blocked","reason":"..."} stops the goal.',
    'Work in small steps: at most one implementation task per turn, then end with progress, delegate or complete.'
  ];
}

export function buildTurnPrompt({ state, engine, role, task = null, mail = [], now = Date.now() }) {
  const { goal } = state;
  const last = state.checkpoints.at(-1) ?? null;
  return JSON.stringify({
    protocol, role, engine,
    peers: goal.engines.filter((name) => name !== engine).map((name) => ({ engine: name, status: available(state, name, now) ? 'available' : 'down' })),
    goal: { id: goal.id, objective: goal.objective, criteria: goal.criteria, branch: goal.branch, allowedPaths: goal.allowedPaths, checks: goal.checks },
    turn: state.turns.length + 1, maxTurns: goal.maxTurns, budgetMinutes: goal.timeoutMinutes,
    leadership: { leader: state.leader, history: state.leadership.slice(-5) },
    ...(task ? { task: { id: task.id, from: task.from, title: task.title, instructions: task.instructions, kind: task.kind, allowedPaths: task.allowedPaths } } : {}),
    inbox: mail.map(({ id, from, kind, body, task: t, status, summary, paths, evidence, reason, checkpoint, failures }) => ({ id, from, kind, body, task: t, status, summary, paths, evidence, reason, checkpoint, failures })),
    tasks: Object.values(state.tasks).map(({ id, from, to, status, title, result }) => ({ id, from, to, status, title, result: result ? { status: result.status, summary: result.summary, paths: result.paths } : null })),
    checkpoint: last ? { n: last.n, reason: last.reason, head: last.head, tree: last.tree, paths: last.paths } : null,
    rules: rules(role)
  });
}

function available(state, engine, now) {
  const health = state.engines[engine];
  return Boolean(health) && (health.status === 'available' || (Number.isFinite(health.retryAt) && health.retryAt <= now));
}

function requiredAdapters(adapters) {
  for (const name of ['preflight', 'runTurn', 'terminated', 'kill', 'writer', 'snapshot', 'restore', 'compare', 'inspectChanges', 'runCheck', 'fingerprint', 'acquire', 'release', 'commit', 'checkpoint']) {
    if (typeof adapters?.[name] !== 'function') throw new TypeError(`Missing adapter: ${name}`);
  }
}

// Fallos simulados (`quota:claude@2`): el turno n de ese motor termina como si el proveedor no tuviera cuota.
// Con `+Ns` el motor real se lanza y se mata a los N segundos, a mitad de trabajo.
export function parseSimulate(spec) {
  if (!spec) return [];
  return String(spec).split(',').map((item) => {
    const match = item.trim().match(/^(quota|provider|session-lost):(claude|opencode)@(\d{1,2})(?:\+(\d{1,4})s)?$/);
    if (!match) throw new TypeError(`Invalid simulate: ${item}`);
    return { kind: match[1], engine: match[2], turn: Number(match[3]), afterMs: match[4] ? Number(match[4]) * 1000 : 0 };
  });
}

export async function runGoal(input, adapters, options = {}) {
  const goal = validateGoal(input);
  requiredAdapters(adapters);
  if (typeof options.stateDir !== 'string' || !options.stateDir) throw new TypeError('Missing options.stateDir');
  const given = options.resume ?? null;
  if (given && (given.schema !== stateSchema || given.goal?.id !== goal.id || typeof given.runId !== 'string')) throw new TypeError('Invalid resume state');
  const fs = { ...nativeFs, ...options.fs };
  const clock = typeof options.now === 'function' ? options.now : () => Date.now();
  const identify = typeof options.id === 'function' ? options.id : randomUUID;

  // Un solo controlador por state-dir: el resto se rechaza sin escribir nada.
  await fs.mkdir(options.stateDir, { recursive: true });
  const control = options.controller ?? { self: identifyProcess(process.pid), alive: sameProcess };
  const self = control.self ? { ...control.self, token: identify() } : null;
  const held = await acquireController(options.stateDir, { self, alive: control.alive, fs, at: new Date(clock()).toISOString() });
  if (!held.ok) return { status: 'blocked', reason: held.reason, runId: given?.runId ?? null, controller: 'refused', paths: { state: join(options.stateDir, 'state.json'), events: join(options.stateDir, 'events.jsonl') } };
  const io = { fs, held, queue: Promise.resolve() };
  try {
    return await drive(goal, adapters, options, io);
  } finally {
    await io.queue;
    await releaseController(options.stateDir, self, fs);
  }
}

async function drive(goal, adapters, options, io) {
  const { fs, held } = io;
  const clock = typeof options.now === 'function' ? options.now : () => Date.now();
  const identify = typeof options.id === 'function' ? options.id : randomUUID;
  const simulate = options.simulate ?? [];
  const cooldowns = { ...cooldownByOutcome, ...(Number.isInteger(options.cooldownMs) ? Object.fromEntries(Object.keys(cooldownByOutcome).map((k) => [k, Math.min(cooldownByOutcome[k], options.cooldownMs)])) : {}) };
  const timeoutMs = goal.timeoutMinutes * 60_000;
  const leaseGraceMs = options.leaseGraceMs ?? 60_000;
  const paths = { state: join(options.stateDir, 'state.json'), events: join(options.stateDir, 'events.jsonl') };
  // El estado que vale es el del disco leído con el bloqueo tomado, no la copia que el llamador leyó antes.
  const given = options.resume ?? null;
  let prior = given;
  if (given) {
    let disk = null;
    try { disk = JSON.parse(await fs.readFile(paths.state, 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw new TypeError('Invalid resume state'); }
    if (disk && disk.runId !== given.runId) throw new TypeError('Invalid resume state');
    prior = disk ?? given;
  }
  const order = prior ? prior.goal.engines : options.engines ?? goal.engines;
  const iso = () => new Date(clock()).toISOString();

  const state = prior ?? {
    schema: stateSchema, runId: identify(), goal: { ...goal, engines: order, lead: order.includes(goal.lead) ? goal.lead : order[0] }, status: 'running', reason: null,
    engines: Object.fromEntries(order.map((name) => [name, { status: 'available', reason: null, retryAt: null, failures: 0 }])),
    leader: order.includes(goal.lead) ? goal.lead : order[0], leadership: [], lease: null, inflight: null,
    turns: [], tasks: {}, mail: [], checkpoints: [], corrections: 0, protocolErrors: 0, commit: null, push: null,
    simulated: simulate, events: []
  };
  if (prior) state.simulated = simulate.length ? simulate : prior.simulated ?? [];
  // Al reanudar, --cooldown-minutes acorta la espera de los motores caídos (p. ej. la cuota ya se repuso).
  if (prior && Number.isInteger(options.cooldownMs)) {
    for (const health of Object.values(state.engines)) {
      if (health.status === 'down' && Number.isFinite(health.downAt)) health.retryAt = Math.min(health.retryAt, health.downAt + options.cooldownMs);
    }
  }
  let writes = 0;

  // Escrituras en serie (una escritura lenta nunca pisa un estado posterior) y duraderas: temporal
  // sincronizado, rename atómico y sincronización del directorio. state.json es la fuente de verdad;
  // events.jsonl es su copia legible, que se escribe después y se repara al reanudar.
  function enqueue(work) {
    const run = io.queue.then(work);
    io.queue = run.catch(() => {});
    return run;
  }
  async function durable(target, data) {
    const temp = join(options.stateDir, `.state-${identify()}-${writes++}.tmp`);
    const handle = await fs.open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, target);
    try {
      const dir = await fs.open(options.stateDir, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    } catch {}
  }
  function persist() {
    state.updatedAt = iso();
    const data = `${JSON.stringify(state)}\n`;
    return enqueue(() => durable(paths.state, data));
  }
  async function event(name, detail = {}) {
    const entry = { at: iso(), event: name, leader: state.leader, ...detail };
    state.events.push(entry);
    await persist();
    await enqueue(() => fs.appendFile(paths.events, `${JSON.stringify(entry)}\n`, { mode: 0o600 }));
  }
  // Tras una caída: temporales huérfanos fuera y events.jsonl igual a los eventos de state.json.
  async function recoverFiles() {
    for (const name of await fs.readdir(options.stateDir)) {
      if (/^\.state-.*\.tmp$/.test(name)) await fs.unlink(join(options.stateDir, name)).catch(() => {});
    }
    const expected = state.events.map((e) => `${JSON.stringify(e)}\n`).join('');
    let actual = null;
    try { actual = await fs.readFile(paths.events, 'utf8'); } catch {}
    if (actual === expected) return;
    const had = actual === null ? 0 : actual.split('\n').filter(Boolean).length;
    await enqueue(() => durable(paths.events, expected));
    await event('events-repaired', { had, expected: state.events.length });
  }
  function post(to, message) {
    state.mail.push({ id: `m${state.mail.length + 1}`, at: iso(), to, delivered: false, ...message });
  }
  function mailFor(engine, role) {
    return state.mail.filter((m) => !m.delivered && (m.to === engine || (role === 'lead' && m.to === 'lead')));
  }

  // Checkpoint verificable: árbol git con los cambios sin confirmar, HEAD y rutas. También en jz-checkpoint.
  async function checkpoint(reason, note = '') {
    let snap = null;
    try { snap = await adapters.snapshot({ goal, n: state.checkpoints.length + 1 }); } catch {}
    if (snap?.rc !== 0) {
      await event('checkpoint-failed', { reason });
      return null;
    }
    const entry = { n: state.checkpoints.length + 1, at: iso(), reason, leader: state.leader, head: snap.head, tree: snap.tree, paths: snap.paths ?? [], patch: snap.patch ?? null, note: clip(note, 500) };
    state.checkpoints.push(entry);
    await event('checkpoint', { n: entry.n, reason, head: entry.head, tree: entry.tree, paths: entry.paths });
    return entry;
  }

  async function close(status, reason = null) {
    state.status = status;
    state.reason = reason;
    // El lease y el turno en vuelo sólo se olvidan si su titular terminó: con un titular vivo, el próximo
    // controlador debe seguir viéndolo y no escribir.
    const holder = state.lease ?? state.inflight;
    const gone = !holder || await adapters.terminated(holderOf(holder));
    if (gone) {
      state.inflight = null;
      state.lease = null;
    }
    const kind = status === 'completed' ? 'incompleto' : /unavailable|no engine/.test(reason ?? '') ? 'cuota' : 'bloqueado';
    let rc = 1;
    try { rc = (await adapters.checkpoint({ goal, kind, next: `jz-coord ${state.runId} ${status}${reason ? ` (${reason})` : ''}; resume: jz-coord resume` }))?.rc ?? 1; } catch {}
    await event('closed', { status, reason, checkpoint: rc, ...(gone ? {} : { leaseKept: { holder: holder.holder ?? holder.engine, pid: holder.pid } }) });
    return summary();
  }
  function holderOf(lease) {
    return { pid: lease.pid ?? null, identity: lease.identity ?? null, token: lease.token ?? null };
  }
  function summary() {
    return { status: state.status, reason: state.reason, runId: state.runId, leader: state.leader, leadership: state.leadership, turns: state.turns.length, tasks: state.tasks, commit: state.commit, push: state.push, checkpoints: state.checkpoints.length, simulated: state.simulated, paths };
  }

  // Lease del escritor: nadie más escribe mientras quien lo tiene siga vivo y dentro de plazo.
  async function leaseHeldByOther() {
    const lease = state.lease;
    if (!lease) return null;
    const alive = !(await adapters.terminated(holderOf(lease)));
    if (!alive) return null;
    if (Date.parse(lease.expiresAt) > clock()) return `lease held by ${lease.holder} (pid ${lease.pid}) until ${lease.expiresAt}`;
    // Vencido: sólo se mata lo que el adaptador demuestra que es del turno; si sobrevive, no se transfiere.
    await adapters.kill(holderOf(lease));
    if (!(await adapters.terminated(holderOf(lease)))) return `expired lease holder ${lease.holder} (pid ${lease.pid}) did not terminate or its identity could not be proven`;
    return null;
  }

  // Comprueba que el escritor anterior terminó y que el árbol es el del último checkpoint antes de entregar el
  // trabajo a otro motor. Si los cambios desaparecieron del árbol, los restaura desde el checkpoint.
  async function verifyHandover() {
    const busy = await leaseHeldByOther();
    if (busy) return busy;
    const writer = await adapters.writer();
    if (writer?.alive) return `worktree writer still active: ${writer.holder ?? 'unknown'}`;
    return verifyTree();
  }

  // El árbol debe ser el del último checkpoint. Se restaura sólo una pérdida pura: cada ruta distinta estaba
  // cambiada en el checkpoint y hoy vuelve a ser la de HEAD. Cualquier otra diferencia es trabajo ajeno o
  // divergente: se bloquea sin tocar nada.
  async function verifyTree() {
    const last = state.checkpoints.at(-1);
    if (!last) return null;
    let now = null;
    try { now = await adapters.snapshot({ goal, n: 0 }); } catch {}
    if (now?.rc !== 0) return 'snapshot failed';
    if (now.tree === last.tree && now.head === last.head) return null;
    if (now.head !== last.head) return `worktree changed since checkpoint ${last.n} (HEAD moved)`;
    let diff = null;
    try { diff = await adapters.compare({ from: last.tree, to: now.tree }); } catch {}
    const differing = diff?.rc === 0 ? diff.paths : [];
    if (differing.length && differing.every((p) => last.paths.includes(p) && !now.paths.includes(p))) {
      const restored = await adapters.restore({ tree: last.tree, head: last.head, paths: differing });
      let again = null;
      try { again = await adapters.snapshot({ goal, n: 0 }); } catch {}
      if (restored?.rc === 0 && again?.rc === 0 && again.tree === last.tree) {
        await event('restored', { n: last.n, tree: last.tree, paths: differing });
        return null;
      }
      return 'restore from checkpoint failed';
    }
    return `worktree changed since checkpoint ${last.n}: ${differing.join(', ') || 'unknown paths'}`;
  }

  async function setLeader(engine, reason, from = state.leader) {
    if (engine === state.leader && state.leadership.length > 0) return;
    state.leadership.push({ engine, from: state.leadership.length ? from : null, at: iso(), reason });
    state.leader = engine;
    await event('leader', { engine, from, reason });
  }

  async function markDown(engine, outcome, detail) {
    const health = state.engines[engine];
    health.status = 'down';
    health.reason = outcome;
    health.failures += 1;
    health.downAt = clock();
    health.retryAt = health.downAt + cooldowns[outcome];
    await event('engine-down', { engine, outcome, retryAt: new Date(health.retryAt).toISOString(), detail: clip(detail ?? '', 300) });
  }

  function pickLeader(failed) {
    const now = clock();
    if (!failed && available(state, state.leader, now)) return state.leader;
    const candidates = order.filter((name) => available(state, name, now));
    return candidates.find((name) => name !== failed) ?? candidates[0] ?? null;
  }

  async function turn(engine, role, task = null) {
    const n = state.turns.length + 1;
    const fault = state.simulated.find((f) => f.engine === engine && f.turn === n && !f.used);
    const mail = mailFor(engine, role);
    const prompt = buildTurnPrompt({ state, engine, role, task, mail, now: clock() });
    const expiresAt = new Date(clock() + timeoutMs + leaseGraceMs).toISOString();
    // El token va al entorno del motor antes de lanzarlo: identifica al titular aunque el pid no llegue a
    // registrarse (caída del controlador justo después del spawn).
    const token = identify();
    state.lease = { holder: engine, turn: n, token, pid: null, identity: null, acquiredAt: iso(), expiresAt };
    state.inflight = { n, engine, role, task: task?.id ?? null, pid: null, identity: null, token, startedAt: iso() };
    await event('turn-start', { n, engine, role, task: task?.id ?? null, mail: mail.map((m) => m.id), simulated: fault ? fault.kind : undefined });
    let out;
    try {
      out = await adapters.runTurn({ engine, role, prompt, n, timeoutMs, fault, token, onSpawn: (pid, identity = null) => {
        state.lease.pid = pid;
        state.lease.identity = identity;
        state.inflight.pid = pid;
        state.inflight.identity = identity;
        persist().catch(() => {});
      } });
    } catch (error) {
      out = { rc: 1, text: '', tail: error instanceof Error ? error.message : 'turn adapter failed' };
    }
    if (fault) { fault.used = true; out = { ...out, simulated: fault.kind }; }
    // El grupo de procesos del motor debe haber terminado antes de soltar el lease.
    const pid = out?.pid ?? state.inflight.pid;
    const holder = { pid, identity: state.inflight.identity, token };
    let terminated = await adapters.terminated(holder);
    if (!terminated) {
      await adapters.kill(holder);
      terminated = await adapters.terminated(holder);
    }
    const outcome = classifyTurn(out);
    const reply = outcome === 'ok' ? parseReply(out.text, { goal, role, engine, task }) : null;
    const record = { n, engine, role, task: task?.id ?? null, outcome: reply?.error ? 'protocol' : outcome, error: reply?.error ?? null, rc: out?.rc ?? null, pid: pid ?? null, terminated, simulated: Boolean(fault), startedAt: state.inflight.startedAt, endedAt: iso(), actions: reply?.actions ?? [] };
    state.turns.push(record);
    state.inflight = null;
    if (terminated) state.lease = null;
    if (record.outcome === 'ok') for (const m of mail) m.delivered = true;
    await event('turn-end', { n, engine, role, outcome: record.outcome, error: record.error, terminated, simulated: record.simulated, actions: record.actions.map((a) => a.type) });
    if (!terminated) return { ...record, fatal: `engine ${engine} process ${pid} did not terminate` };
    if (!(await checkpoint(`after turn ${n} (${engine} ${role}: ${record.outcome})`))) return { ...record, fatal: `checkpoint failed after turn ${n}` };
    // Cualquier turno, termine como termine, sólo puede dejar cambios dentro de la meta.
    const changed = await adapters.inspectChanges({ goal });
    const outside = (changed?.paths ?? []).filter((p) => !within(p, goal.allowedPaths) || protectedPath(p));
    if (outside.length) return { ...record, fatal: `${engine} ${role} turn changed paths outside the goal: ${outside.join(', ')}` };
    return record;
  }

  async function delegate(action) {
    const { task: t, to } = action;
    if (state.tasks[t.id] && ['done', 'failed', 'blocked'].includes(state.tasks[t.id].status)) {
      post(state.leader, { from: 'jz-coord', kind: 'result', task: t.id, status: state.tasks[t.id].status, summary: `task ${t.id} already finished; reusing its result`, paths: state.tasks[t.id].result?.paths ?? [] });
      return null;
    }
    const task = { ...t, from: state.leader, to, status: 'running', result: null, attempts: (state.tasks[t.id]?.attempts ?? 0) + 1 };
    state.tasks[t.id] = task;
    await event('delegate', { task: t.id, from: task.from, to, kind: t.kind });
    if (!available(state, to, clock())) {
      task.status = 'failed';
      task.result = { status: 'failed', summary: `${to} unavailable (${state.engines[to]?.reason})`, paths: [], evidence: [] };
      post(task.from, { from: 'jz-coord', kind: 'result', task: t.id, status: 'failed', summary: task.result.summary });
      return null;
    }
    const record = await turn(to, 'delegate', task);
    if (record.fatal) return record.fatal;
    if (record.outcome !== 'ok') {
      if (record.outcome !== 'protocol') await markDown(to, record.outcome, record.error);
      // El trabajo que el delegado dejó sin confirmar sigue en el árbol: el líder debe saberlo para no rehacerlo.
      const left = state.checkpoints.at(-1)?.paths ?? [];
      task.status = 'failed';
      task.result = { status: 'failed', summary: `delegate turn ended ${record.outcome}${record.error ? `: ${record.error}` : ''}${left.length ? `; uncommitted changes now in the worktree: ${left.join(', ')} (inspect before redoing)` : ''}`, paths: left, evidence: [] };
    } else {
      const result = record.actions[0];
      task.status = result.status;
      task.result = result;
    }
    post(task.from, { from: to, kind: 'result', task: t.id, status: task.status, summary: task.result.summary, paths: task.result.paths, evidence: task.result.evidence });
    await event('result', { task: t.id, from: to, status: task.status });
    return null;
  }

  // Verificación y commit del controlador con el bloqueo de escritor del worktree tomado.
  async function complete() {
    const lock = await adapters.acquire({ runId: state.runId });
    if (lock?.rc !== 0) return { blocked: `writer lock: ${lock?.reason ?? 'busy'}` };
    try {
      const changed = await adapters.inspectChanges({ goal });
      const list = changed?.paths ?? [];
      const outside = list.filter((p) => !within(p, goal.allowedPaths) || protectedPath(p));
      if (outside.length) return { blocked: `paths outside the goal: ${outside.join(', ')}` };
      const before = await adapters.fingerprint({ goal });
      const failures = [];
      for (const check of goal.checks) {
        const out = await adapters.runCheck({ check, goal });
        await event('check', { id: check.id, rc: out?.rc ?? 1 });
        if (out?.rc !== 0) failures.push({ id: check.id, argv: check.argv, rc: out?.rc ?? 1, log: clip(out?.log ?? '', 500) });
      }
      if (failures.length) return { failures };
      const after = await adapters.fingerprint({ goal });
      if (before?.rc !== 0 || after?.rc !== 0 || before.fingerprint !== after.fingerprint) return { blocked: 'tree changed during verification' };
      // Marca previa al commit: una caída a partir de aquí se reanuda en esta verificación, no en otro turno.
      const op = `${goal.id}:${state.runId}:commit`;
      state.committing = { op, at: iso() };
      await event('committing', { op });
      const commit = await adapters.commit({ goal, op });
      state.commit = { rc: commit?.rc ?? 1, head: commit?.head ?? '', reused: Boolean(commit?.reused), evidence: clip(commit?.evidence ?? '', 300) };
      state.committing = null;
      await event('commit', state.commit);
      if (state.commit.rc !== 0) return { blocked: 'commit failed' };
      const left = ((await adapters.inspectChanges({ goal }))?.paths ?? []);
      if (left.length) return { blocked: `uncommitted changes remain after commit: ${left.join(', ')}` };
      return goal.push ? publish() : { done: true };
    } finally {
      await adapters.release({ runId: state.runId });
    }
  }

  // Push idempotente (jz-git no repite un push ya hecho): se reintenta solo al reanudar.
  async function publish() {
    const pushed = typeof adapters.push === 'function' ? await adapters.push({ goal }) : { rc: 78 };
    state.push = { rc: pushed?.rc ?? 1, remoteSha: pushed?.remoteSha ?? '', evidence: clip(pushed?.evidence ?? '', 300) };
    await event('push', state.push);
    if (state.push.rc !== 0) return { blocked: state.push.rc === 77 ? 'push not authorized' : 'push failed' };
    if (state.push.remoteSha !== state.commit.head) return { blocked: 'remote SHA mismatch' };
    return { done: true };
  }

  // Resultado de complete(): cierra el run o devuelve los fallos de los checks al líder (null = seguir).
  async function settle(result) {
    if (result.done) return close('completed');
    if (result.blocked) return close('blocked', result.blocked);
    state.corrections += 1;
    if (state.corrections > goal.maxCorrections) return close('failed', 'checks failed');
    post('lead', { from: 'jz-coord', kind: 'failures', failures: result.failures, body: 'Checks failed; fix the failures and complete again.' });
    await event('correction', { n: state.corrections, failures: result.failures.map((f) => f.id) });
    return null;
  }

  if (prior) {
    if (state.status === 'completed') return summary();
    state.status = 'running';
    state.reason = null;
    await recoverFiles();
    await event('resumed', { turns: state.turns.length });
    if (held.recovered) await event('controller-recovered', { holder: { pid: held.recovered.pid, start: held.recovered.start, boot: held.recovered.boot ?? null, at: held.recovered.at ?? null } });
    // Turno interrumpido por la caída del controlador: no se repite a ciegas.
    if (state.inflight) {
      const busy = await leaseHeldByOther();
      if (busy) return close('blocked', busy);
      const { n, engine, role, task } = state.inflight;
      state.turns.push({ n, engine, role, task, outcome: 'interrupted', error: 'controller stopped during the turn', rc: null, pid: state.inflight.pid, terminated: true, simulated: false, startedAt: state.inflight.startedAt, endedAt: iso(), actions: [] });
      state.inflight = null;
      state.lease = null;
      if (task && state.tasks[task]) state.tasks[task].status = 'interrupted';
      await event('turn-end', { n, engine, role, outcome: 'interrupted', terminated: true });
      if (!(await checkpoint(`interrupted turn ${n} (${engine} ${role})`))) return close('blocked', `checkpoint failed after interrupted turn ${n}`);
      post('lead', { from: 'jz-coord', kind: 'info', body: `Turn ${n} (${engine} ${role}${task ? ` for task ${task}` : ''}) was interrupted. Its partial changes are in checkpoint ${state.checkpoints.length}: inspect git status and diff and continue; do not redo finished work blindly.` });
    }
    if (state.commit?.rc === 0) {
      if (!goal.push || state.push?.rc === 0) return close('completed');
      const pushed = await publish();
      return pushed.done ? close('completed') : close('blocked', pushed.blocked);
    }
    if (state.committing) {
      // Caída durante el commit: se repite la verificación (los checks y el commit con el mismo Jz-Op, que
      // jz-git reutiliza si ya existe), sin otro turno de motor. Con HEAD intacto, el árbol se verifica antes.
      const last = state.checkpoints.at(-1);
      let head = null;
      try { head = (await adapters.snapshot({ goal, n: 0 }))?.head ?? null; } catch {}
      if (head === last?.head) {
        const problem = await verifyHandover();
        if (problem) return close('blocked', problem);
      }
      await event('commit-resumed', { op: state.committing.op });
      const closing = await settle(await complete());
      if (closing) return closing;
    } else {
      const problem = await verifyHandover();
      if (problem) return close('blocked', problem);
    }
  } else {
    await event('initialized', { goal: goal.id, engines: order, lead: state.leader, simulated: simulate.map(({ kind, engine, turn: t, afterMs }) => ({ kind, engine, turn: t, afterMs })) });
    const pre = await adapters.preflight({ goal });
    if (pre?.status !== 'clean') return close('blocked', pre?.reason ?? 'preflight blocked');
    state.leadership.push({ engine: state.leader, from: null, at: iso(), reason: 'initial' });
    await event('leader', { engine: state.leader, from: null, reason: 'initial' });
    if (!(await checkpoint('start'))) return close('blocked', 'checkpoint failed at start');
  }

  // Un líder que cayó antes de la interrupción cede el turno a otro motor disponible aunque ya pueda reintentar.
  let failed = state.engines[state.leader]?.status === 'down' ? state.leader : null;
  while (state.status === 'running') {
    if (state.turns.length >= goal.maxTurns) return close('blocked', `maxTurns ${goal.maxTurns} reached`);
    const next = pickLeader(failed);
    if (!next) return close('blocked', 'no engine available');
    if (next !== state.leader || failed) {
      const problem = await verifyHandover();
      if (problem) return close('blocked', problem);
      const from = state.leader;
      if (next !== from) {
        const why = state.engines[from]?.status === 'down' ? `${from} ${state.engines[from].reason}` : 'rebalance';
        await setLeader(next, why, from);
        const last = state.checkpoints.at(-1);
        post('lead', { from: 'jz-coord', kind: 'transfer', reason: `${from} is ${state.engines[from]?.reason ?? 'unavailable'}; you now lead`, checkpoint: last ? { n: last.n, head: last.head, tree: last.tree, paths: last.paths } : null, body: 'Uncommitted changes from the previous leader are in the worktree and verified against the checkpoint tree. Inspect them, keep what is correct and finish the goal.' });
        await persist();
      } else if (failed) {
        const lastTurn = state.turns.at(-1);
        post('lead', { from: 'jz-coord', kind: 'info', body: `Your previous turn ${lastTurn?.n} ended ${lastTurn?.outcome}; no peer is available, so you continue. Its partial changes are in checkpoint ${state.checkpoints.at(-1)?.n}: inspect git status and diff and do not redo finished work. Stay within budgetMinutes.` });
        await persist();
      }
    }
    failed = null;
    const health = state.engines[state.leader];
    if (health.status === 'down') { health.status = 'available'; health.reason = null; await event('engine-up', { engine: state.leader }); }

    const record = await turn(state.leader, 'lead');
    if (record.fatal) return close('blocked', record.fatal);
    if (record.outcome === 'protocol') {
      state.protocolErrors += 1;
      if (state.protocolErrors < 2) {
        post(state.leader, { from: 'jz-coord', kind: 'error', body: `Your last reply was rejected: ${record.error}. End with one JZ-COORD line.` });
        continue;
      }
      state.protocolErrors = 0;
      await markDown(state.leader, 'protocol', record.error);
      failed = state.leader;
      continue;
    }
    if (record.outcome !== 'ok') {
      await markDown(state.leader, record.outcome, record.error);
      failed = state.leader;
      continue;
    }
    state.protocolErrors = 0;
    state.engines[state.leader].failures = 0;
    for (const action of record.actions) {
      if (action.type === 'delegate') {
        const problem = await delegate(action);
        if (problem) return close('blocked', problem);
      } else if (action.type === 'message') {
        post(action.to, { from: state.leader, kind: 'message', body: action.body });
        await event('message', { from: state.leader, to: action.to });
      } else if (action.type === 'yield') {
        if (available(state, action.to, clock())) {
          const problem = await verifyHandover();
          if (problem) return close('blocked', problem);
          const from = state.leader;
          await setLeader(action.to, `yield: ${action.reason}`, from);
          post('lead', { from, kind: 'transfer', reason: `yield from ${from}: ${action.reason}`, checkpoint: state.checkpoints.at(-1) ? { n: state.checkpoints.at(-1).n, head: state.checkpoints.at(-1).head, tree: state.checkpoints.at(-1).tree, paths: state.checkpoints.at(-1).paths } : null });
          await persist();
        } else {
          post(state.leader, { from: 'jz-coord', kind: 'error', body: `${action.to} is unavailable; keep leading` });
        }
        break;
      } else if (action.type === 'blocked') {
        return close('blocked', `leader: ${action.reason}`);
      } else if (action.type === 'complete') {
        const closing = await settle(await complete());
        if (closing) return closing;
        break;
      }
    }
    await persist();
  }
  return summary();
}
