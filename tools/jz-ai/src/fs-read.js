import { constants, promises as fsp } from 'node:fs';
import { compareText } from './order.js';

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

export function createFsRead({ opendir = fsp.opendir } = {}) {
  return {
    lstat: (path) => fsp.lstat(path),
    realpath: (path) => fsp.realpath(path),
    readdir: async (path) => (await fsp.readdir(path)).sort(compareText),
    readdirBounded: (path, max, skip) => readdirBounded(path, max, skip, opendir),
    readBounded,
  };
}

// Lee como máximo max + 1 nombres no omitidos. Si el directorio tiene más de max, devuelve
// `truncated: true` sin nombres: un subconjunto dependería del orden del sistema de archivos.
export async function readdirBounded(path, max, skip = () => false, opendir = fsp.opendir) {
  const dir = await opendir(path);
  const names = [];
  try {
    for (let entry = await dir.read(); entry !== null; entry = await dir.read()) {
      if (skip(entry.name)) continue;
      if (names.length === max) return { names: [], truncated: true };
      names.push(entry.name);
    }
  } finally {
    await dir.close();
  }
  return { names: names.sort(compareText), truncated: false };
}

export async function readBounded(path, maxBytes) {
  const handle = await fsp.open(path, READ_FLAGS);
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { ok: false, reason: 'not-file' };
    if (info.size > maxBytes) return { ok: false, reason: 'too-large' };
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > maxBytes) return { ok: false, reason: 'too-large' };
    return { ok: true, bytes: buffer.subarray(0, total) };
  } finally {
    await handle.close();
  }
}
