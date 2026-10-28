// Juicio: lo decide la batería, nunca el driver.

/** Denegado: 401, 403, 404 o redirección 3xx (el «estado no cambió» lo comprueba cada caso). */
export function esDenegado(res) {
  const s = res?.status;
  return s === 401 || s === 403 || s === 404 || (s >= 300 && s <= 399);
}

/** Aceptado: 2xx. */
export function esAceptado(res) {
  const s = res?.status;
  return s >= 200 && s <= 299;
}

/** Rechazo de validación: 4xx entre 400 y 429 (que no se creó/cambió nada lo comprueba cada caso). */
export function esRechazoValidacion(res) {
  const s = res?.status;
  return s >= 400 && s <= 429;
}

/** true si el texto contiene alguno de los centinelas. */
export function contieneAlguno(texto, centinelas) {
  return typeof texto === 'string' && centinelas.some((c) => texto.includes(c));
}

/** Primer centinela contenido en el texto, o null. */
export function cualCentinela(texto, centinelas) {
  if (typeof texto !== 'string') return null;
  return centinelas.find((c) => texto.includes(c)) ?? null;
}

/** Expuesto: 2xx y el cuerpo contiene un centinela privado. */
export function esExpuesto(res, privados) {
  return esAceptado(res) && contieneAlguno(res.body, privados);
}
