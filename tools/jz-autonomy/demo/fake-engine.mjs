// Motor SINTÉTICO para la demo de jz-coord: se instala como `claude` u `opencode` en un PATH temporal y
// responde al protocolo jz-coord-v1 sin modelo. Sirve para ejercitar el controlador y los adaptadores reales
// (procesos, grupos, logs, snapshot git, jz-run, jz-git); no demuestra el razonamiento de un motor real.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const engine = process.argv[2];
const prompt = JSON.parse(process.argv.at(-1));
const wt = process.cwd();
const config = (() => { try { return JSON.parse(readFileSync(join(wt, '.jz-state', 'fake-engine.json'), 'utf8')); } catch { return {}; } })();
const policy = await import(pathToFileURL(join(wt, '.jz/policy/policy.mjs')).href);

function emit(text) {
  if (engine === 'claude') process.stdout.write(`${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text })}\n`);
  else process.stdout.write(`${JSON.stringify({ type: 'text', part: { text } })}\n`);
}
const reply = (actions) => emit(`INFORME-JZ (synthetic ${engine})\nJZ-COORD ${JSON.stringify({ actions })}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Escribe como lo haría un subagente escritor: con el bloqueo de escritor del worktree tomado.
async function write(path, content, pauseMs = 0) {
  const holder = { engine: engine === 'claude' ? 'claude-code' : 'opencode', pid: process.pid, session: 'fake', agent: 'jz-implementer', call: `fake-${Date.now()}` };
  const lock = policy.acquireWriter(wt, holder);
  if (lock.decision !== 'allow') throw new Error(lock.reason);
  mkdirSync(join(wt, 'src'), { recursive: true });
  const half = Math.floor(content.length / 2);
  writeFileSync(join(wt, path), content.slice(0, half));
  if (pauseMs) await sleep(pauseMs);
  writeFileSync(join(wt, path), content);
  policy.releaseWriter(wt, { pid: process.pid, call: holder.call });
}

const slug = 'export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, \'-\').replace(/^-+|-+$/g, \'\');\n';
const words = 'export const wordCount = (s) => s.split(/\\s+/).filter(Boolean).length;\n';

// Verifica lo que hay en el árbol (p. ej. tras una transferencia) y sólo rehace lo que falta o quedó a medias.
const good = (path, content) => existsSync(join(wt, path)) && readFileSync(join(wt, path), 'utf8') === content;
const present = (path) => existsSync(join(wt, path));

if (prompt.role === 'delegate') {
  await write('src/words.js', words, config.pauseMs ?? 0);
  reply([{ type: 'result', task: prompt.task.id, status: 'done', summary: `${engine} wrote wordCount`, paths: ['src/words.js'], evidence: ['synthetic: no model'] }]);
} else if (!good('src/slug.js', slug)) {
  await write('src/slug.js', slug);
  reply([{ type: 'progress', note: present('src/slug.js') ? 'slugify verified or repaired; wordCount pending' : 'slugify written; wordCount pending' }]);
} else if (!good('src/words.js', words)) {
  const peer = prompt.peers.find((p) => p.status === 'available')?.engine;
  if (/delegate wordCount/i.test(prompt.goal.objective) && peer && !present('src/words.js') && !prompt.tasks.some((t) => t.id === 'word-count')) {
    reply([{ type: 'delegate', to: peer, task: { id: 'word-count', title: 'wordCount', instructions: 'Create src/words.js exporting wordCount(s): number of whitespace-separated words.', kind: 'write', allowedPaths: ['src'] } }]);
  } else {
    const repaired = present('src/words.js');
    await write('src/words.js', words, config.pauseMs ?? 0);
    reply([{ type: 'progress', note: repaired ? 'src/words.js was incomplete (previous leader interrupted); rewritten' : 'wordCount written' }]);
  }
} else {
  reply([{ type: 'complete', summary: `${engine}: slugify and wordCount verified; checks should pass` }]);
}
