import * as nativeFs from 'node:fs/promises';
import { join } from 'node:path';

// Exclusión entre controladores jz-coord sobre un mismo state-dir. El bloqueo se crea con link(2), que es
// atómico y falla si ya existe, desde un temporal completo y sincronizado: nunca hay un bloqueo a medio
// escribir. Sólo se retira el de un titular que se demuestra muerto (otro starttime u otro arranque), bajo un
// mutex de recuperación, y se conserva renombrado como evidencia. Un bloqueo ilegible o un mutex huérfano no
// se tocan: los resuelve un humano.

const LOCK = 'controller.lock';
const fields = (holder) => holder && Number.isInteger(holder.pid) && typeof holder.start === 'string' && typeof holder.token === 'string';

async function writeSynced(fs, path, data) {
  const handle = await fs.open(path, 'wx', 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function acquireController(dir, { self, alive, fs = nativeFs, at = new Date().toISOString() }) {
  if (!fields(self)) return { ok: false, reason: 'controller identity unavailable' };
  const lock = join(dir, LOCK);
  const mutex = `${lock}.recover`;
  const temp = join(dir, `.${LOCK}.${self.token}.tmp`);
  await writeSynced(fs, temp, `${JSON.stringify({ ...self, at })}\n`);
  const link = async (target) => {
    try {
      await fs.link(temp, target);
      return true;
    } catch (error) {
      if (error?.code === 'EEXIST') return false;
      throw error;
    }
  };
  const read = async () => {
    try { return await fs.readFile(lock, 'utf8'); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  };
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await link(lock)) return { ok: true, lock, recovered: null };
      const seen = await read();
      if (seen === null) continue;
      let holder = null;
      try { holder = JSON.parse(seen); } catch {}
      if (!fields(holder)) return { ok: false, reason: `controller lock unreadable: ${lock} (inspect and remove it by hand)` };
      if (holder.token === self.token) return { ok: true, lock, recovered: null };
      if (await alive(holder)) return { ok: false, reason: `controller pid ${holder.pid} active since ${holder.at ?? '?'}` };
      if (!(await link(mutex))) return { ok: false, reason: `controller lock recovery in progress or stuck: ${mutex}` };
      try {
        // Bajo el mutex: si el bloqueo sigue siendo el mismo del titular muerto, se aparta y se toma.
        if ((await read()) !== seen) continue;
        await fs.rename(lock, `${lock}.stale-${holder.token}`);
        if (await link(lock)) return { ok: true, lock, recovered: holder };
        return { ok: false, reason: 'controller lock taken by another controller during recovery' };
      } finally {
        await fs.unlink(mutex).catch(() => {});
      }
    }
    return { ok: false, reason: 'controller lock contended' };
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}

export async function releaseController(dir, self, fs = nativeFs) {
  const lock = join(dir, LOCK);
  try {
    const holder = JSON.parse(await fs.readFile(lock, 'utf8'));
    if (holder?.token === self.token) await fs.unlink(lock);
  } catch {}
}
