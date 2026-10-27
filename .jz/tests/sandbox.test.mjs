// Pruebas de aislamiento de .jz/bin/jz-run. Se ejecutan en el host (no dentro del sandbox, que no
// puede crear espacios de nombres): node --test .jz/tests/sandbox.test.mjs
// Son sondas no destructivas: intentan leer, escribir o conectar y comprueban que el sistema lo impide.
// Lo que crean (directorio de sondas, cuarentena) lo borran al terminar.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WT = path.resolve(import.meta.dirname, '../..');
const RUN = path.join(WT, '.jz/bin/jz-run');
const PROBE = `jz-probe-${process.pid}`;
const skip = process.env.JZ_SANDBOX === '1' ? 'dentro del sandbox no se pueden anidar espacios de nombres' : false;

function run(script, env = {}) {
  const r = spawnSync(RUN, ['sh', '-c', script], { cwd: WT, encoding: 'utf8', env: { ...process.env, ...env } });
  return { rc: r.status, out: r.stdout + r.stderr };
}

const quarantined = [];
after(() => {
  fs.rmSync(path.join(WT, PROBE), { recursive: true, force: true });
  for (const q of quarantined) fs.rmSync(q, { recursive: true, force: true });
});

test('escribe dentro del worktree', { skip }, () => {
  const r = run(`mkdir ${PROBE} && echo ok > ${PROBE}/a && cat ${PROBE}/a`);
  assert.equal(r.rc, 0, r.out);
  assert.equal(fs.readFileSync(path.join(WT, PROBE, 'a'), 'utf8'), 'ok\n');
});

test('no escribe en el plano de control ni fuera del worktree', { skip }, () => {
  for (const target of ['.claude/x', '.opencode/x', '.jz/x', '.jz-state/x', 'AGENTS.md', '/usr/x', '/etc/x', '/x']) {
    const r = run(`echo x >> ${target}`);
    assert.notEqual(r.rc, 0, `${target}: ${r.out}`);
    assert.match(r.out, /Read-only file system|Permission denied/, target);
  }
  if (fs.statSync(path.join(WT, '.git')).isFile()) {
    assert.notEqual(run('echo x >> .git').rc, 0, '.git');
  }
});

test('no ve credenciales, otros proyectos ni el socket de Docker', { skip }, () => {
  const r = run('ls /root 2>&1; ls /home/proyectos; ls /var/run/docker.sock /run/docker.sock 2>&1; '
    + 'wc -c < /etc/shadow; ls -A /etc/ssh | wc -l');
  assert.match(r.out, /'\/root': No such file or directory/);
  // Sólo el propio worktree es visible; bajo /home/proyectos aparece únicamente la primera componente de su
  // ruta (jozeuzz-poc-… o, en la estructura anidada, jozeuzz con sólo el esqueleto hasta worktrees/<nombre>).
  const own = path.relative('/home/proyectos', WT).split(path.sep)[0];
  assert.deepEqual(r.out.split('\n').filter((l) => l.startsWith('jozeuzz')), [own]);
  assert.doesNotMatch(r.out.replaceAll(own, ''), /wealthfolio|jozeuzz|MoneyPrinter/i);
  assert.match(r.out, /'\/run\/docker\.sock': No such file or directory/);
  assert.match(r.out, /^0$/m, '/etc/shadow vacío');
});

test('no lee secretos del worktree (.env*, claves), salvo los de ejemplo', { skip }, () => {
  const dir = path.join(WT, PROBE, 'secretos');
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  const secrets = ['.env', '.env.local', 'sub/.env.production', 'servidor.key', 'cert.pem', 'id_ed25519'];
  for (const f of secrets) fs.writeFileSync(path.join(dir, f), 'SECRETO-SONDA-77\n');
  fs.writeFileSync(path.join(dir, '.env.example'), 'EJEMPLO-VISIBLE\n');
  const rel = path.relative(WT, dir);
  const r = run(`cd ${rel} && cat ${secrets.join(' ')} .env.example; echo x > .env; echo rc_escritura=$?`);
  assert.doesNotMatch(r.out, /SECRETO-SONDA-77/);
  assert.match(r.out, /EJEMPLO-VISIBLE/);
  assert.doesNotMatch(r.out, /rc_escritura=0/);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), 'SECRETO-SONDA-77\n');
});

test('sin red y sin acceso a servicios del host', { skip }, () => {
  const ports = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim().split(/\s+/)[3]).filter(Boolean)
    .map((a) => Number(a.split(':').at(-1))).filter((p) => p > 0);
  const port = ports[0] ?? 80;
  const js = `const n=require('net');for(const [h,p] of [['1.1.1.1',53],['127.0.0.1',${port}]]){`
    + `n.connect(p,h).on('connect',()=>console.log('CONECTA',h,p)).on('error',e=>console.log('falla',h,p,e.code))}`;
  const r = run(`node -e "${js}"`);
  assert.doesNotMatch(r.out, /CONECTA/, r.out);
  assert.match(r.out, /falla 1\.1\.1\.1 53 ENETUNREACH/);
  assert.match(r.out, new RegExp(`falla 127\\.0\\.0\\.1 ${port} ECONNREFUSED`));
});

test('no ve ni señaliza procesos del host', { skip }, () => {
  const r = run(`ls /proc | grep -c '^[0-9]'; kill -0 ${process.pid} 2>&1 || echo NO-SEÑAL`);
  assert.ok(Number(r.out.split('\n')[0]) < 10, r.out);
  assert.match(r.out, /NO-SEÑAL/);
});

test('sin capacidades, sin escalar y sin heredar secretos del entorno', { skip }, () => {
  const r = run('grep -E "^Cap(Eff|Prm|Bnd)" /proc/self/status; unshare -Ur true 2>&1 || echo NO-USERNS; '
    + 'echo "tok=${JZ_FAKE_TOKEN:-vacío}"; mount -o remount,rw /usr 2>&1 || echo NO-REMOUNT', { JZ_FAKE_TOKEN: 'secreto' });
  assert.match(r.out, /CapEff:\s+0+\n/);
  assert.match(r.out, /CapBnd:\s+0+\n/);
  assert.match(r.out, /NO-USERNS/);
  assert.match(r.out, /NO-REMOUNT/);
  assert.match(r.out, /tok=vacío/);
});

test('pone en cuarentena el plano de control creado y los enlaces hacia fuera', { skip }, () => {
  const created = ['opencode.jsonc', '.mcp.json'].filter((p) => !fs.existsSync(path.join(WT, p)));
  assert.ok(created.length > 0, 'se necesita al menos un archivo de control ausente');
  fs.mkdirSync(path.join(WT, PROBE), { recursive: true });
  const r = run(`for f in ${created.join(' ')}; do echo '{}' > $f; done; ln -s /etc/hostname ${PROBE}/fuera`);
  assert.equal(r.rc, 86, r.out);
  for (const p of [...created, `${PROBE}/fuera`]) assert.equal(fs.existsSync(path.join(WT, p)), false, p);
  const qdir = path.join(WT, r.out.match(/se movieron a (\.jz-state\/quarantine\/\S+):/)[1]);
  quarantined.push(qdir);
  for (const p of created) assert.ok(fs.existsSync(path.join(qdir, p)), `${p} en cuarentena`);
  const last = JSON.parse(fs.readFileSync(path.join(WT, '.jz-state/runs.jsonl'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.rc, 86);
});

// Revisión de seguridad: un enlace interno hacia el plano de control sobrevivía a jz-run y una edición
// posterior a través de él (fuera del sandbox) escribiría en .jz/.
test('pone en cuarentena los enlaces nuevos que apuntan al plano de control', { skip }, () => {
  fs.mkdirSync(path.join(WT, PROBE), { recursive: true });
  const r = run(`ln -s ../.jz/policy/policy.mjs ${PROBE}/interno && ln -s ../AGENTS.md ${PROBE}/agentes && ln -s ../docs ${PROBE}/docs`);
  assert.equal(r.rc, 86, r.out);
  for (const p of ['interno', 'agentes']) assert.equal(fs.existsSync(path.join(WT, PROBE, p)), false, p);
  assert.ok(fs.lstatSync(path.join(WT, PROBE, 'docs')).isSymbolicLink(), 'un enlace interno ordinario se conserva');
  quarantined.push(path.join(WT, r.out.match(/se movieron a (\.jz-state\/quarantine\/\S+):/)[1]));
});

// QA F12: con un árbol no verificable, jz-run no ejecuta el comando ni registra una ejecución.
test('jz-run no ejecuta ni registra nada si la huella falla', { skip }, () => {
  fs.mkdirSync(path.join(WT, PROBE, 'anidado/.git'), { recursive: true });
  const runs = path.join(WT, '.jz-state/runs.jsonl');
  const before = fs.existsSync(runs) ? fs.readFileSync(runs, 'utf8') : '';
  const r = run(`touch ${PROBE}/ejecutado`);
  assert.notEqual(r.rc, 0, r.out);
  assert.match(r.out, /JZ_TREE_NESTED_REPO/);
  assert.equal(fs.existsSync(path.join(WT, PROBE, 'ejecutado')), false, 'el comando no se ejecutó');
  assert.equal(fs.existsSync(runs) ? fs.readFileSync(runs, 'utf8') : '', before, 'runs.jsonl sin cambios');
  fs.rmSync(path.join(WT, PROBE, 'anidado'), { recursive: true, force: true });
});

// QA R7: el head registrado es el de este worktree aunque el entorno del motor apunte a otro repositorio.
test('jz-run registra su propio HEAD aunque el entorno apunte a otro repositorio', { skip }, () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-otro-'));
  try {
    execFileSync('git', ['init', '-q', other], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
    const r = run('true', { GIT_DIR: path.join(other, '.git'), GIT_WORK_TREE: other });
    assert.equal(r.rc, 0, r.out);
    const last = JSON.parse(fs.readFileSync(path.join(WT, '.jz-state/runs.jsonl'), 'utf8').trim().split('\n').at(-1));
    const head = execFileSync('git', ['-C', WT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8',
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) }).trim();
    assert.equal(last.head, head);
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test('--cwd sólo admite subdirectorios del worktree', { skip }, () => {
  const ok = spawnSync(RUN, ['--cwd', 'docs', 'pwd'], { cwd: WT, encoding: 'utf8' });
  assert.equal(ok.stdout.trim(), path.join(WT, 'docs'));
  const out = spawnSync(RUN, ['--cwd', '..', 'pwd'], { cwd: WT, encoding: 'utf8' });
  assert.equal(out.status, 2, out.stderr);
});
