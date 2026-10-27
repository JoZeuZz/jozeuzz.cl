import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const schema = 'jz-autonomy-objective-v1';
const agents = new Set(['jz-implementer', 'jz-implementer-copilot']);
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

export async function runObjective(input, adapters, options = {}) {
  const objective = validateObjective(input);
  requiredAdapters(adapters);
  if (typeof options.stateDir !== 'string' || !options.stateDir) throw new TypeError('Missing options.stateDir');

  const now = typeof options.clock === 'function' ? options.clock : () => new Date().toISOString();
  const identify = typeof options.id === 'function' ? options.id : randomUUID;
  const paths = { state: join(options.stateDir, 'state.json'), events: join(options.stateDir, 'events.jsonl') };
  const state = { schema, objective, result: 'running', corrections: 0, checks: [], commit: null, paths, events: [] };
  let writes = 0;

  await mkdir(options.stateDir, { recursive: true });
  async function persist() {
    const temp = join(options.stateDir, `.state-${identify()}-${writes++}.tmp`);
    await writeFile(temp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temp, paths.state);
  }
  async function transition(event, detail = {}) {
    state.updatedAt = now();
    const entry = { at: state.updatedAt, event, result: state.result, ...detail };
    state.events.push(entry);
    await persist();
    await appendFile(paths.events, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }
  async function callAgent(phase, failures = []) {
    let output;
    try {
      output = await adapters.runAgent({ phase, objective, failures });
    } catch (error) {
      output = { rc: 1, error: error instanceof Error ? error.message : 'agent adapter failed' };
    }
    const failure = { kind: 'agent', phase, rc: Number.isInteger(output?.rc) ? output.rc : 1 };
    await transition('agent', failure);
    return failure.rc === 0 ? null : failure;
  }
  async function inspect(phase) {
    let output;
    try {
      output = await adapters.inspectChanges({ objective, allowedPaths: objective.workflow === 'split-tdd' && phase === 'implementation' ? objective.testPaths : objective.allowedPaths });
    } catch (error) {
      return error instanceof Error ? error.message : 'change inspection failed';
    }
    const paths = Array.isArray(output?.paths) ? output.paths : [];
    const permitted = objective.workflow === 'split-tdd' && phase === 'implementation' ? objective.testPaths : objective.allowedPaths;
    const unexpected = paths.filter((path) => !permitted.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)));
    await transition('inspect', { paths });
    return unexpected.length > 0 ? `unexpected paths: ${unexpected.join(', ')}` : null;
  }
  async function runChecks(checks) {
    const records = [];
    for (const check of checks) {
      let output;
      try {
        output = await adapters.runCheck({ check, objective });
      } catch (error) {
        output = { rc: 1, log: error instanceof Error ? error.message : 'check adapter failed' };
      }
      const record = checkRecord(check, output);
      records.push(record);
      state.checks.push(record);
      await transition('check', { id: record.id, rc: record.rc });
    }
    return records.filter((record) => record.rc !== 0).map((record) => ({ kind: 'check', phase: 'check', ...record }));
  }
  async function close(result, reason) {
    state.result = result;
    if (reason) state.reason = redact(reason);
    await transition('closed', { reason: state.reason });
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
    return { result: state.result, corrections: state.corrections, checks: state.checks, commit: state.commit, paths };
  }

  await transition('initialized');
  let preflight;
  try {
    preflight = await adapters.preflight({ objective });
  } catch (error) {
    return close('blocked', error instanceof Error ? error.message : 'preflight adapter failed');
  }
  await transition('preflight', { status: preflight?.status, dirty: Boolean(preflight?.dirty) });
  if (preflight?.status === 'blocked' || preflight?.status === 'BLOQUEADO' || preflight?.dirty) return close('blocked', preflight?.reason || 'preflight blocked');

  const initialAgentFailure = await callAgent('implementation');
  const initialInspection = await inspect('implementation');
  if (initialInspection) return close('blocked', initialInspection);
  let failures = [initialAgentFailure, ...(await runChecks(objective.checks))].filter(Boolean);
  if (objective.workflow === 'split-tdd' && !failures.some((failure) => failure.kind === 'check')) return close('failed', 'expected RED');
  while (failures.length > 0 && state.corrections < objective.maxCorrections) {
    state.corrections += 1;
    const structuredFailures = failures.map(structuralFailure);
    await transition('correction', { failures: structuredFailures });
    const correctionFailure = await callAgent('correction', structuredFailures);
    const correctionInspection = await inspect('correction');
    if (correctionInspection) return close('blocked', correctionInspection);
    const affected = objective.checks.filter((check) => failures.some((failure) => failure.kind !== 'agent' && failure.id === check.id));
    const affectedFailures = await runChecks(affected);
    const suiteFailures = await runChecks(objective.checks);
    failures = [correctionFailure, ...affectedFailures, ...suiteFailures].filter(Boolean);
  }
  if (failures.length > 0) return close('failed', 'checks failed');

  if (typeof adapters.commit !== 'function') return close('blocked', 'commit capability missing');
  try {
    const commit = await adapters.commit({ objective, state, paths });
    state.commit = {
      rc: Number.isInteger(commit?.rc) ? commit.rc : 1,
      evidence: redact(typeof commit?.evidence === 'string' ? commit.evidence : ''),
      head: redact(typeof commit?.head === 'string' ? commit.head : '')
    };
    await transition('commit', state.commit);
    if (state.commit.rc !== 0) return close('blocked', 'commit failed');
  } catch (error) {
    state.commit = { rc: 1, evidence: '', head: '' };
    await transition('commit', state.commit);
    return close('blocked', error instanceof Error ? error.message : 'commit failed');
  }
  return close('completed');
}
