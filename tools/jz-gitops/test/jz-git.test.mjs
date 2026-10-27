import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EXIT, branchAllowed, commit, main, push, validBranch, validPath } from '../jz-git.mjs';

const env = {
  PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'jz', GIT_AUTHOR_EMAIL: 'jz@example.invalid', GIT_COMMITTER_NAME: 'jz', GIT_COMMITTER_EMAIL: 'jz@example.invalid'
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

function fixture(branch = 'chore/demo') {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'jz-git-')));
  const remote = join(base, 'remote.git');
  const repo = join(base, 'repo');
  git(base, 'init', '-q', '--bare', remote);
  git(base, 'init', '-q', '-b', branch, repo);
  writeFileSync(join(repo, 'README.md'), 'hola\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', remote);
  const policyFile = join(base, 'gitops.json');
  writeFileSync(policyFile, JSON.stringify({ schema: 'jz-gitops-policy-v1', push: { remotes: { origin: remote }, branches: ['chore/*'] } }));
  return { base, remote, repo, policyFile };
}

const run = (argv) => {
  let text = '';
  const rc = main(argv, { write: (s) => { text += s; } });
  return { rc, out: JSON.parse(text) };
};

test('branch and path rules reject protected, control-plane and secret targets', () => {
  for (const b of ['main', 'master', 'production', 'release/x', 'feat/', 'feat/a..b', 'feat/x.lock', 'feat//x']) assert.equal(validBranch(b), false, b);
  for (const b of ['feat/x', 'chore/jz-agents', 'integ/mvp-1', 'docs/a/b']) assert.equal(validBranch(b), true, b);
  for (const p of ['', '/etc/passwd', '../x', 'a/../b', '.git/config', '.jz/bin/jz-run', 'AGENTS.md', 'x/.env', '.env.local', 'k.pem', 'id_rsa', 'a\0b']) {
    assert.equal(validPath(p), false, JSON.stringify(p));
  }
  for (const p of ['src/a.js', 'tools/jz-autonomy', 'docs/x.md']) assert.equal(validPath(p), true, p);
  assert.equal(branchAllowed('chore/jz-agents', ['chore/jz-*']), true);
  assert.equal(branchAllowed('chore/other', ['chore/jz-*']), false);
});

test('commit stages only the manifest, skips hooks and records an idempotency trailer', () => {
  const { repo } = fixture();
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src/a.js'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'other.txt'), 'fuera\n');
  writeFileSync(join(repo, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const result = commit({ repo, branch: 'chore/demo', message: 'feat: add a', paths: ['src'], op: 'unit-1:commit' }, env);
  assert.equal(result.ok, true);
  assert.deepEqual(result.files, ['src/a.js']);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), result.head);
  assert.match(git(repo, 'log', '-1', '--format=%B'), /Jz-Op: unit-1:commit/);
  assert.match(git(repo, 'status', '--porcelain'), /\?\? other\.txt/);
  const again = commit({ repo, branch: 'chore/demo', message: 'feat: add a', paths: ['src'], op: 'unit-1:commit' }, env);
  assert.equal(again.reused, true);
  assert.equal(again.head, result.head);
});

test('commit refuses a different branch, foreign staged files and an empty manifest', () => {
  const { repo } = fixture();
  assert.throws(() => commit({ repo, branch: 'chore/other', message: 'm', paths: ['src'] }, env), (e) => e.code === EXIT.unauthorized);
  writeFileSync(join(repo, 'x.txt'), 'x\n');
  git(repo, 'add', 'x.txt');
  assert.throws(() => commit({ repo, branch: 'chore/demo', message: 'm', paths: ['src'] }, env), /fuera del manifiesto/);
  git(repo, 'reset', '-q');
  assert.throws(() => commit({ repo, branch: 'chore/demo', message: 'm', paths: ['src'] }, env), /nada que confirmar/);
  assert.throws(() => commit({ repo, branch: 'chore/demo', message: 'm', paths: ['.jz/bin'] }, env), (e) => e.code === EXIT.unauthorized);
});

test('push requires the administrative policy and verifies the remote SHA', () => {
  const { repo, remote, policyFile, base } = fixture();
  assert.throws(() => push({ repo, branch: 'chore/demo', policyFile: join(base, 'missing.json') }, env), (e) => e.code === EXIT.unauthorized);
  const link = join(base, 'link.json');
  symlinkSync(policyFile, link);
  assert.throws(() => push({ repo, branch: 'chore/demo', policyFile: link }, env), (e) => e.code === EXIT.unauthorized);
  const first = push({ repo, branch: 'chore/demo', policyFile }, env);
  assert.equal(first.remoteSha, git(repo, 'rev-parse', 'HEAD'));
  assert.equal(git(base, '--git-dir', remote, 'rev-parse', 'refs/heads/chore/demo'), first.head);
  assert.equal(push({ repo, branch: 'chore/demo', policyFile }, env).reused, true);
});

test('push refuses unlisted branches, foreign remotes and non fast-forward updates', () => {
  const { repo, remote, policyFile, base } = fixture();
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  assert.throws(() => push({ repo, branch: 'feat/x', policyFile }, env), /no autorizado/);
  git(repo, 'checkout', '-q', 'chore/demo');
  push({ repo, branch: 'chore/demo', policyFile }, env);
  git(repo, 'commit', '-q', '--amend', '-m', 'rewritten');
  assert.throws(() => push({ repo, branch: 'chore/demo', policyFile }, env), /push/);
  const other = join(base, 'other.json');
  writeFileSync(other, JSON.stringify({ schema: 'jz-gitops-policy-v1', push: { remotes: { origin: `${remote}x` }, branches: ['chore/*'] } }));
  assert.throws(() => push({ repo, branch: 'chore/demo', policyFile: other }, env), /remoto origin no autorizado/);
});

test('CLI returns JSON and exit codes without throwing', () => {
  assert.equal(run(['bogus']).rc, EXIT.usage);
  assert.equal(run(['push', '--repo', '/tmp', '--branch', 'main']).rc, EXIT.unauthorized);
  assert.equal(run(['commit', '--repo', 'relative', '--branch', 'chore/x', '--message', 'm', '--path', 'a']).rc, EXIT.usage);
  assert.equal(run(['push', '--repo', '/tmp', '--branch', 'chore/x', '--path', 'a']).out.ok, false);
});
