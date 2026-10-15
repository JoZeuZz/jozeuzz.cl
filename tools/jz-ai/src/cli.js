import { parseArgs } from 'node:util';
import { createContext } from './context.js';
import { renderJson, renderSkillsText } from './render.js';
import { safeErrorCode } from './sanitize.js';
import { runSkills } from './skills.js';
import { TOOL } from './tool.js';

export const USAGE = `Uso: jz-ai <comando> [--json]
       jz-ai [<comando>] --help
       jz-ai --version

Comandos:
  doctor     Diagnóstico de herramientas, repositorio, rutas y entorno (solo lectura).
  skills     Inventario de manifiestos SKILL.md, procedencia y duplicados (solo lectura).

Opciones:
  --json     Salida JSON (schemaVersion 1).
  --help     Muestra esta ayuda (solo o tras un comando, sin otras opciones).
  --version  Muestra la versión (sólo como único argumento).
`;

const COMMANDS = {
  skills: { run: runSkills, text: renderSkillsText },
};

export async function run(argv, { stdout, stderr, ctx } = {}) {
  // Formas válidas: --help, <comando> --help y --version (spec §5). Se resuelven antes de crear el contexto.
  const helpRequested = (argv.length === 1 && argv[0] === '--help')
    || (argv.length === 2 && argv[1] === '--help' && Object.hasOwn(COMMANDS, argv[0]));
  if (helpRequested) {
    stdout.write(USAGE);
    return 0;
  }
  if (argv.length === 1 && argv[0] === '--version') {
    stdout.write(`${TOOL.name} ${TOOL.version}\n`);
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: { json: { type: 'boolean' } } });
  } catch {
    return usageError(stderr, 'Opción o argumento inválido.');
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1 || !Object.hasOwn(COMMANDS, positionals[0])) return usageError(stderr, 'Comando inválido.');
  const name = positionals[0];
  const command = COMMANDS[name];
  const context = ctx ?? createContext();
  let doc;
  try {
    doc = await command.run(context);
  } catch (error) {
    // Nunca se publica error.message: puede contener rutas o fragmentos de archivos (spec §7.4).
    const code = safeErrorCode(error);
    const detail = code ? ` (${code})` : '';
    if (values.json) {
      stdout.write(renderJson({ schemaVersion: 1, command: name, tool: { ...TOOL }, completeness: 'failed', error: { code: 'INTERNAL', message: `Fallo interno inesperado${detail}.` } }));
    } else {
      stderr.write(`jz-ai ${name}: fallo interno inesperado${detail}.\n`);
    }
    return 3;
  }
  stdout.write(values.json ? renderJson(doc) : command.text(doc, context.home));
  return exitCodeFor(doc);
}

function usageError(stderr, message) {
  stderr.write(`${message}\n\n${USAGE}`);
  return 2;
}

export function exitCodeFor(doc) {
  const errors = doc.command === 'skills' ? doc.summary.error : doc.checks.filter((c) => c.severity === 'error').length;
  return doc.completeness === 'complete' && errors === 0 ? 0 : 1;
}
