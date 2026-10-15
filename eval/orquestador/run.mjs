#!/usr/bin/env node
// Ejecuta la batería de evaluación del orquestador de OpenCode.
//
//   node eval/orquestador/run.mjs --work-root <dir> [--model <id>]... [--reps 3] [--scenarios E1,E2] [--dry-run]
//
// Cada ejecución usa una copia nueva del fixture, con un repositorio Git propio, fuera
// de este repositorio. Los perfiles `.opencode/agents/` se copian del repositorio actual;
// sólo cambia el modelo del orquestador (`-m`). Los resultados quedan en
// <work-root>/<marca>/results.jsonl y summary.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { SCENARIOS, FIXTURE_DIR, truthFor, runHidden, sabotageProfile, nonInteractiveOrchestrator } from './escenarios.mjs';
import { normalize, aggregate } from './score.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const AGENTS_DIR = path.join(REPO_ROOT, '.opencode/agents');
const DEFAULT_MODELS = ['openai/gpt-5.6-sol', 'openai/gpt-6.1-sol'];

const { values } = parseArgs({
  options: {
    'work-root': { type: 'string' },
    model: { type: 'string', multiple: true },
    reps: { type: 'string', default: '3' },
    scenarios: { type: 'string' },
    'timeout-ms': { type: 'string', default: '1200000' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const workRoot = values['work-root'] && path.resolve(values['work-root']);
if (!workRoot) throw new Error('Falta --work-root');
if (workRoot === REPO_ROOT || workRoot.startsWith(`${REPO_ROOT}${path.sep}`)) {
  throw new Error('--work-root debe estar fuera del repositorio');
}
const models = values.model ?? DEFAULT_MODELS;
const reps = Number(values.reps);
const wanted = values.scenarios ? values.scenarios.split(',') : SCENARIOS.map((s) => s.id);
const scenarios = SCENARIOS.filter((s) => wanted.includes(s.id));
const timeoutMs = Number(values['timeout-ms']);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(workRoot, stamp);
fs.mkdirSync(runDir, { recursive: true });
const resultsFile = path.join(runDir, 'results.jsonl');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function prepareFixture(dir, scenario) {
  fs.cpSync(FIXTURE_DIR, dir, { recursive: true });
  const agents = path.join(dir, '.opencode/agents');
  fs.mkdirSync(agents, { recursive: true });
  for (const name of fs.readdirSync(AGENTS_DIR)) fs.copyFileSync(path.join(AGENTS_DIR, name), path.join(agents, name));
  const orchestrator = path.join(agents, 'jz-orchestrator.md');
  fs.writeFileSync(orchestrator, nonInteractiveOrchestrator(fs.readFileSync(orchestrator, 'utf8')));
  if (scenario.sabotage) {
    const explorer = path.join(agents, 'jz-explorer.md');
    fs.writeFileSync(explorer, sabotageProfile(fs.readFileSync(explorer, 'utf8')));
  }
  // OpenCode instala su paquete de plugins en .opencode/; no cuenta como cambio del evaluado.
  fs.writeFileSync(path.join(dir, '.gitignore'), '.opencode/node_modules/\n.opencode/package.json\n.opencode/package-lock.json\n.opencode/bun.lock\n.opencode/.gitignore\n');
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=eval', '-c', 'user.email=eval@localhost', 'commit', '-q', '-m', 'fixture');
}

// OpenCode toma el directorio del proyecto de PWD, no del cwd del proceso.
const inDir = (dir) => ({ ...process.env, PWD: dir });

function runOpencode(dir, model, prompt) {
  return new Promise((resolve) => {
    const started = Date.now();
    const out = fs.openSync(path.join(dir, '..', `${path.basename(dir)}.events.jsonl`), 'w');
    // stdin cerrado: `opencode run` se queda esperando si stdin es una terminal o un pipe abierto.
    const child = spawn('opencode', ['run', '-m', model, '--agent', 'jz-orchestrator', '--format', 'json', prompt], {
      cwd: dir,
      env: inDir(dir),
      stdio: ['ignore', out, 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      fs.closeSync(out);
      resolve({ exitCode: code, signal, durationMs: Date.now() - started, stderr: stderr.slice(-2000) });
    });
  });
}

// `opencode export` corta la salida en 64 KiB cuando stdout es un pipe: se exporta a un archivo.
function exportSession(dir, sessionId) {
  const file = path.join(path.dirname(dir), `${path.basename(dir)}.${sessionId}.json`);
  const fd = fs.openSync(file, 'w');
  try {
    spawnSync('opencode', ['export', sessionId], { cwd: dir, env: inDir(dir), stdio: ['ignore', fd, 'ignore'] });
  } finally {
    fs.closeSync(fd);
  }
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw.slice(raw.indexOf('{')));
}

function sessionIdFrom(eventsFile) {
  for (const line of fs.readFileSync(eventsFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.sessionID) return event.sessionID;
    } catch { /* línea no JSON */ }
  }
  return null;
}

function changedFiles(dir) {
  return git(dir, 'status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
    .sort();
}

async function runOne(model, scenario, rep) {
  const dir = path.join(runDir, model.replace(/[^\w.-]+/g, '_'), `${scenario.id}-${rep}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  prepareFixture(dir, scenario);
  const truth = truthFor(scenario.id, dir);
  const base = { model, scenario: scenario.id, rep, dir };
  if (values['dry-run']) return { ...base, dryRun: true, truth };

  const proc = await runOpencode(dir, model, scenario.prompt);
  const eventsFile = path.join(path.dirname(dir), `${path.basename(dir)}.events.jsonl`);
  const sessionId = sessionIdFrom(eventsFile);
  if (!sessionId) return { ...base, error: 'sin sesión', ...proc };

  const parent = exportSession(dir, sessionId);
  if (parent.info?.directory !== dir) return { ...base, sessionId, error: `sesión fuera del fixture: ${parent.info?.directory}`, ...proc };
  const firstPass = normalize(parent, []);
  const children = firstPass.tasks.filter((t) => t.childSessionId).map((t) => exportSession(dir, t.childSessionId));
  fs.writeFileSync(`${dir}.export.json`, JSON.stringify({ parent, children }));
  const record = normalize(parent, children);

  const changed = changedFiles(dir);
  const slug = path.join(dir, 'src/slug.js');
  const hidden = scenario.id === 'E5' ? await runHidden(slug) : null;
  const score = scenario.score(record, { truth, changed, hidden });
  return {
    ...base,
    sessionId,
    effectiveModel: record.model,
    subagents: record.tasks.map((t) => `${t.subagent}@${record.children[t.childSessionId]?.model ?? '?'}`),
    exitCode: proc.exitCode,
    signal: proc.signal,
    durationMs: proc.durationMs,
    tokens: record.tokens,
    changed,
    hidden,
    truth,
    finalText: record.finalText.slice(-1500),
    score,
  };
}

const results = [];
for (let rep = 1; rep <= reps; rep += 1) {
  // Orden intercalado: cada repetición recorre todos los modelos, para repartir las variaciones del proveedor.
  for (const scenario of scenarios) {
    for (const model of models) {
      let result;
      try {
        result = await runOne(model, scenario, rep);
      } catch (error) {
        result = { model, scenario: scenario.id, rep, error: String(error?.message ?? error).slice(0, 500) };
      }
      results.push(result);
      fs.appendFileSync(resultsFile, `${JSON.stringify(result)}\n`);
      console.log(`${result.model} ${result.scenario}#${result.rep} ${result.error ? `ERROR ${result.error}` : JSON.stringify(result.score ?? result.truth)}`);
    }
  }
}

const scored = results.filter((r) => r.score);
const summary = { runDir, models, reps, scenarios: wanted, errors: results.filter((r) => r.error).length, aggregate: aggregate(scored) };
fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
