// Pruebas de la política por rol. Usan un worktree ficticio desechable en el directorio temporal.
// Ejecutar: .jz/bin/jz-run node --test .jz/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkBash, checkWrite, checkRead, checkDelegate, acquireWriter, releaseWriter, readLock, tokenize,
} from '../policy/policy.mjs';

const wt = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jz-policy-')));
for (const d of ['src', 'docs', '.jz/bin', '.claude', '.opencode/agents', '.jz-state/notes']) {
  fs.mkdirSync(path.join(wt, d), { recursive: true });
}
fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /nowhere\n');
fs.symlinkSync('/etc/hostname', path.join(wt, 'src', 'fuera'));
const ctx = { wt, cwd: wt };
const ok = (r, msg) => assert.equal(r.decision, 'allow', `${msg}: ${r.reason}`);
const no = (r, msg) => assert.equal(r.decision, 'deny', `${msg}: ${r.reason}`);

test('implementer: comandos de desarrollo sólo mediante el ejecutor acotado', () => {
  ok(checkBash('.jz/bin/jz-run npm test', 'jz-implementer', ctx), 'jz-run relativo');
  ok(checkBash(`${wt}/.jz/bin/jz-run node --test src/`, 'jz-implementer', ctx), 'jz-run absoluto');
  ok(checkBash('.jz/bin/jz-run npm test 2>&1 | tail -n 40', 'jz-implementer', ctx), 'filtro de salida');
  ok(checkBash('cd src && ../.jz/bin/jz-run npx tsc --noEmit', 'jz-implementer', ctx), 'cd dentro del worktree');
  ok(checkBash('.jz/bin/jz-run node --test src/; echo EXIT=$?', 'jz-implementer', ctx), '; y echo $?');
  ok(checkBash('.jz/bin/jz-state; git status --short || echo "falló $?"', 'jz-implementer', ctx), '; y ||');
  for (const cmd of ['npm test', 'node -e 1', 'npx vitest', 'bash -c "npm test"', 'sh .jz/bin/jz-run ls',
    'python3 -c 1', '/bin/rm -rf src', 'docker ps', 'curl https://example.com', 'FOO=1 .jz/bin/jz-run ls',
    'rm -rf src', 'chmod +x x', 'kill -9 1', 'systemctl restart docker']) {
    no(checkBash(cmd, 'jz-implementer', ctx), cmd);
  }
});

test('implementer: inyección de shell rechazada', () => {
  for (const cmd of ['git status; rm -rf src', 'git status || rm -rf src', 'git status & rm x', 'echo $HOME',
    'git log $?', 'echo x > src/a', 'echo "$(id)"', 'git status;; rm x',
    'git log $(id)', 'git log `id`', 'git log "$HOME"', 'git status > /tmp/x', 'git status < /etc/passwd',
    'git status\nrm -rf src', '(git status)', 'git log ~/x', '.jz/bin/jz-run ls | tee src/x',
    '.jz/bin/jz-run ls | grep x /etc/passwd', '.jz/bin/jz-run ls | sh', 'cd /tmp && git status',
    'cd .. && git status']) {
    no(checkBash(cmd, 'jz-implementer', ctx), JSON.stringify(cmd));
  }
});

test('implementer: git de lectura permitido, historial y árbol protegidos', () => {
  for (const cmd of ['git status --short', 'git diff --stat', 'git log --oneline -5', 'git branch --show-current',
    'git worktree list', 'git --no-pager diff', 'git remote -v']) {
    ok(checkBash(cmd, 'jz-implementer', ctx), cmd);
  }
  for (const cmd of ['git push', 'git push origin HEAD', 'git merge main', 'git reset --hard', 'git reset HEAD~1',
    'git checkout -- src', 'git restore src/a.ts', 'git clean -fdx', 'git stash', 'git rebase main',
    'git commit --amend -m x', 'git commit -F /etc/shadow', 'git rm -f src/a', 'git branch -D x',
    'git branch nueva', 'git config core.hooksPath x', 'git -c core.hooksPath=/tmp commit -m x',
    'git -C /home/otro status', 'git diff --output=/tmp/x', 'git diff --no-index /root/.ssh/id_rsa /dev/null',
    'git blame --contents /etc/shadow src/a.ts', 'git ls-files --exclude-from=/root/.ssh/id_rsa',
    'git add --pathspec-from-file=/etc/passwd', 'git worktree remove x', 'git fetch', 'git remote add x https://example.invalid', 'git remote set-url origin x', 'git tag v1', 'git update-ref -d HEAD', 'git gc --prune=now']) {
    no(checkBash(cmd, 'jz-implementer', ctx), cmd);
  }
  no(checkBash("git commit -m \"$(cat <<'EOF'\nx\nEOF\nrm -rf src\nEOF\n)\"", 'jz-implementer', ctx),
    'heredoc con cierre anticipado');
  no(checkBash("git log \"$(cat <<'EOF'\nx\nEOF\n)\"", 'jz-implementer', ctx), 'heredoc fuera de commit');
});

// I1 (JZ-IMPLEMENT-001): Git de escritura directo no es una vía para modificar el plano de control, añadir
// secretos ni arrastrar cambios ajenos. Se deniega entero a los roles autónomos; los commits los hace el humano.
test('git de escritura denegado a todos los roles autónomos, con cualquier ruta u opción', () => {
  const cases = [
    // add: rutas ordinarias, protegidas, secretos y modos que arrastran todo el árbol
    'git add src/a.ts', 'git add -A', 'git add .', 'git add -u', 'git add --all', 'git add -f .env',
    'git add --force src/.env.local', 'git add .claude/settings.json', 'git add -- .jz/policy/policy.mjs',
    'git add AGENTS.md', 'git add src', 'git --no-pager add src/a.ts', 'git add -p src/a.ts',
    // commit: mensajes simples, heredoc y opciones peligrosas
    'git commit -m "feat: algo"', 'git commit -a -m x', 'git commit -am x', 'git commit --all -m x',
    'git commit --no-verify -m x', 'git commit -n -m x', 'git commit --allow-empty -m x',
    'git commit -m x -- .jz/bin/jz-run', 'git commit --include .claude -m x', 'git commit --only AGENTS.md -m x',
    "git add src && git commit -m \"$(cat <<'EOF'\nfeat: algo\n\nCuerpo.\nEOF\n)\"",
    // rm y mv: borrar, mover o reemplazar el plano de control
    'git rm src/viejo.ts', 'git rm .jz/policy/policy.mjs', 'git rm -r .jz', 'git rm --cached .claude/settings.json',
    'git rm -r --cached .', 'git mv src/a src/b', 'git mv AGENTS.md x.md', 'git mv .jz/bin/jz-run src/x',
    'git mv src/x .jz/bin/jz-run', 'git mv -k .claude .claude-old',
    // restore: incluso --staged modifica el índice
    'git restore --staged src/a.ts', 'git restore -S .jz/policy/policy.mjs', 'git restore --staged .',
    'git restore --source=HEAD~1 --staged AGENTS.md',
    // encadenados detrás de una lectura permitida
    'git status && git add -A', 'git status; git commit -m x', 'git log -1 || git rm AGENTS.md',
    // otras escrituras del índice o del historial
    'git apply x.patch', 'git am x.mbox', 'git cherry-pick HEAD', 'git revert HEAD', 'git update-index --add x',
    'git read-tree HEAD', 'git checkout-index -a -f', 'git notes add -m x', 'git commit-tree HEAD^{tree} -m x',
    'git hash-object -w src/a.ts', 'git replace HEAD HEAD~1', 'git switch -c x', 'git submodule update',
  ];
  for (const role of ['jz-implementer', 'jz-implementer-copilot', 'jz-orchestrator']) {
    for (const cmd of cases) no(checkBash(cmd, role, ctx), `${role}: ${cmd}`);
  }
  for (const role of ['jz-architect', 'jz-explorer', 'jz-security', 'jz-qa']) {
    no(checkBash('git add -A', role, ctx), `${role}: git add -A`);
  }
  const r = checkBash('git commit -m x', 'jz-implementer', ctx);
  assert.match(r.reason, /humano/, 'el motivo indica que los commits los hace el humano');
});

test('orquestador: sólo lectura de git y estado; nunca ejecuta ni escribe', () => {
  ok(checkBash('git status', 'jz-orchestrator', ctx), 'git status');
  ok(checkBash('.jz/bin/jz-state', 'jz-orchestrator', ctx), 'jz-state');
  ok(checkBash('.jz/bin/jz-lock status', 'jz-orchestrator', ctx), 'jz-lock status');
  for (const cmd of ['.jz/bin/jz-run npm test', 'git add x', 'git commit -m x', '.jz/bin/jz-lock release']) {
    no(checkBash(cmd, 'jz-orchestrator', ctx), cmd);
  }
  no(checkWrite('src/a.ts', 'jz-orchestrator', ctx), 'escritura');
});

test('explorer, security y qa: sin shell ni escritura', () => {
  for (const role of ['jz-explorer', 'jz-security', 'jz-qa']) {
    no(checkBash('git status', role, ctx), `${role} bash`);
    no(checkWrite('src/a.ts', role, ctx), `${role} write`);
    no(checkWrite('.jz-state/notes/x.md', role, ctx), `${role} notas`);
    ok(checkRead('src', role, ctx), `${role} read`);
  }
});

test('escrituras: alcance del worktree y plano de control', () => {
  ok(checkWrite('src/nuevo/a.ts', 'jz-implementer', ctx), 'archivo nuevo');
  ok(checkWrite(`${wt}/docs/x.md`, 'jz-implementer', ctx), 'ruta absoluta');
  ok(checkWrite('.jz-state/notes/handoff.md', 'jz-implementer', ctx), 'notas de handoff');
  ok(checkWrite('docs/adr/0001.md', 'jz-architect', ctx), 'architect en docs');
  no(checkWrite('src/a.ts', 'jz-architect', ctx), 'architect fuera de docs');
  for (const p of ['../otro/x', '/root/.bashrc', '/etc/hosts', '.claude/settings.json', '.opencode/agents/x.md',
    '.opencode/plugins/x.js', '.jz/bin/jz-run', '.jz/policy/policy.mjs', '.git', '.git/hooks/pre-commit',
    '.jz-state/runs.jsonl', '.jz-state/writer.lock', 'AGENTS.md', 'CLAUDE.md', 'opencode.json', '.mcp.json',
    '.env', 'src/.env.local', 'src/fuera']) {
    no(checkWrite(p, 'jz-implementer', ctx), p);
  }
  ok(checkWrite('.env.example', 'jz-implementer', ctx), '.env.example');
});

test('lecturas: worktree y skills; no secretos ni rutas ajenas', () => {
  ok(checkRead('docs', 'jz-explorer', ctx), 'docs');
  ok(checkRead(undefined, 'jz-explorer', ctx), 'cwd por defecto');
  ok(checkRead(path.join(os.homedir(), '.claude/plugins/x/SKILL.md'), 'jz-explorer', ctx), 'skills');
  for (const p of ['/etc/passwd', '/root/.ssh/id_rsa', path.join(os.homedir(), '.claude/settings.json'),
    '/home/proyectos/otro', '.env', 'src/fuera', '/var/run/docker.sock']) {
    no(checkRead(p, 'jz-explorer', ctx), p);
  }
});

test('delegación: sólo el orquestador, sólo en jz-*, escritores en primer plano', () => {
  ok(checkDelegate('jz-implementer', 'jz-orchestrator'), 'orquestador → implementer');
  ok(checkDelegate('jz-explorer', 'jz-orchestrator', { background: true }), 'explorer en paralelo');
  for (const t of ['general-purpose', 'claude', 'jz-orchestrator', 'build', undefined]) {
    no(checkDelegate(t, 'jz-orchestrator'), `orquestador → ${t}`);
  }
  no(checkDelegate('jz-implementer', 'jz-orchestrator', { background: true }), 'escritor en segundo plano');
  for (const role of ['jz-explorer', 'jz-security', 'jz-qa', 'jz-implementer', 'jz-architect']) {
    no(checkDelegate('jz-implementer', role), `${role} → implementer`);
  }
});

test('escritor único: bloqueo exclusivo con recuperación de huérfanos', () => {
  const a = { engine: 'claude-code', pid: process.pid, session: 's1', agent: 'jz-implementer', call: 'c1' };
  ok(acquireWriter(wt, a), 'primer escritor');
  no(acquireWriter(wt, { ...a, engine: 'opencode', session: 's2', call: 'c2' }), 'segundo escritor');
  assert.equal(releaseWriter(wt, { session: 's2' }), false, 'otro titular no libera');
  assert.equal(releaseWriter(wt, { session: 's1', call: 'c1' }), true, 'titular libera');
  ok(acquireWriter(wt, { ...a, pid: 2 ** 22 + 7 }), 'titular con pid inexistente');
  ok(acquireWriter(wt, { ...a, call: 'c3' }), 'bloqueo huérfano recuperado');
  assert.equal(readLock(wt).call, 'c3');
});

test('tokenize conserva argumentos con comillas', () => {
  assert.deepEqual(tokenize(`git commit -m 'a "b"' -m "c 'd'"`), ['git', 'commit', '-m', 'a "b"', '-m', "c 'd'"]);
});
