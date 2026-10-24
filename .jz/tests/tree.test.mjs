// Pruebas de la huella del árbol (jz-run --fingerprint) y de la lista de cambios de jz-state frente a
// repositorios hostiles: filtros clean y fsmonitor configurados, nombres con forma de opción, enlaces
// simbólicos hacia fuera, FIFO y directorios sustituidos por enlaces. Todo ocurre en repositorios
// desechables del directorio temporal, con contenido sintético.
// Ejecutar: .jz/bin/jz-run node --test .jz/tests/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
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
function git(repo, ...a) {
  return execFileSync('git', ['-C', repo, '-c', 'user.name=jz-test', '-c', 'user.email=jz-test@example.invalid', ...a],
    { stdio: 'pipe', encoding: 'utf8' });
}

function fingerprint(repo) {
  const r = spawnSync(path.join(repo, '.jz/bin/jz-run'), ['--fingerprint'], { cwd: repo, encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.error, undefined, `jz-run --fingerprint no terminó: ${r.error}`);
  assert.equal(r.status, 0, r.stderr);
  const fp = r.stdout.trim();
  assert.match(fp, /^[0-9a-f]{16}$/);
  return fp;
}

function jzState(repo) {
  const r = spawnSync(path.join(repo, '.jz/bin/jz-state'), [], { cwd: repo, encoding: 'utf8', timeout: 20_000 });
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

test('un repositorio anidado no rastreado aparece en la huella y en jz-state', () => {
  const repo = fixture();
  const clean = fingerprint(repo);
  git(repo, 'init', '-q', 'anidado');
  assert.notEqual(fingerprint(repo), clean, 'el directorio anidado cuenta como no rastreado');
  assert.ok(jzState(repo).out.split('\n').includes('?? anidado/'));
});
