// Comprobación de que los logs recogidos contienen el registro del intake real. Sin ella, IN-12 («los logs no
// contienen datos privados») pasaría en vacío si logs() devolviera una lista que no incluye al servicio.
export const MARCA_EVENTO_INTAKE = '"evento":"intake"'

/**
 * Devuelve las líneas tal cual. Si el driver ya envió al intake desde el último reset (`envios > 0`) y ninguna
 * línea lleva `"evento":"intake"`, lanza: el log no observa al servicio. Sin envíos no se exige nada (PR-02 lee logs
 * sin haber enviado).
 */
export function exigirEventoIntake(lineas, envios) {
  if (envios > 0 && !lineas.some((linea) => linea.includes(MARCA_EVENTO_INTAKE))) {
    throw new Error(`logs() no contiene ninguna línea con ${MARCA_EVENTO_INTAKE} tras ${envios} envío(s) al intake: la comprobación de logs sería vacía`)
  }
  return lineas
}
