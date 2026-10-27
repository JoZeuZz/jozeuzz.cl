#!/usr/bin/env node
// jz-git — GitOps acotado para el supervisor jz-autonomy.
//
// Sólo dos operaciones: commit de un manifiesto de rutas en la rama declarada y push normal (sin force) de
// una rama autorizada, con verificación del SHA remoto. Lo ejecuta el supervisor confiable desde su copia
// instalada (fuera de cualquier worktree), nunca un worker: la política jz-* no lo admite en ningún rol.
// El push exige una autorización administrativa explícita en ~/.config/jz-ai/gitops.json.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXIT = { ok: 0, failed: 1, usage: 2, unauthorized: 77 };
const BRANCH = /^(feat|fix|chore|docs|work|integ)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const PROTECTED = new Set(['main', 'master', 'production']);
const CONTROL = new Set(['.git', '.claude', '.opencode', '.jz', '.jz-state', 'AGENTS.md', 'CLAUDE.md', 'opencode.json',
  'opencode.jsonc', '.mcp.json']);
const MAX_SCAN = 200;

// SEC-8: nunca se repiten credenciales incrustadas en URLs.
export const scrub = (text) => String(text).replace(/\/\/[^/@\s]+@/g, '//[REDACTED]@');

class GitOpsError extends Error {
  constructor(message, code = EXIT.failed) {
    super(scrub(message));
    this.code = code;
  }
}

export function validBranch(branch) {
  return typeof branch === 'string' && BRANCH.test(branch) && !PROTECTED.has(branch) && !branch.includes('..')
    && !branch.endsWith('/') && !branch.endsWith('.lock') && !branch.includes('//');
}

export function validPath(p) {
  if (typeof p !== 'string' || !p || p.includes('\0') || isAbsolute(p) || p.startsWith('\\')) return false;
  return p.split(/[\\/]/).every((part) => part && part !== '.' && part !== '..' && !CONTROL.has(part)
    && !/^\.env(\..+)?$/.test(part) && !/\.(pem|key|p12|pfx)$/i.test(part) && !/^id_(rsa|ed25519|ecdsa|dsa)/.test(part));
}

// Coincidencia de ramas: '*' abarca cualquier sufijo sin '..'.
export function branchAllowed(branch, patterns) {
  return Array.isArray(patterns) && patterns.some((pattern) => {
    if (typeof pattern !== 'string') return false;
    const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return re.test(branch);
  });
}

function cleanEnv(source = process.env) {
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0' };
  for (const name of ['HOME', 'XDG_CONFIG_HOME']) if (source[name]) env[name] = source[name];
  return env;
}

function makeGit(repo, env) {
  return (args, input) => {
    const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', repo, ...args],
      { env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return { rc: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
}

function must(result, what) {
  if (result.rc !== 0) throw new GitOpsError(`${what}: ${result.stderr.trim().split('\n').at(-1) ?? ''}`);
  return result.stdout;
}

function openRepo(repo, branch, env) {
  if (typeof repo !== 'string' || !isAbsolute(repo)) throw new GitOpsError('--repo debe ser absoluta', EXIT.usage);
  if (!validBranch(branch)) throw new GitOpsError(`rama no permitida: ${branch}`, EXIT.unauthorized);
  const real = realpathSync(repo);
  const git = makeGit(real, env);
  const top = must(git(['rev-parse', '--show-toplevel']), 'rev-parse').trim();
  if (realpathSync(top) !== real) throw new GitOpsError('--repo no es la raíz del worktree', EXIT.usage);
  return { real, git };
}

function findOp(git, op) {
  const log = must(git(['log', `-${MAX_SCAN}`, '--format=%H%x00%(trailers:key=Jz-Op,valueonly,separator=%x01)%x02']), 'log');
  for (const entry of log.split('\x02')) {
    const [sha, trailers = ''] = entry.trim().split('\0');
    if (sha && trailers.split('\x01').map((s) => s.trim()).includes(op)) return sha;
  }
  return null;
}

const inManifest = (file, paths) => paths.some((p) => file === p || file.startsWith(`${p}/`));

export function commit({ repo, branch, message, paths, op }, env = cleanEnv()) {
  if (typeof message !== 'string' || !message.trim() || message.includes('\0')) throw new GitOpsError('mensaje vacío', EXIT.usage);
  if (!Array.isArray(paths) || paths.length === 0) throw new GitOpsError('sin --path', EXIT.usage);
  for (const p of paths) if (!validPath(p)) throw new GitOpsError(`ruta no permitida: ${p}`, EXIT.unauthorized);
  if (op !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(op)) throw new GitOpsError('--op inválido', EXIT.usage);
  const { git, real } = openRepo(repo, branch, env);
  const current = must(git(['branch', '--show-current']), 'branch').trim();
  if (current !== branch) throw new GitOpsError(`rama actual ${current || '(detached)'} distinta de ${branch}`, EXIT.unauthorized);
  if (op) {
    const prior = findOp(git, op);
    if (prior) return { ok: true, op: 'commit', head: prior, reused: true, evidence: `Jz-Op ${op} ya confirmado` };
  }
  const staged = must(git(['diff', '--cached', '--name-only', '-z']), 'diff --cached').split('\0').filter(Boolean);
  const foreign = staged.filter((f) => !inManifest(f, paths));
  if (foreign.length) throw new GitOpsError(`índice con rutas fuera del manifiesto: ${foreign.join(', ')}`, EXIT.unauthorized);
  // Rutas del manifiesto que existen o están versionadas (borradas): git add falla con una ruta inexistente.
  const present = paths.filter((p) => existsSync(join(real, p))
    || must(git(['ls-files', '-z', '--', `:(literal)${p}`]), 'ls-files').length > 0);
  if (present.length) must(git(['add', '-A', '--', ...present.map((p) => `:(literal)${p}`)]), 'add');
  // SEC-3: el manifiesto puede ser un directorio; cada entrada añadida se valida entera, y no se confirman
  // enlaces simbólicos (120000) ni gitlinks (160000).
  const raw = must(git(['diff', '--cached', '--raw', '--no-renames', '-z']), 'diff --cached').split('\0');
  const pending = [];
  const refused = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const meta = raw[i].split(' ');
    const file = raw[i + 1];
    if (!file) continue;
    pending.push(file);
    if (!validPath(file) || ['120000', '160000'].includes(meta[1])) refused.push(file);
  }
  if (refused.length) {
    git(['reset', '-q', '--', ...present.map((p) => `:(literal)${p}`)]);
    throw new GitOpsError(`rutas protegidas, enlaces o gitlinks en el manifiesto: ${refused.join(', ')}`, EXIT.unauthorized);
  }
  if (pending.length === 0) throw new GitOpsError('nada que confirmar en el manifiesto');
  const body = op ? `${message.trimEnd()}\n\nJz-Op: ${op}\n` : `${message.trimEnd()}\n`;
  must(git(['commit', '--no-verify', '--no-gpg-sign', '-q', '-F', '-'], body), 'commit');
  const head = must(git(['rev-parse', 'HEAD']), 'rev-parse').trim();
  return { ok: true, op: 'commit', head, files: pending, evidence: `commit ${head.slice(0, 12)} en ${branch}` };
}

export function policyPath(env = process.env) {
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config');
  return join(base, 'jz-ai', 'gitops.json');
}

export function loadPolicy(file) {
  let info;
  try { info = lstatSync(file); } catch { throw new GitOpsError(`push sin autorizar: falta ${file}`, EXIT.unauthorized); }
  if (!info.isFile() || info.isSymbolicLink()) throw new GitOpsError('política GitOps inválida', EXIT.unauthorized);
  let policy;
  try { policy = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new GitOpsError('política GitOps ilegible', EXIT.unauthorized); }
  if (policy?.schema !== 'jz-gitops-policy-v1' || typeof policy.push?.remotes !== 'object' || !Array.isArray(policy.push?.branches)) {
    throw new GitOpsError('política GitOps inválida', EXIT.unauthorized);
  }
  return policy;
}

export function push({ repo, branch, remote = 'origin', policyFile }, env = cleanEnv()) {
  if (!/^[A-Za-z0-9._-]+$/.test(remote)) throw new GitOpsError('remoto inválido', EXIT.usage);
  const policy = loadPolicy(policyFile ?? policyPath(env));
  const { git } = openRepo(repo, branch, env);
  const url = must(git(['remote', 'get-url', remote]), 'remote').trim();
  if (policy.push.remotes[remote] !== url) throw new GitOpsError(`remoto ${remote} no autorizado (${url})`, EXIT.unauthorized);
  // SEC-4: la URL efectiva de push (pushurl, pushInsteadOf) debe ser la autorizada, y mirror fuerza el push.
  const pushUrls = must(git(['remote', 'get-url', '--push', '--all', remote]), 'remote').trim().split('\n');
  if (pushUrls.length !== 1 || pushUrls[0] !== url) throw new GitOpsError(`URL de push no autorizada para ${remote}`, EXIT.unauthorized);
  if (git(['config', '--get', `remote.${remote}.mirror`]).stdout.trim()) throw new GitOpsError(`remoto ${remote} mirror no autorizado`, EXIT.unauthorized);
  if (!branchAllowed(branch, policy.push.branches)) throw new GitOpsError(`push no autorizado para ${branch}`, EXIT.unauthorized);
  const local = must(git(['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]), 'rev-parse').trim();
  const remoteSha = () => must(git(['ls-remote', remote, `refs/heads/${branch}`]), 'ls-remote').split(/\s/)[0] || null;
  if (remoteSha() === local) return { ok: true, op: 'push', head: local, remoteSha: local, reused: true, evidence: 'remoto ya en el SHA local' };
  // Sin '+' ni --force: git rechaza todo lo que no sea fast-forward.
  must(git(['push', '--porcelain', '--no-verify', remote, `refs/heads/${branch}:refs/heads/${branch}`]), 'push');
  const after = remoteSha();
  if (after !== local) throw new GitOpsError(`verificación remota fallida: ${after} != ${local}`);
  return { ok: true, op: 'push', head: local, remoteSha: after, evidence: `${remote}/${branch} = ${local.slice(0, 12)}` };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { paths: [] };
  const names = { '--repo': 'repo', '--branch': 'branch', '--message': 'message', '--op': 'op', '--remote': 'remote', '--policy': 'policyFile' };
  for (let i = 0; i < rest.length; i += 2) {
    const [key, value] = [rest[i], rest[i + 1]];
    if (value === undefined) throw new GitOpsError(`falta valor para ${key}`, EXIT.usage);
    if (key === '--path') opts.paths.push(value);
    else if (names[key] && opts[names[key]] === undefined) opts[names[key]] = value;
    else throw new GitOpsError(`opción no admitida: ${key}`, EXIT.usage);
  }
  return { command, opts };
}

export function main(argv, out = process.stdout) {
  try {
    const { command, opts } = parseArgs(argv);
    let result;
    if (command === 'commit') result = commit(opts);
    else if (command === 'push') {
      if (opts.paths.length || opts.message || opts.op) throw new GitOpsError('push no admite --path, --message ni --op', EXIT.usage);
      result = push(opts);
    } else throw new GitOpsError('uso: jz-git commit|push --repo <abs> --branch <rama> ...', EXIT.usage);
    out.write(`${JSON.stringify(result)}\n`);
    return EXIT.ok;
  } catch (error) {
    const code = error instanceof GitOpsError ? error.code : EXIT.failed;
    out.write(`${JSON.stringify({ ok: false, error: error.message, code })}\n`);
    return code;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
