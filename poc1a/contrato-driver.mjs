// Esqueleto del driver de POC-1a (fase 1, paso 2): todo lanza NoImplementado.
// Se reemplaza paso a paso; esta versión existe para registrar el rojo inicial de la batería.
import { NoImplementado } from '../contrato/errores.mjs';

const no = (detalle) => async () => {
  throw new NoImplementado(detalle);
};
const canal = (nombre, tipo) => ({ nombre, tipo, leer: no(`canal ${nombre}`) });

export default async function crearDriver() {
  const base = process.env.POC_BASE_URL ?? 'http://127.0.0.1:3101';
  return {
    nombre: 'poc1a-payload-next',
    baseUrl: base,
    reset: no('reset'),
    canalesPublicos: [canal('html', 'html'), canal('api-rest', 'api'), canal('medios-publicos', 'medio'), canal('sitemap', 'sitemap')],
    canalesCerrados: [canal('graphql', 'graphql')],
    noAplica: { accion: 'acciones de servidor de Payload: cubiertas por e2e/acciones-servidor.spec.ts' },
    canalesEscritura: [{ nombre: 'api-rest', tipo: 'api', crear: no('crear'), actualizar: no('actualizar'), eliminar: no('eliminar') }],
    iniciarSesion: no('iniciarSesion'),
    sesionAnonima: { token: null },
    sesionInvalida: { token: 'invalida' },
    intake: { limite: { max: 1 }, preparar: no('POC-3'), enviar: no('POC-3') },
    admin: () => ({}),
    logs: no('logs'),
  };
}
