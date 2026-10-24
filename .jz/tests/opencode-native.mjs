#!/usr/bin/env node
// Caracterización de OpenCode real (binario instalado) sin consumir cuota: un servidor OpenAI-compatible
// simulado en 127.0.0.1 dicta una única llamada de herramienta por escenario y se comprueba sobre el sistema
// de archivos qué ejecutó OpenCode. Cubre la carga del plugin jz-guard (normal, --pure, ausente, error al
// importar la política, error al inicializarse, jz-permissions.json ausente), los permisos nativos que el
// plugin aplica (sólo el hook config, sin su validación por llamada) y el workdir de Bash.
//
// Cada escenario usa un repositorio desechable con una copia del plano de control y datos de OpenCode
// aislados (XDG_DATA_HOME y XDG_STATE_HOME temporales); la configuración global y sus plugins se cargan como
// en una sesión real. No usa red salvo loopback ni credenciales.
//
// Uso (en el host, no dentro de jz-run, desde un directorio temporal):
//   node .jz/tests/opencode-native.mjs [--src <worktree>] [--only N1,P1] [--keep] [--any-version]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const SRC = path.resolve(opt('--src', path.resolve(import.meta.dirname, '../..')));
const only = opt('--only', '')?.split(',').filter(Boolean);
const keep = args.includes('--keep');

const bash = (command, extra = {}) => ({ tool: 'bash', args: { command, description: 'escenario', ...extra } });
const write = { tool: 'write', args: { filePath: '@FX@/src/nuevo.txt', content: 'x\n' } };
// Motivo exigido a una llamada denegada (QA F1: sin él, un fallo del montaje pasaría por denegación).
const PLUGIN = /jz-policy:/;
const NATIVE = /rule which prevents/;
const ABSENT = /unavailable tool/;
// expect.ran: la herramienta terminó sin error; marker: se creó MARK (en el fixture o en su directorio padre);
// reason: patrón del error de una llamada denegada.
const SCENARIOS = [
  { id: 'N1', variant: 'normal', agent: 'jz-orchestrator', call: bash('echo hola > MARK'), expect: { ran: false, marker: false, reason: PLUGIN } },
  { id: 'N2', variant: 'normal', agent: 'jz-orchestrator', call: bash('git status --short'), expect: { ran: true, marker: false } },
  { id: 'N3', variant: 'normal', agent: 'jz-orchestrator', call: bash('touch MARK', { workdir: '@FX@/fuera' }), expect: { ran: false, marker: false, reason: PLUGIN } },
  { id: 'N4', variant: 'normal', agent: 'jz-orchestrator', call: bash('git status --short', { workdir: '@FX@/fuera' }), expect: { ran: false, reason: PLUGIN } },
  { id: 'N5', variant: 'normal', agent: 'jz-implementer', call: write, expect: { ran: true, file: 'src/nuevo.txt' } },
  { id: 'N6', variant: 'normal', agent: 'jz-orchestrator', call: { tool: 'task', args: { description: 'x', prompt: 'x', subagent_type: 'jz-implementer' } }, expect: { ran: true, nolock: true } },
  { id: 'N7', variant: 'normal', agent: 'jz-orchestrator', call: bash('git diff /etc/hostname /dev/null'), expect: { ran: false, reason: PLUGIN } },
  { id: 'P1', variant: 'pure', agent: 'jz-orchestrator', call: bash('git status --short'), expect: { ran: false, marker: false, reason: ABSENT } },
  { id: 'P2', variant: 'pure', agent: 'jz-orchestrator', call: bash('echo hola > MARK'), expect: { ran: false, marker: false, reason: ABSENT } },
  { id: 'P3', variant: 'pure', agent: 'jz-implementer', call: write, expect: { ran: false, nofile: 'src/nuevo.txt', reason: ABSENT } },
  { id: 'P4', variant: 'pure', agent: 'jz-implementer', call: bash('pwd'), expect: { ran: false, reason: ABSENT } },
  { id: 'P5', variant: 'pure', agent: 'jz-orchestrator', call: { tool: 'task', args: { description: 'x', prompt: 'x', subagent_type: 'jz-implementer' } }, expect: { ran: false, reason: NATIVE } },
  { id: 'P6', variant: 'pure', agent: 'jz-explorer', call: { tool: 'read', args: { filePath: '@FX@/certs/server.key' } }, expect: { ran: false, reason: NATIVE } },
  { id: 'A1', variant: 'noplugin', agent: 'jz-orchestrator', call: bash('echo hola > MARK'), expect: { ran: false, marker: false, reason: ABSENT } },
  { id: 'A2', variant: 'importfail', agent: 'jz-orchestrator', call: bash('echo hola > MARK'), expect: { ran: false, marker: false, reason: ABSENT } },
  { id: 'A3', variant: 'initfail', agent: 'jz-orchestrator', call: bash('echo hola > MARK'), expect: { ran: false, marker: false, reason: ABSENT } },
  { id: 'A4', variant: 'nopermissions', agent: 'jz-implementer', call: write, expect: { ran: false, nofile: 'src/nuevo.txt', reason: ABSENT } },
  { id: 'C1', variant: 'configonly', agent: 'jz-orchestrator', call: bash('echo hola > MARK'), expect: { ran: false, marker: false, reason: NATIVE } },
  { id: 'C2', variant: 'configonly', agent: 'jz-orchestrator', call: bash('git difftool -y -x "touch MARK"'), expect: { ran: false, marker: false, reason: NATIVE } },
  { id: 'C3', variant: 'configonly', agent: 'jz-orchestrator', call: bash('ls /root'), expect: { ran: false, reason: NATIVE } },
  { id: 'C4', variant: 'configonly', agent: 'jz-orchestrator', call: bash('git blame --contents=/etc/hostname AGENTS.md'), expect: { ran: false, reason: NATIVE } },
  { id: 'C5', variant: 'configonly', agent: 'jz-orchestrator', call: bash('git status --short'), expect: { ran: true } },
  { id: 'C6', variant: 'configonly', agent: 'jz-orchestrator', call: bash('git status; touch MARK'), expect: { ran: false, marker: false, reason: NATIVE } },
  { id: 'C7', variant: 'configonly', agent: 'jz-orchestrator', call: bash('git diff /etc/hostname /dev/null'), expect: { ran: false, reason: NATIVE } },
  { id: 'C8', variant: 'configonly', agent: 'jz-orchestrator', call: bash('git blame --cont=/etc/hostname AGENTS.md'), expect: { ran: false, reason: NATIVE } },
  { id: 'C9', variant: 'configonly', agent: 'jz-orchestrator', call: bash('echo hola; touch MARK'), expect: { ran: false, marker: false, reason: NATIVE } },
  { id: 'C10', variant: 'configonly', agent: 'jz-orchestrator', call: bash('echo hola | tee MARK'), expect: { ran: false, marker: false, reason: NATIVE } },
].filter((s) => !only.length || only.includes(s.id));

// Servidor simulado: con herramientas disponibles y sin resultado previo, devuelve la llamada del escenario;
// después (o para el título de la sesión) responde texto.
let current = null;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    const last = (j.messages ?? []).at(-1);
    const chunk = (c) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', ...c })}\n\n`;
    const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (!j.tools?.length || last?.role === 'tool' || !current) {
      res.write(chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'fin' }, finish_reason: null }] }));
      res.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage }));
    } else {
      const call = { index: 0, id: 'call_1', type: 'function', function: { name: current.tool, arguments: JSON.stringify(current.args) } };
      res.write(chunk({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] }));
      res.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage }));
    }
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

function fixture(variant) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `jz-ocnative-${variant}-`)));
  const fx = path.join(root, 'fx');
  fs.mkdirSync(path.join(fx, 'src'), { recursive: true });
  for (const p of ['.opencode/agents', '.opencode/plugins', '.opencode/jz-permissions.json', '.jz', 'AGENTS.md']) {
    if (fs.existsSync(path.join(SRC, p))) fs.cpSync(path.join(SRC, p), path.join(fx, p), { recursive: true });
  }
  fs.writeFileSync(path.join(fx, '.gitignore'), '.jz-state/\n');
  for (const f of fs.readdirSync(path.join(fx, '.opencode/agents'))) {
    const p = path.join(fx, '.opencode/agents', f);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^model: .*$/m, 'model: mock/m').replace(/^mode: subagent$/m, 'mode: all'));
  }
  const plugin = path.join(fx, '.opencode/plugins/jz-guard.js');
  if (variant === 'noplugin') fs.rmSync(plugin);
  if (variant === 'importfail') fs.writeFileSync(path.join(fx, '.jz/policy/policy.mjs'), 'throw new Error("politica rota");\n');
  if (variant === 'initfail') {
    fs.writeFileSync(plugin, fs.readFileSync(plugin, 'utf8').replace(/(export const JzGuard = async \([^)]*\) => \{)/, '$1\n  throw new Error("init roto");'));
  }
  if (variant === 'nopermissions') fs.rmSync(path.join(fx, '.opencode/jz-permissions.json'), { force: true });
  if (variant === 'configonly') {
    // Sólo el hook config del plugin real (movido fuera de plugins/, a la misma profundidad): deja a la vista
    // las reglas nativas operativas sin la validación por llamada.
    fs.mkdirSync(path.join(fx, '.opencode/lib'));
    fs.renameSync(plugin, path.join(fx, '.opencode/lib/jz-guard.js'));
    fs.writeFileSync(path.join(fx, '.opencode/plugins/config-only.js'),
      'import { JzGuard } from "../lib/jz-guard.js";\nexport const ConfigOnly = async (input) => ({ config: (await JzGuard(input)).config });\n');
  }
  fs.writeFileSync(path.join(fx, 'cambio.txt'), 'uno\n');
  fs.mkdirSync(path.join(fx, 'certs'));
  fs.writeFileSync(path.join(fx, 'certs/server.key'), 'CLAVE-SINTETICA\n');
  fs.symlinkSync(root, path.join(fx, 'fuera'));
  const gitEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = (...a) => execFileSync('git', ['-C', fx, '-c', 'user.name=jz-test', '-c', 'user.email=jz-test@example.invalid', ...a],
    { stdio: 'pipe', env: gitEnv });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  fs.writeFileSync(path.join(fx, 'cambio.txt'), 'dos\n'); // diferencia para git difftool
  return { root, fx };
}

function runOpencode(fx, root, variant, agent) {
  const config = { provider: { mock: { npm: '@ai-sdk/openai-compatible', name: 'Mock',
    options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: 'sintetica' }, models: { m: { name: 'm', tool_call: true } } } } };
  // OpenCode toma el directorio de --dir y, si falta, de PWD (no del cwd del proceso): se fijan los dos.
  const argv = ['run', ...(variant === 'pure' ? ['--pure'] : []), '--print-logs', '--log-level', 'INFO', '--dir', fx,
    '--agent', agent, '-m', 'mock/m', '--format', 'json', 'escenario'];
  return new Promise((resolve) => {
    const child = spawn('opencode', argv, {
      cwd: fx, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PWD: fx, OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        XDG_DATA_HOME: path.join(root, 'xdg/data'), XDG_STATE_HOME: path.join(root, 'xdg/state') },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

const version = execFileSync('opencode', ['--version'], { encoding: 'utf8' }).trim();
console.log(`OpenCode ${version}; plano de control de ${SRC}`);
// La caracterización vale para la versión comprobada; otra versión se ejecuta sólo a sabiendas.
if (version !== '1.17.18' && !args.includes('--any-version')) {
  console.log('versión de OpenCode no caracterizada (1.17.18); repetir con --any-version y revisar los resultados');
  process.exit(2);
}
let failures = 0;
for (const s of SCENARIOS) {
  const { root, fx } = fixture(s.variant);
  current = JSON.parse(JSON.stringify(s.call).replaceAll('@FX@', fx));
  const r = await runOpencode(fx, root, s.variant, s.agent);
  const tools = r.out.split('\n').filter(Boolean).flatMap((l) => {
    try {
      const p = JSON.parse(l).part;
      return p?.type === 'tool' ? [p.state] : [];
    } catch {
      return [];
    }
  });
  const state = tools.at(-1);
  const ran = state?.status === 'completed';
  const marker = fs.existsSync(path.join(fx, 'MARK')) || fs.existsSync(path.join(root, 'MARK'));
  const pluginErrors = r.err.split('\n').filter((l) => /failed to load plugin/.test(l)).length;
  const dirs = new Set([...r.err.matchAll(/message="creating instance" directory=(\S+)/g)].map((m) => m[1]));
  const checks = [];
  if (dirs.size !== 1 || !dirs.has(fx)) checks.push(`instancia en ${[...dirs].join(', ') || '(desconocido)'}, no en el fixture`);
  if ('ran' in s.expect && ran !== s.expect.ran) checks.push(`ran=${ran}`);
  if ('marker' in s.expect && marker !== s.expect.marker) checks.push(`MARK=${marker}`);
  if (s.expect.file && !fs.existsSync(path.join(fx, s.expect.file))) checks.push(`falta ${s.expect.file}`);
  if (s.expect.nofile && fs.existsSync(path.join(fx, s.expect.nofile))) checks.push(`existe ${s.expect.nofile}`);
  if (s.expect.nolock && fs.existsSync(path.join(fx, '.jz-state/writer.lock'))) checks.push('bloqueo de escritor sin liberar');
  if (s.expect.reason && !(state?.status === 'error' && s.expect.reason.test(String(state.error ?? '')))) {
    checks.push(`motor de la denegación distinto de ${s.expect.reason}`);
  }
  if (r.code !== 0) checks.push(`opencode rc=${r.code}`);
  failures += checks.length ? 1 : 0;
  const detail = String(state?.error ?? state?.output ?? '(sin llamada de herramienta)').replace(/\s+/g, ' ').slice(0, 110);
  console.log(`${checks.length ? 'FALLA' : 'ok   '} ${s.id} ${s.variant.padEnd(13)} ${s.agent.padEnd(16)} `
    + `${current.tool} ${JSON.stringify(current.args.command ?? current.args.filePath?.replace(fx, '.') ?? current.args.subagent_type)}`
    + `${current.args.workdir ? ` workdir=${current.args.workdir.replace(fx, '.')}` : ''} → `
    + `${state?.status ?? 'ninguna'}${marker ? ', MARK creado' : ''}${pluginErrors ? `, plugin no cargado (${pluginErrors} error)` : ''}`
    + `${checks.length ? ` [esperado distinto: ${checks.join(', ')}]` : ''} | ${detail}`);
  if (!keep) fs.rmSync(root, { recursive: true, force: true });
}
server.close();
console.log(failures ? `${failures} escenario(s) con resultado distinto del esperado` : 'todos los escenarios como se esperaba');
process.exit(failures ? 1 : 0);
