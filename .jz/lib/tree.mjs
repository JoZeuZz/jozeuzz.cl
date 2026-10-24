#!/usr/bin/env node
// Huella del árbol y lista de cambios sin ejecutar código del repositorio.
//
// git status y git diff contra el árbol de trabajo pueden ejecutar filtros clean, textconv y fsmonitor
// configurados en el repositorio, fuera del sandbox de jz-run. Aquí Git sólo lee el índice y los objetos
// (rev-parse, ls-files, diff-index --cached) y el contenido de los archivos lo lee Node directamente:
//   - O_NOFOLLOW | O_NONBLOCK: un enlace simbólico se registra por su destino y nunca se sigue; una FIFO
//     o un dispositivo se registran por su tipo y no se abren;
//   - una ruta cuyo directorio padre no resuelve a sí mismo dentro del worktree (porque un componente es
//     un enlace) se registra como tal, sin leerla;
//   - los nombres de archivo viajan separados por NUL y nunca como argumentos de otro programa.
// Patrón de proceso y de lectura tomado de tools/jz-ai M0 (exec.js, fs-read.js).
//
// Uso: node .jz/lib/tree.mjs fingerprint|status <worktree>
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
const GIT_PREFIX = ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
  '-c', 'core.hooksPath=/dev/null'];
const GIT_ENV = {
  PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};

function git(wt, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', [...GIT_PREFIX, ...args], {
      cwd: wt, env: GIT_ENV, encoding: 'utf8', maxBuffer: 256 << 20, timeout: 60_000, killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`git ${args[0]} falló: ${String(e.stderr ?? e.message).trim().split('\n')[0]}`);
  }
}

const nulSplit = (out) => out.split('\0').filter(Boolean);

// Rutas relativas tal como las da git; se descartan las que pudieran salir del worktree.
function safeRel(rel) {
  return !path.isAbsolute(rel) && !rel.split('/').some((c) => c === '..' || c === '' || c === '.git');
}

function indexEntries(wt) {
  const map = new Map();
  for (const rec of nulSplit(git(wt, ['ls-files', '-s', '-z']))) {
    const tab = rec.indexOf('\t');
    const [mode, oid, stage] = rec.slice(0, tab).split(' ');
    const rel = rec.slice(tab + 1);
    if (!safeRel(rel)) continue;
    const cur = map.get(rel);
    if (cur) cur.conflict = true;
    else map.set(rel, { mode, oid, conflict: stage !== '0' });
  }
  return map;
}

// Un repositorio anidado aparece como «dir/»: se conserva la barra para mostrarlo como git.
function untracked(wt) {
  return nulSplit(git(wt, ['ls-files', '-o', '--exclude-standard', '-z'])).filter((rel) => safeRel(rel.replace(/\/$/, '')));
}

// Descripción de una ruta del árbol sin seguir enlaces ni abrir archivos especiales.
// hashes: algoritmos con los que se resume el contenido de un archivo regular, con la cabecera de blob
// de git para los que lo piden.
function describe(wt, rel, hashes) {
  const abs = path.join(wt, rel);
  let parentReal;
  try {
    parentReal = fs.realpathSync(path.dirname(abs));
  } catch {
    return { kind: 'missing' };
  }
  if (parentReal !== path.dirname(abs)) return { kind: 'beyond-symlink' };
  let st;
  try {
    st = fs.lstatSync(abs);
  } catch {
    return { kind: 'missing' };
  }
  if (st.isSymbolicLink()) {
    const target = fs.readlinkSync(abs);
    return { kind: 'symlink', target, digests: digestBuffer(Buffer.from(target), hashes) };
  }
  if (st.isDirectory()) return { kind: 'dir' };
  if (!st.isFile()) return { kind: 'special' };
  const fd = fs.openSync(abs, READ_FLAGS);
  try {
    const fst = fs.fstatSync(fd);
    if (!fst.isFile() || fst.ino !== st.ino || fst.dev !== st.dev) return { kind: 'special' };
    const hs = hashes.map(({ algo, blob }) => {
      const h = crypto.createHash(algo);
      if (blob) h.update(`blob ${fst.size}\0`);
      return h;
    });
    const buf = Buffer.alloc(1 << 20);
    let read = 0;
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) {
      read += n;
      for (const h of hs) h.update(buf.subarray(0, n));
    }
    if (read !== fst.size) return { kind: 'special' }; // cambió mientras se leía
    return { kind: 'file', exec: (fst.mode & 0o100) !== 0, digests: hs.map((h) => h.digest('hex')) };
  } finally {
    fs.closeSync(fd);
  }
}

function digestBuffer(b, hashes) {
  return hashes.map(({ algo, blob }) => {
    const h = crypto.createHash(algo);
    if (blob) h.update(`blob ${b.length}\0`);
    return h.update(b).digest('hex');
  });
}

const byteOrder = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export function fingerprint(wt) {
  const head = git(wt, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true })?.trim() || 'no-head';
  const index = indexEntries(wt);
  const paths = [...new Set([...index.keys(), ...untracked(wt).map((rel) => rel.replace(/\/$/, ''))])].sort(byteOrder);
  const h = crypto.createHash('sha256').update(`jz-tree-v2\0${head}\0`);
  for (const rel of paths) {
    const d = describe(wt, rel, [{ algo: 'sha256' }]);
    const what = d.kind === 'file' ? `file ${d.exec ? 'x' : '-'} ${d.digests[0]}`
      : d.kind === 'symlink' ? `symlink ${d.digests[0]}` : d.kind;
    h.update(`${index.has(rel) ? 't' : 'u'}\0${rel}\0${what}\0`);
  }
  return h.digest('hex').slice(0, 16);
}

// Formato de git status --porcelain=v1 (XY ruta), con las rutas inusuales entre comillas.
export function status(wt) {
  const format = git(wt, ['rev-parse', '--show-object-format'], { allowFail: true })?.trim() || 'sha1';
  const hashes = [{ algo: format === 'sha256' ? 'sha256' : 'sha1', blob: true }];
  const index = indexEntries(wt);
  const staged = new Map();
  const hasHead = git(wt, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true }) !== null;
  if (hasHead) {
    const recs = nulSplit(git(wt, ['diff-index', '--cached', '--no-renames', '--name-status', '-z', 'HEAD']));
    for (let i = 0; i + 1 < recs.length; i += 2) staged.set(recs[i + 1], recs[i][0]);
  } else {
    for (const rel of index.keys()) staged.set(rel, 'A');
  }
  const lines = [];
  for (const rel of [...new Set([...index.keys(), ...staged.keys()])].sort(byteOrder)) {
    const e = index.get(rel);
    let y = ' ';
    if (e?.conflict) {
      lines.push(`UU ${quote(rel)}`);
      continue;
    }
    if (e && e.mode !== '160000') {
      const d = describe(wt, rel, hashes);
      if (d.kind === 'missing' || d.kind === 'beyond-symlink') y = 'D';
      else if (d.kind === 'file') {
        const mode = d.exec ? '100755' : '100644';
        if (d.digests[0] !== e.oid || mode !== e.mode) y = 'M';
      } else if (d.kind === 'symlink') {
        if (e.mode !== '120000' || d.digests[0] !== e.oid) y = 'M';
      } else y = 'M';
    }
    const x = staged.get(rel) ?? ' ';
    if (x !== ' ' || y !== ' ') lines.push(`${x}${y} ${quote(rel)}`);
  }
  for (const rel of untracked(wt).sort(byteOrder)) lines.push(`?? ${quote(rel)}`);
  return lines;
}

function quote(rel) {
  return /[\x00-\x1f\x7f"\\]/.test(rel) ? JSON.stringify(rel) : rel;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, dir] = process.argv.slice(2);
  try {
    if (!dir || !['fingerprint', 'status'].includes(cmd)) {
      process.stderr.write('uso: node .jz/lib/tree.mjs fingerprint|status <worktree>\n');
      process.exit(2);
    }
    const wt = fs.realpathSync(dir);
    if (cmd === 'fingerprint') process.stdout.write(`${fingerprint(wt)}\n`);
    else for (const l of status(wt)) process.stdout.write(`${l}\n`);
  } catch (e) {
    process.stderr.write(`jz-tree: ${e.message}\n`);
    process.exit(3);
  }
}
