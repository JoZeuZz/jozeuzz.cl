import { check } from './findings.js';

const OUTSIDE = Object.freeze({ inside: 'no', root: null, branch: null, head: null, detached: 'unknown', workingTree: null });

export function parseGitVersion(output) {
  return /git version (\d+\.\d+\.\d+)/.exec(output)?.[1] ?? null;
}

export async function inspectRepo(runGit, repoRoot) {
  if (!repoRoot) {
    return { repo: { ...OUTSIDE }, checks: [check('repo.outside', 'El directorio actual no está dentro de un repositorio Git.')], partial: false };
  }
  const checks = [];
  // El working tree no se inspecciona en M0: git status ejecuta filtros clean (spec §10.1).
  const repo = { inside: 'yes', root: repoRoot, branch: null, head: null, detached: 'unknown', workingTree: 'not-inspected' };
  const head = await runGit(['rev-parse', '--verify', 'HEAD'], repoRoot);
  const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  if (head.ok && branch.ok) {
    repo.head = head.stdout.trim();
    const name = branch.stdout.trim();
    repo.detached = name === 'HEAD' ? 'yes' : 'no';
    repo.branch = name === 'HEAD' ? null : name;
    if (repo.detached === 'yes') checks.push(check('repo.detached', 'HEAD separado: no hay rama activa.'));
    return { repo, checks, partial: false };
  }
  const broken = [head, branch].find((result) => !result.ok && result.reason !== 'failed');
  if (broken) {
    checks.push(check('repo.git-failed', `git rev-parse no terminó (${broken.reason}).`));
    return { repo, checks, partial: true };
  }
  checks.push(check('repo.head-unavailable', 'HEAD no resoluble (repositorio sin commits o de otro propietario).'));
  return { repo, checks, partial: false };
}
