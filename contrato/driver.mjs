// Interfaz normativa del driver de la batería de contrato.
// Cada POC implementa un módulo con `export default async function crearDriver()`.
//
// Respuesta cruda:          Res = { status: number, body: string }
// Respuesta administrativa: { status: number, data?: any }
//
// @typedef {{ status: number, body: string }} Res
// @typedef {{ tipo: 'proyecto'|'servicio'|'solicitud'|'evento'|'medio'|'lista-proyectos'|'lista-servicios'|'lista-solicitudes'|'sitemap', ref?: string }} Objetivo
// @typedef {{ nombre: string, tipo: 'html'|'api'|'graphql'|'accion'|'medio'|'sitemap', leer(objetivo: Objetivo): Promise<Res> }} Canal
//   Un canal que no soporta un objetivo devuelve un 404/405 sin cuerpo útil.
// @typedef {{ nombre: string, tipo: string,
//             crear(sesion: any, a: { tipo: string, datos: object }): Promise<Res>,
//             actualizar(sesion: any, a: { tipo: string, ref: string, cambios: object }): Promise<Res>,
//             eliminar(sesion: any, a: { tipo: string, ref: string }): Promise<Res> }} CanalEscritura
// @typedef {{ id, nombre, contacto, tipo_equipo, descripcion, servicio: string|null, estado: 'recibida'|'en_gestion'|'cerrada',
//             motivo_cierre: string|null, observaciones_internas: string, creada_en: string }} Solicitud
// @typedef {{ id, solicitud, estado_anterior, estado_nuevo, actor, fecha, motivo_cierre: string|null }} Evento   // ningún otro campo
// @typedef {{ slug: string, titulo: string, estado: 'borrador'|'publicado'|'retirado' }} Proyecto
//
// @typedef {Object} Admin
// listarSolicitudes({ estado?, motivo_cierre? }) → { status, data?: Solicitud[] }
// obtenerSolicitud(ref) → { status, data?: Solicitud }
// transicionar(ref, { a, motivo_cierre? }, { falla?: 'tras-estado' }) → { status }
//     falla: el driver inyecta un fallo tras escribir el estado y antes de confirmar el evento
// fijarObservaciones(ref, texto) → { status }
// listarEventos(ref) → { status, data?: Evento[] }
// obtenerProyecto(ref) → { status, data?: Proyecto }, publicarProyecto(ref) → { status }, retirarProyecto(ref) → { status }
//
// @typedef {Object} Driver
// nombre: string
// reset(semilla) → Promise<Refs>      borra todo y carga la semilla; Refs: ver CLAVES_REFS en fixture.mjs
// canalesPublicos: Canal[]            TODOS los canales anónimos de lectura del stack
// canalesEscritura: CanalEscritura[]  TODOS los canales genéricos de escritura (REST, GraphQL, acciones de servidor…)
// iniciarSesion() → Promise<Sesion>   sesión del único administrador
// sesionAnonima, sesionInvalida       sesión sin credenciales / token falsificado o caducado
// intake: { limite: { max }, preparar(payload) → Promise<Envio>, enviar(envio, { origen }) → Promise<Res> }
//     reenviar el mismo `envio` simula un doble envío
// admin(sesion) → Admin
// logs() → Promise<string[]>          líneas de log producidas desde el último reset

import { CLAVES_REFS } from './fixture.mjs';

const TIPOS_CANAL = ['html', 'api', 'graphql', 'accion', 'medio', 'sitemap'];

function exigir(condicion, miembro) {
  if (!condicion) throw new Error(`Driver inválido: falta o es incorrecto «${miembro}»`);
}

/** Falla con un mensaje claro si falta algún miembro de la interfaz. */
export function assertDriverShape(driver) {
  exigir(driver && typeof driver === 'object', 'driver (objeto)');
  exigir(typeof driver.nombre === 'string' && driver.nombre !== '', 'nombre');
  exigir(typeof driver.reset === 'function', 'reset');
  exigir(Array.isArray(driver.canalesPublicos) && driver.canalesPublicos.length > 0, 'canalesPublicos (lista no vacía)');
  driver.canalesPublicos.forEach((c, i) => {
    exigir(typeof c?.nombre === 'string', `canalesPublicos[${i}].nombre`);
    exigir(TIPOS_CANAL.includes(c.tipo), `canalesPublicos[${i}].tipo (uno de ${TIPOS_CANAL.join('|')})`);
    exigir(typeof c.leer === 'function', `canalesPublicos[${i}].leer`);
  });
  exigir(Array.isArray(driver.canalesEscritura) && driver.canalesEscritura.length > 0, 'canalesEscritura (lista no vacía)');
  driver.canalesEscritura.forEach((c, i) => {
    exigir(typeof c?.nombre === 'string', `canalesEscritura[${i}].nombre`);
    for (const m of ['crear', 'actualizar', 'eliminar']) {
      exigir(typeof c[m] === 'function', `canalesEscritura[${i}].${m}`);
    }
  });
  exigir(typeof driver.iniciarSesion === 'function', 'iniciarSesion');
  exigir(driver.sesionAnonima !== undefined, 'sesionAnonima');
  exigir(driver.sesionInvalida !== undefined, 'sesionInvalida');
  exigir(driver.intake && typeof driver.intake === 'object', 'intake');
  exigir(Number.isInteger(driver.intake.limite?.max) && driver.intake.limite.max > 0, 'intake.limite.max (entero > 0)');
  exigir(typeof driver.intake.preparar === 'function', 'intake.preparar');
  exigir(typeof driver.intake.enviar === 'function', 'intake.enviar');
  exigir(typeof driver.admin === 'function', 'admin');
  exigir(typeof driver.logs === 'function', 'logs');
  return true;
}

/** Comprueba que reset() devolvió todas las claves lógicas. */
export function assertRefsShape(refs) {
  for (const k of CLAVES_REFS) exigir(typeof refs?.[k] === 'string', `refs.${k}`);
  return true;
}
