// Plugin de OpenCode: aplica .jz/policy/policy.mjs a los agentes jz-* (segunda barrera, además de
// las reglas `permission` de cada perfil) y mantiene un único escritor por worktree mediante
// .jz-state/writer.lock, compartido con Claude Code. No importa el SDK de plugins.
// También corta los reintentos cuando se agota la cuota del proveedor: OpenCode reintenta
// indefinidamente con espera exponencial; el plugin aborta la sesión, libera el bloqueo y deja un
// checkpoint para que otro motor reanude. Se desactiva con `opencode --pure`: no usar --pure en modo autónomo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  roleOf, checkRead, checkWrite, checkBash, checkDelegate, acquireWriter, releaseWriter, readLock, WRITER_ROLES,
} from '../../.jz/policy/policy.mjs';

const PATCH_PATH = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;
// Cuota agotada: no se recupera en minutos. Límite de velocidad: se tolera hasta MAX_RATE_RETRIES.
const QUOTA = /usage limit|quota|insufficient_quota|billing|credit balance|exceeded your current/i;
const RATE = /rate.?limit|too many requests|\b429\b/i;
const MAX_RATE_RETRIES = 3;

export const JzGuard = async ({ client, directory, worktree }) => {
  const wt = fs.realpathSync(worktree || directory);
  const agentBySession = new Map();
  const activeWriterCalls = new Set();
  const stopped = new Set();

  const stopForQuota = async (sessionID, message) => {
    if (stopped.has(sessionID)) return;
    stopped.add(sessionID);
    const cur = readLock(wt);
    if (cur?.engine === 'opencode' && cur.pid === process.pid) releaseWriter(wt, { call: cur.call });
    const agent = agentBySession.get(sessionID) ?? 'desconocido';
    // Síncrono: OpenCode puede terminar en cuanto se aborta la sesión.
    try {
      execFileSync(path.join(wt, '.jz/bin/jz-checkpoint'), [
        '--unit', `sesión OpenCode interrumpida (${agent})`, '--state', 'cuota',
        '--issue', `proveedor sin cuota: ${String(message).slice(0, 200)}`,
        '--next', 'Verificar con .jz/bin/jz-state y reanudar con otro motor; no repetir a ciegas la última tarea',
      ], { cwd: wt, env: { ...process.env, JZ_ENGINE: 'opencode' }, timeout: 15_000, stdio: 'ignore' });
    } catch {
      // Sin checkpoint, jz-state sigue mostrando el estado real.
    }
    try {
      await client.session.abort({ path: { id: sessionID } });
    } catch {
      // La sesión puede haber terminado ya.
    }
  };

  const enforce = (r) => {
    if (r && r.decision !== 'allow') throw new Error(`jz-policy: ${r.reason}`);
  };

  return {
    event: async ({ event }) => {
      if (event.type !== 'session.status' || event.properties?.status?.type !== 'retry') return;
      const { sessionID, status } = event.properties;
      if (QUOTA.test(status.message) || (RATE.test(status.message) && status.attempt >= MAX_RATE_RETRIES)) {
        await stopForQuota(sessionID, status.message);
      }
    },
    'chat.params': async (input) => {
      agentBySession.set(input.sessionID, input.agent);
    },
    'shell.env': async (_input, output) => {
      output.env.JZ_ENGINE = 'opencode';
    },
    'tool.execute.before': async (input, output) => {
      const role = roleOf(agentBySession.get(input.sessionID));
      const a = output.args ?? {};
      const ctx = { wt, cwd: wt };

      if (input.tool === 'task') {
        const target = a.subagent_type;
        if (role) enforce(checkDelegate(target, role));
        if (WRITER_ROLES.has(target)) {
          const cur = readLock(wt);
          if (cur?.engine === 'opencode' && cur.pid === process.pid && !activeWriterCalls.has(cur.call)) {
            releaseWriter(wt, { call: cur.call }); // llamada anterior de este proceso que no liberó
          }
          enforce(acquireWriter(wt, {
            engine: 'opencode', pid: process.pid, session: input.sessionID, agent: target, call: input.callID,
          }));
          activeWriterCalls.add(input.callID);
        }
        return;
      }
      if (!role) return;
      switch (input.tool) {
        case 'read':
          return enforce(checkRead(a.filePath, role, ctx));
        case 'glob':
        case 'grep':
        case 'list':
          return enforce(checkRead(a.path, role, ctx));
        case 'edit':
        case 'write':
          return enforce(checkWrite(a.filePath, role, ctx));
        case 'apply_patch': {
          const paths = [...String(a.patchText ?? '').matchAll(PATCH_PATH)].map((m) => m[1].trim());
          if (paths.length === 0) enforce({ decision: 'deny', reason: 'parche sin rutas reconocibles' });
          for (const p of paths) enforce(checkWrite(p, role, ctx));
          return;
        }
        case 'bash':
          return enforce(checkBash(a.command, role, { wt, cwd: a.workdir ? path.resolve(wt, a.workdir) : wt }));
        case 'webfetch':
        case 'websearch':
        case 'codesearch':
          return enforce({ decision: 'deny', reason: `${input.tool} no está permitido para ${role}` });
        default:
      }
    },
    'tool.execute.after': async (input) => {
      if (input.tool === 'task' && activeWriterCalls.delete(input.callID)) {
        releaseWriter(wt, { engine: 'opencode', call: input.callID });
      }
    },
  };
};
