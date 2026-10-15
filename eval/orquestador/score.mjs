// Puntuación de la batería de evaluación del orquestador. Funciones puras sobre
// los exports de `opencode export <sesión>` (1.17.x) y el estado del fixture.

const VERIFY_TOOLS = new Set(['read', 'glob', 'grep', 'list', 'bash']);
const WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch']);

function toolsOf(exp) {
  const tools = [];
  for (const message of exp.messages ?? []) {
    if (message.info?.role !== 'assistant') continue;
    for (const part of message.parts ?? []) {
      if (part.type !== 'tool') continue;
      tools.push({
        seq: tools.length,
        tool: part.tool,
        input: part.state?.input ?? {},
        output: String(part.state?.output ?? ''),
        status: part.state?.status ?? 'unknown',
        metadata: part.state?.metadata ?? {},
      });
    }
  }
  return tools;
}

function modelOf(exp) {
  const message = (exp.messages ?? []).find((m) => m.info?.role === 'assistant' && m.info.providerID);
  return message ? `${message.info.providerID}/${message.info.modelID}` : null;
}

function agentOf(exp) {
  if (exp.info?.agent) return exp.info.agent;
  const message = (exp.messages ?? []).find((m) => m.info?.role === 'assistant' && m.info.agent);
  return message ? message.info.agent : null;
}

function addTokens(total, exp) {
  for (const message of exp.messages ?? []) {
    const t = message.info?.role === 'assistant' ? message.info.tokens : null;
    if (!t) continue;
    total.input += t.input ?? 0;
    total.output += t.output ?? 0;
    total.reasoning += t.reasoning ?? 0;
    total.cacheRead += t.cache?.read ?? 0;
  }
  return total;
}

function lastText(exp) {
  let text = '';
  for (const message of exp.messages ?? []) {
    if (message.info?.role !== 'assistant') continue;
    for (const part of message.parts ?? []) {
      if (part.type === 'text' && part.text?.trim()) text = part.text;
    }
  }
  return text;
}

export function normalize(parent, children) {
  const parentTools = toolsOf(parent);
  const tasks = parentTools
    .filter((t) => t.tool === 'task')
    .map((t) => ({
      seq: t.seq,
      subagent: t.input.subagent_type ?? null,
      childSessionId: t.metadata.sessionId ?? (t.output.match(/<task id="([^"]+)"/) ?? [])[1] ?? null,
    }));
  const tokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0 };
  addTokens(tokens, parent);
  const byId = {};
  for (const child of children) {
    addTokens(tokens, child);
    byId[child.info.id] = { agent: agentOf(child), model: modelOf(child), tools: toolsOf(child) };
  }
  return {
    sessionId: parent.info?.id ?? null,
    model: modelOf(parent),
    tokens,
    finalText: lastText(parent),
    parentTools,
    tasks,
    children: byId,
  };
}

export function parseAnswer(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text).match(new RegExp(`^[\\s*_]*${escaped}[\\s*_]*[:=][\\s*_]*(.+?)[\\s*_]*$`, 'im'));
  return match ? match[1].trim() : null;
}

const firstNumber = (value) => {
  const match = String(value ?? '').match(/-?\d+/);
  return match ? Number(match[0]) : null;
};

export function verifiedAfterFirstDelegation(record) {
  if (record.tasks.length === 0) return false;
  const first = record.tasks[0].seq;
  return record.parentTools.some(
    (t) => t.seq > first && t.status === 'completed' && (VERIFY_TOOLS.has(t.tool) || t.tool === 'task'),
  );
}

function view(t) {
  return { tool: t.tool, input: t.input ?? t.state?.input ?? {}, output: String(t.output ?? t.state?.output ?? '') };
}

const isTestRun = (t) => t.tool === 'bash' && /node\s+--test|npm\s+(run\s+)?test/.test(t.input.command ?? '');
const isRed = (t) => /#\s*fail\s+[1-9]|^not ok /m.test(t.output);
// Rutas que escribe una llamada: `filePath` en write/edit; en apply_patch, sólo las cabeceras
// `*** Add/Update/Delete File:` (el contenido del parche puede mencionar src/ sin escribir allí).
function writtenPaths(t) {
  if (t.input.filePath) return [t.input.filePath];
  return [...String(t.input.patchText ?? '').matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => m[1].trim());
}
const isSrcWrite = (t) => WRITE_TOOLS.has(t.tool) && writtenPaths(t).some((p) => /(^|\/)src\//.test(p));

export function tddEvidence(child) {
  const tools = (child?.tools ?? []).map(view);
  const firstSrc = tools.findIndex(isSrcWrite);
  const testRuns = tools.filter(isTestRun).length;
  const redBeforeGreen = firstSrc !== -1 && tools.slice(0, firstSrc).some((t) => isTestRun(t) && isRed(t));
  return { redBeforeGreen, testRuns };
}

const DISCREPANCY = /discrepan|no coincide|incorrect|error del subagente|corrij/i;

export function scoreCount(record, truth) {
  const answer = parseAnswer(record.finalText, 'RESPUESTA');
  return {
    correct: answer !== null && firstNumber(answer) === truth.count,
    delegatedExplorer: record.tasks.some((t) => t.subagent === 'jz-explorer'),
    verified: verifiedAfterFirstDelegation(record),
    flaggedDiscrepancy: DISCREPANCY.test(record.finalText),
    answer,
  };
}

export function scoreClaims(record, truth) {
  let verdictsCorrect = 0;
  let falsePositives = 0;
  let falseDetected = true;
  let correctedValue = true;
  for (const [id, expected] of Object.entries(truth)) {
    const match = record.finalText.match(new RegExp(`^[\\s*_]*${id}[\\s*_]*:[\\s*_]*(incorrecto|correcto)`, 'im'));
    const verdict = match ? match[1].toLowerCase() : null;
    if (verdict !== null && (verdict === 'correcto') === expected.ok) verdictsCorrect += 1;
    if (expected.ok && verdict === 'incorrecto') falsePositives += 1;
    if (!expected.ok) {
      if (verdict !== 'incorrecto') falseDetected = false;
      if (expected.value !== undefined && firstNumber(parseAnswer(record.finalText, `VALOR ${id}`)) !== firstNumber(expected.value)) {
        correctedValue = false;
      }
    }
  }
  return { verdictsCorrect, verdictsTotal: Object.keys(truth).length, falseDetected, falsePositives, correctedValue };
}

export function scorePlan(record, checks, changed) {
  const matched = checks.filter((c) => c.re.test(record.finalText)).map((c) => c.id);
  return { matched, ratio: checks.length ? matched.length / checks.length : 0, noChanges: changed.length === 0 };
}

export function scoreTdd(record, after) {
  const implementers = record.tasks.filter((t) => (t.subagent ?? '').startsWith('jz-implementer'));
  return {
    hiddenPass: after.hidden.exitCode === 0 && after.hidden.fail === 0 && after.hidden.pass > 0,
    redBeforeGreen: implementers.some((t) => tddEvidence(record.children[t.childSessionId]).redBeforeGreen),
    delegatedImplementer: implementers.length > 0,
    onlyAllowedFiles: after.changed.every((path) => after.allowed.includes(path)),
    verified: verifiedAfterFirstDelegation(record),
  };
}

export function aggregate(results) {
  const groups = {};
  for (const r of results) {
    groups[r.model] ??= {};
    (groups[r.model][r.scenario] ??= []).push(r);
  }
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const out = {};
  for (const [model, scenarios] of Object.entries(groups)) {
    out[model] = {};
    for (const [scenario, runs] of Object.entries(scenarios)) {
      const row = { runs: runs.length };
      const keys = [...new Set(runs.flatMap((r) => Object.keys(r.score ?? {})))];
      for (const key of keys) {
        const values = runs.map((r) => r.score?.[key]);
        if (values.every((v) => typeof v === 'boolean')) row[key] = mean(values.map(Number));
        else if (values.every((v) => typeof v === 'number')) row[key] = mean(values);
      }
      row.meanInputTokens = mean(runs.map((r) => r.tokens?.input ?? 0));
      row.meanOutputTokens = mean(runs.map((r) => r.tokens?.output ?? 0));
      row.meanDurationMs = mean(runs.map((r) => r.durationMs ?? 0));
      out[model][scenario] = row;
    }
  }
  return out;
}
