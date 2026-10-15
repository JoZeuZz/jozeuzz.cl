#!/usr/bin/env node
// CLI: node contrato/run.mjs --driver <ruta> [--solo ID,ID] [--alcance poc-1a|poc-1b|poc-3] [--json]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ALCANCES, CASOS } from './casos/index.mjs';
import { runCases } from './runner.mjs';

const { values } = parseArgs({
  options: {
    driver: { type: 'string' },
    solo: { type: 'string' },
    alcance: { type: 'string' },
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

if (values.alcance && !ALCANCES.includes(values.alcance)) {
  console.error(`--alcance desconocido «${values.alcance}» (${ALCANCES.join('|')})`);
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

let driverInfo = {};
try {
  const d = await crearDriver();
  driverInfo = { noAplica: d.noAplica, canalesCerrados: d.canalesCerrados };
} catch {
  // la validación de la forma la hace runCases
}

let resultados;
try {
  resultados = await runCases(crearDriver, CASOS, { filtro });
} catch (e) {
  console.error(`Driver inválido: ${e.message}`);
  process.exit(2);
}

// Clasificación. Sin --alcance, «no-implementado» es fallo (comportamiento original).
// Con --alcance: dentro del alcance es FAIL; fuera del alcance es «pendiente»; un FAIL real fuera sigue siendo FAIL.
const enAlcance = (r) => !values.alcance || r.alcance === values.alcance;
const clasificar = (r) => {
  if (r.ok) return 'ok';
  if (r.estado === 'no-implementado' && !enAlcance(r)) return 'pendiente';
  return 'fail';
};
for (const r of resultados) r.veredicto = clasificar(r);
const cuenta = (v) => resultados.filter((r) => r.veredicto === v).length;
const fallos = cuenta('fail');
const pendientes = resultados.filter((r) => r.veredicto === 'pendiente');

if (values.json) {
  console.log(JSON.stringify(resultados, null, 2));
} else {
  for (const r of resultados) {
    if (r.veredicto === 'pendiente') continue;
    const marca = r.veredicto === 'ok' ? 'ok ' : r.estado === 'no-implementado' ? 'FAIL (no implementado)' : 'FAIL';
    console.log(r.ok ? `ok  ${r.id} ${r.titulo}` : `${marca} ${r.id} ${r.titulo} — ${String(r.error).split('\n')[0]}`);
    for (const m of r.mediciones) console.log(`    medida ${r.id} ${m.nombre} = ${m.valor} ${m.unidad}`);
  }
  if (values.alcance) {
    for (const alc of ALCANCES.filter((a) => a !== values.alcance)) {
      const lista = pendientes.filter((r) => r.alcance === alc);
      if (!lista.length) continue;
      console.log(`pendiente (${alc}):`);
      for (const r of lista) console.log(`  pendiente ${r.id} ${r.titulo}`);
    }
  }
  const detalle = `casos ${resultados.length} · ok ${cuenta('ok')} · fail ${fallos}`;
  console.log(values.alcance ? `${detalle} · pendiente ${pendientes.length}` : detalle);
  // Justificaciones de «no aplica»: se imprimen siempre para que no pasen inadvertidas.
  for (const [tipo, motivo] of Object.entries(driverInfo.noAplica ?? {})) console.log(`no aplica «${tipo}»: ${motivo}`);
  for (const c of driverInfo.canalesCerrados ?? []) console.log(`canal cerrado «${c.nombre}» (${c.tipo})`);
}
process.exit(fallos === 0 ? 0 : 1);
