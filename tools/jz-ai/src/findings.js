import { compareText } from './order.js';
import { cleanText } from './sanitize.js';

// Réplica de las tablas 6.8 y 10.2 de la spec; catalog.test.js las compara.
export const FINDING_SEVERITY = Object.freeze({
  HOME_UNSET: 'error',
  LIMIT_REACHED: 'error',
  UNREADABLE: 'warn',
  ROOT_MISSING: 'info',
  ROOT_NOT_DIRECTORY: 'warn',
  BROKEN_LINK: 'warn',
  LINK_CYCLE: 'warn',
  LINK_OUTSIDE_ROOTS: 'warn',
  ENTRY_NOT_DIRECTORY: 'warn',
  ENTRY_NOT_FILE: 'warn',
  SENSITIVE_PATH_SKIPPED: 'warn',
  SYMLINK_NOT_FOLLOWED: 'info',
  SIBLINGS_TRUNCATED: 'info',
  TOO_LARGE: 'warn',
  MANIFEST_INVALID: 'warn',
  MANIFEST_NAME_MISMATCH: 'info',
  NAME_COLLISION_DIVERGENT: 'warn',
  NAME_COLLISION_IDENTICAL: 'info',
  SAME_REALPATH: 'info',
  PLUGIN_CACHE_NOT_INSTALLED: 'info',
  PROVENANCE_INVALID: 'warn',
});

export const CHECK_SEVERITY = Object.freeze({
  'runtime.node': 'error',
  'runtime.root': 'warn',
  'env.home-unset': 'error',
  'env.provider-keys': 'info',
  'tool.git.missing': 'error',
  'tool.git.untrusted': 'error',
  'tool.git.version-unknown': 'warn',
  'tool.claude.missing': 'info',
  'tool.claude.version-unknown': 'info',
  'tool.opencode.missing': 'info',
  'tool.opencode.version-unknown': 'info',
  'repo.outside': 'info',
  'repo.detached': 'warn',
  'repo.head-unavailable': 'warn',
  'repo.git-failed': 'error',
  'repo.git-unavailable': 'warn',
  'paths.*.permissive': 'warn',
  'paths.*.unexpected-type': 'warn',
});

const SEVERITY_RANK = { error: 0, warn: 1, info: 2 };

export function finding(code, subject, paths, message) {
  if (!Object.hasOwn(FINDING_SEVERITY, code)) throw new Error('código de hallazgo desconocido');
  return {
    severity: FINDING_SEVERITY[code],
    code,
    subject: cleanText(subject),
    paths: paths.map(cleanText).sort(compareText),
    message: cleanText(message),
  };
}

export function checkSeverity(id) {
  // Los ids de rutas pueden contener puntos (repo-env:.env.local); el sufijo es el último segmento.
  const key = id.startsWith('paths.') ? `paths.*.${id.slice(id.lastIndexOf('.') + 1)}` : id;
  return Object.hasOwn(CHECK_SEVERITY, key) ? CHECK_SEVERITY[key] : null;
}

export function check(id, message) {
  const severity = checkSeverity(id);
  if (!severity) throw new Error('check desconocido');
  return { id: cleanText(id), severity, message: cleanText(message) };
}

export function sortFindings(list) {
  return [...list].sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    compareText(a.code, b.code) ||
    compareText(a.subject, b.subject) ||
    compareText(a.paths[0] ?? null, b.paths[0] ?? null));
}

export function sortChecks(list) {
  return [...list].sort((a, b) => compareText(a.id, b.id) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function countBySeverity(list) {
  const counts = { info: 0, warn: 0, error: 0 };
  for (const item of list) counts[item.severity] += 1;
  return counts;
}
