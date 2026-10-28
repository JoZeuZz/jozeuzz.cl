import assert from 'node:assert/strict';
import { ESTADOS } from '../fixture.mjs';
import { abrirAdmin, aceptado, canalesEscritura, crearSolicitud, estadoDe, eventosDe, llevarA, listar, rechazado, solicitudEn } from './util.mjs';

const caso = (id, titulo, run) => ({ id, area: 'estados', titulo, run });

function transicionRechazada(id, desde, hacia) {
  return caso(id, `${desde} → ${hacia} rechazada, el estado no cambia`, async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const { ref } = await solicitudEn(driver, admin, desde);
    const antes = await estadoDe(admin, ref);
    const eventosAntes = await eventosDe(admin, ref);
    const args = { a: hacia };
    if (hacia === 'cerrada') args.motivo_cierre = 'atendida'; // aísla la regla de estados de la de motivos
    rechazado(await admin.transicionar(ref, args), `${desde} → ${hacia}`);
    const despues = await estadoDe(admin, ref);
    assert.equal(despues.estado, antes.estado, 'el estado no debe cambiar');
    assert.equal(despues.motivo_cierre, antes.motivo_cierre, 'el motivo no debe cambiar');
    assert.equal((await eventosDe(admin, ref)).length, eventosAntes.length, 'no debe haber evento nuevo');
  });
}

export const CASOS_ESTADOS = [
  caso('ES-01', 'recibida → en_gestion aceptada', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    aceptado(await admin.transicionar(refs.solicitud_sembrada, { a: 'en_gestion' }), 'recibida → en_gestion');
    assert.equal((await estadoDe(admin, refs.solicitud_sembrada)).estado, 'en_gestion');
  }),
  caso('ES-02', 'recibida → cerrada con motivo aceptada (cierre directo)', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    aceptado(await admin.transicionar(refs.solicitud_sembrada, { a: 'cerrada', motivo_cierre: 'descartada' }), 'recibida → cerrada');
    const s = await estadoDe(admin, refs.solicitud_sembrada);
    assert.equal(s.estado, 'cerrada');
    assert.equal(s.motivo_cierre, 'descartada');
  }),
  caso('ES-03', 'en_gestion → cerrada con motivo aceptada', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const { ref } = await solicitudEn(driver, admin, 'en_gestion');
    aceptado(await admin.transicionar(ref, { a: 'cerrada', motivo_cierre: 'atendida' }), 'en_gestion → cerrada');
    assert.equal((await estadoDe(admin, ref)).estado, 'cerrada');
  }),
  transicionRechazada('ES-04', 'en_gestion', 'recibida'),
  transicionRechazada('ES-05', 'cerrada', 'en_gestion'),
  transicionRechazada('ES-06', 'cerrada', 'recibida'),
  transicionRechazada('ES-07', 'cerrada', 'cerrada'),
  transicionRechazada('ES-08', 'recibida', 'recibida'),
  caso('ES-09', 'estado desconocido (archivada) rechazado', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    for (const desde of ['recibida', 'en_gestion']) {
      const { ref } = await solicitudEn(driver, admin, desde);
      rechazado(await admin.transicionar(ref, { a: 'archivada' }), `${desde} → archivada`);
      rechazado(await admin.transicionar(ref, { a: 'archivada', motivo_cierre: 'atendida' }), `${desde} → archivada con motivo`);
      assert.equal((await estadoDe(admin, ref)).estado, desde, 'el estado no debe cambiar');
    }
  }),
  caso('ES-10', 'los canales genéricos de escritura no saltan las reglas de estado', async ({ driver }) => {
    const { sesion, admin } = await abrirAdmin(driver);
    for (const canal of canalesEscritura(driver)) {
      const cerrada = await solicitudEn(driver, admin, 'cerrada');
      const eventosCerrada = await eventosDe(admin, cerrada.ref);
      await canal.actualizar(sesion, { tipo: 'solicitud', ref: cerrada.ref, cambios: { estado: 'recibida' } });
      const c = await estadoDe(admin, cerrada.ref);
      assert.equal(c.estado, 'cerrada', `[${canal.nombre}] no debe reabrir una solicitud cerrada`);
      assert.equal(c.motivo_cierre, 'atendida', `[${canal.nombre}] el motivo no debe cambiar`);
      assert.equal((await eventosDe(admin, cerrada.ref)).length, eventosCerrada.length, `[${canal.nombre}] ningún cambio de estado sin su evento`);

      const { ref } = await crearSolicitud(driver, admin);
      await canal.actualizar(sesion, { tipo: 'solicitud', ref, cambios: { estado: 'cerrada' } });
      const r = await estadoDe(admin, ref);
      assert.equal(r.estado, 'recibida', `[${canal.nombre}] no debe cerrar sin motivo`);
      assert.equal(r.motivo_cierre, null, `[${canal.nombre}] no debe fijar motivo`);
      assert.equal((await eventosDe(admin, ref)).length, 0, `[${canal.nombre}] ningún cambio de estado sin su evento`);
    }
  }),
  caso('ES-11', 'la bandeja filtra por estado y sólo devuelve ese estado', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    const gestion = await solicitudEn(driver, admin, 'en_gestion');
    const cerrada = await solicitudEn(driver, admin, 'cerrada');
    const esperado = { recibida: refs.solicitud_sembrada, en_gestion: gestion.ref, cerrada: cerrada.ref };
    for (const estado of ESTADOS) {
      const filas = await listar(admin, { estado });
      assert.ok(filas.every((s) => s.estado === estado), `el filtro ${estado} devolvió otro estado`);
      assert.deepEqual(filas.map((s) => s.id), [esperado[estado]], `el filtro ${estado} debe devolver exactamente su solicitud`);
    }
  }),
];
