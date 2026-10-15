import assert from 'node:assert/strict';
import { INEXISTENTE, payloadValido } from '../fixture.mjs';
import { contieneAlguno, esAceptado } from '../juicio.mjs';
import { abrirAdmin, aceptado, buscarPorNombre, contarSolicitudes, enviar, logsSinTexto, origenNuevo, rechazado } from './util.mjs';

const OBLIGATORIOS = ['nombre', 'contacto', 'tipo_equipo', 'descripcion'];
const ADMINISTRATIVOS = {
  estado: 'cerrada',
  motivo_cierre: 'spam',
  observaciones_internas: 'SNT-OBS-FORZADA',
  id: 'SNT-ID-FORZADO',
  creada_en: '2000-01-01T00:00:00.000Z',
};

async function rechazaSinRegistro(driver, admin, payload, ctx) {
  const antes = await contarSolicitudes(admin);
  rechazado(await enviar(driver, payload), ctx);
  assert.equal(await contarSolicitudes(admin), antes, `${ctx}: no debe crearse ningún registro`);
}

const caso = (id, titulo, run) => ({ id, area: 'intake', titulo, run });

export const CASOS_INTAKE = [
  caso('IN-01', 'envío válido sin servicio: aceptado, sin eco de datos y en recibida', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const payload = payloadValido();
    const antes = await contarSolicitudes(admin);
    const res = await enviar(driver, payload);
    aceptado(res, 'envío válido');
    assert.ok(
      !contieneAlguno(res.body, [payload.nombre, payload.contacto, payload.descripcion]),
      'la respuesta del intake no debe contener nombre, contacto ni descripción',
    );
    const halladas = await buscarPorNombre(admin, payload.nombre);
    assert.equal(halladas.length, 1, 'debe haber exactamente una solicitud nueva');
    assert.equal(await contarSolicitudes(admin), antes + 1, 'debe haber una solicitud más');
    const s = halladas[0];
    assert.equal(s.estado, 'recibida', 'el servidor asigna recibida');
    assert.equal(s.motivo_cierre, null, 'motivo_cierre debe ser nulo');
    assert.equal(s.observaciones_internas, '', 'observaciones_internas debe estar vacío');
  }),

  caso('IN-02', 'con servicio activo: aceptado y guarda la referencia', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    const payload = { ...payloadValido(), servicio: refs.servicio_activo };
    aceptado(await enviar(driver, payload), 'envío con servicio activo');
    const [s] = await buscarPorNombre(admin, payload.nombre);
    assert.ok(s, 'la solicitud debe existir');
    assert.equal(s.servicio, refs.servicio_activo, 'debe guardar la referencia al servicio');
  }),

  caso('IN-03', 'con servicio inactivo: rechazo de validación, sin registro', async ({ driver, refs }) => {
    const { admin } = await abrirAdmin(driver);
    await rechazaSinRegistro(driver, admin, { ...payloadValido(), servicio: refs.servicio_inactivo }, 'servicio inactivo');
  }),

  caso('IN-04', 'con servicio inexistente: rechazo de validación, sin registro', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    await rechazaSinRegistro(driver, admin, { ...payloadValido(), servicio: INEXISTENTE }, 'servicio inexistente');
  }),

  caso('IN-05', 'falta un obligatorio (uno por vez): rechazo, sin registro', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    for (const campo of OBLIGATORIOS) {
      const payload = payloadValido();
      delete payload[campo];
      await rechazaSinRegistro(driver, admin, payload, `falta ${campo}`);
    }
  }),

  caso('IN-06', 'tipos inválidos en campos de texto: rechazo', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    for (const campo of OBLIGATORIOS) {
      for (const valor of [123, { a: 1 }, ['x']]) {
        await rechazaSinRegistro(driver, admin, { ...payloadValido(), [campo]: valor }, `${campo}=${JSON.stringify(valor)}`);
      }
    }
  }),

  caso('IN-07', 'descripcion de 64 KiB: rechazo', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    await rechazaSinRegistro(driver, admin, { ...payloadValido(), descripcion: 'x'.repeat(64 * 1024) }, 'descripcion de 64 KiB');
  }),

  caso('IN-08', 'campos administrativos en el payload: rechazo o ignorados, nunca guardados', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const variantes = [['todos', ADMINISTRATIVOS], ...Object.entries(ADMINISTRATIVOS).map(([k, v]) => [k, { [k]: v }])];
    for (const [nombre, extra] of variantes) {
      const payload = { ...payloadValido(), ...extra };
      const antes = await contarSolicitudes(admin);
      const res = await enviar(driver, payload);
      if (esAceptado(res)) {
        const halladas = await buscarPorNombre(admin, payload.nombre);
        assert.equal(halladas.length, 1, `[${nombre}] aceptado: debe haber un registro`);
        const s = halladas[0];
        assert.equal(s.estado, 'recibida', `[${nombre}] el estado no puede venir del payload`);
        assert.equal(s.motivo_cierre, null, `[${nombre}] el motivo no puede venir del payload`);
        assert.equal(s.observaciones_internas, '', `[${nombre}] las observaciones no pueden venir del payload`);
        assert.notEqual(s.id, ADMINISTRATIVOS.id, `[${nombre}] el id no puede venir del payload`);
        assert.notEqual(s.creada_en, ADMINISTRATIVOS.creada_en, `[${nombre}] creada_en no puede venir del payload`);
      } else {
        rechazado(res, `[${nombre}]`);
        assert.equal(await contarSolicitudes(admin), antes, `[${nombre}] rechazado: no debe haber registro`);
      }
    }
  }),

  caso('IN-09', 'reenviar el mismo envío: un solo registro', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const payload = payloadValido();
    const envio = await driver.intake.preparar(payload);
    const origen = origenNuevo();
    aceptado(await driver.intake.enviar(envio, { origen }), 'primer envío');
    const segundo = await driver.intake.enviar(envio, { origen });
    assert.ok(segundo.status < 500, `el reenvío no debe provocar un error de servidor (${segundo.status})`);
    assert.equal((await buscarPorNombre(admin, payload.nombre)).length, 1, 'el doble envío debe dejar un solo registro');
  }),

  caso('IN-10', 'dos envíos distintos legítimos: dos registros', async ({ driver }) => {
    const { admin } = await abrirAdmin(driver);
    const a = payloadValido();
    const b = payloadValido();
    aceptado(await enviar(driver, a), 'envío A');
    aceptado(await enviar(driver, b), 'envío B');
    assert.equal((await buscarPorNombre(admin, a.nombre)).length, 1, 'registro A');
    assert.equal((await buscarPorNombre(admin, b.nombre)).length, 1, 'registro B');
  }),

  caso('IN-11', 'límite por origen: max aceptados, el siguiente denegado, otro origen aceptado', async ({ driver, medir }) => {
    const { admin } = await abrirAdmin(driver);
    const max = driver.intake.limite.max;
    medir('limite_max', max, 'envios');
    const antes = await contarSolicitudes(admin);
    const origen = origenNuevo();
    for (let i = 1; i <= max; i++) aceptado(await enviar(driver, payloadValido(), origen), `envío ${i}/${max} del origen`);
    rechazado(await enviar(driver, payloadValido(), origen), `envío ${max + 1} del mismo origen`);
    aceptado(await enviar(driver, payloadValido(), origenNuevo()), 'envío de otro origen');
    assert.equal(await contarSolicitudes(admin), antes + max + 1, 'el envío denegado no debe crear registro');
  }),

  caso('IN-12', 'los logs no contienen nombre, contacto, equipo ni descripción', async ({ driver }) => {
    const validos = [payloadValido(), payloadValido()];
    const invalidos = [
      { ...payloadValido(), descripcion: 12345 },
      (() => { const p = payloadValido(); delete p.contacto; return p; })(),
      { ...payloadValido(), servicio: INEXISTENTE },
    ];
    for (const p of [...validos, ...invalidos]) await enviar(driver, p);
    const datos = [...validos, ...invalidos].flatMap((p) =>
      [p.nombre, p.contacto, p.tipo_equipo, typeof p.descripcion === 'string' ? p.descripcion : undefined].filter(Boolean),
    );
    await logsSinTexto(driver, datos, 'logs del intake');
  }),
];
