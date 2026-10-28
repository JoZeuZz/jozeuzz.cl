// Motor sintético para test/coord-real.test.js: se lanza como `claude -p --agent jz-orchestrator ...` y sigue
// el guion de <root>/.jz-state/engine.json por número de turno. Escribe, borra, se cuelga (motor vivo tras la
// caída del controlador) o espera antes de responder. No usa modelo.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const prompt = JSON.parse(process.argv.at(-1));
const root = process.cwd();
const script = JSON.parse(readFileSync(join(root, '.jz-state', 'engine.json'), 'utf8'));
const step = script[String(prompt.turn)] ?? { reply: [{ type: 'complete', summary: 'done' }] };

for (const [path, content] of Object.entries(step.write ?? {})) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
for (const path of step.delete ?? []) rmSync(join(root, path), { force: true });
if (step.pidFile) writeFileSync(step.pidFile, `${process.pid}\n`);
if (step.hang) setInterval(() => {}, 1000);
else {
  if (step.waitMs) await new Promise((resolve) => setTimeout(resolve, step.waitMs));
  const text = `synthetic engine turn ${prompt.turn}\nJZ-COORD ${JSON.stringify({ actions: step.reply })}`;
  process.stdout.write(`${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text })}\n`);
}
