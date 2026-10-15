// Semilla sintética con centinelas únicos (SNT-…) para detectar fugas.
// Todos los datos son ficticios; los correos usan el dominio reservado example.invalid.

export const INEXISTENTE = 'snt-no-existe';
export const MOTIVOS = ['atendida', 'descartada', 'duplicada', 'spam'];
export const ESTADOS = ['recibida', 'en_gestion', 'cerrada'];

export const SEMILLA = {
  proyectos: [
    {
      clave: 'publicado',
      slug: 'snt-proyecto-publicado',
      titulo: 'SNT-TITULO-PUBLICADO',
      resumen: 'SNT-RESUMEN-PUBLICADO',
      estado: 'publicado',
      medios: [],
    },
    {
      clave: 'borrador',
      slug: 'snt-proyecto-borrador',
      titulo: 'SNT-TITULO-BORRADOR',
      resumen: 'SNT-RESUMEN-BORRADOR',
      estado: 'borrador',
      medios: ['privado'],
    },
  ],
  medios: [
    { clave: 'publico', id: 'snt-medio-publico', contenido: 'SNT-MEDIO-PUBLICO', visibilidad: 'publico' },
    { clave: 'privado', id: 'snt-medio-privado', contenido: 'SNT-MEDIO-PRIVADO', visibilidad: 'privado' },
  ],
  servicios: [
    {
      clave: 'activo',
      slug: 'snt-servicio-activo',
      titulo: 'SNT-SERVICIO-ACTIVO',
      descripcion: 'SNT-DESC-SERVICIO-ACTIVO',
      activo: true,
    },
    {
      clave: 'inactivo',
      slug: 'snt-servicio-inactivo',
      titulo: 'SNT-SERVICIO-INACTIVO',
      descripcion: 'SNT-DESC-SERVICIO-INACTIVO',
      activo: false,
    },
  ],
  solicitudes: [
    {
      clave: 'sembrada',
      nombre: 'SNT-NOMBRE',
      contacto: 'snt-contacto@example.invalid',
      tipo_equipo: 'SNT-EQUIPO',
      descripcion: 'SNT-DESCRIPCION',
      servicio: null,
      estado: 'recibida',
      motivo_cierre: null,
      observaciones_internas: 'SNT-OBS-INTERNA',
    },
  ],
};

// Claves lógicas que reset(SEMILLA) debe devolver en Refs:
// proyecto_publicado, proyecto_borrador (slugs), servicio_activo, servicio_inactivo (slugs),
// medio_publico, medio_privado (ids) y solicitud_sembrada (id asignado por el stack).
export const CLAVES_REFS = [
  'proyecto_publicado',
  'proyecto_borrador',
  'servicio_activo',
  'servicio_inactivo',
  'medio_publico',
  'medio_privado',
  'solicitud_sembrada',
];

export const CENTINELAS = {
  privados: [
    'SNT-TITULO-BORRADOR',
    'SNT-RESUMEN-BORRADOR',
    'SNT-MEDIO-PRIVADO',
    'SNT-SERVICIO-INACTIVO',
    'SNT-DESC-SERVICIO-INACTIVO',
    'SNT-NOMBRE',
    'snt-contacto@example.invalid',
    'SNT-EQUIPO',
    'SNT-DESCRIPCION',
    'SNT-OBS-INTERNA',
  ],
  publicos: [
    'SNT-TITULO-PUBLICADO',
    'SNT-RESUMEN-PUBLICADO',
    'SNT-MEDIO-PUBLICO',
    'SNT-SERVICIO-ACTIVO',
    'SNT-DESC-SERVICIO-ACTIVO',
  ],
};

let contador = 0;
/** Payload de intake válido y único (sin servicio). */
export function payloadValido() {
  const n = ++contador;
  return {
    nombre: `SNT-ENVIO-${n}-NOMBRE`,
    contacto: `snt-envio-${n}@example.invalid`,
    tipo_equipo: `SNT-ENVIO-${n}-EQUIPO`,
    descripcion: `SNT-ENVIO-${n}-DESCRIPCION`,
  };
}
