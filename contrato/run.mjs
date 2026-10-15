#!/usr/bin/env node
// CLI: node contrato/run.mjs --driver <ruta> [--solo ID,ID] [--json]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { CASOS } from './casos/index.mjs';
import { runCases } from './runner.mjs';

const { values } = parseArgs({
  options: {
    driver: { type: 'string' },
    solo: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  strict: true,
});

if (!values.driver) {
  console.error('Sin implementación: indica --driver <ruta al módulo del driver>');
  process.exit(2);
}

let crearDriver;
try {
  const modulo = await import(pathToFileURL(path.resolve(values.driver)).href);
  crearDriver = modulo.default;
  if (typeof crearDriver !== 'function') throw new Error('el módulo no exporta por defecto una función crearDriver');
} catch (e) {
  console.error(`No se pudo cargar el driver «${values.driver}»: ${e.message}`);
  process.exit(2);
}

const filtro = values.solo ? values.solo.split(',').map((s) => s.trim()) : undefined;
if (filtro) {
  const conocidos = new Set(CASOS.map((c) => c.id));
  const desconocidos = filtro.filter((id) => !conocidos.has(id));
  if (desconocidos.length) {
    console.error(`Casos desconocidos en --solo: ${desconocidos.join(', ')}`);
    process.exit(2);
  }
}

let resultados;
try {
  resultados = await runCases(crearDriver, CASOS, { filtro });
} catch (e) {
  console.error(`Driver inválido: ${e.message}`);
  process.exit(2);
}

const fallos = resultados.filter((r) => !r.ok).length;
if (values.json) {
  console.log(JSON.stringify(resultados, null, 2));
} else {
  for (const r of resultados) {
    console.log(r.ok ? `ok  ${r.id} ${r.titulo}` : `FAIL ${r.id} ${r.titulo} — ${String(r.error).split('\n')[0]}`);
    for (const m of r.mediciones) console.log(`    medida ${r.id} ${m.nombre} = ${m.valor} ${m.unidad}`);
  }
  console.log(`casos ${resultados.length} · ok ${resultados.length - fallos} · fail ${fallos}`);
}
process.exit(fallos === 0 ? 0 : 1);
