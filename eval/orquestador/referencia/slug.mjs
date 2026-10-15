// Implementación de referencia: sólo valida que las pruebas ocultas son satisfacibles.
export function slugify(texto) {
  if (typeof texto !== 'string') throw new TypeError('slugify espera una cadena');
  let slug = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-+$/, '');
  return slug;
}
