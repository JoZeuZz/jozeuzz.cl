// Driver defectuoso (M01) para probar que la CLI sale con código 1 cuando falla algún caso.
import { crearDriverConOpciones } from './driver.mjs';

export default async function crearDriver() {
  return crearDriverConOpciones({ permitirReapertura: true });
}
