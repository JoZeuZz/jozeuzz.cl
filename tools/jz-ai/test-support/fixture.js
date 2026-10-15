import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

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
  for (const method of ['lstat', 'realpath', 'readdir', 'readBounded']) {
    wrapped[method] = async (path, ...rest) => {
      if (method === 'readBounded') reads.push(path);
      const code = fail[method]?.[path];
      if (code) throw Object.assign(new Error(`${code}: ${path}`), { code });
      return fs[method](path, ...rest);
    };
  }
  return { fs: wrapped, reads };
}
