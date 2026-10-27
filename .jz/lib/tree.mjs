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
//   - los nombres de archivo viajan separados por NUL y nunca como argumentos de otro programa;
//   - la huella falla cerrada (código JZ_TREE_*, salida 3) ante lo que no puede representar sin pérdida:
//     nombres no UTF-8, repositorios anidados o directorios .git, gitlinks, tipos desconocidos, errores de
//     lectura y archivos que cambian mientras se leen.
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
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.excludesFile=/dev/null'];
const GIT_ENV = {
  PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};

export class TreeError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

// Devuelve la salida en bytes. missingOk: estado 1 sin mensaje (rev-parse -q --verify de una ref que no
// existe) devuelve null; cualquier otro fallo es un error.
function git(wt, args, { missingOk = false } = {}) {
  try {
    return execFileSync('git', [...GIT_PREFIX, ...args], {
      cwd: wt, env: GIT_ENV, maxBuffer: 256 << 20, timeout: 60_000, killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = String(e.stderr ?? '').trim();
    if (missingOk && e.status === 1 && err === '') return null;
    throw new TreeError('JZ_TREE_GIT', `git ${args[0]} falló: ${(err || e.message).split('\n')[0]}`);
  }
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const shown = (b) => [...b].map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : `\\x${c.toString(16).padStart(2, '0')}`)).join('');

// Registros separados por NUL, decodificados sin pérdida: lo que no vuelve a dar los mismos bytes se rechaza.
function records(buf) {
  const out = [];
  for (let i = 0, j; i < buf.length; i = j + 1) {
    j = buf.indexOf(0, i);
    if (j < 0) j = buf.length;
    if (j === i) continue;
    const b = buf.subarray(i, j);
    let str;
    try {
      str = UTF8.decode(b);
    } catch {
      throw new TreeError('JZ_TREE_NON_UTF8', `ruta no UTF-8: ${shown(b)}`);
    }
    if (!Buffer.from(str, 'utf8').equals(b)) throw new TreeError('JZ_TREE_NON_UTF8', `ruta no representable: ${shown(b)}`);
    out.push(str);
  }
  return out;
}

// Rutas relativas tal como las da git; una que pudiera salir del worktree o entrar en un .git es un error.
function checkRel(rel) {
  if (path.isAbsolute(rel) || rel.split('/').some((c) => c === '..' || c === '.' || c === '' || c === '.git')) {
    throw new TreeError('JZ_TREE_UNSAFE_PATH', `ruta no admitida: ${JSON.stringify(rel)}`);
  }
  return rel;
}

const INDEX_REC = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t([\s\S]+)$/;

// Entradas del índice en su orden (ruta y stage). Un gitlink apunta a otro repositorio cuyo contenido la
// huella no cubre: se rechaza.
function indexEntries(wt) {
  const list = [];
  const map = new Map();
  for (const rec of records(git(wt, ['ls-files', '-s', '-z']))) {
    const m = INDEX_REC.exec(rec);
    if (!m) throw new TreeError('JZ_TREE_INDEX', `entrada del índice no reconocida: ${JSON.stringify(rec)}`);
    const [, mode, oid, stage, rel] = m;
    checkRel(rel);
    if (mode === '160000') throw new TreeError('JZ_TREE_GITLINK', `gitlink (submódulo) no admitido: ${rel}`);
    list.push({ mode, oid, stage, rel });
    const cur = map.get(rel);
    if (cur) cur.conflict = true;
    else map.set(rel, { mode, oid, conflict: stage !== '0' });
  }
  return { list, map };
}

// git lista un repositorio anidado como «dir/» y no entra en él.
function untracked(wt) {
  return records(git(wt, ['ls-files', '-o', '--exclude-standard', '-z'])).map((rel) => {
    if (rel.endsWith('/')) throw new TreeError('JZ_TREE_NESTED_REPO', `repositorio anidado no admitido: ${rel}`);
    return checkRel(rel);
  });
}

const isMissing = (e) => e.code === 'ENOENT' || e.code === 'ENOTDIR';
const ioError = (rel, e) => new TreeError('JZ_TREE_IO', `${JSON.stringify(rel)}: ${e.code ?? e.message}`);

// git omite cualquier entrada .git (sea o no un repositorio válido) y su contenido no entra en la huella.
// Se buscan en cada directorio que git recorrió: los antecesores de las rutas listadas y, recorridos enteros
// sin seguir enlaces, los directorios no rastreados (--directory sólo muestra el más alto), salvo sus
// subdirectorios ignorados, que quedan fuera de la huella como el resto de lo ignorado. Un directorio
// alcanzado a través de un enlace no se inspecciona: sus rutas ya se registran como externas.
function rejectNestedGit(wt, rels) {
  const nested = (d) => new TreeError('JZ_TREE_NESTED_REPO', `directorio .git anidado no admitido: ${d}/.git`);
  const listDirs = (args) => new Set(records(git(wt, ['ls-files', '-o', '--directory', ...args, '--exclude-standard', '-z']))
    .filter((rel) => rel.endsWith('/')).map((rel) => checkRel(rel.slice(0, -1))));
  const ignored = listDirs(['-i']);
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(wt, d), { withFileTypes: true });
    } catch (e) {
      throw ioError(d, e);
    }
    for (const e of entries) {
      const rel = `${d}/${e.name}`;
      if (e.name === '.git') throw nested(d);
      if (e.isDirectory() && !ignored.has(rel)) walk(rel);
    }
  };
  const dirs = new Set();
  for (const d of listDirs([])) {
    dirs.add(d);
    const abs = path.join(wt, d);
    if (fs.realpathSync(abs) === abs) walk(d);
  }
  for (const rel of rels) {
    for (let d = path.posix.dirname(rel); d !== '.'; d = path.posix.dirname(d)) dirs.add(d);
  }
  for (const d of dirs) {
    const abs = path.join(wt, d);
    try {
      if (fs.realpathSync(abs) !== abs) continue;
      fs.lstatSync(path.join(abs, '.git'));
    } catch (e) {
      if (isMissing(e)) continue;
      throw ioError(`${d}/.git`, e);
    }
    throw nested(d);
  }
}

// La configuración del repositorio (core.worktree) podría hacer que git describa otro árbol.
function checkToplevel(wt) {
  const [top] = records(git(wt, ['rev-parse', '--show-toplevel']).subarray(0, -1));
  if (top !== wt) throw new TreeError('JZ_TREE_TOPLEVEL', `git describe ${top}, no ${wt}`);
}

function headOf(wt) {
  return git(wt, ['rev-parse', '--verify', '-q', 'HEAD'], { missingOk: true })?.toString().trim() || null;
}

// Descripción de una ruta del árbol sin seguir enlaces ni abrir archivos especiales.
// hashes: algoritmos con los que se resume el contenido de un archivo regular, con la cabecera de blob
// de git para los que lo piden. Sólo «no existe» se registra como ausente; los demás errores fallan.
function describe(wt, rel, hashes) {
  const abs = path.join(wt, rel);
  let parentReal;
  let st;
  try {
    parentReal = fs.realpathSync(path.dirname(abs));
    if (parentReal !== path.dirname(abs)) return { kind: 'beyond-symlink' };
    st = fs.lstatSync(abs);
  } catch (e) {
    if (isMissing(e)) return { kind: 'missing' };
    throw ioError(rel, e);
  }
  if (st.isSymbolicLink()) {
    let target;
    try {
      target = fs.readlinkSync(abs, { encoding: 'buffer' });
    } catch (e) {
      throw ioError(rel, e);
    }
    return { kind: 'symlink', digests: digestBuffer(target, hashes) };
  }
  if (st.isDirectory()) return { kind: 'dir' };
  if (st.isFIFO()) return { kind: 'fifo' };
  if (st.isSocket()) return { kind: 'socket' };
  if (st.isCharacterDevice()) return { kind: `chardev ${st.rdev}` };
  if (st.isBlockDevice()) return { kind: `blockdev ${st.rdev}` };
  if (!st.isFile()) throw new TreeError('JZ_TREE_TYPE', `tipo de archivo no admitido: ${rel}`);
  let fd;
  try {
    fd = fs.openSync(abs, READ_FLAGS);
  } catch (e) {
    throw ioError(rel, e);
  }
  try {
    const fst = fs.fstatSync(fd);
    if (!fst.isFile() || fst.ino !== st.ino || fst.dev !== st.dev) {
      throw new TreeError('JZ_TREE_RACE', `cambió mientras se inspeccionaba: ${rel}`);
    }
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
    if (read !== fst.size) throw new TreeError('JZ_TREE_RACE', `cambió mientras se leía: ${rel}`);
    return { kind: 'file', perm: fst.mode & 0o7777, exec: (fst.mode & 0o100) !== 0, digests: hs.map((h) => h.digest('hex')) };
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

// Identidad de HEAD, del índice completo (modo, OID, stage y ruta de cada entrada) y del contenido del árbol
// de trabajo rastreado y no ignorado (tipo, permisos y contenido de cada ruta).
export function fingerprint(wt) {
  checkToplevel(wt);
  const head = headOf(wt) ?? 'no-head';
  const { list, map: index } = indexEntries(wt);
  const paths = [...new Set([...index.keys(), ...untracked(wt)])].sort(byteOrder);
  rejectNestedGit(wt, paths);
  const h = crypto.createHash('sha256').update(`jz-tree-v3\0${head}\0`);
  for (const e of list) h.update(`i\0${e.mode}\0${e.oid}\0${e.stage}\0${e.rel}\0`);
  for (const rel of paths) {
    const d = describe(wt, rel, [{ algo: 'sha256' }]);
    const what = d.kind === 'file' ? `file ${d.perm.toString(8)} ${d.digests[0]}`
      : d.kind === 'symlink' ? `symlink ${d.digests[0]}` : d.kind;
    h.update(`${index.has(rel) ? 't' : 'u'}\0${rel}\0${what}\0`);
  }
  return h.digest('hex');
}

// I2 (jz-verify): HEAD completo, huella del índice por separado y huella del árbol (que ya liga ambos).
// HEAD y el índice se leen antes y después de la huella: si cambian entre medias, la instantánea no es coherente.
export function snapshot(wt) {
  const read = () => {
    const h = crypto.createHash('sha256').update('jz-index-v1\0');
    for (const e of indexEntries(wt).list) h.update(`${e.mode}\0${e.oid}\0${e.stage}\0${e.rel}\0`);
    return { head: headOf(wt), index: h.digest('hex') };
  };
  const before = read();
  const tree = fingerprint(wt);
  const after = read();
  if (before.head !== after.head || before.index !== after.index) {
    throw new TreeError('JZ_TREE_RACE', 'HEAD o el índice cambiaron mientras se calculaba la huella');
  }
  return { ...after, tree };
}

// Formato de git status --porcelain=v1 (XY ruta), con las rutas inusuales entre comillas.
export function status(wt) {
  checkToplevel(wt);
  const format = git(wt, ['rev-parse', '--show-object-format']).toString().trim();
  const hashes = [{ algo: format === 'sha256' ? 'sha256' : 'sha1', blob: true }];
  const { map: index } = indexEntries(wt);
  const untrackedPaths = untracked(wt);
  rejectNestedGit(wt, [...index.keys(), ...untrackedPaths]);
  const staged = new Map();
  if (headOf(wt) !== null) {
    const recs = records(git(wt, ['diff-index', '--cached', '--no-renames', '--no-ext-diff', '--no-textconv',
      '--name-status', '-z', 'HEAD']));
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
    if (e) {
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
  for (const rel of untrackedPaths.sort(byteOrder)) lines.push(`?? ${quote(rel)}`);
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
    process.stderr.write(`jz-tree: ${e instanceof TreeError ? e.message : `JZ_TREE_ERROR: ${e.message}`}\n`);
    process.exit(3);
  }
}
