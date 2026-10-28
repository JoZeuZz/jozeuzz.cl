import assert from 'node:assert/strict';
import { esAceptado } from '../juicio.mjs';
import { abrirAdmin, aceptado, canalesEscritura, crearSolicitud, estadoDe, eventosDe, rechazado, solicitudEn } from './util.mjs';

const caso = (id, titulo, run) => ({ id, area: 'eventos', titulo, run });
const CLAVES_EVENTO = ['actor', 'estado_anterior', 'estado_nuevo', 'fecha', 'id', 'motivo_cierre', 'solicitud'];

function verificarEvento(e, ref, anterior, nuevo, motivo, ctx) {
  assert.deepEqual(Object.keys(e).sort(), CLAVES_EVENTO, `${ctx}: el evento debe tener exactamente sus claves, sin texto libre`);
  assert.equal(e.solicitud, ref, `${ctx}: solicitud`);
  assert.equal(e.estado_anterior, anterior, `${ctx}: estado_anterior`);
  assert.equal(e.estado_nuevo, nuevo, `${ctx}: estado_nuevo`);
  assert.ok(typeof e.actor === 'string' && e.actor.trim() !== '', `${ctx}: actor no vacío`);
  assert.ok(typeof e.fecha === 'string' && !Number.isNaN(Date.parse(e.fecha)), `${ctx}: fecha válida`);
  assert.equal(e.motivo_cierre, motivo, `${ctx}: motivo_cierre (sólo al cerrar)`);
}

export const CASOS_EVENTOS = [
  caso('EV-01', 'crear una solicitud no genera eventos', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const { ref } = await crearSolicitud(driver, admin);
    assert.equal((await eventosDe(admin, ref)).length, 0, 'la creación no debe generar eventos');
  }),
  caso('EV-02', 'cada transición válida genera exactamente un evento correcto', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const obs = 'SNT-OBS-EV02';
    const rutas = [
      ['recibida → en_gestion', async (ref) => { aceptado(await admin.transicionar(ref, { a: 'en_gestion' }), 'transición'); return ['recibida', 'en_gestion', null]; }],
      ['recibida → cerrada', async (ref) => { aceptado(await admin.transicionar(ref, { a: 'cerrada', motivo_cierre: 'spam' }), 'transición'); return ['recibida', 'cerrada', 'spam']; }],
    ];
    for (const [nombre, ir] of rutas) {
      const { ref } = await crearSolicitud(driver, admin);
      aceptado(await admin.fijarObservaciones(ref, obs), 'observaciones');
      const [anterior, nuevo, motivo] = await ir(ref);
      const eventos = await eventosDe(admin, ref);
      assert.equal(eventos.length, 1, `${nombre}: debe haber exactamente un evento`);
      verificarEvento(eventos[0], ref, anterior, nuevo, motivo, nombre);
      assert.ok(!JSON.stringify(eventos[0]).includes(obs), `${nombre}: el evento no debe copiar texto libre`);
    }
    const { ref } = await solicitudEn(driver, admin, 'en_gestion');
    aceptado(await admin.transicionar(ref, { a: 'cerrada', motivo_cierre: 'atendida' }), 'en_gestion → cerrada');
    const eventos = await eventosDe(admin, ref);
    assert.equal(eventos.length, 2, 'dos transiciones válidas, dos eventos');
    verificarEvento(eventos[0], ref, 'recibida', 'en_gestion', null, 'primer evento');
    verificarEvento(eventos[1], ref, 'en_gestion', 'cerrada', 'atendida', 'en_gestion → cerrada');
  }),
  caso('EV-03', 'una transición rechazada no genera evento', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const cerrada = await solicitudEn(driver, admin, 'cerrada');
    const gestion = await solicitudEn(driver, admin, 'en_gestion');
    const nueva = await crearSolicitud(driver, admin);
    const intentos = [
      [cerrada.ref, { a: 'en_gestion' }],
      [cerrada.ref, { a: 'cerrada', motivo_cierre: 'spam' }],
      [gestion.ref, { a: 'recibida' }],
      [gestion.ref, { a: 'cerrada' }],
      [nueva.ref, { a: 'cerrada' }],
      [nueva.ref, { a: 'archivada' }],
    ];
    const antes = await Promise.all([cerrada, gestion, nueva].map((s) => eventosDe(admin, s.ref)));
    for (const [ref, args] of intentos) rechazado(await admin.transicionar(ref, args), JSON.stringify(args));
    const despues = await Promise.all([cerrada, gestion, nueva].map((s) => eventosDe(admin, s.ref)));
    assert.deepEqual(despues, antes, 'las transiciones rechazadas no deben generar eventos');
  }),
  caso('EV-04', 'fallo tras escribir el estado: sin 2xx, estado sin cambio y sin evento (atomicidad)', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const nueva = await crearSolicitud(driver, admin);
    const res = await admin.transicionar(nueva.ref, { a: 'en_gestion' }, { falla: 'tras-estado' });
    assert.ok(!esAceptado(res), `con fallo inyectado la respuesta no puede ser 2xx (${res.status})`);
    assert.equal((await estadoDe(admin, nueva.ref)).estado, 'recibida', 'el estado no debe cambiar');
    assert.equal((await eventosDe(admin, nueva.ref)).length, 0, 'no debe quedar evento');

    const gestion = await solicitudEn(driver, admin, 'en_gestion');
    const res2 = await admin.transicionar(gestion.ref, { a: 'cerrada', motivo_cierre: 'atendida' }, { falla: 'tras-estado' });
    assert.ok(!esAceptado(res2), `con fallo inyectado el cierre no puede ser 2xx (${res2.status})`);
    const s = await estadoDe(admin, gestion.ref);
    assert.equal(s.estado, 'en_gestion', 'el estado no debe cambiar');
    assert.equal(s.motivo_cierre, null, 'el motivo no debe guardarse');
    assert.equal((await eventosDe(admin, gestion.ref)).length, 1, 'sólo el evento previo');
  }),
  caso('EV-05', 'los canales genéricos no pueden actualizar ni eliminar un evento', async ({ driver }) => {
    const { sesion, admin } = await abrirAdmin(driver);
    for (const canal of canalesEscritura(driver)) {
      const { ref } = await solicitudEn(driver, admin, 'en_gestion');
      const antes = await eventosDe(admin, ref);
      assert.equal(antes.length, 1, 'preparación: un evento');
      const e = antes[0];
      const upd = await canal.actualizar(sesion, { tipo: 'evento', ref: e.id, cambios: { estado_nuevo: 'cerrada', actor: 'SNT-HACK', motivo_cierre: 'spam' } });
      assert.ok(!esAceptado(upd), `[${canal.nombre}] actualizar evento no debe aceptarse (${upd.status})`);
      const del = await canal.eliminar(sesion, { tipo: 'evento', ref: e.id });
      assert.ok(!esAceptado(del), `[${canal.nombre}] eliminar evento no debe aceptarse (${del.status})`);
      assert.deepEqual(await eventosDe(admin, ref), antes, `[${canal.nombre}] el evento debe quedar idéntico`);
    }
  }),
  caso('EV-06', 'eventos en orden cronológico y actor ajeno al payload', async ({ driver }) => {
    const { sesion, admin } = await abrirAdmin(driver);
    const falso = 'SNT-ACTOR-FALSO';
    const { ref } = await crearSolicitud(driver, admin);
    aceptado(await admin.transicionar(ref, { a: 'en_gestion', actor: falso }), 'en_gestion');
    aceptado(await admin.transicionar(ref, { a: 'cerrada', motivo_cierre: 'atendida', actor: falso }), 'cerrada');
    const otra = await crearSolicitud(driver, admin);
    for (const canal of canalesEscritura(driver)) {
      await canal.actualizar(sesion, { tipo: 'solicitud', ref: otra.ref, cambios: { estado: 'en_gestion', actor: falso } });
    }
    for (const r of [ref, otra.ref]) {
      const eventos = await eventosDe(admin, r);
      const fechas = eventos.map((e) => Date.parse(e.fecha));
      assert.ok(fechas.every((f, i) => i === 0 || f >= fechas[i - 1]), 'las fechas deben ser no decrecientes');
      for (const e of eventos) assert.ok(!JSON.stringify(e).includes(falso), 'el actor no puede venir del payload');
    }
    assert.equal((await eventosDe(admin, ref)).length, 2);
  }),
];
