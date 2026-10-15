import { cell, cleanDeep, tildify } from './sanitize.js';

export const NOTE = 'Nota: la presencia de un manifiesto no implica que el host cargue la skill.';
const COMPLETENESS = { complete: 'completo', partial: 'parcial', failed: 'fallido' };

// Único punto de saneamiento del JSON: el escapado de JSON.stringify no elimina controles.
export function renderJson(doc) {
  return `${JSON.stringify(cleanDeep(doc), null, 2)}\n`;
}

function row(values) {
  return values.map(cell).join('\t');
}

function pathFormatter(home) {
  return (path) => (path ? tildify(path, home) : null);
}

export function renderSkillsText(doc, home) {
  const p = pathFormatter(home);
  const s = doc.summary;
  const lines = [
    `jz-ai skills: ${s.roots} raíces (${s.rootsPresent} presentes), ${s.manifests} manifiestos, ${s.names} nombres, estado ${COMPLETENESS[doc.completeness]}`,
    NOTE,
    '',
    row(['NAME', 'HOST', 'ROOT', 'SHA256', 'LINK', 'PLUGIN', 'PATH']),
  ];
  for (const k of doc.skills) {
    lines.push(row([k.name, k.host, k.rootId, k.sha256 ? k.sha256.slice(0, 8) : null, p(k.linkTarget), pluginLabel(k.plugin), p(k.entryPath)]));
  }
  lines.push('', row(['SEVERITY', 'CODE', 'SUBJECT', 'MESSAGE', 'PATHS']));
  for (const f of doc.findings) lines.push(row([f.severity, f.code, f.subject, f.message, f.paths.map(p).join(' ')]));
  lines.push('', `resumen: info=${s.info} warn=${s.warn} error=${s.error}`);
  return `${lines.join('\n')}\n`;
}

function pluginLabel(plugin) {
  if (!plugin) return null;
  return `${plugin.id} ${plugin.cacheVersion} installed=${plugin.installed} enabled=${plugin.enabled} loaded=${plugin.loaded}`;
}

export function renderDoctorText(doc, home) {
  const p = pathFormatter(home);
  const r = doc.runtime;
  const lines = [
    `jz-ai doctor: estado ${COMPLETENESS[doc.completeness]}`,
    '',
    '[runtime]',
    row(['NODE', 'PLATFORM', 'ARCH', 'UID', 'ROOT']),
    row([r.node, r.platform, r.arch, r.uid, r.isRoot ? 'yes' : 'no']),
    '',
    '[tools]',
    row(['NAME', 'FOUND', 'VERSION', 'CONFIDENCE', 'SOURCE', 'PATH']),
  ];
  for (const t of doc.tools) lines.push(row([t.name, t.found, t.version.value ?? 'unknown', t.version.confidence, t.version.source, p(t.path)]));
  lines.push('', '[repo]');
  if (doc.repo.inside === 'yes') {
    lines.push(
      row(['ROOT', 'BRANCH', 'HEAD', 'DETACHED', 'WORKING_TREE']),
      row([p(doc.repo.root), doc.repo.branch, doc.repo.head, doc.repo.detached, doc.repo.workingTree]),
    );
  } else {
    lines.push('fuera de un repositorio Git');
  }
  lines.push('', '[paths]', row(['ID', 'CATEGORY', 'SENSITIVE', 'EXISTS', 'TYPE', 'MODE', 'CONTENT_READ', 'PATH']));
  for (const x of doc.paths) lines.push(row([x.id, x.category, x.sensitive, x.exists, x.type, x.mode, x.contentRead, p(x.path)]));
  lines.push('', '[env]', row(['NAME', 'SET']));
  for (const e of doc.env) lines.push(row([e.name, e.set]));
  lines.push('', '[checks]', row(['SEVERITY', 'ID', 'MESSAGE']));
  for (const c of doc.checks) lines.push(row([c.severity, c.id, c.message]));
  return `${lines.join('\n')}\n`;
}
