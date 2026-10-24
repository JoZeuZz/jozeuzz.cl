// Política determinista por rol para los especialistas jz-* de Claude Code y OpenCode.
//
// La aplican el hook PreToolUse de Claude Code (.jz/hooks/claude-policy.mjs) y el plugin
// de OpenCode (.opencode/plugins/jz-guard.js). No depende del modelo ni del modo de permisos:
// devuelve "allow" para el trabajo ordinario dentro del alcance (sin preguntar) y "deny" para
// lo demás. Las reglas nativas de cada motor son la primera barrera; ésta es la segunda.
import crypto from 'node:crypto';
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
    // Comodines sin comillas: el shell los expande después de validar (echo /root/.ssh/*).
    if ('*?['.includes(c)) return null;
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

// Opciones largas que escriben o leen archivos arbitrarios, o ejecutan programas externos. git acepta también
// cualquier prefijo único (blame --cont=<archivo>): se deniega todo prefijo de cuatro o más caracteres.
export const GIT_DENIED_LONG = ['--output', '--no-index', '--ext-diff', '--exec', '--upload-pack', '--receive-pack',
  '--contents', '--exclude-from', '--pathspec-from-file', '--ignore-revs-file'];
// Opciones cortas que leen un archivo, solas o agrupadas (-S<archivo>, -wS <archivo>).
const GIT_DENIED_SHORT = { blame: /^-[^-]*S/, 'ls-files': /^-[^-]*X/, diff: /^-[^-]*O/, log: /^-[^-]*O/, show: /^-[^-]*O/ };

function checkGit(argv, ctx, cwd) {
  let i = 1;
  while (argv[i] === '--no-pager') i++;
  const sub = argv[i];
  const args = argv.slice(i + 1);
  if (!sub || sub.startsWith('-')) return deny(`opción global de git no permitida: ${sub ?? '(vacía)'}`);
  for (const a of args) {
    const flag = a.split('=')[0];
    if (GIT_DENIED_LONG.includes(flag)
      || (flag.startsWith('--') && flag.length >= 4 && GIT_DENIED_LONG.some((d) => d.startsWith(flag)))
      || GIT_DENIED_SHORT[sub]?.test(a)) {
      return deny(`opción de git no permitida: ${a}`);
    }
    // Una ruta fuera del worktree convierte git diff en diff sin índice (lee cualquier archivo) y, en los demás
    // subcomandos, apunta fuera del repositorio. Las revisiones (HEAD~1, main..x, HEAD:ruta) resuelven dentro.
    if (!a.startsWith('-')) {
      const real = realResolve(a, cwd);
      if (!inside(real, ctx.wt)) return deny(`git: ruta fuera del worktree: ${a}`);
      if (isSecret(path.relative(ctx.wt, real))) return deny(`git: ruta de secreto bloqueada: ${a}`);
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
  if (GIT_WRITE.has(sub)) {
    // I1: add, commit, rm, mv y restore modifican el índice o el historial sin pasar por checkWrite y ejecutan
    // hooks y filtros fuera de jz-run. Ningún rol autónomo los usa; los commits los hace el humano.
    return deny(`git ${sub} no está permitido a los agentes: los commits (add, commit, rm, mv, restore) `
      + 'los hace el humano; deja los cambios en el árbol y descríbelos en el informe');
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
  if (exe === 'git') return checkGit(argv, ctx, cwd);
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
  // Antes que el comando: un directorio de trabajo externo (por «..» o por un enlace) daría acceso a otro
  // repositorio aunque el comando sea de lectura.
  let cwd = realResolve(ctx.cwd ?? ctx.wt, ctx.wt);
  if (!inside(cwd, ctx.wt)) return deny(`directorio de trabajo fuera del worktree: ${cwd}`);
  const segments = parse(cmd.trim());
  if (!segments) {
    return deny('sintaxis de shell no admitida: sólo comandos simples unidos con &&, || o ; y filtros con |; '
      + 'sin &, redirecciones a archivo, $(), comillas invertidas, variables (salvo $?) ni subshells');
  }
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
      // cd - y cd ±N saltan a $OLDPWD o a la pila de directorios, no a la ruta escrita.
      if (/^[-+]/.test(argv[1])) return deny(`cd no admite opciones ni ${argv[1]}`);
      const dest = realResolve(argv[1], cwd);
      if (!inside(dest, ctx.wt)) return deny(`cd fuera del worktree: ${argv[1]}`);
      if (!fs.statSync(dest, { throwIfNoEntry: false })?.isDirectory()) return deny(`cd: no es un directorio: ${argv[1]}`);
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

const readRaw = (wt) => {
  try {
    return fs.readFileSync(lockPath(wt), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};

// Mutex del bloqueo: quien lo crea es el único que puede retirar un huérfano, liberar o reescribir el bloqueo.
// Crear el bloqueo no lo necesita: sólo tiene éxito si no existe. Si un proceso muere con el mutex tomado,
// esas operaciones quedan denegadas hasta que el humano ejecute jz-lock release.
export function recoverPath(wt) {
  return `${lockPath(wt)}.recover`;
}

const MUTEX_WAIT_MS = 200;
// Un bloqueo ilegible más reciente que esto se considera de otro escritor a medio crear (versión anterior o
// escritura ajena); más antiguo, huérfano.
const UNREADABLE_GRACE_MS = 60_000;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Ejecuta fn con el mutex tomado; devuelve { busy: true } si no se obtiene a tiempo.
function withMutex(wt, fn) {
  const token = `${process.pid} ${crypto.randomUUID()}\n`;
  const deadline = Date.now() + MUTEX_WAIT_MS;
  for (;;) {
    try {
      fs.writeFileSync(recoverPath(wt), token, { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST' || Date.now() >= deadline) return { busy: true, error: e };
      pause(5);
    }
  }
  try {
    return { value: fn() };
  } finally {
    // Sólo el propio: el humano pudo retirarlo con jz-lock release mientras tanto.
    try {
      if (fs.readFileSync(recoverPath(wt), 'utf8') === token) fs.unlinkSync(recoverPath(wt));
    } catch {
      // Ya no existe.
    }
  }
}

const mutexDenied = (wt, r) => deny(r.error?.code === 'EEXIST'
  ? 'otra operación sobre el bloqueo de escritor está en curso o quedó interrumpida '
    + `(${path.relative(wt, recoverPath(wt))}); si no hay ningún escritor activo, el humano ejecuta .jz/bin/jz-lock release`
  : `no se pudo tomar el mutex del bloqueo de escritor: ${r.error?.message}`);

// Retira el bloqueo huérfano leído (seen) sólo si sigue siendo el mismo: entre la lectura y el borrado otro
// proceso pudo recuperarlo y adquirir el suyo. Con el mutex tomado nadie más puede borrarlo ni reescribirlo,
// y nadie puede crear otro mientras exista. Devuelve una denegación o null para reintentar.
function reapOrphan(wt, seen) {
  const r = withMutex(wt, () => {
    if (readRaw(wt) === seen) fs.unlinkSync(lockPath(wt));
  });
  if (r.busy) return mutexDenied(wt, r);
  return null;
}

// holder: { engine, pid, session, agent, call }
// El bloqueo se escribe en un temporal y se enlaza con link(2), que falla si ya existe: nunca hay un bloqueo
// visible a medio escribir.
export function acquireWriter(wt, holder) {
  fs.mkdirSync(path.dirname(lockPath(wt)), { recursive: true });
  const data = JSON.stringify({ ...holder, since: new Date().toISOString() }) + '\n';
  const tmp = `${lockPath(wt)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, data, { flag: 'wx' });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fs.linkSync(tmp, lockPath(wt));
        return allow(`bloqueo de escritor adquirido por ${holder.agent}`);
      } catch (e) {
        if (e.code !== 'EEXIST') return deny(`no se pudo crear el bloqueo de escritor: ${e.message}`);
      }
      let seen;
      let mtime;
      try {
        seen = readRaw(wt);
        mtime = seen === null ? 0 : fs.statSync(lockPath(wt)).mtimeMs;
      } catch (e) {
        if (e.code === 'ENOENT') continue;
        return deny(`no se pudo leer el bloqueo de escritor: ${e.message}`);
      }
      if (seen === null) continue; // liberado entre medias
      let cur = null;
      try {
        cur = JSON.parse(seen);
      } catch {
        if (Date.now() - mtime < UNREADABLE_GRACE_MS) {
          return deny('el bloqueo de escritor es ilegible y reciente (otro escritor podría estar creándolo); '
            + 'reintenta más tarde o, si no hay ningún escritor, el humano ejecuta .jz/bin/jz-lock release');
        }
      }
      if (cur && pidAlive(cur.pid)) {
        return deny(`otro escritor está activo en este worktree: ${cur.agent} (${cur.engine}, pid ${cur.pid}, `
          + `desde ${cur.since}). Espera a que termine; no lances escritores en paralelo.`);
      }
      // Bloqueo huérfano: su proceso ya no existe.
      const r = reapOrphan(wt, seen);
      if (r) return r;
    }
    return deny('no se pudo adquirir el bloqueo de escritor');
  } catch (e) {
    return deny(`no se pudo crear el bloqueo de escritor: ${e.message}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// OpenCode: el bloqueo lo adquiere la sesión que delega; la sesión del subagente escritor se conoce después,
// con su primera petición al modelo. Se vincula una sola vez, y sólo si coincide el titular.
export function bindWriterSession(wt, match, session) {
  const r = withMutex(wt, () => {
    const cur = readLock(wt);
    if (!cur || cur.writer_session || !Object.entries(match).every(([k, v]) => cur[k] === v)) return false;
    const tmp = `${lockPath(wt)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...cur, writer_session: session }) + '\n');
    fs.renameSync(tmp, lockPath(wt));
    return true;
  });
  return r.busy ? false : r.value;
}

export function releaseWriter(wt, match) {
  const r = withMutex(wt, () => {
    const cur = readLock(wt);
    if (!cur || !Object.entries(match).every(([k, v]) => cur[k] === v)) return false;
    fs.unlinkSync(lockPath(wt));
    return true;
  });
  return r.busy ? false : r.value;
}
