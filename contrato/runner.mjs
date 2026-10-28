// Ejecutor de casos sin node:test, para poder usarlo contra mutantes y desde la CLI.
import { assertDriverShape, assertRefsShape } from './driver.mjs';
import { SEMILLA } from './fixture.mjs';

function pasaFiltro(caso, filtro) {
  if (!filtro) return true;
  if (typeof filtro === 'function') return filtro(caso);
  return filtro.includes(caso.id);
}

/**
 * @param {() => Promise<object>} crearDriver
 * @param {Array} casos
 * @param {{ filtro?: string[] | ((caso) => boolean) }} [opciones]
 * @returns {Promise<Array<{ id, area, titulo, ok, error?, mediciones }>>}
 */
export async function runCases(crearDriver, casos, { filtro } = {}) {
  const driver = await crearDriver();
  assertDriverShape(driver);
  const resultados = [];
  for (const caso of casos.filter((c) => pasaFiltro(c, filtro))) {
    const mediciones = [];
    const medir = (nombre, valor, unidad) => mediciones.push({ nombre, valor, unidad });
    const resultado = { id: caso.id, area: caso.area, titulo: caso.titulo, ok: true, mediciones };
    try {
      const refs = await driver.reset(structuredClone(SEMILLA));
      assertRefsShape(refs);
      await caso.run({ driver, refs, medir });
    } catch (e) {
      resultado.ok = false;
      resultado.error = e?.message ?? String(e);
    }
    resultados.push(resultado);
  }
  return resultados;
}
