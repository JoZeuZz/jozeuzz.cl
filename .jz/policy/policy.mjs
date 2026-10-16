// Política determinista por rol para los especialistas jz-* de Claude Code y OpenCode.
//
// La aplican el hook PreToolUse de Claude Code (.jz/hooks/claude-policy.mjs) y el plugin
// de OpenCode (.opencode/plugins/jz-guard.js). No depende del modelo ni del modo de permisos:
// devuelve "allow" para el trabajo ordinario dentro del alcance (sin preguntar) y "deny" para
// lo demás. Las reglas nativas de cada motor son la primera barrera; ésta es la segunda.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const READ_ONLY = { write: null, bash: null, delegate: false };
export const ROLES = {
  'jz-orchestrator': { write: null, bash: 'orchestrator', delegate: true },
  'jz-architect': { write: ['docs/'], bash: null, delegate: false },
  'jz-implementer': { write: '*', bash: 'implementer', delegate: false },
  'jz-implementer-copilot': { write: '*', bash: 'implementer', delegate: false },
  'jz-explorer': READ_ONLY,
  'jz-security': READ_ONLY,
  'jz-qa': READ_ONLY,
};
export const DELEGATES = new Set([
  'jz-architect', 'jz-explorer', 'jz-implementer', 'jz-implementer-copilot', 'jz-security', 'jz-qa',
]);
export const WRITER_ROLES = new Set(['jz-architect', 'jz-implementer', 'jz-implementer-copilot']);

// Plano de control: ningún agente lo modifica; lo cambia el humano.
const CONTROL_PLANE = ['.git', '.claude', '.opencode', '.jz', '.jz-state', 'AGENTS.md', 'CLAUDE.md',
  'opencode.json', 'opencode.jsonc', '.mcp.json'];
// Excepción: notas de handoff libres de los agentes.
const NOTES_DIR = '.jz-state/notes/';

const allow = (reason) => ({ decision: 'allow', reason });
const deny = (reason) => ({ decision: 'deny', reason });

export function roleOf(agent) {
  return typeof agent === 'string' && agent.startsWith('jz-') ? agent : null;
}

// ------------------------------------------------------------------ rutas

// Resuelve enlaces simbólicos aunque el archivo final todavía no exista.
export function realResolve(p, cwd) {
  let abs = path.resolve(cwd, p);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(abs), ...rest.reverse());
    } catch {
      const parent = path.dirname(abs);
      if (parent === abs) return path.join(abs, ...rest.reverse());
      rest.push(path.basename(abs));
      abs = parent;
    }
  }
}

const inside = (p, dir) => p === dir || p.startsWith(dir.endsWith('/') ? dir : dir + '/');

function isSecret(rel) {
  const base = path.basename(rel);
  if (/^\.env(\..+)?$/.test(base) && !/^\.env\.(example|sample|template)$/.test(base)) return true;
  return /\.(pem|key|p12|pfx)$/.test(base) || /^id_(rsa|ed25519|ecdsa|dsa)/.test(base);
}

function readRoots(wt) {
  const home = os.homedir();
  const project = wt.replace(/[^A-Za-z0-9]/g, '-');
  return [
    path.join(home, '.claude/plugins'), path.join(home, '.claude/skills'),
    path.join(home, '.agents/skills'), path.join(home, '.config/opencode/skills'),
    path.join(home, '.claude/projects', project), // resultados largos de herramientas de Claude
    path.join(home, '.local/share/opencode/tool-output'), '/tmp/opencode',
  ];
}

export function checkRead(p, _role, ctx) {
  const real = realResolve(p || '.', ctx.cwd);
  if (inside(real, ctx.wt)) {
    const rel = path.relative(ctx.wt, real);
    return isSecret(rel) ? deny(`lectura de secreto bloqueada: ${rel}`) : allow('lectura dentro del worktree');
  }
  if (readRoots(ctx.wt).some((r) => inside(real, r))) return allow('lectura de skills o resultados de herramientas');
  return deny(`lectura fuera del worktree: ${real}`);
}

export function checkWrite(p, role, ctx) {
  const spec = ROLES[role];
  if (!spec || !spec.write) return deny(`${role} es de sólo lectura`);
  if (!p) return deny('ruta de escritura vacía');
  const real = realResolve(p, ctx.cwd);
  if (!inside(real, ctx.wt) || real === ctx.wt) return deny(`escritura fuera del worktree: ${real}`);
  const rel = path.relative(ctx.wt, real);
  if (isSecret(rel)) return deny(`escritura de secreto bloqueada: ${rel}`);
  const notes = inside(real, path.join(ctx.wt, NOTES_DIR));
  if (!notes && CONTROL_PLANE.some((c) => rel === c || rel.startsWith(c + '/'))) {
    return deny(`plano de control protegido: ${rel} (lo modifica el humano)`);
  }
  if (spec.write !== '*' && !notes && !spec.write.some((pre) => rel.startsWith(pre))) {
    return deny(`${role} sólo escribe en ${spec.write.join(', ')} (intentó ${rel})`);
  }
  return allow('escritura dentro del alcance');
}

// ------------------------------------------------------------------ shell

const HEREDOC = /"\$\(cat <<'([A-Za-z_]+)'\n([\s\S]*?)\n\1\n\)"/g;

// Tokeniza un comando sin expansiones. Devuelve null ante cualquier construcción no
// soportada (sustitución, redirección a archivo, subshell, variables salvo $?, '&').
// ';', '&&' y '||' separan segmentos: cada segmento se valida por separado, sea cual sea el flujo.
export function tokenize(cmd) {
  const heredocs = [];
  let unsafe = false;
  const src = cmd.replace(HEREDOC, (_, tag, body) => {
    // El shell cierra el heredoc en la primera línea igual al delimitador.
    if (body.split('\n').includes(tag)) unsafe = true;
    heredocs.push(body);
    return `\u0000${heredocs.length - 1}\u0000`;
  });
  if (unsafe) return null;
  const tokens = [];
  let cur = null;
  const push = () => { if (cur !== null) tokens.push(cur); cur = null; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\u0000') {
      const end = src.indexOf('\u0000', i + 1);
      if (cur !== null) return null;
      tokens.push({ heredoc: heredocs[Number(src.slice(i + 1, end))] });
      i = end;
      continue;
    }
    if (c === ' ' || c === '\t') { push(); continue; }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) return null;
      cur = (cur ?? '') + src.slice(i + 1, end);
      i = end;
      continue;
    }
    if (c === '"') {
      let s = '';
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === '$' && src[j + 1] === '?') { s += '$?'; j++; continue; }
        if (src[j] === '$' || src[j] === '`') return null;
        if (src[j] === '\\' && '"\\$`'.includes(src[j + 1])) j++;
        s += src[j];
      }
      if (j >= src.length) return null;
      cur = (cur ?? '') + s;
      i = j;
      continue;
    }
    if (c === '&' && src[i + 1] === '&') { push(); tokens.push({ op: '&&' }); i++; continue; }
    if (c === '|' && src[i + 1] === '|') { push(); tokens.push({ op: '&&' }); i++; continue; }
    if (c === ';') { push(); tokens.push({ op: '&&' }); continue; }
    if (c === '|') { push(); tokens.push({ op: '|' }); continue; }
    if (c === '$' && src[i + 1] === '?') { cur = (cur ?? '') + '$?'; i++; continue; }
    if (c === '2' && cur === null && src.startsWith('2>&1', i) && /[\s]|$/.test(src[i + 4] ?? '')) {
      i += 3;
      continue;
    }
    if (';&|<>()$`\\!{}\n\r'.includes(c)) return null;
    if (c === '~' && cur === null) return null;
    cur = (cur ?? '') + c;
  }
  push();
  return tokens;
}

// Divide en segmentos '&&' y, dentro de cada uno, en etapas de tubería.
function parse(cmd) {
  const tokens = tokenize(cmd);
  if (!tokens || tokens.length === 0) return null;
  const segments = [[[]]];
  for (const t of tokens) {
    if (t.op === '&&') segments.push([[]]);
    else if (t.op === '|') segments.at(-1).push([]);
    else segments.at(-1).at(-1).push(t);
  }
  const ok = segments.every((seg) => seg.every((stage) => stage.length > 0));
  return ok ? segments : null;
}

const FILTERS = {
  head: { values: ['-n', '-c'], positional: 0 },
  tail: { values: ['-n', '-c'], positional: 0 },
  wc: { values: [], positional: 0 },
  sort: { values: ['-k', '-t'], positional: 0, forbid: ['-o', '-T', '--output'] },
  uniq: { values: [], positional: 0 },
  cut: { values: ['-d', '-f', '-c', '-b'], positional: 0 },
  grep: { values: ['-e', '-m', '-A', '-B', '-C'], positional: 1, forbid: ['-f', '-r', '-R', '-d', '-D'] },
};

function checkFilter(argv) {
  const spec = FILTERS[argv[0]];
  if (!spec) return deny(`sólo se admite filtrar con ${Object.keys(FILTERS).join(', ')}`);
  let positional = 0;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('-') && a !== '-') {
      const flag = a.split('=')[0];
      if ((spec.forbid ?? []).includes(flag) || flag.startsWith('--file') || flag.startsWith('--recursive')) {
        return deny(`opción no permitida en ${argv[0]}: ${a}`);
      }
      if (spec.values.includes(a)) i++;
      if (argv[0] === 'grep' && a === '-e') positional = Infinity;
      continue;
    }
    if (++positional > spec.positional) return deny(`${argv[0]} no puede leer archivos en una tubería`);
  }
  return allow('filtro de salida');
}

const GIT_READ = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'blame', 'merge-base',
  'describe', 'rev-list']);
const GIT_WRITE = new Set(['add', 'commit', 'rm', 'mv', 'restore']);
const BRANCH_READ = new Set(['--show-current', '--list', '-l', '-a', '--all', '-r', '--remotes', '-v', '-vv',
  '--verbose', '--contains', '--merged', '--no-merged', '--no-color', '--format']);

function checkGit(argv, role) {
  let i = 1;
  while (argv[i] === '--no-pager') i++;
  const sub = argv[i];
  const args = argv.slice(i + 1);
  if (!sub || sub.startsWith('-')) return deny(`opción global de git no permitida: ${sub ?? '(vacía)'}`);
  for (const a of args) {
    const flag = a.split('=')[0];
    // Opciones que escriben o leen archivos arbitrarios, o ejecutan programas externos.
    if (['--output', '--no-index', '--ext-diff', '--exec', '--upload-pack', '--receive-pack', '--contents',
      '--exclude-from', '--pathspec-from-file', '--ignore-revs-file'].includes(flag)) {
      return deny(`opción de git no permitida: ${a}`);
    }
  }
  if (GIT_READ.has(sub)) return allow(`git ${sub} (lectura)`);
  if (sub === 'branch') {
    const flags = args.filter((a) => a.startsWith('-')).map((a) => a.split('=')[0]);
    const listing = flags.includes('--list') || flags.includes('-l');
    if (flags.every((f) => BRANCH_READ.has(f)) && (listing || flags.length === args.length)) {
      return allow('git branch (lectura)');
    }
    return deny('git branch sólo en modo lectura (crear, mover o borrar ramas lo hace el humano)');
  }
  if (sub === 'worktree' && args[0] === 'list') return allow('git worktree list');
  if (sub === 'remote' && args.every((a) => a === '-v' || a === '--verbose')) return allow('git remote (lectura)');
  if (role === 'implementer' && GIT_WRITE.has(sub)) {
    const flags = args.map((a) => a.split('=')[0]);
    if (sub === 'commit') {
      const bad = flags.find((f) => ['--amend', '-F', '--file', '-t', '--template', '-C', '-c',
        '--reuse-message', '--reedit-message'].includes(f));
      return bad ? deny(`git commit ${bad} no permitido (historial sólo se amplía)`) : allow('commit local');
    }
    if ((sub === 'rm' || sub === 'mv') && flags.some((f) => ['-f', '--force'].includes(f))) {
      return deny(`git ${sub} --force descartaría cambios no confirmados`);
    }
    if (sub === 'restore' && (!flags.includes('--staged') && !flags.includes('-S')
      || flags.includes('--worktree') || flags.includes('-W'))) {
      return deny('git restore sólo con --staged (no descarta cambios del árbol de trabajo)');
    }
    return allow(`git ${sub} local`);
  }
  return deny(`git ${sub} no está permitido para este rol (push, merge, reset, checkout, stash, clean, config, `
    + 'rebase y similares requieren al humano)');
}

const JZ_TOOLS = { implementer: ['jz-run', 'jz-state', 'jz-checkpoint', 'jz-lock'], orchestrator: ['jz-state', 'jz-checkpoint', 'jz-lock'] };

function checkCommand(argv, bashRole, ctx, cwd) {
  const exe = argv[0];
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(exe)) return deny('no se admiten asignaciones de entorno');
  if (exe.includes('/')) {
    const real = realResolve(exe, cwd);
    const bin = path.join(ctx.wt, '.jz/bin') + '/';
    const name = real.startsWith(bin) ? real.slice(bin.length) : null;
    if (name && JZ_TOOLS[bashRole].includes(name)) {
      if (name === 'jz-lock' && !['status', undefined].includes(argv[1])) {
        return deny('jz-lock: sólo "status" (liberar un bloqueo lo decide el humano)');
      }
      return allow(`${name} (ejecutor acotado del proyecto)`);
    }
    return deny(`ejecutable no permitido: ${exe}`);
  }
  if (argv.some((a) => a.includes('$?')) && exe !== 'echo') return deny('$? sólo se admite en echo');
  if (exe === 'echo') return allow('echo');
  if (exe === 'git') return checkGit(argv, bashRole);
  if (exe === 'pwd') return argv.length === 1 ? allow('pwd') : deny('pwd sin argumentos');
  if (exe === 'ls') {
    for (const a of argv.slice(1)) {
      if (a.startsWith('-')) continue;
      if (!inside(realResolve(a, cwd), ctx.wt)) return deny(`ls fuera del worktree: ${a}`);
    }
    return allow('ls dentro del worktree');
  }
  const hint = bashRole === 'implementer'
    ? 'Ejecuta comandos de desarrollo con .jz/bin/jz-run <comando> (sandbox sin red ni acceso al host).'
    : 'El orquestador sólo lee el estado de git y usa .jz/bin/jz-state; delega la ejecución en jz-implementer.';
  return deny(`comando no permitido: ${exe}. ${hint}`);
}

export function checkBash(cmd, role, ctx) {
  const bashRole = ROLES[role]?.bash;
  if (!bashRole) return deny(`${role} no tiene shell`);
  if (typeof cmd !== 'string') return deny('comando vacío');
  const segments = parse(cmd.trim());
  if (!segments) {
    return deny('sintaxis de shell no admitida: sólo comandos simples unidos con &&, || o ; y filtros con |; '
      + 'sin &, redirecciones a archivo, $(), comillas invertidas, variables (salvo $?) ni subshells');
  }
  let cwd = ctx.cwd;
  const reasons = [];
  for (const seg of segments) {
    const [first, ...filters] = seg;
    if (first.some((t) => t.heredoc !== undefined)) {
      const idx = first.findIndex((t) => t.heredoc !== undefined);
      const isCommitMsg = first[0] === 'git' && first.includes('commit') && first[idx - 1] === '-m'
        && first.filter((t) => t.heredoc !== undefined).length === 1;
      if (!isCommitMsg) return deny("heredoc sólo como mensaje de git commit -m \"$(cat <<'EOF' ...)\"");
    }
    const argv = first.map((t) => (t.heredoc !== undefined ? t.heredoc : t));
    if (argv[0] === 'cd') {
      if (argv.length !== 2 || filters.length) return deny('cd requiere un único destino');
      const dest = realResolve(argv[1], cwd);
      if (!inside(dest, ctx.wt)) return deny(`cd fuera del worktree: ${argv[1]}`);
      cwd = dest;
      continue;
    }
    const r = checkCommand(argv, bashRole, ctx, cwd);
    if (r.decision !== 'allow') return r;
    reasons.push(r.reason);
    for (const f of filters) {
      if (f.some((t) => typeof t !== 'string')) return deny('heredoc no permitido en un filtro');
      const fr = checkFilter(f);
      if (fr.decision !== 'allow') return fr;
    }
  }
  return allow(reasons.join('; ') || 'cd');
}

// ------------------------------------------------------------------ delegación

export function checkDelegate(target, role, opts = {}) {
  if (!ROLES[role]?.delegate) return deny(`${role} no puede delegar (sin cadenas de subagentes)`);
  if (!DELEGATES.has(target)) return deny(`delegación sólo en especialistas jz-* (intentó ${target ?? '(vacío)'})`);
  if (WRITER_ROLES.has(target) && opts.background) {
    return deny(`${target} escribe: se ejecuta en primer plano para mantener un único escritor`);
  }
  return allow(`delegación en ${target}`);
}

// ------------------------------------------------------------------ escritor único

export function lockPath(wt) {
  return path.join(wt, '.jz-state', 'writer.lock');
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export function readLock(wt) {
  try {
    return JSON.parse(fs.readFileSync(lockPath(wt), 'utf8'));
  } catch {
    return null;
  }
}

// holder: { engine, pid, session, agent, call }
export function acquireWriter(wt, holder) {
  fs.mkdirSync(path.dirname(lockPath(wt)), { recursive: true });
  const data = JSON.stringify({ ...holder, since: new Date().toISOString() }) + '\n';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockPath(wt), data, { flag: 'wx' });
      return allow(`bloqueo de escritor adquirido por ${holder.agent}`);
    } catch (e) {
      if (e.code !== 'EEXIST') return deny(`no se pudo crear el bloqueo de escritor: ${e.message}`);
      const cur = readLock(wt);
      if (cur && pidAlive(cur.pid)) {
        return deny(`otro escritor está activo en este worktree: ${cur.agent} (${cur.engine}, pid ${cur.pid}, `
          + `desde ${cur.since}). Espera a que termine; no lances escritores en paralelo.`);
      }
      // Bloqueo huérfano: su proceso ya no existe.
      fs.rmSync(lockPath(wt), { force: true });
    }
  }
  return deny('no se pudo adquirir el bloqueo de escritor');
}

export function releaseWriter(wt, match) {
  const cur = readLock(wt);
  if (!cur) return false;
  if (Object.entries(match).every(([k, v]) => cur[k] === v)) {
    fs.rmSync(lockPath(wt), { force: true });
    return true;
  }
  return false;
}
