// Driver de la batería de contrato para POC-1a (candidata A: Next.js + Payload + PostgreSQL).
// Corre en el Node del host, sin dependencias, contra TLS local. El reset y la semilla se hacen
// dentro del contenedor con ./poc.sh exec. POC-1b histórico: POC_BASE_URL ?? 'http://127.0.0.1:3101'.
import { createHmac, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NoImplementado } from '../contrato/errores.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const BASE_POC1B = process.env.POC_TARGET_DATABASE;
if (!/^poc(1b|3)_[a-z0-9_]+$/.test(BASE_POC1B ?? '')) {
  throw new Error('POC_TARGET_DATABASE debe indicar una base POC aislada explícita');
}
// Para producción: POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' y POC_LOG_SERVICE=app-prod.
const RESET_ENV = (process.env.POC_RESET_ENV ?? '').split(/\s+/).filter(Boolean);
const BASE = (process.env.POC_BASE_URL ?? '').replace(/\/$/, '');
if (!/^https:\/\/127\.0\.0\.1:\d+$/.test(BASE)) {
  throw new Error('POC_BASE_URL debe tener forma https://127.0.0.1:<puerto>');
}
if (!process.env.NODE_EXTRA_CA_CERTS?.endsWith('/.tls/ca.crt')) {
  throw new Error('NODE_EXTRA_CA_CERTS debe terminar en /.tls/ca.crt');
}
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  throw new Error('NODE_TLS_REJECT_UNAUTHORIZED=0 está prohibido');
}
const ID_INEXISTENTE = '2147483646';
const COLECCION = { proyecto: 'proyectos', servicio: 'servicios', solicitud: 'solicitudes', evento: 'eventos-solicitud' };

const b64url = (x) => Buffer.from(x).toString('base64url');
/** JWT HS256 firmado con una clave aleatoria: estructuralmente válido, criptográficamente falso. */
function jwtFalsificado() {
  const cab = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({ id: 1, collection: 'users', email: 'admin@example.invalid', exp: Math.floor(Date.now() / 1000) + 3600 }));
  const firma = createHmac('sha256', randomBytes(32)).update(`${cab}.${cuerpo}`).digest('base64url');
  return `${cab}.${cuerpo}.${firma}`;
}

async function http(sesion, metodo, ruta, cuerpo, extras = {}) {
  // Sin keep-alive: el servidor cierra conexiones ociosas (~5 s) y el reintento de undici sobre un socket
  // reutilizado producía «fetch failed» entre un reset y la primera petición.
  const headers = { connection: 'close', ...extras };
  if (sesion?.token) headers.authorization = `JWT ${sesion.token}`;
  if (cuerpo !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      redirect: 'manual',
    });
  } catch (e) {
    throw new Error(`fallo de red en ${metodo} ${ruta}: ${e.cause?.code ?? e.cause?.message ?? e.message}`);
  }
  // Next añade a sus páginas de error un identificador aleatorio por petición (self.__next_r): es ruido
  // del framework, no información del recurso. Se neutraliza para que la comparación «privado ≡ inexistente»
  // (CO-07) mida el contenido y no ese token. Queda declarado como decisión del adaptador en el informe.
  const body = (await res.text()).replace(/self\.__next_r="[^"]*"/g, 'self.__next_r="{aleatorio}"');
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = undefined;
  }
  return { status: res.status, body, json };
}
const crudo = ({ status, body }) => ({ status, body });
const SIN_CANAL = () => ({ status: 404, body: '' });

export default async function crearDriver() {
  let estado = { refs: {}, ids: {}, password: '', t0: '', idPorSlug: {}, tipoMedio: {} };
  const sesionAnonima = { token: null };
  const sesionInvalida = { token: jwtFalsificado() };

  // ---------- Traducción de refs lógicas a ids de Payload ----------
  const idDe = (tipo, ref) => {
    if (ref === undefined) return ID_INEXISTENTE;
    return estado.idPorSlug[`${tipo}:${ref}`] ?? ID_INEXISTENTE;
  };
  const idMedio = (ref) => {
    for (const [clave, idRef] of Object.entries(estado.refs)) {
      if (clave.startsWith('medio_') && idRef === ref) return { id: estado.ids[clave], privado: clave === 'medio_privado' };
    }
    return { id: ID_INEXISTENTE, privado: false };
  };

  // ---------- Canales públicos ----------
  const html = {
    nombre: 'html',
    tipo: 'html',
    async leer(o) {
      const rutas = {
        proyecto: `/proyectos/${encodeURIComponent(o.ref ?? '')}`,
        servicio: `/servicios/${encodeURIComponent(o.ref ?? '')}`,
        'lista-proyectos': '/proyectos',
        'lista-servicios': '/servicios',
        solicitud: `/solicitudes/${encodeURIComponent(o.ref ?? '')}`,
        'lista-solicitudes': '/solicitudes',
        evento: `/eventos/${encodeURIComponent(o.ref ?? '')}`,
        medio: `/medios/${encodeURIComponent(o.ref ?? '')}`,
        sitemap: '/sitemap.xml',
      };
      return crudo(await http(sesionAnonima, 'GET', rutas[o.tipo]));
    },
  };

  const rutaApi = (o, query) => {
    const q = query ? `?${query}` : '';
    switch (o.tipo) {
      case 'proyecto':
      case 'servicio':
      case 'solicitud':
        return `/api/${COLECCION[o.tipo]}/${idDe(o.tipo, o.ref)}${q}`;
      case 'evento':
        return `/api/${COLECCION.evento}/${o.ref ?? ID_INEXISTENTE}${q}`;
      case 'lista-proyectos':
        return `/api/proyectos${q}`;
      case 'lista-servicios':
        return `/api/servicios${q}`;
      case 'lista-solicitudes':
        return `/api/solicitudes${q}`;
      case 'medio': {
        const m = idMedio(o.ref);
        return `/api/${m.privado ? 'medios-privados' : 'medios-publicos'}/${m.id}${q}`;
      }
      default:
        return null;
    }
  };
  const apiRest = (nombre, query) => ({
    nombre,
    tipo: 'api',
    async leer(o) {
      const ruta = rutaApi(o, query);
      return ruta ? crudo(await http(sesionAnonima, 'GET', ruta)) : SIN_CANAL();
    },
  });

  const mediosApi = (nombre, coleccion) => ({
    nombre,
    tipo: 'medio',
    async leer(o) {
      if (o.tipo !== 'medio') return SIN_CANAL();
      return crudo(await http(sesionAnonima, 'GET', `/api/${coleccion}/file/${encodeURIComponent(o.ref)}.txt`));
    },
  });
  const mediosDisco = {
    nombre: 'medios-disco',
    tipo: 'medio',
    async leer(o) {
      if (o.tipo !== 'medio') return SIN_CANAL();
      // Sólo el medio público conocido se busca en «publicos»; privado e inexistente comparten carpeta,
      // así la comparación de CO-07 no depende de la ruta pedida.
      const carpeta = o.ref === estado.refs.medio_publico ? 'publicos' : 'privados';
      return crudo(await http(sesionAnonima, 'GET', `/media-store/${carpeta}/${encodeURIComponent(o.ref)}.txt`));
    },
  };
  const sitemap = {
    nombre: 'sitemap',
    tipo: 'sitemap',
    async leer(o) {
      return o.tipo === 'sitemap' ? crudo(await http(sesionAnonima, 'GET', '/sitemap.xml')) : SIN_CANAL();
    },
  };

  // GraphQL está deshabilitado: el canal «cerrado» consulta las rutas reales y la batería exige que no respondan.
  const graphql = {
    nombre: 'graphql',
    tipo: 'graphql',
    async leer(o) {
      const filtro = o.ref ? `{ Proyectos(where:{slug:{equals:"${o.ref}"}}) { docs { slug titulo resumen } } }` : '{ Proyectos { docs { slug titulo } } }';
      return crudo(await http(sesionAnonima, 'POST', '/api/graphql', { query: filtro }));
    },
  };

  // ---------- Canal de escritura REST ----------
  const mapaEstado = { publicado: 'published', borrador: 'draft', retirado: 'draft' };
  const traducir = (tipo, datos = {}) => {
    const d = { ...datos };
    if (tipo === 'proyecto' && 'estado' in d) {
      d._status = mapaEstado[d.estado] ?? d.estado;
      delete d.estado;
    }
    return d;
  };
  const escritura = {
    nombre: 'api-rest',
    tipo: 'api',
    async crear(sesion, { tipo, datos }) {
      return crudo(await http(sesion, 'POST', `/api/${COLECCION[tipo]}`, traducir(tipo, datos)));
    },
    async actualizar(sesion, { tipo, ref, cambios }) {
      const id = tipo === 'evento' ? (/^\d+$/.test(String(ref)) ? ref : ID_INEXISTENTE) : idDe(tipo, ref);
      return crudo(await http(sesion, 'PATCH', `/api/${COLECCION[tipo]}/${id}`, traducir(tipo, cambios)));
    },
    async eliminar(sesion, { tipo, ref }) {
      const id = tipo === 'evento' ? (/^\d+$/.test(String(ref)) ? ref : ID_INEXISTENTE) : idDe(tipo, ref);
      return crudo(await http(sesion, 'DELETE', `/api/${COLECCION[tipo]}/${id}`));
    },
  };

  // ---------- Administración (sólo REST con la sesión recibida) ----------
  const aSolicitud = (d) => ({
    id: String(d.id),
    nombre: d.nombre,
    contacto: d.contacto,
    tipo_equipo: d.tipo_equipo,
    descripcion: d.descripcion,
    servicio: d.servicio == null ? null : String(typeof d.servicio === 'object' ? d.servicio.slug ?? d.servicio.id : d.servicio),
    estado: d.estado,
    motivo_cierre: d.motivo_cierre ?? null,
    observaciones_internas: d.observaciones_internas ?? '',
    creada_en: d.createdAt,
  });
  const estadoProyecto = (d) => (d._status === 'published' ? 'publicado' : d.retiradoEn ? 'retirado' : 'borrador');

  /** Documento principal del proyecto por slug, leído con la sesión recibida (el access decide). */
  async function buscarProyecto(sesion, slug) {
    const r = await http(sesion, 'GET', `/api/proyectos?where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=0`);
    if (r.status !== 200) return { res: r };
    const doc = r.json?.docs?.[0];
    return doc ? { doc } : { res: { status: 404 } };
  }

  const admin = (sesion) => ({
    async listarSolicitudes({ estado, motivo_cierre: motivo } = {}) {
      const filtros = ['limit=100', 'depth=0', 'sort=id'];
      if (estado !== undefined) filtros.push(`where[estado][equals]=${encodeURIComponent(estado)}`);
      if (motivo !== undefined) filtros.push(`where[motivo_cierre][equals]=${encodeURIComponent(motivo)}`);
      const r = await http(sesion, 'GET', `/api/solicitudes?${filtros.join('&')}`);
      return r.status === 200 ? { status: 200, data: r.json.docs.map(aSolicitud) } : { status: r.status };
    },
    async obtenerSolicitud(ref) {
      const r = await http(sesion, 'GET', `/api/solicitudes/${encodeURIComponent(ref)}?depth=0`);
      return r.status === 200 ? { status: 200, data: aSolicitud(r.json) } : { status: r.status };
    },
    async obtenerProyecto(slug) {
      const { doc, res } = await buscarProyecto(sesion, slug);
      if (!doc) return { status: res.status };
      return { status: 200, data: { slug: doc.slug, titulo: doc.titulo, estado: estadoProyecto(doc) } };
    },
    async publicarProyecto(slug) {
      const { doc, res } = await buscarProyecto(sesion, slug);
      if (!doc) return { status: res.status };
      const r = await http(sesion, 'PATCH', `/api/proyectos/${doc.id}`, { _status: 'published' });
      return { status: r.status };
    },
    async retirarProyecto(slug) {
      const { doc, res } = await buscarProyecto(sesion, slug);
      if (!doc) return { status: res.status };
      if (doc._status !== 'published') return { status: 409 };
      // Sin ?draft=true: «volver a borrador» actualiza el documento principal (despublica).
      const r = await http(sesion, 'PATCH', `/api/proyectos/${doc.id}`, { _status: 'draft' });
      return { status: r.status };
    },
    async transicionar() {
      const [ref, datos, opts] = arguments
      const cuerpo = { estado: datos.a, motivo_cierre: datos.motivo_cierre }
      const r = await http(sesion, 'PATCH', `/api/solicitudes/${encodeURIComponent(ref)}`, cuerpo, opts?.falla === 'tras-estado' ? { 'x-poc-fallo': 'tras-estado' } : {})
      return crudo(r)
    },
    async fijarObservaciones() {
      const [ref, observaciones_internas] = arguments
      return crudo(await http(sesion, 'PATCH', `/api/solicitudes/${encodeURIComponent(ref)}`, { observaciones_internas }))
    },
    async listarEventos() {
      const [ref] = arguments
      const r = await http(sesion, 'GET', `/api/eventos-solicitud?where[solicitud][equals]=${encodeURIComponent(ref)}&sort=createdAt&depth=0`)
      return r.status === 200 ? { status: 200, data: r.json.docs.map((e) => ({ id: String(e.id), solicitud: String(e.solicitud), estado_anterior: e.estado_anterior, estado_nuevo: e.estado_nuevo, actor: e.actor, fecha: e.fecha, motivo_cierre: e.motivo_cierre ?? null })) } : { status: r.status }
    },
  });

  return {
    nombre: 'poc1a-payload-next',
    baseUrl: BASE,
    /** Sólo para scripts/reset-e2e.mjs: entrega al runner E2E lo que devolvió el último reset. */
    __estado: () => estado,
    async reset(semilla) {
      const b64 = Buffer.from(JSON.stringify(semilla)).toString('base64');
      const r = spawnSync('./poc.sh', ['exec-en', BASE_POC1B, 'env', 'POC_NO_PUSH=1', ...RESET_ENV, 'npx', 'tsx', 'scripts/reset-semilla.ts', b64], {
        cwd: aqui,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      const linea = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULTADO:'));
      if (r.status !== 0 || !linea) {
        throw new Error(`reset falló (código ${r.status}): ${(r.stderr || r.stdout || '').slice(-400)}`);
      }
      const { refs, ids, password, email } = JSON.parse(linea.slice('RESULTADO:'.length));
      const idPorSlug = {};
      for (const [clave, ref] of Object.entries(refs)) {
        const tipo = clave.split('_')[0];
        if (['proyecto', 'servicio', 'solicitud'].includes(tipo)) idPorSlug[`${tipo}:${ref}`] = ids[clave];
      }
      estado = { refs, ids, password, email, t0: new Date(Date.now() - 1000).toISOString(), idPorSlug };
      return refs;
    },
    canalesPublicos: [
      html,
      apiRest('api-rest', ''),
      apiRest('api-rest-draft', 'draft=true&depth=2'),
      mediosApi('medios-publicos', 'medios-publicos'),
      mediosApi('medios-privados', 'medios-privados'),
      mediosDisco,
      sitemap,
    ],
    canalesCerrados: [graphql],
    noAplica: { accion: 'acciones de servidor de Payload: cubiertas por e2e/acciones-servidor.spec.ts' },
    canalesEscritura: [escritura],
    async iniciarSesion() {
      const r = await http(sesionAnonima, 'POST', '/api/users/login', { email: estado.email, password: estado.password });
      if (r.status !== 200 || !r.json?.token) throw new Error(`login del administrador sintético falló (${r.status})`);
      return { token: r.json.token };
    },
    sesionAnonima,
    sesionInvalida,
    // POC-1a no incluye el intake: la forma exige max > 0 y el resto lanza NoImplementado.
    intake: {
      limite: { max: 1 },
      async preparar() {
        if (process.env.POC_INTAKE_SINTETICO !== '1') throw new NoImplementado('POC-3: intake público');
        return arguments[0]
      },
      async enviar() {
        if (process.env.POC_INTAKE_SINTETICO !== '1') throw new NoImplementado('POC-3: intake público');
        const b64 = Buffer.from(JSON.stringify(arguments[0])).toString('base64')
        const r = spawnSync('./poc.sh', ['exec-en', BASE_POC1B, 'env', 'POC_INTAKE_SINTETICO=1', 'POC_TEST_RUN=1', `POC_TARGET_DATABASE=${BASE_POC1B}`, 'npx', 'tsx', 'scripts/solicitud-sintetica.ts', b64], { cwd: aqui, encoding: 'utf8' })
        return { status: r.status === 0 ? 201 : 400 }
      },
    },
    admin,
    async logs() {
      const r = spawnSync('./poc.sh', ['logs-since', estado.t0], { cwd: aqui, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) throw new Error(`logs-since falló (${r.status})`);
      return `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter(Boolean);
    },
  };
}
