import { chmod, lstat, mkdir, mkdtemp, opendir, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/cli.js';

export async function tempDir(t) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'jz-ai-test-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

// spec: { 'ruta/archivo': 'contenido' | Buffer | { link } | { dir: true } | { fifo: true } | { file, mode } }
export async function makeTree(base, spec) {
  for (const [rel, value] of Object.entries(spec)) {
    const path = join(base, rel);
    await mkdir(dirname(path), { recursive: true });
    if (typeof value === 'string' || Buffer.isBuffer(value)) await writeFile(path, value);
    else if (value.link !== undefined) await symlink(value.link, path);
    else if (value.dir) await mkdir(path, { recursive: true });
    else if (value.fifo) execFileSync('mkfifo', [path]);
    else if (value.file !== undefined) {
      await writeFile(path, value.file);
      if (value.mode !== undefined) await chmod(path, value.mode);
    } else throw new Error(`entrada de fixture no soportada: ${rel}`);
  }
}

export function skillMd(name, body = 'Contenido.') {
  return `---\nname: ${name}\ndescription: Skill ${name}\n---\n\n${body}\n`;
}

export async function snapshotTree(base) {
  const out = [];
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const path = join(dir, name);
      const info = await lstat(path);
      const entry = { path: relative(base, path), mode: info.mode, size: info.size, mtimeMs: info.mtimeMs };
      if (info.isSymbolicLink()) entry.link = await readlink(path);
      else if (info.isFile()) entry.sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
      out.push(entry);
      if (info.isDirectory()) await walk(path);
    }
  }
  await walk(base);
  return out;
}

export function instrumentFs(fs, { fail = {} } = {}) {
  const reads = [];
  const wrapped = {};
  for (const method of ['lstat', 'realpath', 'readdirBounded', 'readBounded']) {
    wrapped[method] = async (path, ...rest) => {
      if (method === 'readBounded') reads.push(path);
      const code = fail[method]?.[path];
      if (code) throw Object.assign(new Error(`${code}: ${path}`), { code });
      return fs[method](path, ...rest);
    };
  }
  return { fs: wrapped, reads };
}

// Envuelve opendir para contar directorios abiertos, entradas materializadas y cierres.
export function countingOpendir(base = opendir) {
  const stats = { opened: [], closed: 0, materialized: new Map(), total: () => [...stats.materialized.values()].reduce((a, b) => a + b, 0) };
  const wrapped = async (path, ...rest) => {
    const dir = await base(path, ...rest);
    stats.opened.push(path);
    return {
      async read() {
        const entry = await dir.read();
        if (entry) stats.materialized.set(path, (stats.materialized.get(path) ?? 0) + 1);
        return entry;
      },
      async close() {
        stats.closed += 1;
        return dir.close();
      },
    };
  };
  return { opendir: wrapped, stats };
}

export const BIN = fileURLToPath(new URL('../bin/jz-ai.js', import.meta.url));

export function runBin(args, { cwd, env, importModule } = {}) {
  const nodeArgs = importModule ? ['--import', importModule, BIN, ...args] : [BIN, ...args];
  const result = spawnSync(process.execPath, nodeArgs, { cwd, env, encoding: 'utf8', timeout: 30000 });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

export async function runInProcess(args, ctx) {
  let stdout = '';
  let stderr = '';
  const code = await run(args, { ctx, stdout: { write: (s) => { stdout += s; } }, stderr: { write: (s) => { stderr += s; } } });
  return { code, stdout, stderr };
}

// Reproduce la forma observada en la auditoría §3.1: 3 variantes de caveman y 2 de cavecrew.
export async function auditFixture(home) {
  const plugin = '.claude/plugins/cache/caveman/caveman/7066cc815414';
  await makeTree(home, {
    [`${plugin}/skills/caveman/SKILL.md`]: skillMd('caveman', 'versión plugin'),
    [`${plugin}/skills/cavecrew/SKILL.md`]: skillMd('cavecrew', 'versión plugin'),
    '.agents/skills/caveman/SKILL.md': skillMd('caveman', 'versión agents'),
    '.agents/skills/cavecrew/SKILL.md': skillMd('cavecrew', 'versión agents'),
    '.claude/skills/caveman': { link: '../../.agents/skills/caveman' },
    '.claude/skills/cavecrew': { link: '../../.agents/skills/cavecrew' },
    '.config/opencode/skills/caveman/SKILL.md': skillMd('caveman', 'versión opencode'),
    '.config/opencode/skills/cavecrew/SKILL.md': skillMd('cavecrew', 'versión plugin'),
    '.claude/plugins/installed_plugins.json': JSON.stringify({
      version: 2,
      plugins: { 'caveman@caveman': [{ scope: 'user', installPath: join(home, plugin), version: '7066cc815414', gitCommitSha: 'd262ab3', installedAt: 'i', lastUpdated: 'l' }] },
    }),
    '.agents/.skill-lock.json': JSON.stringify({ version: 3, skills: { caveman: { source: 'JuliusBrussee/caveman', sourceType: 'github' } } }),
  });
}

export function gitFixture(dir, { commit = true } = {}) {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Prueba', '-c', 'user.email=prueba@example.invalid', '-c', 'init.defaultBranch=main', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1' },
  });
  git('init', '-q');
  if (commit) {
    execFileSync('sh', ['-c', 'printf "a\\n" > a.txt'], { cwd: dir });
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
  }
  return git;
}
