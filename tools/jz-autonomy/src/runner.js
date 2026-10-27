import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const schema = 'jz-autonomy-objective-v1';
const agents = new Set(['jz-implementer', 'jz-implementer-copilot']);
const engines = new Set(['claude', 'opencode']);
const controlNames = new Set(['.git', '.claude', '.opencode', '.jz', '.jz-state', 'AGENTS.md', 'CLAUDE.md', 'opencode.json', 'opencode.jsonc', '.mcp.json']);

function fail(message) {
  throw new TypeError(`Invalid objective: ${message}`);
}

function hasNul(value) {
  if (typeof value === 'string') return value.includes('\0');
  if (Array.isArray(value)) return value.some(hasNul);
  if (value && typeof value === 'object') return Object.values(value).some(hasNul);
  return false;
}

function isUnsafePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)) return true;
  return value.split(/[\\/]/).some((part) => (
    part === '..' || controlNames.has(part) || part === '.env' || part.startsWith('.env.') ||
    /\.(?:pem|key|p12|pfx)$/i.test(part) || /^id_/i.test(part)
  ));
}

function string(value, name) {
  if (typeof value !== 'string' || !value) fail(name);
}

function redact(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\b(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function checkRecord(check, output) {
  return {
    id: check.id,
    argv: [...check.argv],
    rc: Number.isInteger(output?.rc) ? output.rc : 1,
    log: redact(output?.log ?? ''),
    evidence: redact(output?.evidence ?? '')
  };
}

export function validateObjective(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('object');
  if (hasNul(input)) fail('NUL');
  const value = { ...input, maxCorrections: input.maxCorrections ?? 1, workflow: input.workflow ?? 'standard' };
  if (value.schema !== schema) fail('schema');
  for (const name of ['unit', 'objective', 'workspace', 'branch']) string(value[name], name);
  if (isUnsafePath(value.workspace)) fail('path');
  if (!/^(feat|fix|chore|docs|work)\/.+/.test(value.branch) || ['main', 'master', 'production'].includes(value.branch)) fail('branch');
  if (!agents.has(value.agent)) fail('agent');
  if (!Array.isArray(value.criteria) || value.criteria.length === 0 || value.criteria.some((criterion) => typeof criterion !== 'string')) fail('criteria');
  if (!['standard', 'split-tdd'].includes(value.workflow)) fail('workflow');
  if (!Array.isArray(value.allowedPaths) || value.allowedPaths.length === 0) fail('allowedPaths');
  for (const path of value.allowedPaths) if (isUnsafePath(path)) fail(/\.env|\.pem|\.key|^id_/i.test(path) ? 'secret path' : 'path');
  if (value.workflow === 'split-tdd') {
    if (!Array.isArray(value.testPaths) || value.testPaths.length === 0) fail('testPaths');
    for (const path of value.testPaths) {
      if (isUnsafePath(path) || !value.allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))) fail('testPaths');
    }
  }
  if (!Array.isArray(value.checks) || value.checks.length === 0) fail('checks');
  const ids = new Set();
  for (const check of value.checks) {
    if (!check || typeof check !== 'object') fail('check');
    string(check.id, 'check.id');
    if (ids.has(check.id)) fail('duplicate check id');
    ids.add(check.id);
    if (!Array.isArray(check.argv) || check.argv.length === 0 || check.argv.some((arg) => typeof arg !== 'string' || !arg)) fail('check.argv');
  }
  if (!Number.isInteger(value.maxCorrections) || value.maxCorrections < 0 || value.maxCorrections > 2) fail('maxCorrections');
  if (value.engines !== undefined) {
    if (!Array.isArray(value.engines) || value.engines.length === 0 || new Set(value.engines).size !== value.engines.length
      || value.engines.some((engine) => !engines.has(engine))) fail('engines');
  }
  if (value.push !== undefined && typeof value.push !== 'boolean') fail('push');
  if (value.timeoutMinutes !== undefined && (!Number.isInteger(value.timeoutMinutes) || value.timeoutMinutes < 1 || value.timeoutMinutes > 240)) fail('timeoutMinutes');
  if (!value.commit || typeof value.commit !== 'object') fail('commit');
  string(value.commit.message, 'commit.message');
  return value;
}

function requiredAdapters(adapters) {
  for (const name of ['preflight', 'runAgent', 'inspectChanges', 'runCheck', 'checkpoint']) {
    if (typeof adapters?.[name] !== 'function') throw new TypeError(`Missing adapter: ${name}`);
  }
}

function structuralFailure(failure) {
  return {
    kind: typeof failure?.kind === 'string' ? failure.kind : 'unknown',
    phase: typeof failure?.phase === 'string' ? failure.phase : 'unknown',
    id: typeof failure?.id === 'string' ? failure.id : null,
    argv: Array.isArray(failure?.argv) ? [...failure.argv] : [],
    rc: Number.isInteger(failure?.rc) ? failure.rc : 1,
    log: redact(typeof failure?.log === 'string' ? failure.log : ''),
    evidence: redact(typeof failure?.evidence === 'string' ? failure.evidence : '')
  };
}

// Resultados que se reutilizan al reanudar. Los fallos de preflight, commit y push y las cuotas no se
// memorizan: se reintentan al reanudar.
function memorable(name, output) {
  if (name === 'agent') return !output?.unavailable;
  if (['preflight', 'commit', 'push'].includes(name)) return name === 'preflight' ? output?.status === 'clean' && !output?.dirty : output?.rc === 0;
  return true;
}

function plain(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export async function runObjective(input, adapters, options = {}) {
  const objective = validateObjective(input);
  requiredAdapters(adapters);
  if (typeof options.stateDir !== 'string' || !options.stateDir) throw new TypeError('Missing options.stateDir');

  const now = typeof options.clock === 'function' ? options.clock : () => new Date().toISOString();
  const identify = typeof options.id === 'function' ? options.id : randomUUID;
  const paths = { state: join(options.stateDir, 'state.json'), events: join(options.stateDir, 'events.jsonl') };
  const prior = options.resume ?? null;
  if (prior && (prior.schema !== schema || !Array.isArray(prior.steps) || typeof prior.runId !== 'string')) throw new TypeError('Invalid resume state');
  const journal = prior ? prior.steps : [];
  const state = {
    schema, runId: prior?.runId ?? identify(), objective, result: 'running', corrections: 0, checks: [], commit: null, push: null,
    paths, steps: [], events: prior ? [...prior.events] : []
  };
  let writes = 0;
  let diverged = false;
  const replaying = () => !diverged && state.steps.length < journal.length;

  await mkdir(options.stateDir, { recursive: true });
  async function persist() {
    const temp = join(options.stateDir, `.state-${identify()}-${writes++}.tmp`);
    await writeFile(temp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temp, paths.state);
  }
  async function transition(event, detail = {}, force = false) {
    if (replaying() && !force) return;
    state.updatedAt = now();
    const entry = { at: state.updatedAt, event, result: state.result, ...detail };
    state.events.push(entry);
    await persist();
    await appendFile(paths.events, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }
  // Paso del journal: al reanudar devuelve el resultado registrado en vez de repetir la operación.
  async function step(name, fn) {
    const key = `${state.steps.length}:${name}`;
    if (replaying()) {
      const recorded = journal[state.steps.length];
      if (recorded.key === key) {
        state.steps.push(recorded);
        return recorded.output;
      }
      diverged = true;
    }
    const output = await fn();
    if (memorable(name, output)) {
      state.steps.push({ key, output: plain(output) });
      await persist();
    } else {
      diverged = true;
    }
    return output;
  }
  async function callAgent(phase, failures = []) {
    const output = await step('agent', async () => {
      try {
        const out = await adapters.runAgent({ phase, objective, failures, runId: state.runId });
        const skipped = Array.isArray(out?.skipped) ? out.skipped.map((s) => ({ engine: String(s?.engine), reason: redact(String(s?.reason ?? '')) })) : [];
        return { rc: Number.isInteger(out?.rc) ? out.rc : 1, engine: typeof out?.engine === 'string' ? out.engine : null, unavailable: Boolean(out?.unavailable), skipped };
      } catch (error) {
        return { rc: 1, engine: null, unavailable: false, error: error instanceof Error ? error.message : 'agent adapter failed' };
      }
    });
    const failure = { kind: 'agent', phase, rc: output.rc };
    await transition('agent', { ...failure, engine: output.engine, unavailable: output.unavailable, ...(output.skipped?.length ? { skipped: output.skipped } : {}) });
    if (output.unavailable) return { ...failure, unavailable: true };
    return failure.rc === 0 ? null : failure;
  }
  async function inspect(phase) {
    const permitted = objective.workflow === 'split-tdd' && phase === 'implementation' ? objective.testPaths : objective.allowedPaths;
    const output = await step('inspect', async () => {
      try {
        const out = await adapters.inspectChanges({ objective, allowedPaths: permitted });
        return { paths: Array.isArray(out?.paths) ? out.paths : [] };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'change inspection failed' };
      }
    });
    if (output.error) return output.error;
    const unexpected = output.paths.filter((path) => !permitted.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)));
    await transition('inspect', { paths: output.paths });
    return unexpected.length > 0 ? `unexpected paths: ${unexpected.join(', ')}` : null;
  }
  async function runChecks(checks) {
    const records = [];
    for (const check of checks) {
      const output = await step('check', async () => {
        try {
          const out = await adapters.runCheck({ check, objective });
          return { rc: out?.rc, log: out?.log, evidence: out?.evidence };
        } catch (error) {
          return { rc: 1, log: error instanceof Error ? error.message : 'check adapter failed' };
        }
      });
      const record = checkRecord(check, output);
      records.push(record);
      state.checks.push(record);
      await transition('check', { id: record.id, rc: record.rc });
    }
    return records.filter((record) => record.rc !== 0).map((record) => ({ kind: 'check', phase: 'check', ...record }));
  }
  let locked = false;
  async function close(result, reason) {
    diverged = true;
    state.result = result;
    if (reason) state.reason = redact(reason);
    await transition('closed', { reason: state.reason });
    if (locked && typeof adapters.release === 'function') {
      try { await adapters.release({ objective, runId: state.runId }); } catch {}
      locked = false;
    }
    let checkpoint = { rc: 1 };
    try {
      const output = await adapters.checkpoint({ result, state, paths });
      checkpoint = { rc: Number.isInteger(output?.rc) ? output.rc : 1 };
    } catch {
      checkpoint = { rc: 1 };
    }
    state.checkpoint = checkpoint;
    if (checkpoint.rc !== 0 && result === 'completed') {
      state.result = 'blocked';
      state.reason = 'checkpoint failed';
    }
    await transition('checkpoint', checkpoint);
    return { result: state.result, runId: state.runId, corrections: state.corrections, checks: state.checks, commit: state.commit, push: state.push, reason: state.reason, paths };
  }

  if (prior) await transition('resumed', { steps: journal.length }, true);
  else await transition('initialized');
  const preflight = await step('preflight', async () => {
    try {
      const out = await adapters.preflight({ objective });
      return { status: out?.status, dirty: Boolean(out?.dirty), reason: out?.reason };
    } catch (error) {
      return { status: 'blocked', error: error instanceof Error ? error.message : 'preflight adapter failed' };
    }
  });
  if (preflight.error) return close('blocked', preflight.error);
  await transition('preflight', { status: preflight.status, dirty: preflight.dirty });
  if (preflight.status === 'blocked' || preflight.status === 'BLOQUEADO' || preflight.dirty) return close('blocked', preflight.reason || 'preflight blocked');

  if (typeof adapters.acquire === 'function') {
    let lock;
    try { lock = await adapters.acquire({ objective, runId: state.runId }); } catch (error) { lock = { rc: 1, reason: error?.message }; }
    if (lock?.rc !== 0) return close('blocked', `writer lock: ${lock?.reason ?? 'busy'}`);
    locked = true;
    await transition('locked', {}, true);
  }

  const initialAgentFailure = await callAgent('implementation');
  if (initialAgentFailure?.unavailable) return close('blocked', 'engines unavailable');
  const initialInspection = await inspect('implementation');
  if (initialInspection) return close('blocked', initialInspection);
  let failures = [initialAgentFailure, ...(await runChecks(objective.checks))].filter(Boolean);
  if (objective.workflow === 'split-tdd' && !failures.some((failure) => failure.kind === 'check')) return close('failed', 'expected RED');
  while (failures.length > 0 && state.corrections < objective.maxCorrections) {
    state.corrections += 1;
    const structuredFailures = failures.map(structuralFailure);
    await transition('correction', { failures: structuredFailures });
    const correctionFailure = await callAgent('correction', structuredFailures);
    if (correctionFailure?.unavailable) return close('blocked', 'engines unavailable');
    const correctionInspection = await inspect('correction');
    if (correctionInspection) return close('blocked', correctionInspection);
    const affected = objective.checks.filter((check) => failures.some((failure) => failure.kind !== 'agent' && failure.id === check.id));
    // Primero las verificaciones que fallaron; si siguen en rojo, el resto no aporta nada nuevo. En verde, sólo
    // se ejecutan una vez las que no se acaban de repetir sobre el mismo árbol.
    const affectedFailures = await runChecks(affected);
    const rest = affectedFailures.length > 0 ? [] : objective.checks.filter((check) => !affected.includes(check));
    const suiteFailures = await runChecks(rest);
    failures = [correctionFailure, ...affectedFailures, ...suiteFailures].filter(Boolean);
  }
  if (failures.length > 0) return close('failed', 'checks failed');

  if (typeof adapters.commit !== 'function') return close('blocked', 'commit capability missing');
  const commit = await step('commit', async () => {
    try {
      const out = await adapters.commit({ objective, state, paths, op: `${objective.unit}:${state.runId}:commit` });
      return {
        rc: Number.isInteger(out?.rc) ? out.rc : 1,
        evidence: redact(typeof out?.evidence === 'string' ? out.evidence : ''),
        head: redact(typeof out?.head === 'string' ? out.head : '')
      };
    } catch (error) {
      return { rc: 1, evidence: '', head: '', error: error instanceof Error ? error.message : 'commit failed' };
    }
  });
  state.commit = { rc: commit.rc, evidence: commit.evidence, head: commit.head };
  await transition('commit', state.commit);
  if (state.commit.rc !== 0) return close('blocked', commit.error ?? 'commit failed');

  if (objective.push) {
    if (typeof adapters.push !== 'function') return close('blocked', 'push capability missing');
    const pushed = await step('push', async () => {
      try {
        const out = await adapters.push({ objective, state });
        return { rc: Number.isInteger(out?.rc) ? out.rc : 1, remoteSha: typeof out?.remoteSha === 'string' ? out.remoteSha : '', evidence: redact(typeof out?.evidence === 'string' ? out.evidence : '') };
      } catch (error) {
        return { rc: 1, remoteSha: '', evidence: error instanceof Error ? redact(error.message) : 'push failed' };
      }
    });
    state.push = pushed;
    await transition('push', pushed);
    if (pushed.rc !== 0) return close('blocked', pushed.rc === 77 ? 'push not authorized' : 'push failed');
    if (state.commit.head && pushed.remoteSha !== state.commit.head) return close('blocked', 'remote SHA mismatch');
  }
  return close('completed');
}
