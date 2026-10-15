import { isAbsolute, relative, sep } from 'node:path';
import { finding } from './findings.js';
import { isInside } from './paths.js';
import { cleanText, redactUrl, safeErrorCode } from './sanitize.js';

export const MAX_PROVENANCE_BYTES = 1024 * 1024;
export const LOCK_FIELDS = ['source', 'sourceType', 'sourceUrl', 'skillPath', 'skillFolderHash', 'installedAt', 'updatedAt'];
export const PLUGIN_FIELDS = ['scope', 'installPath', 'version', 'gitCommitSha', 'installedAt', 'lastUpdated'];

export async function loadProvenance(ctx, files) {
  const findings = [];
  const lockJson = await readJsonFile(ctx, files.skillLock, 'skill-lock', findings);
  const pluginsJson = await readJsonFile(ctx, files.installedPlugins, 'installed-plugins', findings);
  return {
    skillLock: lockJson === null ? null : parseSkillLock(lockJson, files.skillLock, findings),
    plugins: pluginsJson === null ? null : await parseInstalledPlugins(ctx, pluginsJson, files.installedPlugins, findings),
    findings,
  };
}

async function readJsonFile(ctx, path, subject, findings) {
  if (!path) return null;
  let result;
  try {
    result = await ctx.fs.readBounded(path, MAX_PROVENANCE_BYTES);
  } catch (error) {
    if (error.code !== 'ENOENT') findings.push(invalid(subject, path, `No se pudo leer (${safeErrorCode(error) ?? 'error'}).`));
    return null;
  }
  if (!result.ok) {
    findings.push(invalid(subject, path, result.reason === 'too-large' ? `Supera ${MAX_PROVENANCE_BYTES} bytes.` : 'No es un archivo regular.'));
    return null;
  }
  try {
    return JSON.parse(result.bytes.toString('utf8'));
  } catch {
    findings.push(invalid(subject, path, 'JSON inválido.'));
    return null;
  }
}

function invalid(subject, path, message) {
  return finding('PROVENANCE_INVALID', subject, [path], message);
}

function parseSkillLock(json, path, findings) {
  if (!isPlainObject(json) || !isPlainObject(json.skills)) {
    findings.push(invalid('skill-lock', path, 'Estructura inesperada: falta el objeto "skills".'));
    return null;
  }
  const map = new Map();
  for (const [name, value] of Object.entries(json.skills)) {
    if (isPlainObject(value)) map.set(name, pick(value, LOCK_FIELDS));
  }
  return map;
}

async function parseInstalledPlugins(ctx, json, path, findings) {
  if (!isPlainObject(json) || !isPlainObject(json.plugins)) {
    findings.push(invalid('installed-plugins', path, 'Estructura inesperada: falta el objeto "plugins".'));
    return null;
  }
  const map = new Map();
  for (const [id, value] of Object.entries(json.plugins)) {
    const entries = [];
    let problem = null;
    // Un valor que no es array, o un array vacío, no prueba ausencia: se representa como entrada no verificable.
    const raws = Array.isArray(value) && value.length > 0 ? value : [null];
    for (const raw of raws) {
      const entry = pick(isPlainObject(raw) ? raw : {}, PLUGIN_FIELDS);
      if (!isPlainObject(raw) || !entry.installPath) {
        problem ??= 'estructura inválida';
        entries.push({ ...entry, installRealPath: null, installUnverifiable: true });
        continue;
      }
      const { realPath, error } = await canonicalPath(ctx, entry.installPath);
      if (error) problem ??= `installPath no verificable (${safeErrorCode(error) ?? 'error'})`;
      entries.push({ ...entry, installRealPath: realPath, installUnverifiable: error !== null });
    }
    // installPath no se publica, y el identificador sólo si tiene forma válida: el registro es dato no confiable.
    if (problem) findings.push(invalid('installed-plugins', path, `Entrada de ${PLUGIN_ID.test(id) ? id : 'un plugin con identificador no válido'}: ${problem}.`));
    map.set(id, entries);
  }
  return map;
}

const PLUGIN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}@[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// Errores que prueban que la ruta no resuelve; cualquier otro impide verificarla.
const UNRESOLVED_CODES = new Set(['ENOENT', 'ENOTDIR', 'ELOOP']);

// realpath es metadata: resuelve componentes sin abrir el destino.
async function canonicalPath(ctx, path) {
  if (!path || !isAbsolute(path)) return { realPath: null, error: null };
  try {
    return { realPath: await ctx.fs.realpath(path), error: null };
  } catch (error) {
    return { realPath: null, error: UNRESOLVED_CODES.has(error.code) ? null : error };
  }
}

function pick(source, fields) {
  const out = {};
  for (const field of fields) {
    const value = Object.hasOwn(source, field) ? source[field] : undefined;
    out[field] = typeof value === 'string' ? cleanText(field === 'sourceUrl' ? redactUrl(value) : value) : null;
  }
  return out;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function lockEntryFor(manifest, agentsRoot, skillLock) {
  if (!skillLock || !agentsRoot || !isInside(manifest.realPath, agentsRoot)) return null;
  const [name] = relative(agentsRoot, manifest.realPath).split(sep);
  const entry = skillLock.get(name);
  return entry ? { kind: 'skill-lock', ...entry } : null;
}

export function pluginRecord(plugin, plugins) {
  if (!plugin) return null;
  const id = `${plugin.name}@${plugin.marketplace}`;
  const entries = plugins ? plugins.get(id) ?? [] : null;
  const match = entries?.find((entry) => entry.installRealPath !== null && entry.installRealPath === plugin.versionDir);
  return {
    id,
    marketplace: plugin.marketplace,
    name: plugin.name,
    cacheVersion: plugin.cacheVersion,
    installed: entries === null ? 'unknown' : match ? 'yes' : entries.some((entry) => entry.installUnverifiable) ? 'unknown' : 'no',
    enabled: 'unknown',
    loaded: 'unverified',
    registry: match ? { version: match.version, gitCommitSha: match.gitCommitSha, installedAt: match.installedAt, lastUpdated: match.lastUpdated } : null,
  };
}
