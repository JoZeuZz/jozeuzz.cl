import { constants, promises as fsp } from 'node:fs';
import { compareText } from './order.js';

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

export function createFsRead() {
  return {
    lstat: (path) => fsp.lstat(path),
    realpath: (path) => fsp.realpath(path),
    readdir: async (path) => (await fsp.readdir(path)).sort(compareText),
    readBounded,
  };
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
