import assert from 'node:assert/strict';
import { INEXISTENTE } from '../fixture.mjs';
import { esAceptado } from '../juicio.mjs';
import { abrirAdmin, aceptado, assertSinTexto, barrer, canalesPorTipo, visible } from './util.mjs';

const caso = (id, titulo, run) => ({ id, area: 'contenido', titulo, run });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const T_PUB = 'SNT-TITULO-PUBLICADO';
const T_BOR = 'SNT-TITULO-BORRADOR';

export const CASOS_CONTENIDO = [
  caso('CO-01', 'proyecto publicado visible anónimamente en cada canal html y su lista', async ({ driver, refs }) => {
    for (const canal of canalesPorTipo(driver, 'html')) {
      const det = await canal.leer({ tipo: 'proyecto', ref: refs.proyecto_publicado });
      assert.ok(visible(det, T_PUB), `[${canal.nombre}] el detalle del publicado debe ser 2xx con su título (status ${det.status})`);
      const lista = await canal.leer({ tipo: 'lista-proyectos' });
      assert.ok(visible(lista, T_PUB), `[${canal.nombre}] la lista debe incluir el publicado (status ${lista.status})`);
    }
  }),
  caso('CO-02', 'borrador invisible en todo canal y respondido igual que un slug inexistente', async ({ driver, refs }) => {
    const barrido = await barrer(driver, refs);
    assertSinTexto(barrido, ['SNT-TITULO-BORRADOR', 'SNT-RESUMEN-BORRADOR'], 'CO-02');
    for (const canal of driver.canalesPublicos) {
      const borrador = await canal.leer({ tipo: 'proyecto', ref: refs.proyecto_borrador });
      const inexistente = await canal.leer({ tipo: 'proyecto', ref: INEXISTENTE });
      assert.ok(!esAceptado(borrador), `[${canal.nombre}] el borrador no debe responder 2xx`);
      assert.equal(borrador.status, inexistente.status, `[${canal.nombre}] el borrador (${borrador.status}) debe responder como un inexistente (${inexistente.status})`);
    }
  }),
  caso('CO-03', 'servicio activo visible en algún canal html; el inactivo en ninguno', async ({ driver, refs }) => {
    const html = canalesPorTipo(driver, 'html');
    const activos = [];
    for (const canal of html) {
      activos.push(visible(await canal.leer({ tipo: 'servicio', ref: refs.servicio_activo }), 'SNT-SERVICIO-ACTIVO'));
    }
    assert.ok(activos.some(Boolean), 'el servicio activo debe ser visible en algún canal html');
    const barrido = await barrer(driver, refs);
    assertSinTexto(barrido, ['SNT-SERVICIO-INACTIVO', 'SNT-DESC-SERVICIO-INACTIVO'], 'CO-03');
    for (const canal of html) {
      const res = await canal.leer({ tipo: 'servicio', ref: refs.servicio_inactivo });
      assert.ok(!esAceptado(res), `[${canal.nombre}] el servicio inactivo no debe responder 2xx`);
    }
  }),
  caso('CO-04', 'sitemap: incluye el publicado y excluye borrador y servicio inactivo', async ({ driver, refs }) => {
    for (const canal of canalesPorTipo(driver, 'sitemap')) {
      const res = await canal.leer({ tipo: 'sitemap' });
      assert.ok(esAceptado(res), `[${canal.nombre}] el sitemap debe responder 2xx (${res.status})`);
      assert.ok(res.body.includes(refs.proyecto_publicado), 'el sitemap debe incluir el slug del proyecto publicado');
      assert.ok(!res.body.includes(refs.proyecto_borrador), 'el sitemap no debe incluir el borrador');
      assert.ok(!res.body.includes(refs.servicio_inactivo), 'el sitemap no debe incluir el servicio inactivo');
    }
  }),
  caso('CO-05', 'publicar el borrador: aparece en todos los canales html (propagación medida)', async ({ driver, refs, medir }) => {
    const { admin } = await abrirAdmin(driver);
    const canales = canalesPorTipo(driver, 'html');
    const limite = Number(process.env.CONTRATO_TIMEOUT_PROPAGACION_MS) || 300_000;
    for (const c of canales) {
      assert.ok(!visible(await c.leer({ tipo: 'proyecto', ref: refs.proyecto_borrador }), T_BOR), `[${c.nombre}] precondición: el borrador no debe verse`);
    }
    const inicio = performance.now();
    aceptado(await admin.publicarProyecto(refs.proyecto_borrador), 'publicarProyecto');
    for (;;) {
      const lecturas = await Promise.all(canales.map((c) => c.leer({ tipo: 'proyecto', ref: refs.proyecto_borrador })));
      if (lecturas.every((r) => visible(r, T_BOR))) break;
      assert.ok(performance.now() - inicio <= limite, `el proyecto publicado no apareció en ${limite} ms`);
      await esperar(250);
    }
    const ms = Math.round(performance.now() - inicio);
    medir('propagacion_ms', ms, 'ms');
    medir('objetivo_provisional_ms', 60_000, 'ms');
    medir('supera_objetivo_provisional', ms > 60_000 ? 1 : 0, 'bool');
  }),
  caso('CO-06', 'retirar el publicado: invisible en todos los canales y no borrado', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    aceptado(await admin.retirarProyecto(refs.proyecto_publicado), 'retirarProyecto');
    for (const canal of canalesPorTipo(driver, 'html')) {
      assert.ok(!visible(await canal.leer({ tipo: 'proyecto', ref: refs.proyecto_publicado }), T_PUB), `[${canal.nombre}] el retirado no debe verse por ref`);
      assert.ok(!visible(await canal.leer({ tipo: 'lista-proyectos' }), T_PUB), `[${canal.nombre}] el retirado no debe estar en la lista`);
    }
    for (const canal of canalesPorTipo(driver, 'sitemap')) {
      assert.ok(!(await canal.leer({ tipo: 'sitemap' })).body.includes(refs.proyecto_publicado), 'el retirado no debe estar en el sitemap');
    }
    const r = await admin.obtenerProyecto(refs.proyecto_publicado);
    aceptado(r, 'el admin debe seguir obteniendo el proyecto retirado');
    assert.equal(r.data?.slug, refs.proyecto_publicado);
    assert.equal(r.data?.estado, 'retirado', 'retirar no borra: el estado pasa a retirado');
  }),
  caso('CO-07', 'el medio privado responde igual que uno inexistente', async ({ driver, refs }) => {
    for (const canal of canalesPorTipo(driver, 'medio')) {
      const priv = await canal.leer({ tipo: 'medio', ref: refs.medio_privado });
      const inex = await canal.leer({ tipo: 'medio', ref: INEXISTENTE });
      assert.equal(priv.status, inex.status, `[${canal.nombre}] status del privado (${priv.status}) distinto del inexistente (${inex.status})`);
      assert.equal(
        priv.body.replaceAll(refs.medio_privado, '{ref}'),
        inex.body.replaceAll(INEXISTENTE, '{ref}'),
        `[${canal.nombre}] el cuerpo del privado debe ser igual al del inexistente`,
      );
    }
  }),
];
