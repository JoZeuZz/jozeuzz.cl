import { createHash } from 'node:crypto';
import { basename, extname, join, relative, sep } from 'node:path';
import { finding } from './findings.js';
import { FRONTMATTER_HEAD_BYTES } from './frontmatter.js';
import { EXCLUDED_DIR_NAMES, SKILL_FILE, isInside, isSensitiveName } from './paths.js';
import { safeErrorCode } from './sanitize.js';

export const LIMITS = Object.freeze({ pluginDepth: 12, maxEntries: 20000, siblingDepth: 3, siblingEntries: 1000, skillBytes: 256 * 1024 });
const SCRIPT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.sh', '.bash', '.py', '.rb', '.pl']);

export async function discoverSkills(ctx, roots, limits = LIMITS) {
  const state = { entries: 0, limitHit: false, depthLimitRoots: new Set(), partial: false, findings: [], manifests: [] };
  const probed = [];
  for (const root of roots) probed.push(await probeRoot(ctx.fs, root, state));
  const authorized = probed.filter((root) => root.status === 'ok').map((root) => root.realPath);
  for (const root of probed) {
    if (root.status !== 'ok') continue;
    if (root.layout === 'entries') await scanEntries(ctx, root, authorized, state, limits);
    else if (root.layout === 'plugin-cache') await walkPluginDir(ctx, root, root.realPath, 0, authorized, state, limits);
  }
  return {
    roots: probed.map(({ id, host, path, realPath, status }) => ({ id, host, path, realPath, status })),
    manifests: state.manifests,
    findings: state.findings,
    partial: state.partial,
  };
}

async function probeRoot(fs, root, state) {
  let realPath;
  try {
    realPath = await fs.realpath(root.path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      state.findings.push(finding('ROOT_MISSING', root.id, [root.path], 'La raíz no existe.'));
      return { ...root, realPath: null, status: 'missing' };
    }
    return unreadableRoot({ ...root, realPath: null }, error, state);
  }
  try {
    const info = await fs.lstat(realPath);
    if (!info.isDirectory()) {
      state.findings.push(finding('ROOT_NOT_DIRECTORY', root.id, [root.path], 'La raíz no es un directorio.'));
      return { ...root, realPath, status: 'not-directory' };
    }
  } catch (error) {
    return unreadableRoot({ ...root, realPath }, error, state);
  }
  return { ...root, realPath, status: 'ok' };
}

function unreadableRoot(root, error, state) {
  state.partial = true;
  state.findings.push(finding('UNREADABLE', root.id, [root.path], `No se pudo leer la raíz (${safeErrorCode(error) ?? 'error'}).`));
  return { ...root, status: 'unreadable' };
}

function tick(state, limits, subject, path) {
  if (!state.limitHit && state.entries < limits.maxEntries) {
    state.entries += 1;
    return true;
  }
  limitReached(state, limits, subject, path);
  return false;
}

// Agotar el presupuesto es terminal: no se inspeccionan ni enumeran más entradas.
function limitReached(state, limits, subject, path) {
  if (state.limitHit) return;
  state.limitHit = true;
  state.partial = true;
  state.findings.push(finding('LIMIT_REACHED', subject, [path], `Se alcanzó el límite de ${limits.maxEntries} entradas.`));
}

const isExcluded = (name) => EXCLUDED_DIR_NAMES.has(name);

// Lectura acotada al presupuesto restante. Un directorio que no cabe agota el presupuesto
// sin inventariar un subconjunto, que dependería del orden del sistema de archivos.
async function listBudgeted(ctx, dir, subject, state, limits) {
  if (state.limitHit) return [];
  // Sin presupuesto el directorio no se abre: su contenido queda sin verificar.
  if (state.entries >= limits.maxEntries) {
    limitReached(state, limits, subject, dir);
    return [];
  }
  const listing = await listDir(ctx, dir, subject, state, limits.maxEntries - state.entries, isExcluded);
  if (listing.truncated) limitReached(state, limits, subject, dir);
  return listing.names;
}

async function listDir(ctx, dir, subject, state, max, skip) {
  try {
    return await ctx.fs.readdirBounded(dir, max, skip);
  } catch (error) {
    state.partial = true;
    state.findings.push(finding('UNREADABLE', subject, [dir], `No se pudo listar el directorio (${safeErrorCode(error) ?? 'error'}).`));
    return { names: [], truncated: false };
  }
}

async function lstatEntry(ctx, path, subject, state) {
  try {
    return await ctx.fs.lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    state.partial = true;
    state.findings.push(finding('UNREADABLE', subject, [path], `No se pudo inspeccionar (${safeErrorCode(error) ?? 'error'}).`));
    return null;
  }
}

async function scanEntries(ctx, root, authorized, state, limits) {
  for (const name of await listBudgeted(ctx, root.realPath, root.id, state, limits)) {
    const physical = join(root.realPath, name);
    if (!tick(state, limits, root.id, physical)) return;
    const info = await lstatEntry(ctx, physical, name, state);
    if (!info) continue;
    const entryDir = join(root.path, name);
    if (info.isDirectory()) {
      await readSkillDir(ctx, { root, entryDir, dir: physical, linkTarget: null, plugin: null }, authorized, state, limits);
    } else if (info.isSymbolicLink()) {
      const target = await resolveEntryLink(ctx, root, name, physical, entryDir, authorized, state);
      if (target) await readSkillDir(ctx, { root, entryDir, dir: target, linkTarget: target, plugin: null }, authorized, state, limits);
    }
  }
}

async function resolveEntryLink(ctx, root, name, physical, entryDir, authorized, state) {
  let target;
  try {
    target = await ctx.fs.realpath(physical);
  } catch (error) {
    if (error.code === 'ENOENT') {
      state.findings.push(finding('BROKEN_LINK', name, [entryDir], 'El enlace apunta a una ruta inexistente.'));
    } else if (error.code === 'ELOOP') {
      state.findings.push(finding('LINK_CYCLE', name, [entryDir], 'El enlace forma un ciclo.'));
    } else {
      state.partial = true;
      state.findings.push(finding('UNREADABLE', name, [entryDir], `No se pudo resolver el enlace (${safeErrorCode(error) ?? 'error'}).`));
    }
    return null;
  }
  if (authorized.includes(target) || isInside(root.realPath, target)) {
    state.findings.push(finding('LINK_CYCLE', name, [entryDir, target], 'El enlace apunta a una raíz o a un ancestro de la entrada.'));
    return null;
  }
  if (!authorized.some((base) => isInside(target, base))) {
    state.findings.push(finding('LINK_OUTSIDE_ROOTS', name, [entryDir, target], 'El enlace sale de las raíces autorizadas; no se lee.'));
    return null;
  }
  const info = await lstatEntry(ctx, target, name, state);
  if (!info) return null;
  if (!info.isDirectory()) {
    state.findings.push(finding('ENTRY_NOT_DIRECTORY', name, [entryDir, target], 'El enlace de entrada no apunta a un directorio.'));
    return null;
  }
  return target;
}

async function readSkillDir(ctx, entry, authorized, state, limits) {
  const { root, entryDir, dir } = entry;
  const subject = basename(entryDir);
  const skillPath = join(dir, SKILL_FILE);
  const info = entry.info ?? await lstatEntry(ctx, skillPath, subject, state);
  if (!info) return;
  const manifest = {
    rootId: root.id,
    host: root.host,
    entryPath: join(entryDir, SKILL_FILE),
    realPath: skillPath,
    linkTarget: entry.linkTarget,
    dirName: subject,
    plugin: entry.plugin,
    head: null,
    sha256: null,
    size: null,
    readProblem: null,
    siblingFiles: 0,
    scriptLike: false,
  };
  let filePath = skillPath;
  if (info.isSymbolicLink()) {
    const resolved = await resolveManifestLink(ctx, manifest, skillPath, authorized, state);
    if (!resolved) {
      state.manifests.push(manifest);
      return;
    }
    filePath = resolved;
    manifest.realPath = resolved;
  } else if (!info.isFile()) {
    manifest.readProblem = 'not-file';
    state.findings.push(finding('ENTRY_NOT_FILE', subject, [manifest.entryPath], 'El manifiesto no es un archivo regular.'));
    state.manifests.push(manifest);
    return;
  }
  await readManifestFile(ctx, manifest, filePath, state, limits);
  await countSiblings(ctx, dir, 0, manifest, { used: 0, truncated: false }, state, limits);
  state.manifests.push(manifest);
}

async function resolveManifestLink(ctx, manifest, skillPath, authorized, state) {
  const subject = manifest.dirName;
  let target;
  try {
    target = await ctx.fs.realpath(skillPath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ELOOP') {
      manifest.readProblem = 'broken-link';
      const code = error.code === 'ELOOP' ? 'LINK_CYCLE' : 'BROKEN_LINK';
      state.findings.push(finding(code, subject, [manifest.entryPath], 'El enlace del manifiesto no se puede resolver.'));
    } else {
      manifest.readProblem = 'unreadable';
      state.partial = true;
      state.findings.push(finding('UNREADABLE', subject, [manifest.entryPath], `No se pudo resolver el enlace del manifiesto (${safeErrorCode(error) ?? 'error'}).`));
    }
    return null;
  }
  if (isSensitiveName(basename(target))) {
    manifest.readProblem = 'sensitive';
    state.findings.push(finding('SENSITIVE_PATH_SKIPPED', subject, [manifest.entryPath, target], 'El manifiesto enlaza a un archivo sensible; no se lee.'));
    return null;
  }
  if (basename(target) !== SKILL_FILE || !authorized.some((base) => isInside(target, base))) {
    manifest.readProblem = 'outside-roots';
    state.findings.push(finding('LINK_OUTSIDE_ROOTS', subject, [manifest.entryPath, target], 'El manifiesto enlaza fuera de las raíces autorizadas; no se lee.'));
    return null;
  }
  return target;
}

async function readManifestFile(ctx, manifest, filePath, state, limits) {
  let result;
  try {
    result = await ctx.fs.readBounded(filePath, limits.skillBytes);
  } catch (error) {
    manifest.readProblem = 'unreadable';
    state.partial = true;
    state.findings.push(finding('UNREADABLE', manifest.dirName, [manifest.entryPath], `No se pudo leer el manifiesto (${safeErrorCode(error) ?? 'error'}).`));
    return;
  }
  if (!result.ok) {
    manifest.readProblem = result.reason;
    if (result.reason === 'too-large') {
      state.findings.push(finding('TOO_LARGE', manifest.dirName, [manifest.entryPath], `El manifiesto supera ${limits.skillBytes} bytes; no se analiza.`));
    } else {
      state.findings.push(finding('ENTRY_NOT_FILE', manifest.dirName, [manifest.entryPath], 'El manifiesto no es un archivo regular.'));
    }
    return;
  }
  manifest.size = result.bytes.length;
  manifest.sha256 = createHash('sha256').update(result.bytes).digest('hex');
  // Copia de la cabecera: el resto del contenido no sale de esta función.
  manifest.head = Buffer.from(result.bytes.subarray(0, FRONTMATTER_HEAD_BYTES));
}

// Presupuesto propio por skill: no consume `maxEntries` ni marca el resultado como parcial.
// Un directorio que no cabe en lo que queda del tope no se cuenta: el recuento se detiene.
async function countSiblings(ctx, dir, depth, manifest, budget, state, limits) {
  // Tope agotado: el directorio no se abre y su contenido no se presenta como contado.
  if (budget.used >= limits.siblingEntries) return truncateSiblings(manifest, budget, state, limits);
  const skip = (name) => (depth === 0 && name === SKILL_FILE) || isExcluded(name);
  const listing = await listDir(ctx, dir, manifest.dirName, state, limits.siblingEntries - budget.used, skip);
  if (listing.truncated) return truncateSiblings(manifest, budget, state, limits);
  for (const name of listing.names) {
    if (budget.truncated) return;
    if (budget.used >= limits.siblingEntries) return truncateSiblings(manifest, budget, state, limits);
    budget.used += 1;
    const path = join(dir, name);
    const info = await lstatEntry(ctx, path, manifest.dirName, state);
    if (!info) continue;
    if (info.isDirectory()) {
      if (depth + 1 < limits.siblingDepth) await countSiblings(ctx, path, depth + 1, manifest, budget, state, limits);
      continue;
    }
    manifest.siblingFiles += 1;
    if (SCRIPT_EXTENSIONS.has(extname(name).toLowerCase()) || (info.isFile() && (info.mode & 0o111) !== 0)) manifest.scriptLike = true;
  }
}

function truncateSiblings(manifest, budget, state, limits) {
  if (budget.truncated) return;
  budget.truncated = true;
  state.findings.push(finding('SIBLINGS_TRUNCATED', manifest.dirName, [manifest.entryPath],
    `Recuento detenido en ${limits.siblingEntries} entradas: siblingFiles es una cota inferior y scriptLike puede ser un falso negativo.`));
}

async function walkPluginDir(ctx, root, dir, depth, authorized, state, limits) {
  const plugin = pluginFromPath(root, dir);
  for (const name of await listBudgeted(ctx, dir, root.id, state, limits)) {
    const path = join(dir, name);
    if (!tick(state, limits, root.id, path)) return;
    const info = await lstatEntry(ctx, path, root.id, state);
    if (!info) continue;
    if (info.isSymbolicLink()) {
      state.findings.push(finding('SYMLINK_NOT_FOLLOWED', root.id, [path], 'Symlink dentro de la caché de plugins; no se sigue.'));
      continue;
    }
    if (name === SKILL_FILE) {
      // Fuera de <marketplace>/<plugin>/<versión> no hay plugin al que atribuir el manifiesto.
      if (plugin) {
        const entryDir = join(root.path, relative(root.realPath, dir));
        await readSkillDir(ctx, { root, entryDir, dir, linkTarget: null, plugin, info }, authorized, state, limits);
      }
      continue;
    }
    if (!info.isDirectory()) continue;
    if (depth + 1 > limits.pluginDepth) {
      reportDepthLimit(root, path, state, limits);
      continue;
    }
    await walkPluginDir(ctx, root, path, depth + 1, authorized, state, limits);
  }
}

function reportDepthLimit(root, path, state, limits) {
  state.partial = true;
  if (state.depthLimitRoots.has(root.id)) return;
  state.depthLimitRoots.add(root.id);
  state.findings.push(finding('LIMIT_REACHED', root.id, [path], `Directorio a más de ${limits.pluginDepth} niveles; no se recorre.`));
}

function pluginFromPath(root, dir) {
  const parts = relative(root.realPath, dir).split(sep);
  if (parts.length < 3 || parts[0] === '') return null;
  const [marketplace, name, cacheVersion] = parts;
  return { marketplace, name, cacheVersion, versionDir: join(root.realPath, marketplace, name, cacheVersion) };
}
