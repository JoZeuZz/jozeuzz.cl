// Implementación defectuosa (no cumple R-2): las pruebas ocultas deben detectarla.
export function slugify(texto) {
  if (typeof texto !== 'string') throw new TypeError('slugify espera una cadena');
  return texto.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}
