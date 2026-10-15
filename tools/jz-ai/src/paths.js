import { dirname, join, sep } from 'node:path';

export const SKILL_FILE = 'SKILL.md';
export const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.git']);

const HOME_SKILL_ROOTS = [
  { id: 'claude-user', host: 'claude', layout: 'entries', segments: ['.claude', 'skills'] },
  { id: 'claude-plugins', host: 'claude', layout: 'plugin-cache', segments: ['.claude', 'plugins', 'cache'] },
  { id: 'agents', host: 'agents', layout: 'entries', segments: ['.agents', 'skills'] },
  { id: 'opencode-user', host: 'opencode', layout: 'entries', segments: ['.config', 'opencode', 'skills'] },
];

const REPO_SKILL_ROOTS = [
  { id: 'project-claude', host: 'claude', layout: 'entries', segments: ['.claude', 'skills'] },
  { id: 'project-opencode', host: 'opencode', layout: 'entries', segments: ['.opencode', 'skills'] },
];

export function skillRoots(home, repoRoot) {
  const build = (base, list) => list.map(({ id, host, layout, segments }) => ({ id, host, layout, path: join(base, ...segments) }));
  return [...(home ? build(home, HOME_SKILL_ROOTS) : []), ...(repoRoot ? build(repoRoot, REPO_SKILL_ROOTS) : [])];
}

export function provenanceFiles(home) {
  if (!home) return { skillLock: null, installedPlugins: null };
  return {
    skillLock: join(home, '.agents', '.skill-lock.json'),
    installedPlugins: join(home, '.claude', 'plugins', 'installed_plugins.json'),
  };
}

const HOME_CONFIGS = [
  { id: 'claude-credentials', segments: ['.claude', '.credentials.json'], category: 'credentials', sensitive: 'yes' },
  { id: 'claude-state', segments: ['.claude.json'], category: 'account-state', sensitive: 'yes' },
  { id: 'claude-settings', segments: ['.claude', 'settings.json'], category: 'host-config', sensitive: 'yes' },
  { id: 'claude-settings-local', segments: ['.claude', 'settings.local.json'], category: 'host-config', sensitive: 'yes' },
  { id: 'opencode-config', segments: ['.config', 'opencode', 'opencode.json'], category: 'provider-config', sensitive: 'yes' },
  { id: 'opencode-config-jsonc', segments: ['.config', 'opencode', 'opencode.jsonc'], category: 'host-config', sensitive: 'yes' },
  { id: 'opencode-auth', segments: ['.local', 'share', 'opencode', 'auth.json'], category: 'credentials', sensitive: 'yes' },
  { id: 'opencode-agents-md', segments: ['.config', 'opencode', 'AGENTS.md'], category: 'instructions', sensitive: 'no' },
  { id: 'claude-caveman-flag', segments: ['.claude', '.caveman-active'], category: 'session-state', sensitive: 'no' },
  { id: 'opencode-caveman-flag', segments: ['.config', 'opencode', '.caveman-active'], category: 'session-state', sensitive: 'no' },
];

const REPO_CONFIGS = [
  { id: 'project-claude-settings-local', segments: ['.claude', 'settings.local.json'], category: 'host-config', sensitive: 'yes' },
];

export function knownConfigPaths(home, repoRoot) {
  const build = (base, list) => list.map(({ id, segments, category, sensitive }) => ({ id, path: join(base, ...segments), category, sensitive }));
  return [...(home ? build(home, HOME_CONFIGS) : []), ...(repoRoot ? build(repoRoot, REPO_CONFIGS) : [])];
}

export const REPO_ENV_PATTERN = /^\.env(\..+)?$/;

const SENSITIVE_NAME_PATTERNS = [
  /^auth\.json$/i, /^\.credentials\.json$/i, /\.pem$/i, /\.key$/i, /^id_rsa/i, /^id_ed25519/i,
  /^\.env$/i, /^\.env\./i, /^\.netrc$/i, /^cookies/i, /token/i, /secret/i, /credential/i,
];

export function isSensitiveName(name) {
  return SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export const PROVIDER_KEY_VARS = ['ANTHROPIC_API_KEY', 'FIREWORKS_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY'];

export const ENV_PRESENCE = [
  'ANTHROPIC_API_KEY', 'CAVECREW_BUILDER_MODEL', 'CAVECREW_INVESTIGATOR_MODEL', 'CAVECREW_REVIEWER_MODEL',
  'CAVEMAN_DEFAULT_MODE', 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', 'FIREWORKS_API_KEY', 'LLM_COUNCIL_BASE_URL',
  'LLM_COUNCIL_CHAIRMAN', 'LLM_COUNCIL_MODELS', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
];

export function isInside(path, base) {
  return path === base || path.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

export async function findRepoRoot(fs, start) {
  let dir = start;
  for (;;) {
    try {
      await fs.lstat(join(dir, '.git'));
      return dir;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
