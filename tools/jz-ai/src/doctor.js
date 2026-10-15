import { join } from 'node:path';
import { check, sortChecks } from './findings.js';
import { inspectRepo, parseGitVersion } from './git.js';
import { compareBy } from './order.js';
import { envValue } from './context.js';
import { ENV_PRESENCE, PROVIDER_KEY_VARS, REPO_ENV_PATTERN, findRepoRoot, knownConfigPaths } from './paths.js';
import { safeErrorCode } from './sanitize.js';
import { TOOL } from './tool.js';

const MIN_NODE = [20, 19, 0];
// Tope de la enumeración de la raíz del repositorio (CP1-G, spec §8).
export const REPO_ROOT_ENTRIES = 1000;
const UNKNOWN_VERSION = Object.freeze({ value: null, confidence: 'unknown', source: null });

export async function runDoctor(ctx) {
  const checks = [];
  let partial = false;

  const nodeVersion = ctx.runtime.node.replace(/^v/, '');
  if (!atLeast(nodeVersion, MIN_NODE)) checks.push(check('runtime.node', `Node ${nodeVersion} es menor que 20.19.0.`));
  const isRoot = ctx.uid === 0;
  if (isRoot) checks.push(check('runtime.root', 'Proceso como root: los controles de jz-ai son de código, no un sandbox.'));
  if (!ctx.home) {
    partial = true;
    checks.push(check('env.home-unset', `HOME ${ctx.homeProblem}.`));
  }

  const tools = [];
  let runGit = null;
  // git nunca se busca en PATH: ruta fija validada (spec §10.1).
  const git = await inspectGit(ctx.fs, ctx.gitPath);
  if (git.status === 'missing') {
    tools.push(toolEntry('git', 'no', null, UNKNOWN_VERSION));
    checks.push(check('tool.git.missing', 'No existe git en la ruta fija admitida.'));
  } else if (git.status === 'untrusted') {
    tools.push(toolEntry('git', 'yes', git.path, UNKNOWN_VERSION));
    checks.push(check('tool.git.untrusted', 'git no es un archivo regular de root, ejecutable y sin escritura para grupo u otros; no se ejecuta.'));
  } else {
    runGit = ctx.createGitRunner(git.path);
    const result = await runGit(['--version'], '/');
    const value = result.ok ? parseGitVersion(result.stdout) : null;
    tools.push(toolEntry('git', 'yes', git.path, value ? { value, confidence: 'verified', source: 'git --version' } : UNKNOWN_VERSION));
    if (!value) checks.push(check('tool.git.version-unknown', 'No se pudo determinar la versión de git.'));
  }

  const pathDirs = (envValue(ctx.env, 'PATH') ?? '').split(':').filter((dir) => dir.startsWith('/'));
  tools.push(toolEntry('node', 'yes', null, { value: nodeVersion, confidence: 'verified', source: 'process.version' }));
  for (const name of ['claude', 'opencode']) {
    const found = await findExecutable(ctx.fs, name, pathDirs);
    if (!found) {
      tools.push(toolEntry(name, 'no', null, UNKNOWN_VERSION));
      checks.push(check(`tool.${name}.missing`, `${name} no está en PATH.`));
      continue;
    }
    const inferred = name === 'claude' ? inferClaudeVersion(found.realPath) : null;
    tools.push(toolEntry(name, 'yes', found.path, inferred ? { value: inferred, confidence: 'inferred', source: 'realpath' } : UNKNOWN_VERSION));
    if (!inferred) checks.push(check(`tool.${name}.version-unknown`, `Versión de ${name} no determinable sin ejecutarlo.`));
  }

  const repoRoot = await findRepoRoot(ctx.fs, ctx.cwd);
  let repo;
  if (runGit) {
    const inspected = await inspectRepo(runGit, repoRoot);
    repo = inspected.repo;
    checks.push(...inspected.checks);
    partial ||= inspected.partial;
  } else {
    repo = { inside: repoRoot ? 'yes' : 'no', root: repoRoot, branch: null, head: null, detached: 'unknown', workingTree: repoRoot ? 'not-inspected' : null };
    if (repoRoot) {
      partial = true;
      checks.push(check('repo.git-unavailable', 'No se inspeccionó el repositorio: no hay un git utilizable.'));
    } else {
      checks.push(check('repo.outside', 'El directorio actual no está dentro de un repositorio Git.'));
    }
  }

  const { paths, repoEnvUnverified } = await inspectPaths(ctx, repoRoot, checks);
  if (repoEnvUnverified) partial = true;
  // Definida = propiedad propia con valor cadena, aunque esté vacía (spec §8).
  const env = ENV_PRESENCE.map((name) => ({ name, set: envValue(ctx.env, name) !== null ? 'yes' : 'no' }));
  if (PROVIDER_KEY_VARS.some((name) => envValue(ctx.env, name))) {
    checks.push(check('env.provider-keys', 'Hay claves de API definidas: llm-council elige proveedor según el entorno.'));
  }

  return {
    schemaVersion: 1,
    command: 'doctor',
    tool: { ...TOOL },
    completeness: partial ? 'partial' : 'complete',
    runtime: { node: ctx.runtime.node, platform: ctx.runtime.platform, arch: ctx.runtime.arch, uid: ctx.uid, isRoot },
    tools,
    repo,
    paths,
    env,
    checks: sortChecks(checks),
  };
}

function toolEntry(name, found, path, version) {
  return { name, found, path, version };
}

function atLeast(version, minimum) {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < minimum.length; index += 1) {
    const value = parts[index] ?? 0;
    if (value !== minimum[index]) return value > minimum[index];
  }
  return true;
}

export async function inspectGit(fs, gitPath) {
  let info;
  try {
    info = await fs.lstat(await fs.realpath(gitPath));
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { status: 'missing', path: null };
    return { status: 'untrusted', path: gitPath };
  }
  const trusted = info.isFile() && (info.mode & 0o111) !== 0 && info.uid === 0 && (info.mode & 0o022) === 0;
  return { status: trusted ? 'ok' : 'untrusted', path: gitPath };
}

export async function findExecutable(fs, name, dirs) {
  for (const dir of dirs) {
    const path = join(dir, name);
    let realPath;
    try {
      realPath = await fs.realpath(path);
      const info = await fs.lstat(realPath);
      if (info.isFile() && (info.mode & 0o111) !== 0) return { path, realPath };
    } catch {
      continue;
    }
  }
  return null;
}

export function inferClaudeVersion(realPath) {
  return /\/versions\/(\d+\.\d+\.\d+)$/.exec(realPath)?.[1] ?? null;
}

async function inspectPaths(ctx, repoRoot, checks) {
  const entries = knownConfigPaths(ctx.home, repoRoot);
  let repoEnvUnverified = false;
  if (repoRoot) {
    let listing = null;
    try {
      // Lectura acotada (spec §8, CP1-G): la raíz del repositorio nunca se enumera completa.
      listing = await ctx.fs.readdirBounded(repoRoot, REPO_ROOT_ENTRIES);
    } catch (error) {
      checks.push(check('repo.env-scan-failed', `No se pudo enumerar la raíz del repositorio (${safeErrorCode(error) ?? 'error'}); no se afirma la ausencia de .env*.`));
    }
    if (listing?.truncated) {
      checks.push(check('repo.env-scan-truncated', `La raíz del repositorio supera ${REPO_ROOT_ENTRIES} entradas; no se afirma la ausencia de .env*.`));
    }
    // Truncada o ilegible: ningún repo-env:* se informa como subconjunto.
    repoEnvUnverified = listing === null || listing.truncated;
    for (const name of listing?.names ?? []) {
      if (REPO_ENV_PATTERN.test(name)) entries.push({ id: `repo-env:${name}`, path: join(repoRoot, name), category: 'secrets', sensitive: 'yes' });
    }
  }
  const results = [];
  for (const entry of entries) {
    const meta = await pathMetadata(ctx.fs, entry.path);
    results.push({
      id: entry.id, path: entry.path, category: entry.category, sensitive: entry.sensitive,
      exists: meta.exists, type: meta.type, mode: meta.mode, ownerUid: meta.ownerUid, contentRead: 'no',
    });
    if (meta.exists !== 'yes') continue;
    if (meta.type !== 'file') {
      checks.push(check(`paths.${entry.id}.unexpected-type`, `La ruta es de tipo ${meta.type}; se informa sin seguirla.`));
    } else if (entry.sensitive === 'yes' && (meta.modeBits & 0o077) !== 0) {
      checks.push(check(`paths.${entry.id}.permissive`, `Archivo sensible accesible por grupo u otros (modo ${meta.mode}).`));
    }
  }
  return { paths: results.sort(compareBy((item) => item.id)), repoEnvUnverified };
}

async function pathMetadata(fs, path) {
  let info;
  try {
    info = await fs.lstat(path);
  } catch (error) {
    const exists = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'no' : 'unknown';
    return { exists, type: null, mode: null, ownerUid: null, modeBits: 0 };
  }
  const type = info.isFile() ? 'file' : info.isDirectory() ? 'directory' : info.isSymbolicLink() ? 'symlink' : 'other';
  const modeBits = info.mode & 0o7777;
  return { exists: 'yes', type, mode: modeBits.toString(8).padStart(4, '0'), ownerUid: info.uid, modeBits };
}
