// Pruebas de aislamiento de .jz/bin/jz-run. Se ejecutan en el host (no dentro del sandbox, que no
// puede crear espacios de nombres): node --test .jz/tests/sandbox.test.mjs
// Son sondas no destructivas: intentan leer, escribir o conectar y comprueban que el sistema lo impide.
// Lo que crean (directorio de sondas, cuarentena) lo borran al terminar.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
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
  // Sólo el propio worktree es visible; el nombre del worktree (p. ej. jozeuzz-poc-…) no cuenta como ajeno.
  assert.deepEqual(r.out.split('\n').filter((l) => l.startsWith('jozeuzz')), [path.basename(WT)]);
  assert.doesNotMatch(r.out.replaceAll(path.basename(WT), ''), /wealthfolio|jozeuzz|MoneyPrinter/i);
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

test('--cwd sólo admite subdirectorios del worktree', { skip }, () => {
  const ok = spawnSync(RUN, ['--cwd', 'docs', 'pwd'], { cwd: WT, encoding: 'utf8' });
  assert.equal(ok.stdout.trim(), path.join(WT, 'docs'));
  const out = spawnSync(RUN, ['--cwd', '..', 'pwd'], { cwd: WT, encoding: 'utf8' });
  assert.equal(out.status, 2, out.stderr);
});
