// Latencia del POST /api/intake y falsos positivos del antiabuso (POC-3 U9). Corre en el Node del host, sin
// dependencias, contra el proxy TLS de `app-prod` levantado con `./poc.sh up-prod-pruebas-en <base>` (sólo ese modo
// acepta `x-poc-ip-sintetica`; con el proxy de producción todos los envíos saldrían de la misma IP y toparían con el
// cupo de 5 creaciones / 10 min, lo que se vería como falsos positivos).
//
//   NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt" node medicion/intake-latencia.mjs
//
// Cada envío usa una IP sintética distinta (un /64 propio: el cupo de creaciones es por IP o /64), con un índice
// aleatorio por ejecución por encima de 0x10000000: no choca con la batería (origen-sintetico-1…), con los tests HTTP
// (grupo 2001:db8:ffff::) ni con una ejecución anterior de este script dentro de los 10 minutos del cupo.
// El GET /solicitar y la espera del tiempo mínimo quedan fuera de la medición: se mide sólo el POST (incluye el
// saludo TLS, porque se abre una conexión por petición, como el driver de contrato).
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ipSintetica } from '../driver/ip-sintetica.mjs';

const SERIES = 3;
const POR_SERIE = 50;
const BASE_INDICE = 0x10000000;
const MAX_INDICE = 0xffff0000;

/** Mediana de una lista no vacía de números (no muta la entrada). */
export function mediana(valores) {
  if (valores.length === 0) throw new Error('lista vacía');
  const o = [...valores].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Percentil 95 por rango más cercano: el elemento ceil(0,95·n)-ésimo de la lista ordenada. */
export function p95(valores) {
  if (valores.length === 0) throw new Error('lista vacía');
  const o = [...valores].sort((a, b) => a - b);
  return o[Math.ceil(0.95 * o.length) - 1];
}

/** 201 = creado; otro 4xx = rechazo de un envío legítimo (falso positivo); cualquier otra cosa = error. */
export function clasificar(status) {
  if (status === 201) return 'creado';
  if (Number.isInteger(status) && status >= 400 && status < 500) return 'falso_positivo';
  return 'error';
}

/** Índice de origen sintético, distinto por (serie, i) dentro de una ejecución. */
export function indiceSintetico(base, serie, i) {
  const n = BASE_INDICE + base + serie * 1000 + i;
  if (n >= MAX_INDICE) throw new Error('índice sintético fuera de rango');
  return n;
}

/** Valida el entorno como el driver de contrato; devuelve la configuración. */
export function validarEntorno(env) {
  const base = (env.POC_BASE_URL ?? 'https://127.0.0.1:3444').replace(/\/$/, '');
  if (!/^https:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('POC_BASE_URL debe tener forma https://127.0.0.1:<puerto>');
  if (!env.NODE_EXTRA_CA_CERTS?.endsWith('/.tls/ca.crt')) throw new Error('NODE_EXTRA_CA_CERTS debe terminar en /.tls/ca.crt');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('NODE_TLS_REJECT_UNAUTHORIZED=0 está prohibido');
  const minimo = env.POC_INTAKE_TIEMPO_MINIMO_MS ?? '200';
  if (!/^\d+$/.test(minimo)) throw new Error('POC_INTAKE_TIEMPO_MINIMO_MS debe ser un entero (TIEMPO_MINIMO)');
  return { base, tiempoMinimoMs: Number(minimo) };
}

const redondear = (x) => (x === null ? null : Math.round(x * 100) / 100);

/**
 * Ejecuta `series` × `porSerie` envíos con `unEnvio(serie, i) → { status, ms }` (ms = sólo el POST).
 * Una excepción de `unEnvio` cuenta como error. Mediana de las medianas y p95 sobre las muestras con respuesta.
 */
export async function medirSeries({ series, porSerie, unEnvio }) {
  const resumen = [];
  const todas = [];
  const total = { creados: 0, falsos_positivos: 0, errores: 0 };
  for (let serie = 0; serie < series; serie++) {
    const muestras = [];
    const cuenta = { creados: 0, falsos_positivos: 0, errores: 0 };
    for (let i = 0; i < porSerie; i++) {
      let r;
      try {
        r = await unEnvio(serie, i);
      } catch {
        cuenta.errores += 1;
        continue;
      }
      const clase = clasificar(r.status);
      if (clase === 'creado') cuenta.creados += 1;
      else if (clase === 'falso_positivo') cuenta.falsos_positivos += 1;
      else cuenta.errores += 1;
      muestras.push(r.ms);
    }
    todas.push(...muestras);
    for (const k of Object.keys(total)) total[k] += cuenta[k];
    resumen.push({
      serie: serie + 1,
      n: porSerie,
      mediana_ms: muestras.length ? redondear(mediana(muestras)) : null,
      p95_ms: muestras.length ? redondear(p95(muestras)) : null,
      ...cuenta,
    });
  }
  const medianas = resumen.map((s) => s.mediana_ms).filter((m) => m !== null);
  const enviados = series * porSerie;
  return {
    enviados,
    ...total,
    series: resumen,
    mediana_de_medianas_ms: medianas.length ? redondear(mediana(medianas)) : null,
    p95_ms: todas.length ? redondear(p95(todas)) : null,
    ok: total.creados === enviados && total.falsos_positivos === 0 && total.errores === 0,
  };
}

async function principal() {
  const { base, tiempoMinimoMs } = validarEntorno(process.env);
  const aleatorio = randomInt(0, 0x40000000);
  const marca = aleatorio.toString(36);
  const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function unEnvio(serie, i) {
    // Fuera de la medición: GET del formulario (token y cookie) y espera del tiempo mínimo.
    const g = await fetch(`${base}/solicitar`, { headers: { connection: 'close' } });
    const html = await g.text();
    const token = /<input[^>]+name="token"[^>]+value="([^"]+)"/.exec(html)?.[1];
    const cookie = g.headers.get('set-cookie')?.match(/__Host-intake=[^;]+/)?.[0];
    if (g.status !== 200 || !token || !cookie) throw new Error('GET /solicitar no entregó token y cookie');
    await dormir(tiempoMinimoMs + 50);
    const etiqueta = `${marca}-${serie}-${i}`;
    const cuerpo = JSON.stringify({
      nombre: `SNT-NOMBRE-LAT-${etiqueta}`,
      contacto: `snt-lat-${etiqueta}@example.invalid`,
      tipo_equipo: 'SNT-EQUIPO',
      descripcion: `SNT-DESCRIPCION-LAT-${etiqueta}`,
      token,
    });
    const headers = {
      connection: 'close',
      'content-type': 'application/json',
      origin: base,
      cookie,
      'x-poc-ip-sintetica': ipSintetica(`origen-sintetico-${indiceSintetico(aleatorio, serie, i)}`),
    };
    const t0 = performance.now();
    const r = await fetch(`${base}/api/intake`, { method: 'POST', headers, body: cuerpo });
    await r.text();
    return { status: r.status, ms: performance.now() - t0 };
  }

  const resultado = await medirSeries({ series: SERIES, porSerie: POR_SERIE, unEnvio });
  process.stdout.write(`${JSON.stringify({ base, tiempo_minimo_ms: tiempoMinimoMs, ...resultado }, null, 2)}\n`);
  process.exitCode = resultado.ok ? 0 : 1;
}

// Bajo `node --test` (NODE_TEST_CONTEXT) sólo se importan las funciones puras.
if (!process.env.NODE_TEST_CONTEXT && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  });
}
