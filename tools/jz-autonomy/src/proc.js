import { readdirSync, readFileSync } from 'node:fs';

// Identidad de procesos para jz-coord. Un pid solo no identifica un proceso: el kernel lo reutiliza. La
// identidad es (pid, instante de arranque en ticks desde el arranque, boot_id); los motores llevan además un
// token de lease en su entorno (JZ_COORD_LEASE), que heredan sus hijos.

export const LEASE_ENV = 'JZ_COORD_LEASE';

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

export function bootId() {
  return read('/proc/sys/kernel/random/boot_id')?.trim() ?? null;
}

// Campo 22 de /proc/<pid>/stat (starttime). El nombre del proceso (campo 2) puede contener espacios y
// paréntesis: los campos se cuentan desde el último ')'.
export function processStart(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const stat = read(`/proc/${pid}/stat`);
  if (!stat) return null;
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return /^\d+$/.test(fields[19] ?? '') ? fields[19] : null;
}

export function identify(pid) {
  const start = processStart(pid);
  return start ? { pid, start, boot: bootId() } : null;
}

// Verdadero sólo si el proceso de la identidad sigue vivo: mismo arranque del sistema y mismo starttime.
export function sameProcess(identity) {
  if (!identity || !Number.isInteger(identity.pid) || !identity.start) return false;
  if (identity.boot && identity.boot !== bootId()) return false;
  return processStart(identity.pid) === identity.start;
}

export function carriesToken(pid, token) {
  if (!token) return false;
  const environ = read(`/proc/${pid}/environ`);
  return Boolean(environ) && environ.split('\0').includes(`${LEASE_ENV}=${token}`);
}

// Procesos vivos que llevan el token del lease: la prueba de que pertenecen al turno de jz-coord.
export function holders(token) {
  if (!token) return [];
  let entries = [];
  try { entries = readdirSync('/proc'); } catch { return []; }
  const found = [];
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    if (pid === process.pid || !carriesToken(pid, token)) continue;
    const start = processStart(pid);
    if (start) found.push({ pid, start });
  }
  return found;
}
