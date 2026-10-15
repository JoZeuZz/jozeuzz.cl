// Errores propios de la batería de contrato.

/**
 * Un driver lo lanza cuando una operación aún no está implementada en esa POC.
 * El ejecutor lo distingue de un fallo real: es «no-implementado», no un defecto del stack.
 */
export class NoImplementado extends Error {
  code = 'CONTRATO_NO_IMPLEMENTADO';
  constructor(detalle = '') {
    super(`no implementado${detalle ? `: ${detalle}` : ''}`);
    this.name = 'NoImplementado';
  }
}

export const esNoImplementado = (e) => e?.code === 'CONTRATO_NO_IMPLEMENTADO';
