#!/usr/bin/env node
// Demo de interoperabilidad de jz-coord sobre repositorios sintéticos aislados (nunca sobre un worktree real).
//   node tools/jz-autonomy/demo/interop-demo.mjs --source <worktree> [--mode synthetic|real] [--scenarios a,b] [--out <dir>]
// synthetic: `claude` y `opencode` son el motor sintético demo/fake-engine.mjs (sin modelo).
// real: los binarios reales de Claude Code y OpenCode con su perfil jz-orchestrator.
// Cada escenario lanza el CLI real (bin/jz-coord.js) y después verifica el resultado con git, no con lo que
// dice el controlador. Deja report.json y REPORT.md en el directorio de la ejecución.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../bin/jz-coord.js');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (index % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[index + 1]]] : pairs), []));
const mode = args.mode ?? 'synthetic';
const source = args.source;
if (!source || !['synthetic', 'real'].includes(mode)) {
  process.stderr.write('usage: interop-demo.mjs --source <worktree> [--mode synthetic|real] [--scenarios a,b] [--out <dir>]\n');
  process.exit(2);
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
const runDir = join(args.out ?? '/var/tmp/jz-coord-demo', `${mode}-${stamp}`);
mkdirSync(runDir, { recursive: true });
const ident = ['-c', 'user.name=jz-demo', '-c', 'user.email=jz-demo@localhost'];

function sh(cmd, argv, opts = {}) {
  const out = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { rc: out.status ?? 1, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}
const git = (repo, argv) => sh('git', ['-C', repo, ...argv]);

const delegateText = (peer) => `Implement slugify yourself and delegate wordCount to the peer orchestrator (${peer}) with a delegate action; complete once its result arrives.`;
const stepText = 'Two steps. Turn 1: implement only slugify in src/slug.js, then reply progress. Next turn: implement wordCount in src/words.js, then reply complete.';
const scenarios = {
  'claude-lead': { engines: ['claude'], objective: stepText, expect: { leaders: ['claude'] } },
  'opencode-lead': { engines: ['opencode'], objective: stepText, expect: { leaders: ['opencode'] } },
  'delegate-c2o': { engines: ['claude', 'opencode'], objective: delegateText('opencode'), expect: { leaders: ['claude'], delegate: ['claude', 'opencode'] } },
  'delegate-o2c': { engines: ['opencode', 'claude'], objective: delegateText('claude'), expect: { leaders: ['opencode'], delegate: ['opencode', 'claude'] } },
  failover: { engines: ['claude', 'opencode'], objective: stepText, simulate: 'quota:claude@2', expect: { leaders: ['claude', 'opencode'], partial: true } },
  'failover-midturn': { engines: ['claude', 'opencode'], objective: stepText, simulate: 'quota:claude@2+1s', pauseMs: 4000, expect: { leaders: ['claude', 'opencode'], partial: true, midturn: true } },
  reverse: { engines: ['claude', 'opencode'], objective: stepText, simulate: 'quota:claude@2,quota:opencode@4', resume: true, expect: { leaders: ['claude', 'opencode', 'claude'], partial: true } }
};
const selected = (args.scenarios ?? Object.keys(scenarios).join(',')).split(',');

function fakeBin() {
  const dir = join(runDir, 'fake-bin');
  mkdirSync(dir, { recursive: true });
  for (const name of ['claude', 'opencode']) {
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\nexec ${process.execPath} ${join(here, 'fake-engine.mjs')} ${name} "$@"\n`);
    chmodSync(path, 0o755);
  }
  return dir;
}

const testFile = `import assert from 'node:assert/strict';
import test from 'node:test';
import { slugify } from '../src/slug.js';
import { wordCount } from '../src/words.js';

test('slugify', () => {
  assert.equal(slugify('Hola Mundo 2026'), 'hola-mundo-2026');
  assert.equal(slugify('  A--b  '), 'a-b');
});

test('wordCount', () => {
  assert.equal(wordCount('uno  dos tres'), 3);
  assert.equal(wordCount('   '), 0);
});
`;

// Repositorio sintético con el plano de control versionado de --source (git archive: sólo lo confirmado).
function fixture(name, scenario) {
  const repo = join(runDir, name, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-q', '-b', 'feat/text-utils']);
  const archive = sh('sh', ['-c', `git -C '${source}' archive HEAD .jz .claude .opencode docs/AUTONOMIA-JZ.md | tar -x -C '${repo}'`]);
  if (archive.rc !== 0) throw new Error(`fixture archive failed: ${archive.stderr}`);
  writeFileSync(join(repo, 'AGENTS.md'), '# AGENTS.md — fixture sintético de jz-coord\n\nRepositorio desechable para demostrar la coordinación entre orquestadores. No es jozeuzz.cl.\n\n- Implementar sólo dentro de `src/`; los tests de `test/` ya existen y no se modifican.\n- Comandos de desarrollo sólo con `.jz/bin/jz-run` (p. ej. `.jz/bin/jz-run node --test test/text.test.js`).\n- Protocolo de autonomía: `docs/AUTONOMIA-JZ.md`. Commits y checkpoints los hace jz-coord.\n');
  writeFileSync(join(repo, 'CLAUDE.md'), 'Leer y obedecer [AGENTS.md](AGENTS.md).\n');
  writeFileSync(join(repo, 'docs', 'AGENTES.md'), '# Agentes\n\nFixture sintético: Claude Code y OpenCode son orquestadores pares coordinados por jz-coord.\n');
  writeFileSync(join(repo, 'package.json'), '{ "name": "jz-coord-fixture", "private": true, "type": "module" }\n');
  writeFileSync(join(repo, '.gitignore'), '.jz-state/\nnode_modules/\n');
  mkdirSync(join(repo, 'test'), { recursive: true });
  writeFileSync(join(repo, 'test', 'text.test.js'), testFile);
  mkdirSync(join(repo, 'goals'), { recursive: true });
  const goal = {
    schema: 'jz-coord-goal-v1', id: `text-utils-${name}`, objective: `${scenario.objective} slugify(s): lowercase, non-alphanumeric runs become '-', no leading/trailing '-'. wordCount(s): number of whitespace-separated words.`,
    criteria: ['node --test test/text.test.js passes', 'only src/ changes'], branch: 'feat/text-utils', allowedPaths: ['src'],
    checks: [{ id: 'unit', argv: ['node', '--test', 'test/text.test.js'] }], commit: { message: `feat: add text utils (${name})` },
    engines: scenario.engines, lead: scenario.engines[0], maxTurns: 8, timeoutMinutes: mode === 'real' ? 15 : 2
  };
  writeFileSync(join(repo, 'goals', 'goal.json'), `${JSON.stringify(goal, null, 2)}\n`);
  git(repo, ['add', '-A']);
  const commit = git(repo, [...ident, 'commit', '-q', '-m', 'fixture: jz-coord synthetic repo']);
  if (commit.rc !== 0) throw new Error(`fixture commit failed: ${commit.stderr}`);
  if (mode === 'synthetic' && scenario.pauseMs) {
    mkdirSync(join(repo, '.jz-state'), { recursive: true });
    writeFileSync(join(repo, '.jz-state', 'fake-engine.json'), `${JSON.stringify({ pauseMs: scenario.pauseMs })}\n`);
  }
  return { repo, base: git(repo, ['rev-parse', 'HEAD']).stdout.trim() };
}

function coord(repo, argv, pathPrefix) {
  const env = { ...process.env, PATH: pathPrefix ? `${pathPrefix}:${process.env.PATH}` : process.env.PATH };
  const out = sh(process.execPath, [cli, ...argv, '--root', repo], { env, cwd: repo });
  let json = null;
  try { json = JSON.parse(out.stdout.trim().split('\n').at(-1)); } catch {}
  return { rc: out.rc, json, stderr: out.stderr.slice(-2000) };
}

function verify(name, scenario, repo, base, runs) {
  const checks = [];
  const add = (what, ok, detail = '') => checks.push({ what, ok: Boolean(ok), detail });
  const state = JSON.parse(readFileSync(join(repo, '.jz-state', 'coord', name, 'state.json'), 'utf8'));
  add('controller status completed', state.status === 'completed', `${state.status}${state.reason ? ` (${state.reason})` : ''}`);
  const count = Number(git(repo, ['rev-list', '--count', `${base}..HEAD`]).stdout.trim());
  add('exactly one new commit (no duplicates)', count === 1, `${count} commit(s) after the fixture`);
  const ops = git(repo, ['log', '--format=%(trailers:key=Jz-Op,valueonly)', `${base}..HEAD`]).stdout.split('\n').filter(Boolean);
  add('commit carries one Jz-Op trailer', ops.length === 1, ops.join(' '));
  const head = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
  add('controller commit matches HEAD', state.commit?.head === head, `${state.commit?.head?.slice(0, 12)} vs ${head.slice(0, 12)}`);
  const changed = git(repo, ['diff', '--name-only', base, 'HEAD']).stdout.split('\n').filter(Boolean);
  add('commit only touches src/', changed.length > 0 && changed.every((p) => p.startsWith('src/')), changed.join(', '));
  const tmp = join(runDir, name, 'head-check');
  sh('sh', ['-c', `rm -rf '${tmp}' && mkdir -p '${tmp}' && git -C '${repo}' archive HEAD | tar -x -C '${tmp}'`]);
  const tests = sh(process.execPath, ['--test', 'test/text.test.js'], { cwd: tmp });
  add('tests pass on the committed HEAD (independent run)', tests.rc === 0, `rc=${tests.rc}`);
  const dirty = git(repo, ['status', '--porcelain']).stdout.trim();
  add('worktree clean after commit', dirty === '', dirty);
  const leaders = state.leadership.map((l) => l.engine);
  add(`leadership ${scenario.expect.leaders.join(' -> ')}`, JSON.stringify(leaders) === JSON.stringify(scenario.expect.leaders), leaders.join(' -> '));
  if (scenario.expect.delegate) {
    const [from, to] = scenario.expect.delegate;
    const tasks = Object.values(state.tasks);
    const task = tasks.find((t) => t.from === from && t.to === to);
    add(`delegation ${from} -> ${to} finished`, task?.status === 'done', task ? `${task.id}: ${task.status} — ${task.result?.summary ?? ''}` : 'no task');
    const delivered = state.mail.find((m) => m.kind === 'result' && m.from === to && m.delivered);
    add(`structured result delivered to ${from}`, Boolean(delivered), delivered ? JSON.stringify({ task: delivered.task, status: delivered.status, paths: delivered.paths }) : 'not delivered');
  }
  if (scenario.expect.partial) {
    const transfer = state.mail.find((m) => m.kind === 'transfer');
    add('transfer message with checkpoint delivered', transfer?.delivered && transfer.checkpoint?.paths?.length > 0, transfer ? JSON.stringify(transfer.checkpoint?.paths) : 'none');
    const cp = state.checkpoints.find((c) => c.paths.includes('src/slug.js'));
    const before = cp ? git(repo, ['rev-parse', `${cp.tree}:src/slug.js`]).stdout.trim() : '';
    const after = git(repo, ['rev-parse', 'HEAD:src/slug.js']).stdout.trim();
    add('uncommitted work of the first leader reaches the commit', Boolean(cp) && Boolean(after), cp ? `checkpoint ${cp.n} blob ${before.slice(0, 12)}; HEAD blob ${after.slice(0, 12)}${before === after ? ' (unchanged)' : ' (edited by the next leader)'}` : 'no checkpoint with src/slug.js');
    if (scenario.expect.midturn) {
      const killed = state.turns.find((t) => t.simulated);
      add('killed engine process group verified terminated', killed?.terminated === true, killed ? `turn ${killed.n} pid ${killed.pid} terminated=${killed.terminated}` : 'no simulated turn');
      const partialCp = state.checkpoints.find((c) => c.paths.includes('src/words.js'));
      const partialBlob = partialCp ? git(repo, ['rev-parse', `${partialCp.tree}:src/words.js`]).stdout.trim() : '';
      const finalBlob = git(repo, ['rev-parse', 'HEAD:src/words.js']).stdout.trim();
      add('half-written file captured in a checkpoint, then repaired by the new leader', Boolean(partialCp) && partialBlob !== finalBlob, partialCp ? `checkpoint ${partialCp.n} (${partialCp.reason}) blob ${partialBlob.slice(0, 12)} -> HEAD ${finalBlob.slice(0, 12)}` : 'no checkpoint with src/words.js');
    }
    const down = state.events.filter((e) => e.event === 'engine-down').map((e) => `${e.engine}:${e.outcome}`);
    add('simulated quota recorded as engine-down', down.length >= 1, down.join(', '));
  }
  const again = coord(repo, ['resume', '--state-dir', name], runs.pathPrefix);
  const count2 = Number(git(repo, ['rev-list', '--count', `${base}..HEAD`]).stdout.trim());
  add('resume after completion is a no-op', again.json?.status === 'completed' && count2 === 1, `status ${again.json?.status}, commits ${count2}`);
  return { checks, state };
}

const pathPrefix = mode === 'synthetic' ? fakeBin() : null;
const report = { mode, source, sourceHead: git(source, ['rev-parse', 'HEAD']).stdout.trim(), runDir, startedAt: new Date().toISOString(), scenarios: [] };
for (const name of selected) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`unknown scenario ${name}`);
  const started = Date.now();
  const { repo, base } = fixture(name, scenario);
  const runs = { pathPrefix, calls: [] };
  const lead = coord(repo, ['lead', '--goal', 'goals/goal.json', '--state-dir', name, ...(scenario.simulate ? ['--simulate', scenario.simulate] : [])], pathPrefix);
  runs.calls.push({ argv: 'lead', rc: lead.rc, status: lead.json?.status, reason: lead.json?.reason, stderr: lead.stderr });
  if (scenario.resume) {
    // Ningún motor disponible (los dos con cuota): el controlador termina. Más tarde la cuota se repone.
    const resumed = coord(repo, ['resume', '--state-dir', name, '--cooldown-minutes', '0'], pathPrefix);
    runs.calls.push({ argv: 'resume --cooldown-minutes 0', rc: resumed.rc, status: resumed.json?.status, reason: resumed.json?.reason, stderr: resumed.stderr });
  }
  let result;
  try { result = verify(name, scenario, repo, base, runs); } catch (error) { result = { checks: [{ what: 'verification', ok: false, detail: error.message }], state: null }; }
  const s = result.state;
  report.scenarios.push({
    name, repo, seconds: Math.round((Date.now() - started) / 1000), calls: runs.calls, ok: result.checks.every((c) => c.ok), checks: result.checks,
    turns: s?.turns.map((t) => ({ n: t.n, engine: t.engine, role: t.role, task: t.task, outcome: t.outcome, simulated: t.simulated, actions: t.actions.map((a) => a.type) })) ?? [],
    leadership: s?.leadership ?? [], commit: s?.commit ?? null
  });
  process.stdout.write(`${name}: ${result.checks.every((c) => c.ok) ? 'OK' : 'FAIL'}\n`);
}
report.finishedAt = new Date().toISOString();
writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const md = [`# jz-coord demo (${mode})`, '', `Fuente: ${source} @ ${report.sourceHead}`, `Motores: ${mode === 'synthetic' ? 'SINTÉTICOS (demo/fake-engine.mjs, sin modelo)' : 'REALES (claude / opencode con jz-orchestrator)'}`, ''];
for (const sc of report.scenarios) {
  md.push(`## ${sc.name}: ${sc.ok ? 'OK' : 'FAIL'} (${sc.seconds}s)`, '', `Repo: ${sc.repo}`, '');
  md.push(`Turnos: ${sc.turns.map((t) => `${t.n}:${t.engine}/${t.role}${t.task ? `:${t.task}` : ''}=${t.outcome}${t.simulated ? '(simulado)' : ''}[${t.actions.join(',')}]`).join(' · ')}`, '');
  for (const c of sc.checks) md.push(`- [${c.ok ? 'x' : ' '}] ${c.what}${c.detail ? ` — ${c.detail}` : ''}`);
  md.push('');
}
writeFileSync(join(runDir, 'REPORT.md'), `${md.join('\n')}\n`);
process.stdout.write(`report: ${join(runDir, 'REPORT.md')}\n`);
process.exitCode = report.scenarios.every((s) => s.ok) ? 0 : 1;
