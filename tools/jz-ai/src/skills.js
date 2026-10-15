import { discoverSkills, LIMITS } from './discover.js';
import { countBySeverity, finding, sortFindings } from './findings.js';
import { buildInventory } from './inventory.js';
import { findRepoRoot, provenanceFiles, skillRoots } from './paths.js';
import { loadProvenance } from './provenance.js';
import { TOOL } from './tool.js';

export async function runSkills(ctx, limits = LIMITS) {
  const findings = [];
  if (!ctx.home) findings.push(finding('HOME_UNSET', 'HOME', [], `HOME ${ctx.homeProblem}; se omiten las raíces de usuario.`));
  const repoRoot = await findRepoRoot(ctx.fs, ctx.cwd);
  const discovered = await discoverSkills(ctx, skillRoots(ctx.home, repoRoot), limits);
  const provenance = await loadProvenance(ctx, provenanceFiles(ctx.home));
  const agentsRoot = discovered.roots.find((root) => root.id === 'agents' && root.status === 'ok')?.realPath ?? null;
  const inventory = buildInventory({ manifests: discovered.manifests, provenance, agentsRoot });
  const allFindings = sortFindings([...findings, ...discovered.findings, ...provenance.findings, ...inventory.findings]);
  const counts = countBySeverity(allFindings);
  return {
    schemaVersion: 1,
    command: 'skills',
    tool: { ...TOOL },
    completeness: discovered.partial || !ctx.home ? 'partial' : 'complete',
    roots: discovered.roots,
    skills: inventory.skills,
    groups: inventory.groups,
    findings: allFindings,
    summary: {
      roots: discovered.roots.length,
      rootsPresent: discovered.roots.filter((root) => root.status === 'ok').length,
      manifests: inventory.skills.length,
      uniqueFiles: new Set(inventory.skills.map((skill) => skill.realPath)).size,
      names: inventory.groups.length,
      divergentNames: inventory.groups.filter((group) => group.status === 'divergent').length,
      info: counts.info,
      warn: counts.warn,
      error: counts.error,
    },
  };
}
