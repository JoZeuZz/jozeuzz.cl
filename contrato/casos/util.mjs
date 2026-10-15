// Ayudas compartidas por los casos (no forman parte de la interfaz del driver).
import assert from 'node:assert/strict';
import { CENTINELAS, INEXISTENTE, payloadValido } from '../fixture.mjs';
import { contieneAlguno, esAceptado, esDenegado, esRechazoValidacion } from '../juicio.mjs';

let origenes = 0;
export const origenNuevo = () => `origen-sintetico-${++origenes}`;

export const aceptado = (res, ctx) =>
  assert.ok(esAceptado(res), `${ctx}: se esperaba 2xx y se obtuvo ${res?.status}`);
export const rechazado = (res, ctx) =>
  assert.ok(esRechazoValidacion(res), `${ctx}: se esperaba rechazo 400–429 y se obtuvo ${res?.status}`);
export const denegado = (res, ctx) =>
  assert.ok(esDenegado(res), `${ctx}: se esperaba denegación (401/403/404/3xx) y se obtuvo ${res?.status}`);

export async function abrirAdmin(driver) {
  const sesion = await driver.iniciarSesion();
  return { sesion, admin: driver.admin(sesion) };
}

export async function enviar(driver, payload, origen = origenNuevo()) {
  const envio = await driver.intake.preparar(payload);
  return driver.intake.enviar(envio, { origen });
}

export async function listar(admin, filtro = {}) {
  const r = await admin.listarSolicitudes(filtro);
  aceptado(r, 'listarSolicitudes');
  assert.ok(Array.isArray(r.data), 'listarSolicitudes debe devolver data como lista');
  return r.data;
}

export const contarSolicitudes = async (admin) => (await listar(admin)).length;
export const buscarPorNombre = async (admin, nombre) => (await listar(admin)).filter((s) => s.nombre === nombre);

export async function estadoDe(admin, ref) {
  const r = await admin.obtenerSolicitud(ref);
  aceptado(r, `obtenerSolicitud(${ref})`);
  return r.data;
}

export async function eventosDe(admin, ref) {
  const r = await admin.listarEventos(ref);
  aceptado(r, `listarEventos(${ref})`);
  assert.ok(Array.isArray(r.data), 'listarEventos debe devolver data como lista');
  return r.data;
}

/** Crea una solicitud por el intake público y devuelve su ref y su payload. */
export async function crearSolicitud(driver, admin, extra = {}) {
  const payload = { ...payloadValido(), ...extra };
  aceptado(await enviar(driver, payload), 'creación de solicitud por intake');
  const halladas = await buscarPorNombre(admin, payload.nombre);
  assert.equal(halladas.length, 1, 'la solicitud creada debe aparecer exactamente una vez en la bandeja');
  return { ref: halladas[0].id, payload };
}

/** Lleva una solicitud recibida al estado indicado por transiciones válidas. */
export async function llevarA(admin, ref, estado, { motivo = 'atendida', porGestion = false } = {}) {
  if (estado === 'recibida') return;
  if (estado === 'en_gestion' || porGestion) {
    aceptado(await admin.transicionar(ref, { a: 'en_gestion' }), 'transición a en_gestion');
  }
  if (estado === 'cerrada') {
    aceptado(await admin.transicionar(ref, { a: 'cerrada', motivo_cierre: motivo }), 'transición a cerrada');
  }
}

export async function solicitudEn(driver, admin, estado, opciones) {
  const { ref, payload } = await crearSolicitud(driver, admin);
  await llevarA(admin, ref, estado, opciones);
  return { ref, payload };
}

export const visible = (res, centinela) => esAceptado(res) && typeof res.body === 'string' && res.body.includes(centinela);

export function canalesPorTipo(driver, tipo) {
  const canales = driver.canalesPublicos.filter((c) => c.tipo === tipo);
  assert.ok(canales.length >= 1, `el driver debe exponer al menos un canal público de tipo «${tipo}»`);
  return canales;
}

export function canalesEscritura(driver) {
  assert.ok(driver.canalesEscritura.length >= 1, 'el driver debe declarar al menos un canal de escritura');
  return driver.canalesEscritura;
}

export function objetivosSemilla(refs, extra = {}) {
  return [
    { tipo: 'proyecto', ref: refs.proyecto_publicado },
    { tipo: 'proyecto', ref: refs.proyecto_borrador },
    { tipo: 'proyecto', ref: INEXISTENTE },
    { tipo: 'servicio', ref: refs.servicio_activo },
    { tipo: 'servicio', ref: refs.servicio_inactivo },
    { tipo: 'servicio', ref: INEXISTENTE },
    { tipo: 'solicitud', ref: refs.solicitud_sembrada },
    { tipo: 'solicitud', ref: INEXISTENTE },
    ...(extra.solicitudes ?? []).map((ref) => ({ tipo: 'solicitud', ref })),
    { tipo: 'evento', ref: INEXISTENTE },
    ...(extra.eventos ?? []).map((ref) => ({ tipo: 'evento', ref })),
    { tipo: 'medio', ref: refs.medio_publico },
    { tipo: 'medio', ref: refs.medio_privado },
    { tipo: 'medio', ref: INEXISTENTE },
    { tipo: 'lista-proyectos' },
    { tipo: 'lista-servicios' },
    { tipo: 'lista-solicitudes' },
    { tipo: 'sitemap' },
  ];
}

/** Todos los canales públicos × todos los objetivos. */
export async function barrer(driver, refs, extra = {}) {
  const salida = [];
  for (const canal of driver.canalesPublicos) {
    for (const objetivo of objetivosSemilla(refs, extra)) {
      salida.push({ canal: canal.nombre, objetivo, res: await canal.leer(objetivo) });
    }
  }
  return salida;
}

export const describir = ({ canal, objetivo }) => `${canal} ${objetivo.tipo}${objetivo.ref ? `:${objetivo.ref}` : ''}`;

/** Ninguna respuesta del barrido contiene los textos indicados. */
export function assertSinTexto(barrido, textos, ctx) {
  for (const b of barrido) {
    assert.ok(!contieneAlguno(b.res.body, textos), `${ctx}: ${describir(b)} (status ${b.res.status}) contiene un dato que debía ser privado`);
  }
}

export async function logsSinTexto(driver, textos, ctx) {
  const lineas = await driver.logs();
  assert.ok(Array.isArray(lineas), 'logs() debe devolver una lista de líneas');
  for (const linea of lineas) {
    assert.ok(!contieneAlguno(linea, textos), `${ctx}: una línea de log contiene datos privados: «${linea.slice(0, 80)}»`);
  }
}

/** Instantánea del estado observable por el administrador y por la web pública. */
export async function instantanea(driver, refs, admin) {
  const sols = (await listar(admin)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const eventos = {};
  for (const s of sols) eventos[s.id] = await eventosDe(admin, s.id);
  const proyectos = {};
  for (const slug of [refs.proyecto_publicado, refs.proyecto_borrador, 'snt-anon-nuevo']) {
    const r = await admin.obtenerProyecto(slug);
    proyectos[slug] = { status: r.status, data: r.data ?? null };
  }
  const publico = {};
  for (const canal of canalesPorTipo(driver, 'html')) {
    publico[canal.nombre] = {
      servicio_activo: visible(await canal.leer({ tipo: 'servicio', ref: refs.servicio_activo }), 'SNT-SERVICIO-ACTIVO'),
      servicio_inactivo: visible(await canal.leer({ tipo: 'servicio', ref: refs.servicio_inactivo }), 'SNT-SERVICIO-INACTIVO'),
      proyecto_publicado: visible(await canal.leer({ tipo: 'proyecto', ref: refs.proyecto_publicado }), 'SNT-TITULO-PUBLICADO'),
      proyecto_borrador: visible(await canal.leer({ tipo: 'proyecto', ref: refs.proyecto_borrador }), 'SNT-TITULO-BORRADOR'),
    };
  }
  return { sols, eventos, proyectos, publico };
}

export const PRIVADOS = CENTINELAS.privados;

/**
 * Instantánea del contenido observable sin depender de eventos ni de intake (alcance POC-1a):
 * solicitudes visibles al administrador, estado de los proyectos y visibilidad pública.
 */
export async function instantaneaContenido(driver, refs, admin) {
  const sols = (await listar(admin)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const proyectos = {};
  for (const slug of [refs.proyecto_publicado, refs.proyecto_borrador, 'snt-anon-nuevo']) {
    const r = await admin.obtenerProyecto(slug);
    proyectos[slug] = { status: r.status, data: r.data ?? null };
  }
  const publico = {};
  for (const canal of canalesPorTipo(driver, 'html')) {
    publico[canal.nombre] = {
      servicio_activo: visible(await canal.leer({ tipo: 'servicio', ref: refs.servicio_activo }), 'SNT-SERVICIO-ACTIVO'),
      servicio_inactivo: visible(await canal.leer({ tipo: 'servicio', ref: refs.servicio_inactivo }), 'SNT-SERVICIO-INACTIVO'),
      proyecto_publicado: visible(await canal.leer({ tipo: 'proyecto', ref: refs.proyecto_publicado }), 'SNT-TITULO-PUBLICADO'),
      proyecto_borrador: visible(await canal.leer({ tipo: 'proyecto', ref: refs.proyecto_borrador }), 'SNT-TITULO-BORRADOR'),
    };
  }
  return { sols, proyectos, publico };
}
