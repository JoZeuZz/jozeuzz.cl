// Mutantes del oráculo: cada uno rompe una regla y la batería debe detectarlo con sus casos.
import { crearDriverConOpciones } from './driver.mjs';

const m = (id, descripcion, detectadoPor, opciones) => ({
  id,
  descripcion,
  detectadoPor,
  crearDriver: async () => crearDriverConOpciones(opciones),
});

export const MUTANTES = [
  m('M01', 'permite cerrada → en_gestion', ['ES-05'], { permitirReapertura: true }),
  m('M02', 'cierra sin motivo', ['MO-01'], { cerrarSinMotivo: true }),
  m('M03', 'acepta motivo fuera de la lista', ['MO-02'], { motivoLibre: true }),
  m('M04', 'intake guarda el estado del payload', ['IN-08'], { intakeGuardaEstado: true }),
  m('M05', 'el doble envío crea dos registros', ['IN-09'], { dobleEnvioDuplica: true }),
  m('M06', 'acepta servicio inactivo', ['IN-03'], { servicioInactivoAceptado: true }),
  m('M07', 'logs con PII del intake', ['IN-12'], { logPII: true }),
  m('M08', 'el canal api expone solicitudes', ['PR-01'], { apiExponeSolicitudes: true }),
  m('M09', 'log con observaciones al fijarlas', ['PR-02', 'PR-05'], { logObservaciones: true }),
  m('M10', 'borrador en el sitemap', ['CO-04'], { borradorEnSitemap: true }),
  m('M11', 'borrador responde 403 frente a 404 del inexistente', ['CO-02'], { borrador403: true }),
  m('M12', 'medio privado accesible', ['PR-04'], { medioPrivadoAccesible: true }),
  m('M13', 'transición no atómica con falla', ['EV-04'], { noAtomico: true }),
  m('M14', 'evento modificable por el canal genérico', ['EV-05'], { eventoModificable: true }),
  m('M15', 'transición sin evento', ['EV-02'], { sinEvento: true }),
  m('M16', 'acepta sesión inválida', ['AU-02'], { aceptaSesionInvalida: true }),
  m('M17', 'canal genérico cambia el estado sin reglas', ['ES-10'], { genericoSinReglas: true }),
  m('M18', 'la creación genera evento', ['EV-01'], { crearGeneraEvento: true }),
  m('M19', 'retirar borra el proyecto', ['CO-06'], { retirarBorra: true }),
  m('M20', 'servicio inactivo visible', ['CO-03'], { servicioInactivoVisible: true }),
  m('M21', 'sin límite de envíos', ['IN-11'], { sinLimite: true }),
  m('M22', 'la respuesta del intake incluye el nombre', ['IN-01'], { respuestaIncluyeNombre: true }),
];
