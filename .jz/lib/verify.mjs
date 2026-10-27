#!/usr/bin/env node
// Verificación reconocida (I2): sólo un perfil del registro .jz/profiles puede producir evidencia de validación.
//
// jz-verify run <perfil> ejecuta el argv exacto del perfil mediante jz-run y, desde fuera del sandbox:
//   1. comprueba que el perfil existe y cumple el formato autorizado (node --test con el reporter del plano de
//      control y los archivos que declara su oráculo; sin argv libre, filtros de pruebas ni otros reporters);
//   2. toma HEAD, la huella del índice y la del árbol (.jz/lib/tree.mjs) y la identidad del runtime antes y
//      después, y exige que coincidan entre sí y con lo que registró jz-run;
//   3. localiza el registro de esa ejecución en .jz-state/runs.jsonl (por el pid de jz-run) y exige el mismo
//      comando, el mismo cwd, la huella previa y rc=0;
//   4. aplica el oráculo a los eventos estructurados del log (verify-reporter.mjs): inicio y fin presentes, resumen
//      del runner coherente con los eventos, pruebas > 0, ninguna fallida, cancelada, omitida o pendiente sin
//      permiso del perfil y al menos una prueba por archivo esperado;
//   5. escribe la evidencia en .jz-state/verify/<perfil>.json (temporal, fsync y rename). El proceso verificado
//      no puede escribirla: .jz-state es de sólo lectura en el sandbox y plano de control para los agentes.
// jz-verify status recalcula la vigencia: VALIDADO, FALLIDO, OBSOLETO, BLOQUEADO o SIN_VERIFICACION.
// Cada perfil acredita una sola unidad funcional (unitId, en el propio perfil protegido). Un perfil VALIDADO sólo dice
// que su unidad está verificada para el estado actual; jz-checkpoint decide con esa asociación qué unidad es validada.
//
// La evidencia es local y no es una atestación criptográfica: root o cualquier proceso del mismo usuario puede
// reescribir .jz-state. El digest sólo detecta corrupción o ediciones descuidadas.
//
// Uso: node .jz/lib/verify.mjs <worktree> run <perfil> | status [--json]   (normalmente vía .jz/bin/jz-verify)
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot, TreeError } from './tree.mjs';

const PROFILE_DIR = '.jz/profiles';
const EVIDENCE_DIR = '.jz-state/verify';
const RUNS = '.jz-state/runs.jsonl';
const SCHEMA = 'jz-verify-evidence-v1';
const ORACLE_FORMAT = 'node-test-jz-v1';
const REPORTER_ARG = '--test-reporter=./.jz/lib/verify-reporter.mjs';
const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Identificador canónico de unidad: misma forma que el de perfil, para que una etiqueta descriptiva no lo sea.
const UNIT_ID = PROFILE_ID;
const LOG_ID = /^\.jz-state\/runs\/\d{8}T\d{6}Z-(\d+)\.log$/;
// PATH del proceso dentro de jz-run: el node y el git que se identifican son los que ejecuta el perfil.
const SANDBOX_PATH = ['/usr/local/bin', '/usr/bin', '/bin'];
const RUN_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
const SUMMARY_KEYS = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const MAX_FAILURES = 20;
const ASSURANCE = 'Evidencia local escrita por el plano de control (jz-verify, fuera del sandbox); no es una atestación '
  + 'criptográfica: root o cualquier proceso del mismo usuario puede reescribir .jz-state.';
const IGNORED_NOTE = 'Los archivos ignorados por git (node_modules, cachés, .jz-state) no forman parte de la huella. '
  + 'El perfil no declara dependencias ignoradas (v1 no las admite): su identidad no se registra y no se afirma su '
  + 'reproducibilidad.';

export class VerifyError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
// JSON con las claves ordenadas: el digest no depende del orden de escritura.
const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const sameJson = (a, b) => canonical(a) === canonical(b);
const isMissing = (e) => e.code === 'ENOENT' || e.code === 'ENOTDIR';
const inspectionError = (e) => (e instanceof TreeError || e instanceof VerifyError ? e.message : `JZ_VERIFY_INSPECT: ${e.message}`);

// Lee un archivo del plano de control sin seguir enlaces, ni en el último componente ni en el directorio.
function readControlFile(wt, rel) {
  const abs = path.join(wt, rel);
  if (fs.realpathSync(path.dirname(abs)) !== path.dirname(abs)) {
    throw new VerifyError('JZ_VERIFY_PATH', `${path.dirname(rel)} está desplazado por un enlace`);
  }
  const fd = fs.openSync(abs, READ_FLAGS);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new VerifyError('JZ_VERIFY_PATH', `${rel} no es un archivo regular`);
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// ------------------------------------------------------------------ perfiles

const safeRel = (s) => typeof s === 'string' && s !== '' && !path.isAbsolute(s) && !/[\x00-\x1f\x7f\\]/.test(s)
  && s.split('/').every((c) => c !== '' && c !== '.' && c !== '..');
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const count = (n, min) => Number.isInteger(n) && n >= min;

function validateProfile(p, id) {
  const bad = (msg) => new VerifyError('JZ_VERIFY_PROFILE', `perfil ${id} no autorizado: ${msg}`);
  if (!exactKeys(p, ['id', 'version', 'unitId', 'description', 'cwd', 'argv', 'oracle', 'ignoredInputs'])) {
    throw bad('campos distintos de id, version, unitId, description, cwd, argv, oracle e ignoredInputs');
  }
  if (p.id !== id) throw bad(`su id (${JSON.stringify(p.id)}) no coincide con el nombre del archivo`);
  if (!count(p.version, 1)) throw bad('version debe ser un entero positivo');
  if (typeof p.unitId !== 'string' || !UNIT_ID.test(p.unitId)) throw bad(`unitId debe ser un identificador canónico (${UNIT_ID})`);
  if (typeof p.description !== 'string') throw bad('description debe ser texto');
  // v1: el reporter y los archivos se resuelven desde la raíz del worktree.
  if (p.cwd !== '.') throw bad('cwd debe ser "." (raíz del worktree)');
  const o = p.oracle;
  if (!exactKeys(o, ['format', 'files', 'minTests', 'allowSkipped', 'allowTodo']) || o.format !== ORACLE_FORMAT) {
    throw bad(`el oráculo debe ser {format: "${ORACLE_FORMAT}", files, minTests, allowSkipped, allowTodo}`);
  }
  if (!count(o.minTests, 1) || !count(o.allowSkipped, 0) || !count(o.allowTodo, 0)) {
    throw bad('minTests debe ser ≥ 1 y allowSkipped y allowTodo enteros ≥ 0');
  }
  if (!Array.isArray(o.files) || o.files.length === 0 || !o.files.every(safeRel) || new Set(o.files).size !== o.files.length) {
    throw bad('oracle.files debe ser una lista no vacía de rutas relativas distintas dentro del worktree');
  }
  // Sólo node --test con el reporter del plano de control y los archivos del oráculo, en ese orden. Cualquier otra
  // opción (filtros, --test-only, otros reporters o destinos, -e, --import) queda fuera.
  const a = p.argv;
  if (!Array.isArray(a) || !a.every((x) => typeof x === 'string' && x !== '')) throw bad('argv debe ser una lista de cadenas');
  if (a[0] !== 'node' || a[1] !== '--test' || a[2] !== REPORTER_ARG) {
    throw bad(`argv debe empezar por ["node", "--test", "${REPORTER_ARG}"]`);
  }
  if (!sameJson(a.slice(3), o.files)) throw bad('tras el reporter, argv debe contener exactamente oracle.files (sin otras opciones)');
  // No hay forma de demostrar la identidad de lo ignorado por git: un perfil que dependa de ello no se reconoce.
  if (!Array.isArray(p.ignoredInputs) || p.ignoredInputs.length !== 0) {
    throw bad('ignoredInputs debe ser [] (v1 no admite dependencias ignoradas por git: su identidad no se puede demostrar)');
  }
  return p;
}

export function loadProfile(wt, id) {
  if (typeof id !== 'string' || !PROFILE_ID.test(id)) {
    throw new VerifyError('JZ_VERIFY_PROFILE', `identificador de perfil no válido: ${JSON.stringify(id)} (${PROFILE_ID})`);
  }
  const rel = `${PROFILE_DIR}/${id}.json`;
  let raw;
  try {
    raw = readControlFile(wt, rel);
  } catch (e) {
    if (isMissing(e)) throw new VerifyError('JZ_VERIFY_PROFILE', `el perfil ${id} no existe en ${PROFILE_DIR}`);
    if (e.code === 'ELOOP') throw new VerifyError('JZ_VERIFY_PROFILE', `el perfil ${id} es un enlace simbólico (no se sigue)`);
    throw new VerifyError('JZ_VERIFY_PROFILE', `el perfil ${id} no es legible como archivo regular: ${e.code ?? e.message}`);
  }
  let p;
  try {
    p = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new VerifyError('JZ_VERIFY_PROFILE', `el perfil ${id} no es JSON válido`);
  }
  return { profile: validateProfile(p, id), digest: sha256(raw), file: rel };
}

function profileIds(wt) {
  let names;
  try {
    names = fs.readdirSync(path.join(wt, PROFILE_DIR));
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
  return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
}

// ------------------------------------------------------------------ oráculo

// Interpreta los eventos «JZV1 <json>» del reporter. Las líneas que no empiezan así (avisos de node, mensajes de
// jz-run) se ignoran: lo que imprimen las pruebas llega dentro de un evento y no puede formar una línea propia.
export function parseReport(text, { wt, oracle }) {
  const reasons = [];
  const counts = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0]));
  const files = Object.fromEntries(oracle.files.map((f) => [f, 0]));
  const unexpected = new Set();
  const failures = [];
  const summary = {};
  let node = null;
  let started = false;
  let ended = false;
  const relOf = (abs) => (typeof abs === 'string' && path.isAbsolute(abs) ? path.relative(wt, abs) : null);

  for (const l of String(text).split('\n')) {
    if (!l.startsWith('JZV1 ')) continue;
    let e;
    try {
      e = JSON.parse(l.slice(5));
    } catch {
      reasons.push('salida malformada: línea JZV1 que no es JSON');
      continue;
    }
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.t !== 'string') {
      reasons.push('salida malformada: evento sin tipo');
      continue;
    }
    if (ended) {
      reasons.push(`salida malformada: evento ${e.t} tras el fin`);
      continue;
    }
    if (e.t === 'start') {
      if (started) reasons.push('salida malformada: inicio duplicado');
      if (e.v !== 1) reasons.push(`salida malformada: versión de reporter desconocida (${e.v})`);
      started = true;
      node = typeof e.node === 'string' ? e.node : null;
      continue;
    }
    if (!started) {
      reasons.push(`salida malformada: evento ${e.t} antes del inicio`);
      continue;
    }
    switch (e.t) {
      case 'end':
        ended = true;
        break;
      case 'pass':
      case 'fail': {
        const rel = relOf(e.file);
        if (e.suite) {
          counts.suites++;
          if (e.t === 'fail') reasons.push(`suite fallida: ${rel}: ${e.name}`);
          break;
        }
        // Mismo orden que el runner de Node: omitida, pendiente, cancelada, fallida, superada.
        counts.tests++;
        if (e.skip) counts.skipped++;
        else if (e.todo) counts.todo++;
        else if (e.t === 'pass') counts.pass++;
        else if (/^cancelled/.test(e.failureType ?? '')) counts.cancelled++;
        else counts.fail++;
        if (e.t === 'fail' && !e.skip && !e.todo && failures.length < MAX_FAILURES) {
          failures.push({ file: rel, name: e.name, message: String(e.message ?? '') });
        }
        // Un archivo que no informó sus pruebas (vacío, process.exit, error al cargar) aparece como una única prueba
        // con su propia ruta por nombre: el runner lo cuenta como superada.
        if (e.nesting === 0 && e.name === e.file) {
          reasons.push(`${rel}: sin resultados estructurados (el archivo no informó sus pruebas: vacío, salida anticipada o error al cargar)`);
        } else if (rel !== null && Object.hasOwn(files, rel)) {
          files[rel]++;
        } else {
          unexpected.add(rel ?? String(e.file));
        }
        break;
      }
      case 'diag': {
        if (e.file !== null || e.nesting !== 0) break;
        const m = /^(\w+) (\d+(?:\.\d+)?)$/.exec(String(e.message));
        if (!m || !SUMMARY_KEYS.includes(m[1])) break;
        if (Object.hasOwn(summary, m[1])) reasons.push(`salida malformada: resumen duplicado (${m[1]})`);
        summary[m[1]] = Number(m[2]);
        break;
      }
      case 'plan':
      case 'out':
      case 'err':
        break;
      default:
        reasons.push(`salida malformada: evento desconocido ${e.t}`);
    }
  }

  if (!started) reasons.push('salida sin eventos del reporter del plano de control (no hay resultado estructurado)');
  else if (!ended) reasons.push('salida incompleta: falta el fin (el runner terminó antes de tiempo o se interrumpió)');
  for (const k of SUMMARY_KEYS) {
    if (!Object.hasOwn(summary, k)) reasons.push(`resumen del runner incompleto: falta ${k}`);
    else if (summary[k] !== counts[k]) reasons.push(`resumen inconsistente: ${k}=${summary[k]} según el runner y ${counts[k]} según los eventos`);
  }
  if (counts.fail) reasons.push(`${counts.fail} prueba(s) fallida(s)`);
  if (counts.cancelled) reasons.push(`${counts.cancelled} prueba(s) cancelada(s)`);
  if (counts.skipped > oracle.allowSkipped) reasons.push(`${counts.skipped} prueba(s) omitida(s) inesperadamente (admitidas: ${oracle.allowSkipped})`);
  if (counts.todo > oracle.allowTodo) reasons.push(`${counts.todo} prueba(s) todo pendientes (admitidas: ${oracle.allowTodo})`);
  if (counts.pass < oracle.minTests) reasons.push(`${counts.pass} prueba(s) superadas; el mínimo es ${oracle.minTests}`);
  for (const [f, n] of Object.entries(files)) if (n === 0) reasons.push(`falta el archivo esperado ${f} (ninguna prueba registrada)`);
  for (const f of unexpected) reasons.push(`archivo inesperado en la salida: ${f}`);
  return { ok: reasons.length === 0, reasons, counts, files, failures, node };
}

// ------------------------------------------------------------------ runtime

function which(cmd) {
  for (const d of SANDBOX_PATH) {
    const p = path.join(d, cmd);
    try {
      if (fs.statSync(p).isFile()) return fs.realpathSync(p);
    } catch {
      // Sigue con el siguiente directorio.
    }
  }
  return null;
}

const fileDigest = (p) => sha256(fs.readFileSync(p));
// Archivos ejecutables mapeados al cargar el módulo (el binario, el enlazador y las bibliotecas que cargó): la lista no
// depende de lo que el proceso haga después.
const MAPPED = (() => {
  const out = new Set();
  for (const l of fs.readFileSync('/proc/self/maps', 'utf8').split('\n')) {
    const m = /^\S+ (\S{4}) \S+ \S+ \d+\s+(\/.+)$/.exec(l);
    if (m && m[1].includes('x') && !m[2].endsWith(' (deleted)')) out.add(m[2]);
  }
  return [...out].sort();
})();

// Identidad del node que ejecuta el perfil (el binario y las bibliotecas que tiene mapeadas como ejecutables, entre
// ellas libnode) y del git que usan las pruebas. Exige que jz-verify corra con el mismo node que el sandbox.
// El resto de /usr, el núcleo y la configuración de /etc no se registran.
export function runtimeIdentity() {
  const node = which('node');
  const git = which('git');
  if (!node || !git) throw new VerifyError('JZ_VERIFY_RUNTIME', `no se encontró ${node ? 'git' : 'node'} en ${SANDBOX_PATH.join(':')}`);
  if (fs.realpathSync(process.execPath) !== node) {
    throw new VerifyError('JZ_VERIFY_RUNTIME', `jz-verify corre con ${process.execPath}, pero el sandbox usa ${node}`);
  }
  const files = Object.fromEntries(MAPPED.map((f) => [f, fileDigest(f)]));
  return {
    node: { path: node, version: process.version, sha256: files[node] ?? fileDigest(node), files },
    git: { path: git, sha256: fileDigest(git) },
  };
}

// ------------------------------------------------------------------ ejecución

// Ejecutor real: jz-run en su propio grupo de procesos. Una señal a jz-verify termina el grupo entero (jz-run,
// unshare y tee; unshare --kill-child mata el sandbox) y la ejecución queda como interrumpida.
function jzRun({ wt, argv, cwd }) {
  return new Promise((resolve) => {
    const child = spawn(path.join(wt, '.jz/bin/jz-run'), ['--cwd', cwd, '--', ...argv], {
      cwd: wt, detached: true, stdio: ['ignore', 'ignore', 'inherit'],
      env: { PATH: RUN_PATH, LANG: 'C.UTF-8', JZ_ENGINE: process.env.JZ_ENGINE || 'unknown' },
    });
    let interrupted = null;
    const onSignal = (sig) => {
      interrupted = sig;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Ya terminó.
      }
    };
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const s of signals) process.on(s, onSignal);
    const done = (r) => {
      for (const s of signals) process.off(s, onSignal);
      resolve({ pid: child.pid ?? -1, interrupted, ...r });
    };
    child.on('error', (e) => done({ code: null, signal: null, error: e.message }));
    child.on('exit', (code, signal) => done({ code, signal }));
  });
}

// Registros de runs.jsonl añadidos desde offset que corresponden al pid de jz-run.
function findRecords(wt, offset, pid) {
  let buf;
  try {
    buf = readControlFile(wt, RUNS);
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
  const out = [];
  for (const l of buf.subarray(buf.length >= offset ? offset : 0).toString('utf8').split('\n')) {
    if (!l.trim()) continue;
    let r;
    try {
      r = JSON.parse(l);
    } catch {
      continue;
    }
    if (typeof r?.log === 'string' && LOG_ID.exec(r.log)?.[1] === String(pid)) out.push(r);
  }
  return out;
}

const runsOffset = (wt) => {
  try {
    return fs.statSync(path.join(wt, RUNS)).size;
  } catch {
    return 0;
  }
};

function readLog(wt, log) {
  if (!LOG_ID.test(log)) throw new VerifyError('JZ_VERIFY_LOG', `identificador de log no válido: ${JSON.stringify(log)}`);
  const buf = readControlFile(wt, log);
  return { text: buf.toString('utf8'), digest: sha256(buf) };
}

function writeEvidence(wt, id, evidence) {
  const dir = path.join(wt, EVIDENCE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.realpathSync(dir) !== dir) throw new VerifyError('JZ_VERIFY_PATH', `${EVIDENCE_DIR} está desplazado por un enlace`);
  const tmp = path.join(dir, `.${id}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(tmp, 'wx', 0o644);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(evidence, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, path.join(dir, `${id}.json`));
  const dfd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dfd);
  } finally {
    fs.closeSync(dfd);
  }
}

const sameSnapshot = (a, b) => a.head === b.head && a.index === b.index && a.tree === b.tree;
const withDigest = (body) => ({ ...body, digest: sha256(canonical(body)) });

// Ejecuta un perfil y registra su evidencia. Devuelve { state, reasons, evidence }. Un perfil inexistente o no
// autorizado lanza VerifyError sin ejecutar nada; un repositorio que no se puede inspeccionar da BLOQUEADO, sin
// ejecutar ni escribir evidencia. runner sólo se sustituye en las pruebas.
export async function runProfile(wt, id, { runner = jzRun } = {}) {
  const { profile, digest } = loadProfile(wt, id);
  let before;
  let runtime;
  try {
    before = snapshot(wt);
    runtime = runtimeIdentity();
  } catch (e) {
    return { state: 'BLOQUEADO', reasons: [inspectionError(e)], evidence: null };
  }
  const offset = runsOffset(wt);
  const res = await runner({ wt, argv: profile.argv, cwd: profile.cwd });
  const reasons = [];
  if (res.interrupted) reasons.push(`ejecución interrumpida (${res.interrupted})`);
  if (res.error) reasons.push(`no se pudo ejecutar jz-run: ${res.error}`);

  const records = findRecords(wt, offset, res.pid);
  const record = records.length === 1 ? records[0] : null;
  if (records.length > 1) reasons.push('varios registros de jz-run con el mismo pid: no se puede atribuir la ejecución');
  else if (!record) reasons.push('sin registro de jz-run para esta ejecución (interrumpida o no ejecutada)');
  else {
    if (!sameJson(record.cmd, profile.argv)) reasons.push(`comando registrado distinto del perfil: ${JSON.stringify(record.cmd)}`);
    if (record.cwd !== profile.cwd) reasons.push(`cwd registrado distinto del perfil: ${JSON.stringify(record.cwd)}`);
    if (record.tree !== before.tree) reasons.push('la huella registrada por jz-run no es la huella previa a la verificación');
    // jz-run registra HEAD abreviado (o «none» sin commits).
    const headOk = typeof record.head === 'string' && record.head !== ''
      && (before.head ? before.head.startsWith(record.head) : record.head === 'none');
    if (!headOk) reasons.push(`HEAD registrado por jz-run distinto: ${record.head}`);
    if (record.rc !== 0) reasons.push(`rc=${record.rc}`);
    if (res.code !== record.rc) reasons.push(`jz-run terminó con ${res.code ?? res.signal}, pero registró rc=${record.rc}`);
  }

  let after = null;
  try {
    after = snapshot(wt);
    if (!sameSnapshot(before, after)) reasons.push('el árbol cambió durante la ejecución (HEAD, índice o huella distintos)');
    if (!sameJson(runtimeIdentity(), runtime)) reasons.push('el runtime cambió durante la ejecución');
  } catch (e) {
    reasons.push(`no se pudo inspeccionar el repositorio después de la ejecución: ${inspectionError(e)}`);
  }

  let oracle = null;
  let log = null;
  if (record) {
    try {
      log = readLog(wt, record.log);
      oracle = parseReport(log.text, { wt, oracle: profile.oracle });
      reasons.push(...oracle.reasons);
    } catch (e) {
      reasons.push(`log de la ejecución ilegible: ${inspectionError(e)}`);
    }
  }

  const state = reasons.length === 0 ? 'VALIDADO' : 'FALLIDO';
  const evidence = withDigest({
    schema: SCHEMA,
    state,
    reasons,
    date: new Date().toISOString(),
    profile: { id, version: profile.version, unitId: profile.unitId, digest, oracle: profile.oracle },
    command: { cwd: profile.cwd, argv: profile.argv, digest: sha256(canonical({ cwd: profile.cwd, argv: profile.argv })) },
    repo: before,
    repoAfter: after,
    runtime,
    ignored: { inputs: profile.ignoredInputs, reproducible: false, note: IGNORED_NOTE },
    run: record ? { log: record.log, logDigest: log?.digest ?? null, rc: record.rc, cmd: record.cmd, tree: record.tree,
      ts: record.ts, engine: record.engine, secs: record.secs, head: record.head, pid: res.pid } : null,
    oracle: oracle ? { format: ORACLE_FORMAT, ok: oracle.ok, counts: oracle.counts, files: oracle.files,
      failures: oracle.failures, node: oracle.node } : null,
    assurance: ASSURANCE,
  });
  writeEvidence(wt, id, evidence);
  return { state, reasons, evidence };
}

// ------------------------------------------------------------------ estado

// Estado de la verificación de un perfil frente al estado actual del repositorio. La integridad de la evidencia
// (formato, digest, log y registro de jz-run) se comprueba antes que su vigencia: una evidencia que no se puede
// verificar es BLOQUEADO, nunca OBSOLETO ni VALIDADO.
export function profileStatus(wt, id) {
  const result = (state, reasons, evidence = null) => ({ id, state, reasons, evidence });
  if (!PROFILE_ID.test(id)) return result('BLOQUEADO', [`identificador de perfil no válido: ${JSON.stringify(id)}`]);
  // Sin un repositorio inspeccionable no se puede afirmar nada, tampoco que no haya verificación aplicable.
  let cur;
  try {
    cur = snapshot(wt);
  } catch (e) {
    return result('BLOQUEADO', [inspectionError(e)]);
  }
  let raw;
  try {
    raw = readControlFile(wt, `${EVIDENCE_DIR}/${id}.json`);
  } catch (e) {
    if (isMissing(e)) return result('SIN_VERIFICACION', ['no hay evidencia reconocida para este perfil']);
    return result('BLOQUEADO', [`evidencia ilegible: ${e.code ?? e.message}`]);
  }
  let ev;
  try {
    ev = JSON.parse(raw.toString('utf8'));
  } catch {
    return result('BLOQUEADO', ['evidencia corrupta: no es JSON válido']);
  }
  const { digest, ...body } = ev ?? {};
  if (ev?.schema !== SCHEMA || ev.profile?.id !== id || !['VALIDADO', 'FALLIDO'].includes(ev.state)) {
    return result('BLOQUEADO', ['evidencia corrupta: formato desconocido']);
  }
  if (digest !== sha256(canonical(body))) return result('BLOQUEADO', ['evidencia corrupta: el digest no coincide con su contenido']);
  if (ev.run) {
    try {
      const log = readLog(wt, ev.run.log);
      if (log.digest !== ev.run.logDigest) return result('BLOQUEADO', [`el log ${ev.run.log} cambió desde la verificación`], ev);
      const again = parseReport(log.text, { wt, oracle: ev.profile.oracle });
      if (again.ok !== ev.oracle?.ok || !sameJson(again.counts, ev.oracle?.counts)) {
        return result('BLOQUEADO', [`la evidencia no se deriva del log ${ev.run.log}`], ev);
      }
    } catch (e) {
      return result('BLOQUEADO', [`log de la verificación no disponible: ${inspectionError(e)}`], ev);
    }
    const recs = findRecords(wt, 0, ev.run.pid);
    const rec = recs.find((r) => r.log === ev.run.log);
    if (!rec || rec.rc !== ev.run.rc || rec.tree !== ev.run.tree || !sameJson(rec.cmd, ev.run.cmd)) {
      return result('BLOQUEADO', [`registro de jz-run ausente o distinto para ${ev.run.log}`], ev);
    }
  } else if (ev.state === 'VALIDADO') {
    return result('BLOQUEADO', ['evidencia corrupta: VALIDADO sin ejecución registrada'], ev);
  }

  const stale = [];
  try {
    const { profile, digest: pd } = loadProfile(wt, id);
    if (pd !== ev.profile.digest) stale.push(`perfil cambiado (versión ${ev.profile.version} → ${profile.version})`);
    if (profile.unitId !== ev.profile.unitId) stale.push(`unidad acreditada cambiada (${ev.profile.unitId ?? 'ninguna'} → ${profile.unitId})`);
  } catch (e) {
    if (!/no existe/.test(e.message)) return result('BLOQUEADO', [e.message], ev);
    stale.push('perfil retirado del registro');
  }
  if (cur.head !== ev.repo.head) stale.push('HEAD distinto');
  if (cur.index !== ev.repo.index) stale.push('índice distinto');
  if (cur.tree !== ev.repo.tree) stale.push('huella del árbol distinta');
  try {
    const rt = runtimeIdentity();
    if (!sameJson(rt.node, ev.runtime?.node)) stale.push('runtime distinto: node');
    if (!sameJson(rt.git, ev.runtime?.git)) stale.push('runtime distinto: git');
  } catch (e) {
    return result('BLOQUEADO', [inspectionError(e)], ev);
  }
  if (stale.length) return result('OBSOLETO', stale, ev);
  return result(ev.state, ev.state === 'VALIDADO' ? [] : ev.reasons, ev);
}

// Unidad que acredita un perfil del registro según su archivo actual; null si no se puede cargar.
function unitOf(wt, id) {
  try {
    return loadProfile(wt, id).profile.unitId;
  } catch {
    return null;
  }
}

// Perfiles del registro y evidencias de perfiles retirados. registered y unit dan la asociación protegida
// unidad–perfil: un perfil retirado no acredita ninguna unidad, y uno del registro con unit null (no se puede
// cargar) deja indeterminada la cobertura de cualquier unidad.
export function statusAll(wt) {
  let ids;
  let registered;
  try {
    registered = new Set(profileIds(wt));
    ids = new Set(registered);
    const dir = path.join(wt, EVIDENCE_DIR);
    if (fs.existsSync(dir)) for (const n of fs.readdirSync(dir)) if (n.endsWith('.json')) ids.add(n.slice(0, -5));
  } catch (e) {
    return [{ id: '(registro)', state: 'BLOQUEADO', reasons: [`no se pudo leer el registro: ${e.message}`], evidence: null,
      registered: true, unit: null }];
  }
  return [...ids].sort().map((id) => ({ ...profileStatus(wt, id), registered: registered.has(id),
    unit: registered.has(id) ? unitOf(wt, id) : null }));
}

// ------------------------------------------------------------------ CLI

const USAGE = 'uso: .jz/bin/jz-verify run <perfil> | status [--json]';

function describeEvidence(ev) {
  const lines = [];
  if (ev.oracle) {
    const c = ev.oracle.counts;
    lines.push(`- pruebas: ${c.tests} (superadas ${c.pass}, fallidas ${c.fail}, canceladas ${c.cancelled}, omitidas ${c.skipped}, todo ${c.todo})`);
  }
  lines.push(`- perfil: ${ev.profile.id} v${ev.profile.version} (${ev.profile.digest.slice(0, 12)}), unidad ${ev.profile.unitId}`);
  lines.push(`- HEAD ${ev.repo.head ?? 'none'}, huella ${ev.repo.tree}`);
  if (ev.run) lines.push(`- jz-run: rc=${ev.run.rc}, log ${ev.run.log}`);
  lines.push(`- fecha: ${ev.date}`);
  return lines;
}

async function main(args) {
  const [dir, cmd, ...rest] = args;
  const wt = fs.realpathSync(dir);
  if (cmd === 'run' && rest.length === 1) {
    const r = await runProfile(wt, rest[0]);
    process.stdout.write(`# jz-verify run ${rest[0]}\n\n- ${rest[0]}: ${r.state}\n`);
    for (const reason of r.reasons) process.stdout.write(`  - ${reason}\n`);
    if (r.evidence) {
      process.stdout.write(`${describeEvidence(r.evidence).join('\n')}\n- evidencia: ${EVIDENCE_DIR}/${rest[0]}.json\n`);
      for (const f of r.evidence.oracle?.failures ?? []) {
        process.stdout.write(`\n✖ ${f.file}: ${f.name}\n${f.message.split('\n').map((l) => `    ${l}`).join('\n')}\n`);
      }
    }
    return { VALIDADO: 0, FALLIDO: 1 }[r.state] ?? 3;
  }
  if (cmd === 'status' && (rest.length === 0 || (rest.length === 1 && rest[0] === '--json'))) {
    const all = statusAll(wt);
    if (rest[0] === '--json') {
      process.stdout.write(`${JSON.stringify(all.map(({ id, state, reasons, evidence, registered, unit }) => ({ id, state, reasons,
        registered, unit, version: evidence?.profile?.version ?? null, date: evidence?.date ?? null, log: evidence?.run?.log ?? null })))}\n`);
    } else if (all.length === 0) {
      process.stdout.write(`Ningún perfil en ${PROFILE_DIR}.\n`);
    } else {
      for (const s of all) {
        const ev = s.evidence;
        const when = ev ? ` (v${ev.profile.version}, ${ev.date}${ev.run ? `, log ${ev.run.log}` : ''})` : '';
        const unit = !s.registered ? ' [retirado: no acredita ninguna unidad]' : s.unit ? ` [unidad ${s.unit}]` : ' [unidad no determinable]';
        process.stdout.write(`- ${s.id}: ${s.state}${unit}${when}${s.reasons.length ? ` — ${s.reasons.join('; ')}` : ''}\n`);
      }
    }
    return all.some((s) => s.state === 'BLOQUEADO') ? 3 : 0;
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`jz-verify: ${e instanceof VerifyError ? e.message : `JZ_VERIFY_ERROR: ${e.stack}`}\n`);
    process.exit(e instanceof VerifyError && e.code === 'JZ_VERIFY_PROFILE' ? 2 : 3);
  });
}
