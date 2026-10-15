import { finding } from './findings.js';
import { parseFrontmatter } from './frontmatter.js';
import { compareBy, compareText } from './order.js';
import { lockEntryFor, pluginRecord } from './provenance.js';
import { cleanText } from './sanitize.js';

const DESCRIPTION_LIMIT = 1024;

export function buildInventory({ manifests, provenance, agentsRoot }) {
  const findings = [];
  const skills = manifests
    .map((manifest) => toSkillRecord(manifest, provenance, agentsRoot, findings))
    .sort(compareBy((s) => s.name, (s) => s.rootId, (s) => s.entryPath));
  const groups = buildGroups(skills, findings);
  addPluginFindings(skills, findings);
  return { skills, groups, findings };
}

function toSkillRecord(m, provenance, agentsRoot, findings) {
  const manifest = { valid: false, problems: [] };
  let name = null;
  let nameSource = 'directory';
  let description = null;
  if (m.head !== null) {
    const parsed = parseFrontmatter(m.head);
    if (!parsed.ok) manifest.problems.push(parsed.problem);
    else if (!parsed.fields.name) manifest.problems.push('missing-name');
    else {
      name = cleanText(parsed.fields.name);
      nameSource = 'frontmatter';
    }
    if (parsed.ok && parsed.fields.description) description = cleanText(parsed.fields.description).slice(0, DESCRIPTION_LIMIT);
    manifest.valid = manifest.problems.length === 0;
  } else {
    manifest.problems.push(`not-read:${m.readProblem}`);
  }
  if (!name) {
    name = cleanText(m.dirName);
    nameSource = 'directory';
  }
  if (m.head !== null && !manifest.valid) {
    findings.push(finding('MANIFEST_INVALID', name, [m.entryPath], `Manifiesto inválido: ${manifest.problems.join(', ')}.`));
  }
  if (nameSource === 'frontmatter' && name !== m.dirName) {
    findings.push(finding('MANIFEST_NAME_MISMATCH', name, [m.entryPath], `El nombre del frontmatter no coincide con el directorio "${m.dirName}".`));
  }
  return {
    name,
    nameSource,
    description,
    rootId: m.rootId,
    host: m.host,
    entryPath: m.entryPath,
    realPath: m.realPath,
    linkTarget: m.linkTarget,
    sha256: m.sha256,
    size: m.size,
    siblingFiles: m.siblingFiles,
    scriptLike: m.scriptLike,
    manifest,
    plugin: pluginRecord(m.plugin, provenance.plugins),
    provenance: lockEntryFor(m, agentsRoot, provenance.skillLock),
    availability: 'unverified',
  };
}

function buildGroups(skills, findings) {
  const byName = new Map();
  for (const skill of skills) {
    if (!byName.has(skill.name)) byName.set(skill.name, []);
    byName.get(skill.name).push(skill);
  }
  const groups = [];
  for (const [name, members] of [...byName].sort((a, b) => compareText(a[0], b[0]))) {
    const variantMap = new Map();
    for (const skill of members) {
      if (!variantMap.has(skill.sha256)) variantMap.set(skill.sha256, { sha256: skill.sha256, realPaths: new Set(), entryPaths: [] });
      const variant = variantMap.get(skill.sha256);
      variant.realPaths.add(skill.realPath);
      variant.entryPaths.push(skill.entryPath);
    }
    const variants = [...variantMap.values()]
      .map((v) => ({ sha256: v.sha256, realPaths: [...v.realPaths].sort(compareText), entryPaths: v.entryPaths.sort(compareText) }))
      .sort((a, b) => compareText(a.sha256, b.sha256));
    const hashes = variants.filter((v) => v.sha256 !== null);
    const incomplete = hashes.length !== variants.length;
    const realPaths = [...new Set(members.map((s) => s.realPath))].sort(compareText);
    let status;
    if (hashes.length > 1) status = 'divergent';
    else if (members.length === 1) status = 'single';
    else if (realPaths.length === 1) status = 'aliased';
    else if (incomplete) status = 'undetermined';
    else status = 'identical';
    groups.push({ name, status, incomplete, variants });

    if (status === 'divergent') {
      const short = hashes.map((v) => v.sha256.slice(0, 8)).join(', ');
      findings.push(finding('NAME_COLLISION_DIVERGENT', name, members.map((s) => s.entryPath),
        `${hashes.length} variantes de contenido: ${short}. El mismo nombre no implica que el host cargue la misma skill.`));
    }
    if (status === 'identical') {
      findings.push(finding('NAME_COLLISION_IDENTICAL', name, realPaths, 'Copias idénticas byte a byte en rutas distintas.'));
    }
    for (const realPath of realPaths) {
      const aliases = members.filter((s) => s.realPath === realPath);
      if (aliases.length > 1) {
        findings.push(finding('SAME_REALPATH', name, [...aliases.map((s) => s.entryPath), realPath], 'Las entradas resuelven al mismo archivo canónico.'));
      }
    }
  }
  return groups;
}

function addPluginFindings(skills, findings) {
  const seen = new Set();
  for (const skill of skills) {
    if (!skill.plugin || skill.plugin.installed !== 'no') continue;
    const key = `${skill.plugin.id}/${skill.plugin.cacheVersion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(finding('PLUGIN_CACHE_NOT_INSTALLED', skill.plugin.id, [skill.entryPath],
      `La versión ${skill.plugin.cacheVersion} está en caché pero no figura como instalada en el registro.`));
  }
}
