import assert from 'node:assert/strict';
import { PRIVADOS, objetivosSemilla } from './util.mjs';
import { CENTINELAS } from '../fixture.mjs';
import { contieneAlguno, esAceptado } from '../juicio.mjs';

const caso = (id, titulo, run, alcance = 'poc-1a') => ({ id, area: 'canales', titulo, run, alcance });

const TODOS_CENTINELAS = [...CENTINELAS.privados, ...CENTINELAS.publicos];
const INTROSPECCION = JSON.stringify({ query: '{__schema{types{name}}}' });
const BUSQUEDA = JSON.stringify({ query: '{ Proyectos { docs { slug titulo } } }' });

/** Sondeos HTTP propios de la batería sobre las rutas habituales de GraphQL (sólo drivers con baseUrl). */
async function sondearGraphql(baseUrl) {
  const sondeos = [
    ['POST', '/api/graphql', INTROSPECCION],
    ['POST', '/api/graphql', BUSQUEDA],
    ['POST', '/graphql', INTROSPECCION],
    ['GET', '/api/graphql', undefined],
    ['GET', '/graphql', undefined],
    ['GET', '/api/graphql-playground', undefined],
  ];
  for (const [metodo, ruta, cuerpo] of sondeos) {
    const res = await fetch(new URL(ruta, baseUrl), {
      method: metodo,
      headers: cuerpo ? { 'content-type': 'application/json' } : {},
      body: cuerpo,
      redirect: 'manual',
    });
    const texto = await res.text();
    const etiqueta = `${metodo} ${ruta}`;
    assert.ok(!esAceptado({ status: res.status }), `${etiqueta}: GraphQL debe estar cerrado y respondió ${res.status}`);
    assert.ok(!texto.includes('__schema'), `${etiqueta}: la respuesta expone el esquema (__schema)`);
    assert.ok(!contieneAlguno(texto, TODOS_CENTINELAS), `${etiqueta}: la respuesta contiene centinelas`);
  }
}

export const CASOS_CANALES = [
  caso('CA-02', 'canales cerrados (GraphQL): ningún objetivo responde 2xx ni expone centinelas', async ({ driver, refs }) => {
    const cerrados = driver.canalesCerrados ?? [];
    for (const canal of cerrados) {
      for (const objetivo of objetivosSemilla(refs)) {
        const res = await canal.leer(objetivo);
        const etiqueta = `[${canal.nombre}] ${objetivo.tipo}${objetivo.ref ? `:${objetivo.ref}` : ''}`;
        assert.ok(!esAceptado(res), `${etiqueta}: el canal debe estar cerrado y respondió ${res.status}`);
        assert.ok(!contieneAlguno(res.body, [...PRIVADOS, ...CENTINELAS.publicos]), `${etiqueta}: contiene centinelas`);
        assert.ok(!String(res.body).includes('__schema'), `${etiqueta}: expone el esquema`);
      }
    }
    if (driver.baseUrl) await sondearGraphql(driver.baseUrl);
  }),
];
