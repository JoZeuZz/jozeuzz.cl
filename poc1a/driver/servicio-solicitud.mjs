// Traduce el campo `servicio` de una solicitud REST de Payload al slug lógico que espera la batería.
// La REST devuelve el id numérico (depth=0) o un objeto poblado; la semilla guarda los ids como texto.
export function servicioDeSolicitud(d, idPorSlug) {
  if (d.servicio == null) return null;
  if (typeof d.servicio === 'object') return String(d.servicio.slug ?? d.servicio.id);
  const par = Object.entries(idPorSlug).find(([clave, id]) => clave.startsWith('servicio:') && String(id) === String(d.servicio));
  return par ? par[0].slice('servicio:'.length) : String(d.servicio);
}
