import { CASOS_AUTORIZACION } from './autorizacion.mjs';
import { CASOS_CANALES } from './canales.mjs';
import { CASOS_CONTENIDO } from './contenido.mjs';
import { CASOS_ESTADOS } from './estados.mjs';
import { CASOS_EVENTOS } from './eventos.mjs';
import { CASOS_INTAKE } from './intake.mjs';
import { CASOS_MOTIVOS } from './motivos.mjs';
import { CASOS_PRIVACIDAD } from './privacidad.mjs';

export const CASOS = [
  ...CASOS_INTAKE,
  ...CASOS_ESTADOS,
  ...CASOS_MOTIVOS,
  ...CASOS_AUTORIZACION,
  ...CASOS_PRIVACIDAD,
  ...CASOS_EVENTOS,
  ...CASOS_CONTENIDO,
  ...CASOS_CANALES,
];

const ids = CASOS.map((c) => c.id);
if (new Set(ids).size !== ids.length) throw new Error('Identificadores de caso duplicados');

const ALCANCES = ['poc-1a', 'poc-1b', 'poc-3'];
for (const c of CASOS) {
  if (!ALCANCES.includes(c.alcance)) throw new Error(`Caso ${c.id} sin alcance válido (${ALCANCES.join('|')})`);
}
export { ALCANCES };
