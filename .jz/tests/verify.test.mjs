// Pruebas de la verificación reconocida (I2): perfiles autorizados, oráculo del Node Test Runner, evidencia en
// .jz-state/verify/ y estados VALIDADO, FALLIDO, OBSOLETO, BLOQUEADO y SIN_VERIFICACION.
// Todo ocurre en repositorios desechables del directorio temporal, con contenido sintético.
// Las pruebas que ejecutan jz-run de verdad necesitan espacios de nombres y sólo corren en el host:
//   node --test .jz/tests/verify.test.mjs
// Las demás (oráculo con salidas reales de node --test, perfiles y estados con un ejecutor simulado) también
// dentro del sandbox: .jz/bin/jz-run node --test .jz/tests/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReport, loadProfile, runProfile, profileStatus, VerifyError } from '../lib/verify.mjs';

const SRC = path.resolve(import.meta.dirname, '../..');
const REPORTER_ARG = '--test-reporter=./.jz/lib/verify-reporter.mjs';
const hostOnly = process.env.JZ_SANDBOX === '1' ? 'dentro del sandbox no se pueden anidar espacios de nombres' : false;
const roots = [];
after(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function tmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(d);
  return d;
}

// node --test anidado: sin NODE_TEST_CONTEXT heredado (el proceso hijo de un runner emitiría su protocolo
// interno en lugar del reporter) ni opciones del entorno.
const NODE_ENV = Object.fromEntries(Object.entries(process.env)
  .filter(([k]) => !k.startsWith('NODE_') && !k.startsWith('GIT_')));
const GIT_ENV = { ...NODE_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (repo, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=jz-test',
  '-c', 'user.email=jz-test@example.invalid', ...a], { stdio: 'pipe', encoding: 'utf8', env: GIT_ENV });

// ------------------------------------------------------------------ oráculo con salidas reales

const PASS2 = "import { test } from 'node:test';\ntest('uno', () => {});\ntest('dos', () => {});\n";
const oracleOf = (files, over = {}) => ({ format: 'node-test-jz-v1', files, minTests: 1, allowSkipped: 0, allowTodo: 0, ...over });

// Ejecuta node --test con el reporter del plano de control sobre archivos sintéticos y devuelve su salida.
function runReporter(files, { run = Object.keys(files) } = {}) {
  const dir = tmp('jz-oracle-');
  fs.mkdirSync(path.join(dir, '.jz/lib'), { recursive: true });
  fs.copyFileSync(path.join(SRC, '.jz/lib/verify-reporter.mjs'), path.join(dir, '.jz/lib/verify-reporter.mjs'));
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  const r = spawnSync('node', ['--test', REPORTER_ARG, ...run], { cwd: dir, encoding: 'utf8', env: NODE_ENV, timeout: 60_000 });
  return { dir, rc: r.status, text: r.stdout + r.stderr };
}

test('oráculo: dos archivos que pasan dan un resultado estructurado positivo', () => {
  const { dir, rc, text } = runReporter({ 't/a.test.mjs': PASS2, 't/b.test.mjs': PASS2 });
  assert.equal(rc, 0, text);
  const r = parseReport(text, { wt: dir, oracle: oracleOf(['t/a.test.mjs', 't/b.test.mjs']) });
  assert.equal(r.ok, true, r.reasons.join('; '));
  assert.deepEqual(r.counts, { tests: 4, suites: 0, pass: 4, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.deepEqual(r.files, { 't/a.test.mjs': 2, 't/b.test.mjs': 2 });
  assert.match(r.node, /^v\d+\./);
});

const rejects = (files, re, { run, oracle } = {}) => {
  const { dir, text } = runReporter(files, { run });
  const r = parseReport(text, { wt: dir, oracle: oracle ?? oracleOf(run ?? Object.keys(files)) });
  assert.equal(r.ok, false, `se aceptó: ${text}`);
  assert.match(r.reasons.join('; '), re);
  return r;
};

test('oráculo: una prueba fallida no se acepta', () => {
  const r = rejects({ 't/a.test.mjs': `${PASS2}test('rota', () => { throw new Error('esperado'); });\n` }, /fallida/);
  assert.equal(r.counts.fail, 1);
  assert.deepEqual(r.failures.map((f) => f.name), ['rota']);
  assert.match(r.failures[0].message, /esperado/);
});

test('oráculo: pruebas omitidas, todo y canceladas no se aceptan', () => {
  rejects({ 't/a.test.mjs': `${PASS2}test('omitida', { skip: true }, () => {});\n` }, /omitida/);
  rejects({ 't/a.test.mjs': `${PASS2}test('pendiente', { todo: true }, () => {});\n` }, /todo/);
  rejects({ 't/a.test.mjs': `${PASS2}test('lenta', { timeout: 50 }, () => new Promise(() => {}));\n` }, /cancelada|fallida/);
  // Un perfil puede tolerar omisiones de forma explícita.
  const { dir, text } = runReporter({ 't/a.test.mjs': `${PASS2}test('omitida', { skip: true }, () => {});\n` });
  assert.equal(parseReport(text, { wt: dir, oracle: oracleOf(['t/a.test.mjs'], { allowSkipped: 1 }) }).ok, true);
});

test('oráculo: archivos sin resultados estructurados (vacío, salida anticipada, error al cargar)', () => {
  // Node cuenta el propio archivo como una prueba que pasa: «tests 1, pass 1» sin haber ejecutado ninguna.
  rejects({ 't/a.test.mjs': '// sin pruebas\n' }, /sin resultados estructurados/);
  rejects({ 't/a.test.mjs': "import { test } from 'node:test';\ntest('sale', () => { process.exit(0); });\ntest('nunca', () => {});\n" },
    /sin resultados estructurados/);
  rejects({ 't/a.test.mjs': "throw new Error('al cargar');\n" }, /sin resultados estructurados|fallida/);
});

test('oráculo: falta un archivo esperado o aparece uno inesperado', () => {
  rejects({ 't/a.test.mjs': PASS2, 't/b.test.mjs': PASS2 }, /falta.*t\/b\.test\.mjs/,
    { run: ['t/a.test.mjs'], oracle: oracleOf(['t/a.test.mjs', 't/b.test.mjs']) });
  rejects({ 't/a.test.mjs': PASS2, 't/b.test.mjs': PASS2 }, /inesperado.*t\/b\.test\.mjs/,
    { run: ['t/a.test.mjs', 't/b.test.mjs'], oracle: oracleOf(['t/a.test.mjs']) });
});

test('oráculo: salida incompleta, malformada o con eventos duplicados', () => {
  const { dir, text } = runReporter({ 't/a.test.mjs': PASS2 });
  const oracle = oracleOf(['t/a.test.mjs']);
  const lines = text.split('\n');
  const endIdx = lines.findIndex((l) => l.startsWith('JZV1 ') && JSON.parse(l.slice(5)).t === 'end');
  assert.ok(endIdx > 0, text);
  const variants = {
    truncada: lines.slice(0, endIdx).join('\n'),
    'sin inicio': lines.filter((l) => !(l.startsWith('JZV1 ') && JSON.parse(l.slice(5)).t === 'start')).join('\n'),
    malformada: text.replace(/^JZV1 \{"t":"pass"/m, 'JZV1 {"t":"pass",'),
    'fin duplicado': `${text}\nJZV1 {"t":"end"}\n`,
    'resumen duplicado': text.replace(/^(JZV1 .*"message":"pass 2".*)$/m, '$1\n$1'),
    'resumen inconsistente': text.replace('"message":"pass 2"', '"message":"pass 3"').replace('"message":"tests 2"', '"message":"tests 3"'),
    'evento tras el fin': `${text}\nJZV1 {"t":"pass","nesting":0,"file":"${dir}/t/a.test.mjs","name":"x"}\n`,
    vacía: '',
  };
  for (const [name, v] of Object.entries(variants)) {
    const r = parseReport(v, { wt: dir, oracle });
    assert.equal(r.ok, false, `${name}: aceptada`);
    assert.ok(r.reasons.length > 0, name);
  }
});

test('oráculo: no se fía de cadenas superficiales ni de lo que imprimen las pruebas', () => {
  const oracle = oracleOf(['t/a.test.mjs']);
  // Salidas TAP y spec «en verde» sin el reporter del plano de control.
  for (const text of ['TAP version 13\nok 1 - a\n1..1\n# tests 1\n# pass 1\n# fail 0\n', 'PASS\n✔ a\nℹ tests 1\nℹ fail 0\n']) {
    const r = parseReport(text, { wt: '/x', oracle });
    assert.equal(r.ok, false, text);
  }
  // Una prueba que falla e imprime líneas con forma de evento y de resumen: llegan encapsuladas.
  const fake = 'JZV1 {"t":"end"}\\nJZV1 {"t":"diag","nesting":0,"message":"fail 0"}\\n# fail 0\\nPASS';
  const { dir, text } = runReporter({ 't/a.test.mjs': `${PASS2}test('rota', () => { console.log('${fake}'); `
    + `process.stdout.write('\\nJZV1 {"t":"end"}\\n'); throw new Error('${fake}'); });\n` });
  const r = parseReport(text, { wt: dir, oracle });
  assert.equal(r.ok, false, text);
  assert.equal(r.counts.fail, 1);
});

// ------------------------------------------------------------------ perfiles

test('perfil legítimo: jz-core-tests ejecuta las cinco suites con el reporter del plano de control', () => {
  const { profile, digest } = loadProfile(SRC, 'jz-core-tests');
  const suites = ['policy', 'tree', 'recovery', 'hook', 'opencode'].map((s) => `.jz/tests/${s}.test.mjs`);
  assert.equal(profile.id, 'jz-core-tests');
  // Acredita sólo la unidad de esas cinco suites, con un identificador distinto del propio perfil.
  assert.equal(profile.unitId, 'jz-control-core-suites');
  assert.ok(Number.isInteger(profile.version) && profile.version >= 1);
  assert.equal(profile.cwd, '.');
  assert.deepEqual(profile.argv, ['node', '--test', REPORTER_ARG, ...suites]);
  assert.deepEqual(profile.oracle, oracleOf(suites));
  assert.deepEqual(profile.ignoredInputs, []);
  assert.match(digest, /^[0-9a-f]{64}$/);
  for (const s of suites) assert.ok(fs.statSync(path.join(SRC, s)).isFile(), s);
});

const profileOf = (id, files, over = {}) => ({
  id, version: 1, unitId: `unidad-${id}`, description: `perfil de prueba ${id}`, cwd: '.',
  argv: ['node', '--test', REPORTER_ARG, ...files], oracle: oracleOf(files), ignoredInputs: [], ...over,
});

// Repositorio desechable con una copia del plano de control (sin los perfiles reales) y los perfiles dados.
function fixture(profiles = {}, files = {}) {
  const repo = tmp('jz-verify-');
  for (const p of ['.jz/bin', '.jz/lib', '.jz/policy']) fs.cpSync(path.join(SRC, p), path.join(repo, p), { recursive: true });
  fs.mkdirSync(path.join(repo, '.jz/profiles'));
  fs.writeFileSync(path.join(repo, '.gitignore'), '.jz-state/\nignorado/\n');
  for (const [f, c] of Object.entries({ 't/a.test.mjs': PASS2, 't/b.test.mjs': PASS2, 'src/x.txt': 'x\n', ...files })) {
    fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    fs.writeFileSync(path.join(repo, f), c);
  }
  for (const [id, p] of Object.entries(profiles)) {
    fs.writeFileSync(path.join(repo, `.jz/profiles/${id}.json`), typeof p === 'string' ? p : JSON.stringify(p, null, 2));
  }
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'fixture');
  return repo;
}

const profileError = (repo, id, re) => {
  assert.throws(() => loadProfile(repo, id), (e) => e instanceof VerifyError && e.code === 'JZ_VERIFY_PROFILE' && re.test(e.message));
};

test('perfil inexistente o identificador no válido', () => {
  const repo = fixture({ ok: profileOf('ok', ['t/a.test.mjs']) });
  profileError(repo, 'no-existe', /no existe/);
  for (const id of ['../policy', 'ok/../ok', 'Ok', '', '-x', 'a b', '.jz/profiles/ok.json', 'ok.json']) {
    profileError(repo, id, /identificador/);
  }
});

test('perfil no autorizado: argv libre, comando distinto, filtros de pruebas o campos desconocidos', () => {
  const files = ['t/a.test.mjs'];
  const bad = {
    'cmd-true': profileOf('cmd-true', files, { argv: ['true'] }),
    'sin-reporter': profileOf('sin-reporter', files, { argv: ['node', '--test', ...files] }),
    'otro-reporter': profileOf('otro-reporter', files, { argv: ['node', '--test', REPORTER_ARG, '--test-reporter=tap', ...files] }),
    destino: profileOf('destino', files, { argv: ['node', '--test', REPORTER_ARG, '--test-reporter-destination=x', ...files] }),
    filtro: profileOf('filtro', files, { argv: ['node', '--test', REPORTER_ARG, '--test-name-pattern=uno', ...files] }),
    only: profileOf('only', files, { argv: ['node', '--test', '--test-only', REPORTER_ARG, ...files] }),
    eval: profileOf('eval', files, { argv: ['node', '-e', 'process.exit(0)', '--test', REPORTER_ARG, ...files] }),
    archivos: profileOf('archivos', files, { oracle: oracleOf(['t/a.test.mjs', 't/b.test.mjs']) }),
    fuera: profileOf('fuera', ['../x.test.mjs']),
    'otro-id': profileOf('distinto', files),
    extra: { ...profileOf('extra', files), shell: 'sh -c id' },
    cwd: profileOf('cwd', files, { cwd: '/tmp' }),
    ignorados: profileOf('ignorados', files, { ignoredInputs: ['node_modules'] }),
    'sin-minimo': profileOf('sin-minimo', files, { oracle: oracleOf(files, { minTests: 0 }) }),
    version: profileOf('version', files, { version: '1' }),
    'sin-unidad': (({ unitId, ...p }) => p)(profileOf('sin-unidad', files)),
    'unidad-libre': profileOf('unidad-libre', files, { unitId: 'Landing jozeuzz.cl' }),
    'unidad-vacia': profileOf('unidad-vacia', files, { unitId: '' }),
    'unidad-lista': profileOf('unidad-lista', files, { unitId: ['a', 'b'] }),
    json: '{ "id": "json", ',
  };
  const repo = fixture(bad);
  for (const id of Object.keys(bad)) profileError(repo, id, /./);
  fs.symlinkSync('ok-real.json', path.join(repo, '.jz/profiles/enlace.json'));
  fs.writeFileSync(path.join(repo, '.jz/profiles/ok-real.json'), JSON.stringify(profileOf('enlace', files)));
  profileError(repo, 'enlace', /enlace|archivo regular/);
});

// ------------------------------------------------------------------ ejecución con un ejecutor simulado

// Sustituye a jz-run sin espacios de nombres: ejecuta el argv recibido en el worktree y registra en runs.jsonl
// lo mismo que jz-run (huella previa, HEAD corto, comando, rc y log). Las variantes simulan desvíos.
let fakePid = 3_900_000;
function fakeRunner({ cmd, rc, record = true, during, tree } = {}) {
  const calls = [];
  const runner = async ({ wt, argv, cwd }) => {
    calls.push({ argv, cwd });
    const pid = ++fakePid;
    const state = path.join(wt, '.jz-state');
    fs.mkdirSync(path.join(state, 'runs'), { recursive: true });
    const ts = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
    const log = `.jz-state/runs/${ts}-${pid}.log`;
    const fp = execFileSync(path.join(wt, '.jz/bin/jz-run'), ['--fingerprint'], { cwd: wt, encoding: 'utf8' }).trim();
    const head = git(wt, 'rev-parse', '--short', 'HEAD').trim();
    during?.(wt);
    const r = spawnSync(argv[0], argv.slice(1), { cwd: path.join(wt, cwd), encoding: 'utf8', env: NODE_ENV, timeout: 60_000 });
    fs.writeFileSync(path.join(wt, log), r.stdout + r.stderr);
    const code = rc ?? r.status ?? 128 + 9;
    if (record) {
      fs.appendFileSync(path.join(state, 'runs.jsonl'), JSON.stringify({ ts, engine: 'test', head, tree: tree ?? fp,
        cwd, cmd: cmd ?? argv, rc: code, secs: 0, log }) + '\n');
    }
    return { pid, code, signal: null };
  };
  return { runner, calls };
}

const evidenceFile = (repo, id) => path.join(repo, '.jz-state/verify', `${id}.json`);
const readEvidence = (repo, id) => JSON.parse(fs.readFileSync(evidenceFile(repo, id), 'utf8'));

test('ejecución reconocida: VALIDADO con la evidencia completa', async () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs', 't/b.test.mjs']) });
  const { runner, calls } = fakeRunner();
  const res = await runProfile(repo, 'fx', { runner });
  assert.equal(res.state, 'VALIDADO', res.reasons.join('; '));
  assert.deepEqual(calls, [{ argv: profileOf('fx', ['t/a.test.mjs', 't/b.test.mjs']).argv, cwd: '.' }], 'sólo el argv del perfil');
  const ev = readEvidence(repo, 'fx');
  assert.equal(ev.schema, 'jz-verify-evidence-v1');
  assert.equal(ev.state, 'VALIDADO');
  assert.equal(ev.profile.id, 'fx');
  assert.equal(ev.profile.version, 1);
  assert.equal(ev.profile.unitId, 'unidad-fx');
  assert.match(ev.profile.digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(ev.command.argv, calls[0].argv);
  assert.match(ev.command.digest, /^[0-9a-f]{64}$/);
  assert.equal(ev.repo.head, git(repo, 'rev-parse', 'HEAD').trim());
  assert.match(ev.repo.index, /^[0-9a-f]{64}$/);
  assert.match(ev.repo.tree, /^[0-9a-f]{64}$/);
  assert.deepEqual(ev.repoAfter, ev.repo);
  assert.equal(ev.run.rc, 0);
  assert.match(ev.run.log, /^\.jz-state\/runs\/\d{8}T\d{6}Z-\d+\.log$/);
  assert.match(ev.run.logDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(ev.oracle.counts, { tests: 4, suites: 0, pass: 4, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.ok(!Number.isNaN(Date.parse(ev.date)));
  assert.match(ev.runtime.node.sha256, /^[0-9a-f]{64}$/);
  assert.equal(ev.ignored.reproducible, false);
  assert.match(ev.assurance, /no es una atestación/);
  assert.equal(profileStatus(repo, 'fx').state, 'VALIDADO');
});

test('comando registrado distinto del perfil (true con rc=0): FALLIDO', async () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  const res = await runProfile(repo, 'fx', { runner: fakeRunner({ cmd: ['true'] }).runner });
  assert.equal(res.state, 'FALLIDO');
  assert.match(res.reasons.join('; '), /comando/);
  assert.equal(profileStatus(repo, 'fx').state, 'FALLIDO');
});

test('una ejecución de jz-run true en verde no es una verificación reconocida', () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  const fp = execFileSync(path.join(repo, '.jz/bin/jz-run'), ['--fingerprint'], { cwd: repo, encoding: 'utf8' }).trim();
  fs.mkdirSync(path.join(repo, '.jz-state/runs'), { recursive: true });
  fs.appendFileSync(path.join(repo, '.jz-state/runs.jsonl'), JSON.stringify({ ts: '20261024T000000Z', engine: 'test',
    head: git(repo, 'rev-parse', '--short', 'HEAD').trim(), tree: fp, cwd: '.', cmd: ['true'], rc: 0, secs: 0,
    log: '.jz-state/runs/20261024T000000Z-1.log' }) + '\n');
  assert.equal(profileStatus(repo, 'fx').state, 'SIN_VERIFICACION');
});

test('pruebas fallidas u omitidas, rc distinto de cero y ejecución interrumpida: FALLIDO', async () => {
  const cases = {
    fallida: [{ 't/a.test.mjs': `${PASS2}test('rota', () => { throw new Error('x'); });\n` }, {}, /fallida/],
    omitida: [{ 't/a.test.mjs': `${PASS2}test('omitida', { skip: true }, () => {});\n` }, {}, /omitida/],
    rc: [{}, { rc: 1 }, /rc=1/],
    // El runner muere a mitad (como un SIGKILL dentro del sandbox): rc 137 y salida sin fin.
    interrumpida: [{ 't/a.test.mjs': "import { test } from 'node:test';\ntest('mata', () => { process.kill(process.ppid, 'SIGKILL'); "
      + "return new Promise(() => {}); });\n" }, {}, /incompleta|rc=/],
    'sin registro': [{}, { record: false }, /registro de jz-run/],
  };
  for (const [name, [files, opts, re]] of Object.entries(cases)) {
    const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) }, files);
    const res = await runProfile(repo, 'fx', { runner: fakeRunner(opts).runner });
    assert.equal(res.state, 'FALLIDO', name);
    assert.match(res.reasons.join('; '), re, name);
    assert.equal(profileStatus(repo, 'fx').state, 'FALLIDO', name);
  }
});

test('el árbol cambia durante la ejecución o el registro no corresponde a la huella previa: FALLIDO', async () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  const res = await runProfile(repo, 'fx', { runner: fakeRunner({ during: (wt) => fs.writeFileSync(path.join(wt, 'src/x.txt'), 'y\n') }).runner });
  assert.equal(res.state, 'FALLIDO');
  assert.match(res.reasons.join('; '), /cambió durante la ejecución/);
  const repo2 = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  const res2 = await runProfile(repo2, 'fx', { runner: fakeRunner({ tree: 'f'.repeat(64) }).runner });
  assert.equal(res2.state, 'FALLIDO');
  assert.match(res2.reasons.join('; '), /huella/);
});

test('perfil inexistente o repositorio no inspeccionable: no se ejecuta nada', async () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  const { runner, calls } = fakeRunner();
  await assert.rejects(runProfile(repo, 'nada', { runner }), (e) => e.code === 'JZ_VERIFY_PROFILE');
  fs.mkdirSync(path.join(repo, 'anidado/.git'), { recursive: true });
  const res = await runProfile(repo, 'fx', { runner });
  assert.equal(res.state, 'BLOQUEADO');
  assert.match(res.reasons.join('; '), /JZ_TREE_NESTED_REPO/);
  assert.deepEqual(calls, [], 'el ejecutor no se invocó');
  assert.equal(fs.existsSync(evidenceFile(repo, 'fx')), false, 'sin evidencia');
  assert.equal(profileStatus(repo, 'fx').state, 'BLOQUEADO');
});

// ------------------------------------------------------------------ vigencia de la evidencia

async function validated() {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  const res = await runProfile(repo, 'fx', { runner: fakeRunner().runner });
  assert.equal(res.state, 'VALIDADO', res.reasons.join('; '));
  return repo;
}

test('OBSOLETO si cambia el árbol, el índice, HEAD o el perfil protegido', async () => {
  const obsolete = (repo, re) => {
    const s = profileStatus(repo, 'fx');
    assert.equal(s.state, 'OBSOLETO', s.reasons.join('; '));
    assert.match(s.reasons.join('; '), re);
  };
  let repo = await validated();
  fs.writeFileSync(path.join(repo, 'src/x.txt'), 'cambio\n');
  obsolete(repo, /huella/);
  fs.writeFileSync(path.join(repo, 'src/x.txt'), 'x\n');
  assert.equal(profileStatus(repo, 'fx').state, 'VALIDADO', 'el mismo árbol vuelve a ser válido');
  fs.writeFileSync(path.join(repo, 'src/nuevo.txt'), 'n\n');
  obsolete(repo, /huella/);

  repo = await validated();
  fs.writeFileSync(path.join(repo, 'src/x.txt'), 'x2\n');
  git(repo, 'add', 'src/x.txt');
  fs.writeFileSync(path.join(repo, 'src/x.txt'), 'x\n');
  obsolete(repo, /índice/);

  repo = await validated();
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'otro');
  obsolete(repo, /HEAD/);

  repo = await validated();
  const p = path.join(repo, '.jz/profiles/fx.json');
  fs.writeFileSync(p, JSON.stringify(profileOf('fx', ['t/a.test.mjs'], { version: 2 })));
  git(repo, 'commit', '-qam', 'perfil v2');
  obsolete(repo, /perfil/);

  repo = await validated();
  fs.rmSync(path.join(repo, '.jz/profiles/fx.json'));
  obsolete(repo, /perfil/);
});

test('evidencia faltante, corrupta o sin su log: SIN_VERIFICACION o BLOQUEADO', async () => {
  const empty = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  assert.equal(profileStatus(empty, 'fx').state, 'SIN_VERIFICACION');

  const blocked = (repo, re) => {
    const s = profileStatus(repo, 'fx');
    assert.equal(s.state, 'BLOQUEADO', s.reasons.join('; '));
    assert.match(s.reasons.join('; '), re);
  };
  let repo = await validated();
  fs.writeFileSync(evidenceFile(repo, 'fx'), '{"schema": "jz-verify-evidence-v1", ');
  blocked(repo, /corrupta/);

  repo = await validated();
  const ev = readEvidence(repo, 'fx');
  fs.writeFileSync(evidenceFile(repo, 'fx'), JSON.stringify({ ...ev, oracle: { ...ev.oracle, counts: { ...ev.oracle.counts, pass: 99 } } }));
  blocked(repo, /corrupta|digest/);

  repo = await validated();
  fs.writeFileSync(path.join(repo, readEvidence(repo, 'fx').run.log), 'JZV1 {"t":"start"}\n');
  blocked(repo, /log/);

  repo = await validated();
  fs.rmSync(path.join(repo, readEvidence(repo, 'fx').run.log));
  blocked(repo, /log/);

  repo = await validated();
  fs.rmSync(path.join(repo, '.jz-state/runs.jsonl'));
  blocked(repo, /registro de jz-run/);
});

test('fallo al inspeccionar el repositorio: BLOQUEADO aunque la evidencia sea válida', async () => {
  const repo = await validated();
  fs.mkdirSync(path.join(repo, 'otro/.git'), { recursive: true });
  const s = profileStatus(repo, 'fx');
  assert.equal(s.state, 'BLOQUEADO');
  assert.match(s.reasons.join('; '), /JZ_TREE_NESTED_REPO/);
});

// ------------------------------------------------------------------ cobertura de una unidad (jz-checkpoint)

// jz-checkpoint de verdad sobre evidencias producidas con el ejecutor simulado: «validado» sólo si la unidad
// declarada es, exactamente, la unidad canónica (unitId) de un perfil del registro y todos los perfiles que la
// declaran están en VALIDADO para el estado actual.
const checkpointAs = (repo, unit, state = 'validado', extra = []) => spawnSync(path.join(repo, '.jz/bin/jz-checkpoint'),
  ['--unit', unit, '--state', state, '--next', 'n', ...extra], { cwd: repo, encoding: 'utf8', env: NODE_ENV });
const latestOf = (repo) => fs.readFileSync(path.join(repo, '.jz-state/LATEST.md'), 'utf8');
const declared = (repo, unit, state = 'validado', extra = []) => {
  const r = checkpointAs(repo, unit, state, extra);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { stderr: r.stderr, md: latestOf(repo), state: /^- Estado declarado: (\S+)$/m.exec(latestOf(repo))?.[1] };
};

async function validatedWith(profiles, files = {}) {
  const repo = fixture(profiles, files);
  for (const id of Object.keys(profiles)) {
    const res = await runProfile(repo, id, { runner: fakeRunner().runner });
    assert.equal(res.state, 'VALIDADO', `${id}: ${res.reasons.join('; ')}`);
  }
  return repo;
}

test('unidad: un perfil VALIDADO no acredita una etiqueta libre (Landing jozeuzz.cl)', async () => {
  const repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  const c = declared(repo, 'Landing jozeuzz.cl');
  assert.equal(c.state, 'incompleto');
  assert.match(c.stderr, /no es la unidad canónica de ningún perfil/);
  assert.match(c.md, /^- Unidad: Landing jozeuzz\.cl$/m);
  assert.match(c.md, /^- Cobertura de la unidad: ninguna/m);
  assert.match(c.md, /^- Verificación reconocida: fx VALIDADO/m, 'el perfil sigue vigente, pero no cubre la unidad');
});

test('unidad: la unidad canónica de un perfil VALIDADO vigente queda validada', async () => {
  const repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  const c = declared(repo, 'ux');
  assert.equal(c.state, 'validado', c.stderr);
  assert.equal(c.stderr.includes('AVISO'), false, c.stderr);
  assert.match(c.md, /^- Cobertura de la unidad: ux — perfiles que la acreditan: fx VALIDADO$/m);
});

test('unidad: sin perfil aplicable, con el id del perfil o con variantes del id: incompleto', async () => {
  const repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  for (const unit of ['uz', 'fx', 'jz-core-tests', 'ux ', ' ux', 'UX', 'ux\n', 'ux,uy', 'ux*']) {
    const c = declared(repo, unit);
    assert.equal(c.state, 'incompleto', JSON.stringify(unit));
    assert.match(c.md, /^- Cobertura de la unidad: ninguna/m, JSON.stringify(unit));
  }
});

test('unidad: perfil aplicable FALLIDO, OBSOLETO o SIN_VERIFICACION: incompleto', async () => {
  // SIN_VERIFICACION: el perfil existe y declara la unidad, pero nunca se ejecutó.
  let repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  let c = declared(repo, 'ux');
  assert.equal(c.state, 'incompleto');
  assert.match(c.md, /perfiles que la acreditan: fx SIN_VERIFICACION/);
  assert.match(c.stderr, /no están todos en VALIDADO/);

  repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) },
    { 't/a.test.mjs': `${PASS2}test('rota', () => { throw new Error('x'); });\n` });
  assert.equal((await runProfile(repo, 'fx', { runner: fakeRunner().runner })).state, 'FALLIDO');
  c = declared(repo, 'ux');
  assert.equal(c.state, 'incompleto');
  assert.match(c.md, /perfiles que la acreditan: fx FALLIDO/);

  repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  fs.writeFileSync(path.join(repo, 'src/x.txt'), 'cambio\n');
  c = declared(repo, 'ux');
  assert.equal(c.state, 'incompleto');
  assert.match(c.md, /perfiles que la acreditan: fx OBSOLETO/);
});

test('unidad: perfil aplicable BLOQUEADO o registro no interpretable: no se acredita (bloqueado)', async () => {
  let repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  fs.rmSync(path.join(repo, readEvidence(repo, 'fx').run.log));
  let c = declared(repo, 'ux');
  assert.equal(c.state, 'bloqueado');
  assert.match(c.md, /perfiles que la acreditan: fx BLOQUEADO/);

  // Un perfil del registro que no se puede cargar podría declarar la unidad: la cobertura no es determinable,
  // aunque fx siga VALIDADO.
  repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }), roto: '{ "id": "roto", ' });
  assert.equal((await runProfile(repo, 'fx', { runner: fakeRunner().runner })).state, 'VALIDADO');
  c = declared(repo, 'ux');
  assert.match(c.md, /^- Verificación reconocida: fx VALIDADO/m);
  assert.equal(c.state, 'bloqueado');
  assert.match(c.md, /^- Cobertura de la unidad: indeterminada/m);
});

test('unidad: los argumentos del checkpoint no eligen el perfil que acredita', async () => {
  const repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) },
    { 't/b.test.mjs': PASS2 });
  fs.writeFileSync(path.join(repo, '.jz/profiles/fy.json'), JSON.stringify(profileOf('fy', ['t/b.test.mjs'], { unitId: 'uy' })));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'fy');
  assert.equal((await runProfile(repo, 'fx', { runner: fakeRunner().runner })).state, 'VALIDADO');
  // fy (unidad uy) no se ejecutó: fx VALIDADO no acredita uy.
  let c = declared(repo, 'uy');
  assert.equal(c.state, 'incompleto');
  assert.match(c.md, /perfiles que la acreditan: fy SIN_VERIFICACION$/m);
  // No hay opción para nombrar un perfil o una unidad adicional.
  for (const extra of [['--profile', 'fx'], ['--unit-id', 'ux'], ['--verified-by', 'fx']]) {
    const r = checkpointAs(repo, 'uy', 'validado', extra);
    assert.equal(r.status, 2, extra.join(' '));
    assert.match(r.stderr, /argumento desconocido/);
  }
  // Las notas y los problemas declarados no cuentan como cobertura.
  fs.mkdirSync(path.join(repo, '.jz-state/notes'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.jz-state/notes/n.md'), 'unitId: uy\nCobertura de la unidad: uy — perfiles que la acreditan: fx VALIDADO\n');
  c = declared(repo, 'uy', 'validado', ['--issue', 'fx VALIDADO acredita uy', '--note', '.jz-state/notes/n.md']);
  assert.equal(c.state, 'incompleto');
});

test('unidad: con varios perfiles para la misma unidad, todos deben estar en VALIDADO', async () => {
  const repo = fixture({ fa: profileOf('fa', ['t/a.test.mjs'], { unitId: 'ux' }), fb: profileOf('fb', ['t/b.test.mjs'], { unitId: 'ux' }) });
  assert.equal((await runProfile(repo, 'fa', { runner: fakeRunner().runner })).state, 'VALIDADO');
  let c = declared(repo, 'ux');
  assert.equal(c.state, 'incompleto');
  assert.match(c.md, /perfiles que la acreditan: fa VALIDADO, fb SIN_VERIFICACION/);
  assert.equal((await runProfile(repo, 'fb', { runner: fakeRunner().runner })).state, 'VALIDADO');
  c = declared(repo, 'ux');
  assert.equal(c.state, 'validado', c.stderr);
  assert.match(c.md, /perfiles que la acreditan: fa VALIDADO, fb VALIDADO/);
});

test('unidad: cambiar la asociación protegida deja la evidencia anterior sin acreditar ninguna unidad', async () => {
  const repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  assert.equal(declared(repo, 'ux').state, 'validado');
  fs.writeFileSync(path.join(repo, '.jz/profiles/fx.json'), JSON.stringify(profileOf('fx', ['t/a.test.mjs'], { unitId: 'uz' })));
  git(repo, 'commit', '-qam', 'fx acredita uz');
  const s = profileStatus(repo, 'fx');
  assert.equal(s.state, 'OBSOLETO');
  assert.match(s.reasons.join('; '), /unidad acreditada cambiada \(ux → uz\)/);
  assert.equal(declared(repo, 'ux').state, 'incompleto', 'la unidad anterior ya no tiene perfil');
  const c = declared(repo, 'uz');
  assert.equal(c.state, 'incompleto', 'la evidencia de ux no acredita uz');
  assert.match(c.md, /perfiles que la acreditan: fx OBSOLETO/);
  assert.equal((await runProfile(repo, 'fx', { runner: fakeRunner().runner })).state, 'VALIDADO');
  assert.equal(declared(repo, 'uz').state, 'validado', 'una verificación nueva sí la acredita');
});

test('unidad: los checkpoints de progreso conservan etiquetas libres y anotan la cobertura', async () => {
  const repo = await validatedWith({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }) });
  for (const state of ['incompleto', 'bloqueado', 'cuota']) {
    const c = declared(repo, 'Landing jozeuzz.cl', state);
    assert.equal(c.state, state);
    assert.equal(c.stderr.includes('AVISO'), false, c.stderr);
    assert.match(c.md, /^- Cobertura de la unidad: ninguna/m);
  }
});

test('jz-verify status distingue la verificación de un perfil de la unidad que acredita', async () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs'], { unitId: 'ux' }), roto: '{ "id": "roto", ' });
  assert.equal((await runProfile(repo, 'fx', { runner: fakeRunner().runner })).state, 'VALIDADO');
  const r = spawnSync(path.join(repo, '.jz/bin/jz-verify'), ['status', '--json'], { cwd: repo, encoding: 'utf8', env: NODE_ENV });
  const all = Object.fromEntries(JSON.parse(r.stdout).map((s) => [s.id, s]));
  assert.equal(all.fx.state, 'VALIDADO');
  assert.equal(all.fx.unit, 'ux');
  assert.equal(all.fx.registered, true);
  assert.equal(all.roto.unit, null);
  assert.equal(all.roto.registered, true);
  const t = spawnSync(path.join(repo, '.jz/bin/jz-verify'), ['status'], { cwd: repo, encoding: 'utf8', env: NODE_ENV });
  assert.match(t.stdout, /^- fx: VALIDADO \[unidad ux\]/m);
  assert.match(t.stdout, /^- roto: \S+ \[unidad no determinable\]/m);
});

// ------------------------------------------------------------------ extremo a extremo con jz-run (host)

const verifyCli = (repo, args, opts = {}) => spawnSync(path.join(repo, '.jz/bin/jz-verify'), args,
  { cwd: repo, encoding: 'utf8', timeout: 120_000, env: NODE_ENV, ...opts });
const jzState = (repo) => spawnSync(path.join(repo, '.jz/bin/jz-state'), [], { cwd: repo, encoding: 'utf8', env: NODE_ENV });
const checkpoint = (repo, unit) => spawnSync(path.join(repo, '.jz/bin/jz-checkpoint'),
  ['--unit', unit, '--state', 'validado', '--next', 'n'], { cwd: repo, encoding: 'utf8', env: NODE_ENV });
const latest = (repo) => fs.readFileSync(path.join(repo, '.jz-state/LATEST.md'), 'utf8');

test('jz-verify run en el sandbox: VALIDADO; jz-run true no acredita; jz-state y jz-checkpoint lo distinguen', { skip: hostOnly }, () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs', 't/b.test.mjs']) });
  const r = verifyCli(repo, ['run', 'fx']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /fx: VALIDADO/);
  const ev = readEvidence(repo, 'fx');
  const runs = fs.readFileSync(path.join(repo, '.jz-state/runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const rec = runs.find((x) => x.log === ev.run.log);
  assert.deepEqual(rec.cmd, profileOf('fx', ['t/a.test.mjs', 't/b.test.mjs']).argv, 'jz-run registró el argv del perfil');
  assert.equal(rec.tree, ev.repo.tree);
  assert.equal(rec.rc, 0);
  assert.match(verifyCli(repo, ['status']).stdout, /fx: VALIDADO/);

  let s = jzState(repo);
  assert.equal(s.status, 0, s.stdout);
  assert.match(s.stdout, /## Verificación reconocida/);
  assert.match(s.stdout, /fx: VALIDADO \[unidad unidad-fx\]/);
  assert.match(s.stdout, /sólo acredita su propia unidad/);
  // Sólo la unidad canónica del perfil (unitId) queda validada; una etiqueta libre, no.
  let c = checkpoint(repo, 'Landing jozeuzz.cl');
  assert.equal(c.status, 0, c.stderr);
  assert.match(latest(repo), /- Estado declarado: incompleto/);
  assert.match(latest(repo), /- Verificación reconocida: fx VALIDADO/);
  assert.equal(checkpoint(repo, 'unidad-fx').status, 0);
  assert.match(latest(repo), /- Estado declarado: validado/);
  assert.match(latest(repo), /- Cobertura de la unidad: unidad-fx — perfiles que la acreditan: fx VALIDADO/);

  // Un cambio validado sólo con jz-run true: «en verde» por compatibilidad, pero no es verificación reconocida.
  fs.writeFileSync(path.join(repo, 'src/x.txt'), 'cambio\n');
  assert.equal(spawnSync(path.join(repo, '.jz/bin/jz-run'), ['true'], { cwd: repo }).status, 0);
  s = jzState(repo);
  assert.match(s.stdout, /## Último checkpoint\n(?:- .*\n)*- Cobertura de la unidad: unidad-fx — perfiles que la acreditan: fx VALIDADO\n/,
    'jz-state muestra la cobertura que registró el último checkpoint');
  assert.match(s.stdout, /Árbol actual con ejecución en verde: sí/);
  assert.match(s.stdout, /no es una verificación reconocida/);
  assert.match(s.stdout, /fx: OBSOLETO/);
  c = checkpoint(repo, 'unidad-fx');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stderr, /verificación reconocida/);
  assert.match(latest(repo), /- Estado declarado: incompleto/);
});

test('jz-verify: argumentos no admitidos y perfil inexistente', { skip: hostOnly }, () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  for (const args of [[], ['run'], ['run', 'fx', 'extra'], ['run', 'fx', '--', 'sh'], ['run', '../fx'], ['status', 'x'], ['otro']]) {
    const r = verifyCli(repo, args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
  const r = verifyCli(repo, ['run', 'nada']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no existe/);
  assert.equal(fs.existsSync(path.join(repo, '.jz-state/runs.jsonl')), false, 'no se ejecutó nada');
});

test('jz-verify interrumpido con SIGTERM: FALLIDO, sin evidencia en verde', { skip: hostOnly }, async () => {
  const repo = fixture({ lento: profileOf('lento', ['t/lento.test.mjs']) },
    { 't/lento.test.mjs': "import { test } from 'node:test';\ntest('lenta', () => new Promise((r) => setTimeout(r, 30_000)));\n" });
  const child = spawn(path.join(repo, '.jz/bin/jz-verify'), ['run', 'lento'], { cwd: repo, env: NODE_ENV });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const runs = path.join(repo, '.jz-state/runs');
  for (let i = 0; i < 200 && !(fs.existsSync(runs) && fs.readdirSync(runs).length); i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 500));
  child.kill('SIGTERM');
  const [code] = await once(child, 'exit');
  assert.equal(code, 1, out);
  const ev = readEvidence(repo, 'lento');
  assert.equal(ev.state, 'FALLIDO');
  assert.match(ev.reasons.join('; '), /interrumpida/);
  assert.equal(profileStatus(repo, 'lento').state, 'FALLIDO');
});

test('el proceso verificado no puede escribir la evidencia ni los perfiles', { skip: hostOnly }, () => {
  const repo = fixture({ fx: profileOf('fx', ['t/a.test.mjs']) });
  fs.mkdirSync(path.join(repo, '.jz-state/verify'), { recursive: true });
  for (const target of ['.jz-state/verify/fx.json', '.jz/profiles/fx.json', '.jz/profiles/nuevo.json']) {
    const r = spawnSync(path.join(repo, '.jz/bin/jz-run'), ['sh', '-c', `echo x > ${target}`], { cwd: repo, encoding: 'utf8' });
    assert.notEqual(r.status, 0, target);
    assert.match(r.stdout + r.stderr, /Read-only file system/, target);
  }
});
