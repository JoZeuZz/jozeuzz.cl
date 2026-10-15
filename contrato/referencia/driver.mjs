// Oráculo de referencia en memoria. NO es código de producto: sólo demuestra que la batería es
// satisfacible y, con las opciones de mutantes.mjs, que discrimina.
const ESTADOS = ['recibida', 'en_gestion', 'cerrada'];
const MOTIVOS = ['atendida', 'descartada', 'duplicada', 'spam'];
const TRANSICIONES = { recibida: ['en_gestion', 'cerrada'], en_gestion: ['cerrada'], cerrada: [] };
const OBLIGATORIOS = { nombre: 200, contacto: 200, tipo_equipo: 200, descripcion: 8000 };
const TOKEN_ADMIN_PREFIJO = 'admin-';

const ok = (body, status = 200) => ({ status, body });
const NO = () => ({ status: 404, body: 'No encontrado' });
const SIN_AUTORIZAR = () => ({ status: 401, body: 'No autorizado' });

export function crearDriverConOpciones(op = {}) {
  let proyectos, servicios, medios, solicitudes, eventos, envios, conteoOrigen, logsArr, sesiones;
  let seq = 0;
  const log = (linea) => logsArr.push(linea);
  const copia = (x) => structuredClone(x);
  const esAdmin = (s) =>
    (typeof s?.token === 'string' && sesiones.has(s.token)) || (op.aceptaSesionInvalida && s?.token === 'falsificado');

  const proyectoVisible = (p) => p.estado === 'publicado';
  const servicioVisible = (s) => s.activo || op.servicioInactivoVisible;

  // ---------- Núcleo ----------
  function agregarEvento(ref, anterior, nuevo, motivo) {
    eventos.push({
      id: `ev-${++seq}`,
      solicitud: ref,
      estado_anterior: anterior,
      estado_nuevo: nuevo,
      actor: 'administrador',
      fecha: new Date().toISOString(),
      motivo_cierre: motivo,
    });
  }

  function transicionar(ref, args = {}, { falla } = {}) {
    const s = solicitudes.get(ref);
    if (!s) return { status: 404 };
    const { a, motivo_cierre: motivo } = args;
    const hayMotivo = motivo !== undefined && motivo !== null;
    if (!ESTADOS.includes(a)) return { status: 422 };
    const permitidas = [...TRANSICIONES[s.estado]];
    if (op.permitirReapertura && s.estado === 'cerrada') permitidas.push('en_gestion');
    if (!permitidas.includes(a)) return { status: 409 };
    const motivoValido = op.motivoLibre ? typeof motivo === 'string' && motivo !== '' : MOTIVOS.includes(motivo);
    if (a === 'cerrada' && !motivoValido && !(op.cerrarSinMotivo && !hayMotivo)) return { status: 422 };
    if (a !== 'cerrada' && hayMotivo) return { status: 422 };
    const previo = { estado: s.estado, motivo_cierre: s.motivo_cierre };
    s.estado = a;
    s.motivo_cierre = a === 'cerrada' && hayMotivo ? motivo : null;
    if (falla === 'tras-estado') {
      if (!op.noAtomico) Object.assign(s, previo);
      log(`transicion fallida solicitud=${ref}`);
      return { status: 500 };
    }
    if (!op.sinEvento) agregarEvento(ref, previo.estado, a, s.motivo_cierre);
    log(`transicion solicitud=${ref} a=${a}`);
    return { status: 200 };
  }

  function fijarObservaciones(ref, texto) {
    const s = solicitudes.get(ref);
    if (!s) return { status: 404 };
    if (typeof texto !== 'string') return { status: 422 };
    s.observaciones_internas = texto;
    log(op.logObservaciones ? `observaciones solicitud=${ref} texto=${texto}` : `observaciones solicitud=${ref}`);
    return { status: 200 };
  }

  // ---------- Canales públicos ----------
  const listaProyectos = () => [...proyectos.values()].filter(proyectoVisible);
  const listaServicios = () => [...servicios.values()].filter(servicioVisible);

  const html = (o) => {
    switch (o.tipo) {
      case 'proyecto': {
        const p = proyectos.get(o.ref);
        if (p && proyectoVisible(p)) return ok(`<article><h1>${p.titulo}</h1><p>${p.resumen}</p></article>`);
        if (p && op.borrador403 && p.estado === 'borrador') return { status: 403, body: 'Prohibido' };
        return NO();
      }
      case 'servicio': {
        const s = servicios.get(o.ref);
        return s && servicioVisible(s) ? ok(`<article><h1>${s.titulo}</h1><p>${s.descripcion}</p></article>`) : NO();
      }
      case 'lista-proyectos':
        return ok(`<ul>${listaProyectos().map((p) => `<li>${p.titulo}</li>`).join('')}</ul>`);
      case 'lista-servicios':
        return ok(`<ul>${listaServicios().map((s) => `<li>${s.titulo}</li>`).join('')}</ul>`);
      default:
        return NO();
    }
  };

  const api = (o) => {
    switch (o.tipo) {
      case 'proyecto': {
        const p = proyectos.get(o.ref);
        return p && proyectoVisible(p) ? ok(JSON.stringify({ slug: p.slug, titulo: p.titulo, resumen: p.resumen })) : NO();
      }
      case 'servicio': {
        const s = servicios.get(o.ref);
        return s && servicioVisible(s) ? ok(JSON.stringify({ slug: s.slug, titulo: s.titulo, descripcion: s.descripcion })) : NO();
      }
      case 'lista-proyectos':
        return ok(JSON.stringify(listaProyectos().map((p) => ({ slug: p.slug, titulo: p.titulo }))));
      case 'lista-servicios':
        return ok(JSON.stringify(listaServicios().map((s) => ({ slug: s.slug, titulo: s.titulo }))));
      case 'solicitud':
        if (op.apiExponeSolicitudes && solicitudes.has(o.ref)) return ok(JSON.stringify(solicitudes.get(o.ref)));
        return NO();
      case 'lista-solicitudes':
        if (op.apiExponeSolicitudes) return ok(JSON.stringify([...solicitudes.values()]));
        return NO();
      default:
        return NO();
    }
  };

  const medio = (o) => {
    if (o.tipo !== 'medio') return NO();
    const m = medios.get(o.ref);
    return m && (m.visibilidad === 'publico' || op.medioPrivadoAccesible) ? ok(m.contenido) : NO();
  };

  const sitemap = (o) => {
    if (o.tipo !== 'sitemap') return NO();
    const ps = [...proyectos.values()].filter((p) => proyectoVisible(p) || (op.borradorEnSitemap && p.estado === 'borrador'));
    const urls = [
      ...ps.map((p) => `https://ejemplo.example.invalid/proyectos/${p.slug}`),
      ...listaServicios().map((s) => `https://ejemplo.example.invalid/servicios/${s.slug}`),
    ];
    return ok(`<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`);
  };

  const canal = (nombre, tipo, fn) => ({ nombre, tipo, leer: async (o) => fn(o) });

  // ---------- Canal genérico de escritura ----------
  const generico = {
    nombre: 'api-generica',
    tipo: 'api',
    async crear(sesion, { tipo, datos }) {
      if (!esAdmin(sesion)) return SIN_AUTORIZAR();
      if (tipo === 'proyecto') {
        if (!datos?.slug || proyectos.has(datos.slug)) return ok('', 409);
        proyectos.set(datos.slug, { slug: datos.slug, titulo: datos.titulo ?? '', resumen: datos.resumen ?? '', estado: datos.estado ?? 'borrador' });
        return ok('', 201);
      }
      if (tipo === 'servicio') {
        if (!datos?.slug || servicios.has(datos.slug)) return ok('', 409);
        servicios.set(datos.slug, { slug: datos.slug, titulo: datos.titulo ?? '', descripcion: datos.descripcion ?? '', activo: datos.activo ?? false });
        return ok('', 201);
      }
      return ok('', 405);
    },
    async actualizar(sesion, { tipo, ref, cambios = {} }) {
      if (!esAdmin(sesion)) return SIN_AUTORIZAR();
      switch (tipo) {
        case 'solicitud': {
          const s = solicitudes.get(ref);
          if (!s) return NO();
          if (op.genericoSinReglas) {
            Object.assign(s, cambios);
            return ok('');
          }
          if ('estado' in cambios) {
            const r = transicionar(ref, { a: cambios.estado, motivo_cierre: cambios.motivo_cierre });
            if (r.status >= 400) return ok('', r.status);
          }
          if ('observaciones_internas' in cambios) {
            const r = fijarObservaciones(ref, cambios.observaciones_internas);
            if (r.status >= 400) return ok('', r.status);
          }
          return 'estado' in cambios || 'observaciones_internas' in cambios ? ok('') : ok('', 400);
        }
        case 'proyecto': {
          const p = proyectos.get(ref);
          if (!p) return NO();
          if ('estado' in cambios && !['borrador', 'publicado', 'retirado'].includes(cambios.estado)) return ok('', 422);
          for (const k of ['titulo', 'resumen', 'estado']) if (k in cambios) p[k] = cambios[k];
          return ok('');
        }
        case 'servicio': {
          const s = servicios.get(ref);
          if (!s) return NO();
          for (const k of ['titulo', 'descripcion', 'activo']) if (k in cambios) s[k] = cambios[k];
          return ok('');
        }
        case 'evento': {
          const e = eventos.find((x) => x.id === ref);
          if (op.eventoModificable && e) {
            Object.assign(e, cambios);
            return ok('');
          }
          return ok('', 403);
        }
        default:
          return ok('', 400);
      }
    },
    async eliminar(sesion, { tipo, ref }) {
      if (!esAdmin(sesion)) return SIN_AUTORIZAR();
      if (tipo === 'evento' && op.eventoModificable) {
        const i = eventos.findIndex((x) => x.id === ref);
        if (i >= 0) eventos.splice(i, 1);
        return ok('', 204);
      }
      return ok('', 405);
    },
  };

  // ---------- Administración ----------
  const guardar = (sesion, fn) => (...args) => (esAdmin(sesion) ? fn(...args) : { status: 401 });
  const admin = (sesion) => ({
    listarSolicitudes: guardar(sesion, ({ estado, motivo_cierre: motivo } = {}) => ({
      status: 200,
      data: copia(
        [...solicitudes.values()].filter((s) => (estado === undefined || s.estado === estado) && (motivo === undefined || s.motivo_cierre === motivo)),
      ),
    })),
    obtenerSolicitud: guardar(sesion, (ref) => (solicitudes.has(ref) ? { status: 200, data: copia(solicitudes.get(ref)) } : { status: 404 })),
    transicionar: guardar(sesion, (ref, args, opciones) => transicionar(ref, args, opciones)),
    fijarObservaciones: guardar(sesion, fijarObservaciones),
    listarEventos: guardar(sesion, (ref) =>
      solicitudes.has(ref) ? { status: 200, data: copia(eventos.filter((e) => e.solicitud === ref)) } : { status: 404 },
    ),
    obtenerProyecto: guardar(sesion, (ref) => {
      const p = proyectos.get(ref);
      return p ? { status: 200, data: { slug: p.slug, titulo: p.titulo, estado: p.estado } } : { status: 404 };
    }),
    publicarProyecto: guardar(sesion, (ref) => {
      const p = proyectos.get(ref);
      if (!p) return { status: 404 };
      p.estado = 'publicado';
      log(`proyecto publicado ${ref}`);
      return { status: 200 };
    }),
    retirarProyecto: guardar(sesion, (ref) => {
      const p = proyectos.get(ref);
      if (!p || p.estado !== 'publicado') return { status: p ? 409 : 404 };
      if (op.retirarBorra) proyectos.delete(ref);
      else p.estado = 'retirado';
      log(`proyecto retirado ${ref}`);
      return { status: 200 };
    }),
  });

  // ---------- Intake ----------
  function validar(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'cuerpo';
    for (const [campo, max] of Object.entries(OBLIGATORIOS)) {
      if (typeof p[campo] !== 'string' || p[campo].trim() === '' || p[campo].length > max) return campo;
    }
    if (p.servicio !== undefined && p.servicio !== null) {
      if (typeof p.servicio !== 'string') return 'servicio';
      const s = servicios.get(p.servicio);
      if (!s || (!s.activo && !op.servicioInactivoAceptado)) return 'servicio';
    }
    return null;
  }

  const intake = {
    limite: { max: 5 },
    async preparar(payload) {
      return { payload, token: `tok-${++seq}` };
    },
    async enviar(envio, { origen }) {
      if (!op.dobleEnvioDuplica && envios.has(envio.token)) return envios.get(envio.token);
      const p = envio.payload;
      const invalido = validar(p);
      if (invalido) {
        log(`intake rechazado campo=${invalido}`);
        return ok(JSON.stringify({ ok: false }), 422);
      }
      const usados = conteoOrigen.get(origen) ?? 0;
      if (!op.sinLimite && usados >= intake.limite.max) {
        log('intake denegado motivo=limite');
        return ok(JSON.stringify({ ok: false }), 429);
      }
      conteoOrigen.set(origen, usados + 1);
      const id = `sol-${++seq}`;
      const reg = {
        id,
        nombre: p.nombre,
        contacto: p.contacto,
        tipo_equipo: p.tipo_equipo,
        descripcion: p.descripcion,
        servicio: p.servicio ?? null,
        estado: 'recibida',
        motivo_cierre: null,
        observaciones_internas: '',
        creada_en: new Date().toISOString(),
      };
      if (op.intakeGuardaEstado && typeof p.estado === 'string') reg.estado = p.estado;
      solicitudes.set(id, reg);
      if (op.crearGeneraEvento) agregarEvento(id, null, 'recibida', null);
      log(op.logPII ? `intake aceptado id=${id} nombre=${p.nombre} contacto=${p.contacto}` : `intake aceptado id=${id}`);
      const res = ok(JSON.stringify(op.respuestaIncluyeNombre ? { ok: true, nombre: p.nombre } : { ok: true }), 201);
      envios.set(envio.token, res);
      return res;
    },
  };

  // ---------- Driver ----------
  return {
    nombre: 'referencia-en-memoria',
    async reset(semilla) {
      proyectos = new Map();
      servicios = new Map();
      medios = new Map();
      solicitudes = new Map();
      eventos = [];
      envios = new Map();
      conteoOrigen = new Map();
      logsArr = [];
      sesiones = new Set();
      const refs = {};
      for (const p of semilla.proyectos) {
        proyectos.set(p.slug, { slug: p.slug, titulo: p.titulo, resumen: p.resumen, estado: p.estado });
        refs[`proyecto_${p.clave}`] = p.slug;
      }
      for (const s of semilla.servicios) {
        servicios.set(s.slug, { slug: s.slug, titulo: s.titulo, descripcion: s.descripcion, activo: s.activo });
        refs[`servicio_${s.clave}`] = s.slug;
      }
      for (const m of semilla.medios) {
        medios.set(m.id, { id: m.id, contenido: m.contenido, visibilidad: m.visibilidad });
        refs[`medio_${m.clave}`] = m.id;
      }
      for (const s of semilla.solicitudes) {
        const id = `sol-${++seq}`;
        solicitudes.set(id, { id, ...copia(s), creada_en: '2026-01-01T00:00:00.000Z' });
        refs[`solicitud_${s.clave}`] = id;
      }
      return refs;
    },
    canalesPublicos: [
      canal('html', 'html', html),
      canal('api', 'api', api),
      canal('medios', 'medio', medio),
      canal('sitemap', 'sitemap', sitemap),
    ],
    canalesEscritura: [generico],
    async iniciarSesion() {
      const token = `${TOKEN_ADMIN_PREFIJO}${++seq}`;
      sesiones.add(token);
      return { token };
    },
    sesionAnonima: { token: null },
    sesionInvalida: { token: 'falsificado' },
    intake,
    admin,
    async logs() {
      return [...logsArr];
    },
  };
}

export default async function crearDriver() {
  return crearDriverConOpciones();
}
