import assert from 'node:assert/strict';
import { INEXISTENTE, payloadValido } from '../fixture.mjs';
import { esAceptado, esExpuesto } from '../juicio.mjs';
import { abrirAdmin, aceptado, assertSinTexto, barrer, crearSolicitud, describir, enviar, eventosDe, logsSinTexto, PRIVADOS } from './util.mjs';

const caso = (id, titulo, run, alcance = 'poc-1b') => ({ id, area: 'privacidad', titulo, run, alcance });

export const CASOS_PRIVACIDAD = [
  caso('PR-01', 'ningún canal público expone una solicitud (por ref ni en lista)', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    const nueva = await crearSolicitud(driver, admin);
    const datosNuevos = [nueva.payload.nombre, nueva.payload.contacto, nueva.payload.descripcion, nueva.payload.tipo_equipo];
    for (const canal of driver.canalesPublicos) {
      for (const objetivo of [
        { tipo: 'solicitud', ref: refs.solicitud_sembrada },
        { tipo: 'solicitud', ref: nueva.ref },
        { tipo: 'lista-solicitudes' },
      ]) {
        const res = await canal.leer(objetivo);
        const etiqueta = describir({ canal: canal.nombre, objetivo });
        assert.ok(!esExpuesto(res, [...PRIVADOS, ...datosNuevos]), `${etiqueta} expone una solicitud (status ${res.status})`);
        assertSinTexto([{ canal: canal.nombre, objetivo, res }], [...PRIVADOS, ...datosNuevos], 'PR-01');
      }
    }
  }),
  caso('PR-02', 'observaciones_internas: sólo el admin las ve; ni canales públicos ni logs', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    const texto = 'SNT-OBS-NUEVA-PR02';
    aceptado(await admin.fijarObservaciones(refs.solicitud_sembrada, texto), 'fijarObservaciones');
    const r = await admin.obtenerSolicitud(refs.solicitud_sembrada);
    aceptado(r, 'obtenerSolicitud');
    assert.equal(r.data.observaciones_internas, texto, 'el admin debe leer lo que fijó');
    assertSinTexto(await barrer(driver, refs), [texto, 'SNT-OBS-INTERNA'], 'PR-02');
    await logsSinTexto(driver, [texto, 'SNT-OBS-INTERNA'], 'PR-02');
  }),
  caso('PR-03', 'ningún canal público expone eventos', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    aceptado(await admin.transicionar(refs.solicitud_sembrada, { a: 'en_gestion' }), 'preparación');
    const [evento] = await eventosDe(admin, refs.solicitud_sembrada);
    assert.ok(evento, 'la preparación debe producir un evento');
    for (const canal of driver.canalesPublicos) {
      for (const ref of [evento.id, INEXISTENTE]) {
        const res = await canal.leer({ tipo: 'evento', ref });
        const marcas = ['estado_anterior', 'estado_nuevo', evento.id];
        const expuesto = esAceptado(res) && marcas.some((m) => res.body.includes(m));
        assert.ok(!expuesto, `${canal.nombre} expone un evento (status ${res.status})`);
      }
    }
  }),
  caso('PR-04', 'medio privado no expuesto; el público accesible en algún canal medio', async ({ driver, refs }) => {
    const medios = driver.canalesPublicos.filter((c) => c.tipo === 'medio');
    assert.ok(medios.length >= 1, 'el driver debe exponer al menos un canal de tipo medio');
    for (const canal of driver.canalesPublicos) {
      const res = await canal.leer({ tipo: 'medio', ref: refs.medio_privado });
      assert.ok(!esExpuesto(res, ['SNT-MEDIO-PRIVADO']), `${canal.nombre} expone el medio privado (status ${res.status})`);
    }
    for (const canal of medios) {
      const res = await canal.leer({ tipo: 'medio', ref: refs.medio_privado });
      assert.ok(!esAceptado(res), `${canal.nombre}: el medio privado no debe responder 2xx (status ${res.status})`);
    }
    const publicos = await Promise.all(medios.map((c) => c.leer({ tipo: 'medio', ref: refs.medio_publico })));
    assert.ok(
      publicos.some((r) => esAceptado(r) && r.body.includes('SNT-MEDIO-PUBLICO')),
      'el medio público debe ser accesible (2xx con su centinela) en algún canal medio',
    );
  }, 'poc-1a'),
  caso('PR-05', 'los logs tras operaciones administrativas no contienen observaciones ni PII', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    const nueva = await crearSolicitud(driver, admin);
    const obs = 'SNT-OBS-PR05';
    aceptado(await admin.fijarObservaciones(refs.solicitud_sembrada, obs), 'fijarObservaciones');
    aceptado(await admin.fijarObservaciones(nueva.ref, obs), 'fijarObservaciones');
    aceptado(await admin.transicionar(nueva.ref, { a: 'en_gestion' }), 'transicionar');
    aceptado(await admin.transicionar(nueva.ref, { a: 'cerrada', motivo_cierre: 'atendida' }), 'cerrar');
    await admin.obtenerSolicitud(refs.solicitud_sembrada);
    await admin.listarSolicitudes({});
    aceptado(await admin.publicarProyecto(refs.proyecto_borrador), 'publicar');
    const p = nueva.payload;
    await logsSinTexto(driver, [...PRIVADOS, obs, p.nombre, p.contacto, p.tipo_equipo, p.descripcion], 'PR-05');
  }),
  caso('PR-06', 'barrido: todos los canales × todos los objetivos sin centinelas privados', async ({ driver, refs, medir }) => {
    const { admin } = await abrirAdmin(driver);
    const nueva = await crearSolicitud(driver, admin);
    aceptado(await admin.transicionar(nueva.ref, { a: 'en_gestion' }), 'preparación');
    const [evento] = await eventosDe(admin, nueva.ref);
    const barrido = await barrer(driver, refs, { solicitudes: [nueva.ref], eventos: [evento.id] });
    medir('sondeos', barrido.length, 'lecturas');
    assertSinTexto(barrido, [...PRIVADOS, nueva.payload.nombre, nueva.payload.contacto, nueva.payload.descripcion], 'PR-06');
  }),
  caso('PR-07', 'barrido de la semilla: ningún canal × objetivo contiene un centinela privado', async ({ driver, refs, medir }) => {
    const barrido = await barrer(driver, refs);
    medir('sondeos', barrido.length, 'lecturas');
    assertSinTexto(barrido, PRIVADOS, 'PR-07');
  }, 'poc-1a'),
];

