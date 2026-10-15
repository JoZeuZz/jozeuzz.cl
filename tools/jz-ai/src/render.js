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
