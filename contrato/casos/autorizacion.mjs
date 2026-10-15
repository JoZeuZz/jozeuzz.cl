import assert from 'node:assert/strict';
import { contieneAlguno } from '../juicio.mjs';
import { abrirAdmin, aceptado, canalesEscritura, denegado, eventosDe, instantanea, PRIVADOS, solicitudEn } from './util.mjs';

const caso = (id, titulo, run) => ({ id, area: 'autorizacion', titulo, run });

function operaciones(admin, refs) {
  const s = refs.solicitud_sembrada;
  return [
    ['listarSolicitudes', () => admin.listarSolicitudes({})],
    ['obtenerSolicitud', () => admin.obtenerSolicitud(s)],
    ['transicionar', () => admin.transicionar(s, { a: 'en_gestion' })],
    ['fijarObservaciones', () => admin.fijarObservaciones(s, 'SNT-HACK')],
    ['listarEventos', () => admin.listarEventos(s)],
    ['obtenerProyecto', () => admin.obtenerProyecto(refs.proyecto_borrador)],
    ['publicarProyecto', () => admin.publicarProyecto(refs.proyecto_borrador)],
    ['retirarProyecto', () => admin.retirarProyecto(refs.proyecto_publicado)],
  ];
}

async function sesionSinPrivilegios(driver, refs, sesion, nombre) {
  const { admin: adminReal } = await abrirAdmin(driver);
  const antes = await instantanea(driver, refs, adminReal);
  const intruso = driver.admin(sesion);
  for (const [op, ejecutar] of operaciones(intruso, refs)) {
    const res = await ejecutar();
    denegado(res, `${nombre}: ${op}`);
    assert.ok(
      !contieneAlguno(JSON.stringify(res.data ?? null), PRIVADOS),
      `${nombre}: ${op} devolvió datos privados en una respuesta denegada`,
    );
  }
  assert.deepEqual(await instantanea(driver, refs, adminReal), antes, `${nombre}: las operaciones denegadas no deben tener efectos`);
}

export const CASOS_AUTORIZACION = [
  caso('AU-01', 'sesión anónima: toda operación admin denegada y sin efectos', async ({ driver, refs }) => {
    await sesionSinPrivilegios(driver, refs, driver.sesionAnonima, 'anónima');
  }),
  caso('AU-02', 'sesión inválida: toda operación admin denegada y sin efectos', async ({ driver, refs }) => {
    await sesionSinPrivilegios(driver, refs, driver.sesionInvalida, 'inválida');
  }),
  caso('AU-03', 'sesión de administrador: las mismas operaciones aceptadas (control positivo)', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    for (const [op, ejecutar] of operaciones(admin, refs)) aceptado(await ejecutar(), `administrador: ${op}`);
  }),
  caso('AU-04', 'canales de escritura con sesión anónima: denegado y sin efectos', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    aceptado(await admin.transicionar(refs.solicitud_sembrada, { a: 'en_gestion' }), 'preparación: generar un evento');
    const [evento] = await eventosDe(admin, refs.solicitud_sembrada);
    assert.ok(evento, 'la preparación debe producir un evento');
    const antes = await instantanea(driver, refs, admin);
    const anon = driver.sesionAnonima;
    for (const canal of canalesEscritura(driver)) {
      const intentos = [
        ['crear proyecto', () => canal.crear(anon, { tipo: 'proyecto', datos: { slug: 'snt-anon-nuevo', titulo: 'SNT-ANON', estado: 'publicado' } })],
        ['actualizar solicitud', () => canal.actualizar(anon, { tipo: 'solicitud', ref: refs.solicitud_sembrada, cambios: { estado: 'cerrada', motivo_cierre: 'spam', observaciones_internas: 'SNT-HACK', nombre: 'SNT-HACK' } })],
        ['eliminar solicitud', () => canal.eliminar(anon, { tipo: 'solicitud', ref: refs.solicitud_sembrada })],
        ['actualizar proyecto borrador', () => canal.actualizar(anon, { tipo: 'proyecto', ref: refs.proyecto_borrador, cambios: { estado: 'publicado', titulo: 'SNT-HACK' } })],
        ['actualizar proyecto publicado', () => canal.actualizar(anon, { tipo: 'proyecto', ref: refs.proyecto_publicado, cambios: { titulo: 'SNT-HACK' } })],
        ['eliminar proyecto publicado', () => canal.eliminar(anon, { tipo: 'proyecto', ref: refs.proyecto_publicado })],
        ['eliminar proyecto borrador', () => canal.eliminar(anon, { tipo: 'proyecto', ref: refs.proyecto_borrador })],
        ['actualizar servicio activo', () => canal.actualizar(anon, { tipo: 'servicio', ref: refs.servicio_activo, cambios: { titulo: 'SNT-HACK' } })],
        ['actualizar servicio inactivo', () => canal.actualizar(anon, { tipo: 'servicio', ref: refs.servicio_inactivo, cambios: { activo: true } })],
        ['eliminar servicio', () => canal.eliminar(anon, { tipo: 'servicio', ref: refs.servicio_activo })],
        ['actualizar evento', () => canal.actualizar(anon, { tipo: 'evento', ref: evento.id, cambios: { actor: 'SNT-HACK' } })],
        ['eliminar evento', () => canal.eliminar(anon, { tipo: 'evento', ref: evento.id })],
      ];
      for (const [nombre, ejecutar] of intentos) {
        const res = await ejecutar();
        denegado(res, `[${canal.nombre}] ${nombre}`);
        assert.ok(!contieneAlguno(res.body, PRIVADOS), `[${canal.nombre}] ${nombre}: la respuesta denegada contiene datos privados`);
      }
    }
    assert.deepEqual(await instantanea(driver, refs, admin), antes, 'los intentos anónimos no deben tener efectos');
  }),
];
