import assert from 'node:assert/strict';
import { MOTIVOS } from '../fixture.mjs';
import { esAceptado } from '../juicio.mjs';
import { abrirAdmin, aceptado, crearSolicitud, estadoDe, listar, rechazado, solicitudEn } from './util.mjs';

const caso = (id, titulo, run, alcance = 'poc-1b') => ({ id, area: 'motivos', titulo, run, alcance });

async function sinCambio(admin, ref, antes, ctx) {
  const d = await estadoDe(admin, ref);
  assert.equal(d.estado, antes.estado, `${ctx}: el estado no debe cambiar`);
  assert.equal(d.motivo_cierre, antes.motivo_cierre, `${ctx}: el motivo no debe cambiar`);
}

export const CASOS_MOTIVOS = [
  caso('MO-01', 'cerrar sin motivo: rechazado, estado sin cambio', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    for (const desde of ['recibida', 'en_gestion']) {
      for (const args of [{ a: 'cerrada' }, { a: 'cerrada', motivo_cierre: null }]) {
        const { ref } = await solicitudEn(driver, admin, desde);
        const antes = await estadoDe(admin, ref);
        rechazado(await admin.transicionar(ref, args), `cerrar desde ${desde} con ${JSON.stringify(args)}`);
        await sinCambio(admin, ref, antes, `desde ${desde}`);
      }
    }
  }),
  caso('MO-02', 'motivo fuera de la lista: rechazado', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    for (const motivo of ['otro', '', 'ATENDIDA', 'cerrada']) {
      const { ref } = await crearSolicitud(driver, admin);
      const antes = await estadoDe(admin, ref);
      rechazado(await admin.transicionar(ref, { a: 'cerrada', motivo_cierre: motivo }), `motivo «${motivo}»`);
      await sinCambio(admin, ref, antes, `motivo «${motivo}»`);
    }
  }),
  caso('MO-03', 'cada uno de los 4 motivos se acepta y queda guardado', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    for (const motivo of MOTIVOS) {
      const { ref } = await crearSolicitud(driver, admin);
      aceptado(await admin.transicionar(ref, { a: 'cerrada', motivo_cierre: motivo }), `cerrar con ${motivo}`);
      const s = await estadoDe(admin, ref);
      assert.equal(s.estado, 'cerrada');
      assert.equal(s.motivo_cierre, motivo, 'el motivo debe quedar guardado');
    }
  }),
  caso('MO-04', 'recibida → en_gestion con motivo: rechazo, o aceptación con motivo nulo', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const { ref } = await crearSolicitud(driver, admin);
    const res = await admin.transicionar(ref, { a: 'en_gestion', motivo_cierre: 'atendida' });
    const s = await estadoDe(admin, ref);
    if (esAceptado(res)) {
      assert.equal(s.estado, 'en_gestion');
      assert.equal(s.motivo_cierre, null, 'un motivo de cierre no puede guardarse en una solicitud abierta');
    } else {
      rechazado(res, 'en_gestion con motivo');
      assert.equal(s.estado, 'recibida', 'rechazado: el estado no debe cambiar');
      assert.equal(s.motivo_cierre, null);
    }
  }),
  caso('MO-05', 'filtrar por motivo devuelve sólo ese motivo', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const porMotivo = {};
    for (const motivo of MOTIVOS) porMotivo[motivo] = (await solicitudEn(driver, admin, 'cerrada', { motivo })).ref;
    await solicitudEn(driver, admin, 'en_gestion');
    for (const motivo of MOTIVOS) {
      const filas = await listar(admin, { motivo_cierre: motivo });
      assert.ok(filas.every((s) => s.motivo_cierre === motivo), `el filtro ${motivo} devolvió otro motivo`);
      assert.deepEqual(filas.map((s) => s.id), [porMotivo[motivo]], `el filtro ${motivo} debe devolver exactamente su solicitud`);
    }
  }),
];
