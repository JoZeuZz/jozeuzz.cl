// Pruebas de la huella del árbol (jz-run --fingerprint) y de la lista de cambios de jz-state frente a
// repositorios hostiles: filtros clean y fsmonitor configurados, nombres con forma de opción, enlaces
// simbólicos hacia fuera, FIFO y directorios sustituidos por enlaces. Todo ocurre en repositorios
// desechables del directorio temporal, con contenido sintético.
// Ejecutar: .jz/bin/jz-run node --test .jz/tests/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../..');
const roots = [];
after(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function tmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(d);
  return d;
}

function fixture(files = {}) {
  const repo = tmp('jz-tree-');
  for (const p of ['.jz/bin', '.jz/lib', '.jz/policy']) {
    if (fs.existsSync(path.join(SRC, p))) fs.cpSync(path.join(SRC, p), path.join(repo, p), { recursive: true });
  }
  fs.writeFileSync(path.join(repo, '.gitignore'), '.jz-state/\nignorado/\n');
  for (const [p, c] of Object.entries({ 'a.txt': 'a\n', 'b.txt': 'b\n', 'dir/d.txt': 'd\n', ...files })) {
    fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true });
    fs.writeFileSync(path.join(repo, p), c);
  }
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'fixture');
  return repo;
}

// Git del propio test (equivale al humano): nunca lo ejecuta el código bajo prueba.
// Sin la configuración global ni de sistema del host (QA F10) ni el GIT_* heredado: la sesión que lanza las
// pruebas puede tener ya core.fsmonitor=false en el entorno, y el canario de control dejaría de dispararse.
const GIT_TEST_ENV = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
function git(repo, ...a) {
  return execFileSync('git', ['-C', repo, '-c', 'user.name=jz-test', '-c', 'user.email=jz-test@example.invalid', ...a],
    { stdio: 'pipe', encoding: 'utf8', env: GIT_TEST_ENV });
}

function fingerprint(repo) {
  const r = spawnSync(path.join(repo, '.jz/bin/jz-run'), ['--fingerprint'], { cwd: repo, encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.error, undefined, `jz-run --fingerprint no terminó: ${r.error}`);
  assert.equal(r.status, 0, r.stderr);
  const fp = r.stdout.trim();
  assert.match(fp, /^[0-9a-f]{64}$/, 'huella SHA-256 completa (revisión de seguridad: 64 bits admiten colisiones buscadas)');
  return fp;
}

// La huella debe fallar cerrada, con un código identificable, en vez de devolver un valor.
function fingerprintFails(repo, code) {
  const r = spawnSync(path.join(repo, '.jz/bin/jz-run'), ['--fingerprint'], { cwd: repo, encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.error, undefined, `jz-run --fingerprint no terminó: ${r.error}`);
  assert.notEqual(r.status, 0, `se obtuvo una huella (${r.stdout.trim()}) en lugar de ${code}`);
  assert.match(r.stderr, new RegExp(code), r.stderr);
  assert.equal(r.stdout.trim(), '');
}

function jzState(repo, env = {}) {
  const r = spawnSync(path.join(repo, '.jz/bin/jz-state'), [], { cwd: repo, encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, ...env } });
  assert.equal(r.error, undefined, `jz-state no terminó: ${r.error}`);
  return { rc: r.status, out: r.stdout + r.stderr };
}

// Configura en el repositorio un filtro clean y un fsmonitor que dejan una marca si alguien los ejecuta.
function arm(repo) {
  const marker = path.join(tmp('jz-canario-'), 'ejecutado');
  const fsm = path.join(path.dirname(marker), 'fsmonitor.sh');
  fs.writeFileSync(fsm, `#!/bin/sh\necho fsmonitor >> '${marker}'\nexit 1\n`, { mode: 0o755 });
  git(repo, 'config', 'filter.canario.clean', `sh -c 'echo clean >> "${marker}"; cat'`);
  git(repo, 'config', 'filter.canario.smudge', 'cat');
  git(repo, 'config', 'diff.canario.textconv', `sh -c 'echo textconv >> "${marker}"; cat "$1"' -`);
  git(repo, 'config', 'core.fsmonitor', fsm);
  fs.writeFileSync(path.join(repo, '.gitattributes'), '* filter=canario diff=canario\n');
  return marker;
}

test('la huella y jz-state no ejecutan filtros, textconv ni fsmonitor del repositorio', () => {
  // Control positivo (QA F6): en un repositorio armado igual, git status y git diff sí los ejecutan.
  const control = fixture();
  const controlMarker = arm(control);
  fs.writeFileSync(path.join(control, 'a.txt'), 'a modificado\n');
  git(control, 'status', '--short');
  git(control, 'diff');
  const seen = fs.readFileSync(controlMarker, 'utf8');
  for (const m of ['clean', 'textconv', 'fsmonitor']) assert.match(seen, new RegExp(m), `control: ${m} armado`);

  const repo = fixture();
  const marker = arm(repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a modificado\n');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'nuevo\n');
  fingerprint(repo);
  jzState(repo);
  assert.equal(fs.existsSync(marker), false, `se ejecutó: ${fs.existsSync(marker) && fs.readFileSync(marker, 'utf8')}`);
});

test('un nombre con forma de opción se huella como archivo', () => {
  const repo = fixture();
  fs.writeFileSync(path.join(repo, '-b'), 'uno\n');
  const fp1 = fingerprint(repo);
  fs.writeFileSync(path.join(repo, '-b'), 'dos\n');
  assert.notEqual(fingerprint(repo), fp1, 'el contenido de "-b" debe formar parte de la huella');
  fs.writeFileSync(path.join(repo, '--version'), 'x\n');
  fingerprint(repo);
});

test('un enlace simbólico hacia fuera se huella por su destino, sin leerlo', () => {
  const repo = fixture();
  const outside = path.join(tmp('jz-fuera-'), 'secreto-sintetico.txt');
  fs.writeFileSync(outside, 'SINTETICO-1\n');
  fs.symlinkSync(outside, path.join(repo, 'fuera'));
  const fp1 = fingerprint(repo);
  fs.writeFileSync(outside, 'SINTETICO-2\n');
  assert.equal(fingerprint(repo), fp1, 'cambiar el destino externo no debe alterar la huella');
  fs.unlinkSync(path.join(repo, 'fuera'));
  fs.symlinkSync(`${outside}.otro`, path.join(repo, 'fuera'));
  assert.notEqual(fingerprint(repo), fp1, 'cambiar el destino del enlace sí altera la huella');
});

test('un directorio rastreado sustituido por un enlace externo no se lee', () => {
  const repo = fixture();
  const outside = tmp('jz-fuera-');
  fs.writeFileSync(path.join(outside, 'd.txt'), 'SINTETICO-1\n');
  fs.rmSync(path.join(repo, 'dir'), { recursive: true });
  fs.symlinkSync(outside, path.join(repo, 'dir'));
  const fp1 = fingerprint(repo);
  fs.writeFileSync(path.join(outside, 'd.txt'), 'SINTETICO-2\n');
  assert.equal(fingerprint(repo), fp1);
});

test('una FIFO no bloquea ni oculta los demás cambios', () => {
  const repo = fixture();
  const clean = fingerprint(repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a2\n');
  fs.rmSync(path.join(repo, 'b.txt'));
  execFileSync('mkfifo', [path.join(repo, 'b.txt')]);
  execFileSync('mkfifo', [path.join(repo, 'tubo')]);
  assert.notEqual(fingerprint(repo), clean, 'la modificación de a.txt sigue en la huella');
  const s = jzState(repo);
  assert.equal(s.rc, 0, s.out);
  for (const line of [' M a.txt', ' M b.txt']) assert.ok(s.out.split('\n').includes(line), `falta «${line}»:\n${s.out}`);
});

test('la huella es determinista y cambia con el contenido rastreado y no ignorado', () => {
  const repo = fixture();
  const fp0 = fingerprint(repo);
  assert.equal(fingerprint(repo), fp0, 'mismo árbol, misma huella');
  fs.mkdirSync(path.join(repo, 'ignorado'));
  fs.writeFileSync(path.join(repo, 'ignorado/x'), 'x\n');
  assert.equal(fingerprint(repo), fp0, 'los ignorados quedan fuera (limitación N3, I2)');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a2\n');
  const fp1 = fingerprint(repo);
  assert.notEqual(fp1, fp0, 'modificación rastreada');
  fs.writeFileSync(path.join(repo, 'n\nl.txt'), 'n\n');
  const fp2 = fingerprint(repo);
  assert.notEqual(fp2, fp1, 'archivo nuevo con salto de línea en el nombre');
  fs.chmodSync(path.join(repo, 'b.txt'), 0o755);
  assert.notEqual(fingerprint(repo), fp2, 'cambio del bit de ejecución');
  git(repo, 'add', 'a.txt');
  git(repo, 'commit', '-qm', 'a2');
  assert.notEqual(fingerprint(repo), fp0, 'otro HEAD');
});

test('jz-state lista los cambios sin git status', () => {
  const repo = fixture({ 'c.txt': 'c\n' });
  assert.match(jzState(repo).out, /Ninguno \(árbol limpio\)\./);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a2\n');
  fs.rmSync(path.join(repo, 'b.txt'));
  fs.writeFileSync(path.join(repo, 'c.txt'), 'c2\n');
  git(repo, 'add', 'c.txt');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'n\n');
  fs.writeFileSync(path.join(repo, '-b'), 'x\n');
  const { out } = jzState(repo);
  for (const line of [' M a.txt', ' D b.txt', 'M  c.txt', '?? nuevo.txt', '?? -b']) {
    assert.ok(out.split('\n').includes(line), `falta «${line}» en:\n${out}`);
  }
});


// I1-FIX A1: git entrega bytes; un nombre no UTF-8 decodificado con sustitución deja de corresponder a un
// archivo real y su contenido desaparece de la huella. Se rechaza sin convertirlo.
test('un nombre no UTF-8 se rechaza, sea no rastreado, rastreado o con cambios preparados', () => {
  const bad = (repo) => Buffer.concat([Buffer.from(repo + '/n'), Buffer.from([0xff]), Buffer.from('.txt')]);

  const untracked = fixture();
  fs.writeFileSync(bad(untracked), 'uno\n');
  fingerprintFails(untracked, 'JZ_TREE_NON_UTF8');

  const tracked = fixture();
  fs.writeFileSync(bad(tracked), 'uno\n');
  git(tracked, 'add', '-A');
  git(tracked, 'commit', '-qm', 'no utf8');
  fingerprintFails(tracked, 'JZ_TREE_NON_UTF8');

  fs.writeFileSync(bad(tracked), 'dos\n');
  git(tracked, 'add', '-A');
  fingerprintFails(tracked, 'JZ_TREE_NON_UTF8');
  const s = jzState(tracked);
  assert.equal(s.rc, 3, s.out);
  assert.match(s.out, /JZ_TREE_NON_UTF8/);
  assert.match(s.out, /Veredicto: BLOQUEADO/);

  // UTF-8 válido, incluido un BOM inicial que un decodificador por omisión descartaría: se huella.
  const valid = fixture();
  fs.writeFileSync(path.join(valid, '\ufeffa.txt'), 'uno\n');
  fs.writeFileSync(path.join(valid, 'ñandú.txt'), 'uno\n');
  const fp1 = fingerprint(valid);
  fs.writeFileSync(path.join(valid, '\ufeffa.txt'), 'dos\n');
  assert.notEqual(fingerprint(valid), fp1, 'el contenido de «\\ufeffa.txt» cuenta');
});

// I1-FIX A2: el commit sale del índice; dos índices distintos sobre el mismo árbol no comparten huella.
test('la huella cambia con el índice aunque el árbol de trabajo sea el mismo', () => {
  const repo = fixture();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a2\n');
  const unstaged = fingerprint(repo);
  git(repo, 'add', 'a.txt');
  assert.notEqual(fingerprint(repo), unstaged, 'preparar a.txt (OID del índice)');

  const before = fingerprint(repo);
  git(repo, 'update-index', '--chmod=+x', 'b.txt');
  assert.notEqual(fingerprint(repo), before, 'modo del índice sin tocar el archivo');
});

test('un conflicto sin resolver y su resolución tienen huellas distintas', () => {
  const repo = fixture();
  git(repo, 'checkout', '-qb', 'otra');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'otra\n');
  git(repo, 'commit', '-qam', 'otra');
  git(repo, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'main\n');
  git(repo, 'commit', '-qam', 'main');
  assert.throws(() => git(repo, 'merge', '-q', 'otra'));
  const conflicted = fingerprint(repo);
  assert.ok(jzState(repo).out.split('\n').includes('UU a.txt'));
  git(repo, 'add', 'a.txt');
  assert.notEqual(fingerprint(repo), conflicted, 'mismo árbol, conflicto resuelto en el índice');
});

// I1-FIX A3: git no lista el contenido de un repositorio anidado ni de un directorio .git; la huella no
// puede garantizar su integridad y falla cerrada.
test('un repositorio anidado no rastreado se rechaza', () => {
  const repo = fixture();
  git(repo, 'init', '-q', 'anidado');
  fs.writeFileSync(path.join(repo, 'anidado/x.txt'), 'x\n');
  fingerprintFails(repo, 'JZ_TREE_NESTED_REPO');
  const s = jzState(repo);
  assert.equal(s.rc, 3, s.out);
  assert.match(s.out, /JZ_TREE_NESTED_REPO/);
});

test('un directorio .git que no es un repositorio también se rechaza', () => {
  for (const [dir, other] of [['dir', null], ['nuevo', 'nuevo/y.txt'], ['solo', null]]) {
    const repo = fixture();
    fs.mkdirSync(path.join(repo, dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(repo, dir, '.git/oculto'), 'SINTETICO\n');
    if (other) fs.writeFileSync(path.join(repo, other), 'y\n');
    fingerprintFails(repo, 'JZ_TREE_NESTED_REPO');
  }
  const repo = fixture();
  fs.writeFileSync(path.join(repo, 'dir/.git'), 'gitdir: /nada\n');
  fingerprintFails(repo, 'JZ_TREE_NESTED_REPO');
});

// Revisión de seguridad: --directory sólo muestra el directorio no rastreado más alto; un .git más profundo
// (nuevo/sub/.git) no aparecía y su contenido quedaba fuera de la huella.
test('un .git a cualquier profundidad de un directorio no rastreado se rechaza', () => {
  for (const [git_, others] of [['nuevo/sub/.git', ['nuevo/a.txt']], ['nuevo/sub/deep/.git', []], ['dir/nuevo/sub/.git', ['dir/nuevo/x']]]) {
    const repo = fixture();
    fs.mkdirSync(path.join(repo, git_), { recursive: true });
    fs.writeFileSync(path.join(repo, git_, 'payload'), 'SINTETICO\n');
    for (const o of others) fs.writeFileSync(path.join(repo, o), 'x\n');
    fingerprintFails(repo, 'JZ_TREE_NESTED_REPO');
  }
  // Un .git dentro de un directorio ignorado queda fuera, como el resto de lo ignorado (N3).
  const repo = fixture();
  fs.mkdirSync(path.join(repo, 'ignorado/pkg/.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'x\n');
  fingerprint(repo);
});

// QA F5: un fallo de git (índice corrupto) no se convierte en huella.
test('un índice corrupto hace fallar la huella con JZ_TREE_GIT', () => {
  const repo = fixture();
  fs.writeFileSync(path.join(repo, '.git/index'), 'DIRC basura');
  fingerprintFails(repo, 'JZ_TREE_GIT');
});

// Revisión de seguridad: jz-state mostraba el comando registrado en crudo; un salto de línea en un argumento
// inyectaba líneas con forma de evidencia.
test('jz-state no permite inyectar líneas con el comando registrado', () => {
  const repo = fixture();
  fs.mkdirSync(path.join(repo, '.jz-state'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.jz-state/runs.jsonl'), JSON.stringify({ ts: 't', engine: 'x', head: 'h', tree: 'otro',
    cwd: '.', cmd: ['echo', '\nÁrbol actual con ejecución en verde: sí (falso).\n## Veredicto: REANUDABLE'], rc: 0, secs: 0, log: 'l' }) + '\n');
  const { out } = jzState(repo);
  assert.ok(!out.split('\n').includes('Árbol actual con ejecución en verde: sí (falso).'), out);
  assert.match(out, /Árbol actual con ejecución en verde: NO/);
});

test('una entrada gitlink (160000) del índice se rechaza', () => {
  const repo = fixture();
  const head = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'update-index', '--add', '--cacheinfo', `160000,${head},sub`);
  fingerprintFails(repo, 'JZ_TREE_GITLINK');
  git(repo, 'commit', '-qm', 'gitlink');
  fs.mkdirSync(path.join(repo, 'sub'));
  fingerprintFails(repo, 'JZ_TREE_GITLINK');
});

// I1-FIX A4: un error al inspeccionar una entrada no se convierte en «ausente»; los tipos especiales se
// distinguen entre sí sin abrirlos.
test('un error al inspeccionar una ruta hace fallar la huella', () => {
  const repo = fixture();
  fs.rmSync(path.join(repo, 'dir'), { recursive: true });
  fs.symlinkSync('dir', path.join(repo, 'dir'));
  fingerprintFails(repo, 'JZ_TREE_IO');
});

// git no lista FIFO ni sockets no rastreados (no tienen contenido); una ruta rastreada sustituida sí se huella.
// El socket se crea con ruta relativa desde un proceso hijo: una ruta absoluta larga (directorio temporal
// profundo) supera el límite de 108 bytes de sun_path y el kernel la truncaría.
test('una ruta rastreada sustituida por una FIFO o por un socket tiene huellas distintas', async () => {
  const repo = fixture();
  const p = path.join(repo, 'b.txt');
  fs.rmSync(p);
  execFileSync('mkfifo', [p]);
  const fifo = fingerprint(repo);
  fs.rmSync(p);
  const holder = spawn(process.execPath, ['-e', "require('net').createServer().listen('b.txt', () => console.log('listo'))"],
    { cwd: repo, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await once(holder.stdout, 'data');
    assert.ok(fs.lstatSync(p).isSocket(), 'b.txt es un socket');
    assert.notEqual(fingerprint(repo), fifo);
  } finally {
    holder.kill();
  }
});

// I1-FIX D: la configuración local del repositorio no desplaza el árbol ni oculta archivos de la huella.
test('core.worktree y core.excludesFile del repositorio no alteran qué se huella', () => {
  const repo = fixture();
  const elsewhere = tmp('jz-otro-');
  git(repo, 'config', 'core.worktree', elsewhere);
  fingerprintFails(repo, 'JZ_TREE_TOPLEVEL');
  git(repo, 'config', '--unset', 'core.worktree');

  const excludes = path.join(tmp('jz-excl-'), 'todo');
  fs.writeFileSync(excludes, '*\n');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'uno\n');
  const fp1 = fingerprint(repo);
  git(repo, 'config', 'core.excludesFile', excludes);
  assert.equal(fingerprint(repo), fp1, 'core.excludesFile local no oculta archivos');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'dos\n');
  assert.notEqual(fingerprint(repo), fp1);
});

// I1-FIX D: las consultas Git de jz-state y jz-run no heredan el entorno Git del motor que las lanza.
test('jz-state describe su propio repositorio aunque el entorno apunte a otro', () => {
  const repo = fixture();
  const other = fixture({ 'otro.txt': 'otro\n' });
  git(other, 'commit', '-q', '--allow-empty', '-m', 'commit-del-otro-repositorio');
  const s = jzState(repo, { GIT_DIR: path.join(other, '.git'), GIT_WORK_TREE: other });
  assert.match(s.out, /^- HEAD: [0-9a-f]+ fixture$/m, s.out);
  assert.match(s.out, /^- Rama: main$/m, s.out);
});
