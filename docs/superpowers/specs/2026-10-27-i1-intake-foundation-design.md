# Diseño I1: Intake seguro y base ejecutable

## Objetivo

Entregar primer corte vertical: visitante registra una solicitud válida una sola vez y recibe confirmación genérica; administrador autenticado la revisa; actor anónimo no puede listar, contar, leer ni filtrar solicitudes.

## Base y propiedad

- Base: `producto/base@4302e2d47ba7c7a8119e99b2ed807e83ac8ca716`.
- Rama: `feat/mvp-v0.1`.
- Referencia de sólo lectura: `poc/candidata-a-3@40e4e5667e6049d2ab951fe0dd9cd5f58f58d541`.
- Un implementador autorizado es único escritor durante ejecución.
- Revisores QA y Security trabajan en lectura.

## Alcance

- Scaffold exacto de Next.js, Payload, PostgreSQL y TypeScript.
- Configuración Payload con GraphQL desactivado.
- Colecciones `usuarios`, `servicios` y `solicitudes`.
- Admin único creado por procedimiento local.
- Recuperación pública de contraseña cerrada.
- Servicios activos visibles y servicios inactivos privados.
- Formulario público usable sin JavaScript.
- Validación de servidor con allowlist estricta.
- Token CSRF, verificación de origen y cookie segura.
- Honeypot, tiempo mínimo, tamaño máximo y límite por origen.
- Nonce firmado y consumo único para reintentos idempotentes.
- Creación transaccional de solicitud en estado `recibida`.
- Bandeja y detalle nativos de Payload para admin.
- Logs estructurados sin PII.
- Migraciones versionadas, Docker local, CI y E2E productivo.

## Fuera de alcance

- Portafolio, perfil, proyectos y medios.
- Transiciones, motivos, eventos y edición de observaciones.
- Diseño público completo; I1 usa tokens mínimos compatibles.
- Notificaciones y correo transaccional.
- Adjuntos, pagos, órdenes, reservas o portal.
- Contenido real, staging, producción, DNS o backup externo.
- Tailwind CSS; se incorpora con el sistema visual de I3.

## Estructura

```text
src/
  app/
    (frontend)/servicios/solicitar/
    api/intake/
    (payload)/admin/
  collections/
  modules/
    identity/
    catalog/
    intake/
    observability/
  migrations/
test/
  unit/
  integration/
  http/
e2e/
```

Cada archivo tiene una responsabilidad. Rutas Next adaptan HTTP; `intake` conserva lógica de dominio; colecciones declaran persistencia y acceso.

## Contratos internos

```ts
export type DatosSolicitudPublica = Readonly<{
  nombre: string
  contacto: string
  tipoEquipo: string
  descripcion: string
  servicio?: string
  website: string
  token: string
}>

export type ResultadoIntake =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false
      codigo: 'entrada_invalida' | 'origen_invalido' | 'limite' | 'servicio_invalido' | 'interno'
      campos?: Readonly<Record<string, string>>
      reintentarEnSegundos?: number
      correlacion?: string
    }>

export interface ContextoIntake {
  origen: string | null
  ip: string | null
  ahora: Date
  cookieToken: string | null
}

export type ControlIntake = Readonly<{
  nonceHash: string
  claveLimite: string
  ventanaIniciaEn: Date
  expiraEn: Date
}>

export type ResultadoPersistencia =
  | Readonly<{ tipo: 'creada' }>
  | Readonly<{ tipo: 'reintento' }>
  | Readonly<{ tipo: 'limite'; reintentarEnSegundos: number }>
  | Readonly<{ tipo: 'servicio_invalido' }>
  | Readonly<{ tipo: 'error'; errName: string; pgCode?: string }>

export interface RepositorioIntake {
  crearSolicitud(
    datos: DatosSolicitudValidada,
    control: ControlIntake,
  ): Promise<ResultadoPersistencia>
}
```

`DatosSolicitudValidada` no contiene token ni honeypot. `ControlIntake` contiene hash del nonce, clave de límite, ventana y timestamps. Ninguna interfaz devuelve ID de solicitud.

## Validación

- `nombre`: string normalizado, 2 a 120 caracteres.
- `contacto`: string normalizado, 3 a 200 caracteres.
- `tipoEquipo`: string normalizado, 2 a 120 caracteres.
- `descripcion`: string normalizado, 20 a 4000 caracteres.
- `servicio`: UUID o identificador Payload opcional; debe existir y estar activo.
- `website`: debe permanecer vacío.
- Cuerpo total: máximo 16 KiB.
- Claves adicionales: rechazo.

Errores de campo sólo nombran `nombre`, `contacto`, `tipoEquipo`, `descripcion` y `servicio`.

## Seguridad

Cookie `__Host-jozeuzz-csrf` contiene un secreto aleatorio estable por navegador durante 30 minutos y usa `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` y ningún atributo `Domain`. `src/proxy.ts` la crea sólo cuando falta y pasa su valor al Server Component mediante cabecera interna de request; abrir otra pestaña no rota la cookie. Cada render genera un nonce distinto y un token firmado con secreto de servidor, secreto de cookie, emisión y expiración de 30 minutos. Comparación usa tiempo constante. Se acepta `Origin` propio; `Referer` propio sirve sólo cuando el navegador no envía `Origin`. Ausencia o origen distinto produce 403.

La IP llega únicamente desde `x-jozeuzz-client-ip`, fijada por el proxy después de eliminar cualquier valor enviado por cliente. Aplicación no publica puerto y sólo acepta tráfico desde red privada del proxy. No existe excepción loopback: cabecera interna ausente produce rechazo genérico antes de persistir. Cabeceras públicas `X-Forwarded-For`, `Forwarded` y equivalentes se ignoran en la aplicación.

Límite inicial: cinco intentos por 15 minutos por clave HMAC de IP. Respuesta 429 incluye `Retry-After`. La base guarda sólo la clave derivada, nunca la IP.

Tiempo mínimo entre render y envío: 800 ms. Honeypot lleno o envío demasiado rápido responde de forma genérica sin persistir solicitud.

## Persistencia

Una transacción PostgreSQL:

1. intenta reservar hash de nonce con constraint único;
2. si el nonce ya existe como completado, devuelve `reintento` sin consumir cuota;
3. para nonce nuevo, bloquea o crea contador de límite;
4. rechaza ventana agotada y revierte reserva;
5. valida servicio activo dentro de la operación;
6. crea solicitud con `estado = recibida` y timestamps de servidor;
7. marca nonce completado y confirma contador, nonce y solicitud juntos.

Conflicto concurrente espera resolución de la primera transacción: si quedó completada devuelve `reintento`; si hizo rollback, reintenta reserva. El mismo nonce nunca consume una segunda cuota. Nonce distinto crea otra solicitud; I1 no intenta deduplicación semántica.

Nonce y contador vencidos se purgan diariamente mediante tarea local. Nonces se conservan 24 horas, más que expiración del token. Ventanas de límite se conservan 24 horas desde su cierre. Índices cubren `expiraEn`, y la limpieza tiene prueba de conservación y borrado.

## Autorización

| Recurso | Anónimo | Admin |
|---|---|---|
| Servicio activo: leer por gateway público | Sí | Sí |
| Servicio inactivo: leer | No | Sí |
| Servicio: mutar | No | Sí |
| Solicitud: crear por API genérica | No | No |
| Solicitud: crear por `/api/intake` | Sí, contrato limitado | Sí |
| Solicitud: leer/listar/contar | No | Sí |
| Solicitud: actualizar/borrar | No en I1 | No en I1 |
| Usuario: leer/actualizar | No | sólo sesión propia; email e identidad no cambian por HTTP |
| Usuario: crear/borrar | No | No; sólo procedimiento local singleton |

La ruta intake llama `procesarIntake`; sólo ese orquestador puede usar `RepositorioIntake`. El repositorio confina cualquier `overrideAccess` a `repositorio-payload.ts`. Ninguna ruta HTTP llama repositorio directamente. Nunca se concede `create` público a `solicitudes`; incluso admin recibe 403/405 en `POST /api/solicitudes`.

La colección `usuarios` aplica `usuarioPropio` para lectura de sesión, deniega create/delete HTTP y bloquea actualización de email e identidad. Procedimiento local usa transacción y advisory lock para garantizar un único administrador incluso con dos altas concurrentes. En I1, `estado`, `motivoCierre` y cualquier observación administrativa tienen `access.update: () => false` a nivel de campo.

## Observabilidad

Eventos permitidos:

```text
intake_recibido
intake_rechazado
intake_creado
intake_reintento
intake_error
```

Campos permitidos: `evento`, `codigo`, `duracion_ms`, `correlacion`, `err_name` y `pg_code`. Quedan prohibidos cuerpo, nombre, contacto, descripción, cookie, token, IP, query, parámetros, `message`, `stack`, `cause`, `detail` y `where`.

## Respuestas HTTP

- Cliente JSON (`Content-Type: application/json` y `Accept: application/json`): `201` para creación/reintento; `400`, `403`, `429` o `500` con cuerpos cerrados.
- Formulario HTML (`application/x-www-form-urlencoded`): éxito responde `303` hacia confirmación. Validación, origen y límite responden HTML completo accesible con resumen e instrucciones de reintento; estado es `400`, `403` o `429`. El formulario nunca reemite valores enviados: usuario vuelve a ingresarlos. No se serializan errores ni PII en URL o cookies.
- Cualquier combinación ambigua de `Content-Type`/`Accept` se rechaza con `415` o `406` antes de procesar.

Todas usan `Cache-Control: no-store`. Ninguna expone ID, estado, existencia del servicio fuera del error de campo ni datos enviados.

## Criterios de aceptación

1. Dependencias exactas y lockfile; Node `>=24.22.0 <25`.
2. Migración funciona desde PostgreSQL vacío y segunda ejecución no cambia schema.
3. Admin se crea por procedimiento, no por formulario público.
4. `/admin` y solicitudes rechazan anónimos.
5. Formulario funciona con teclado y JavaScript desactivado.
6. Solicitud válida crea un registro `recibida`.
7. Estado, timestamps y campos administrativos son server-side.
8. Dos POST concurrentes con mismo nonce dejan un registro.
9. Servicio inactivo, CSRF inválido y origen inválido no crean registros.
10. Cabecera IP interna ausente, honeypot lleno o envío antes de 800 ms no crea registro y responde de forma genérica.
11. Sexto nonce distinto dentro de ventana produce 429 y `Retry-After`; replay de nonce completado no consume cuota.
12. Logs de app, proxy y PostgreSQL no contienen centinelas de PII.
13. Anónimo no lista, cuenta, consulta por ID ni filtra solicitudes.
14. GraphQL está desactivado y probado desde Task 2.
15. Dos altas administrativas concurrentes dejan un solo usuario; acceso queda restringido a la sesión propia.
16. E2E corre contra build productivo.
17. Lint, tipos, pruebas y build terminan con código cero.
18. No hay secretos, datos reales ni ORM adicional.
19. Worktrees POC y evidencia histórica no cambian.

## Riesgos y mitigaciones

- API transaccional interna de Payload: encapsular en `RepositorioIntake` y fijar versión.
- NAT compartido: límite moderado y ventana corta; revisar métricas sin PII.
- Bloqueo del único admin: procedimiento local de recuperación, sin endpoint público.
- Logs de dependencias: pruebas con centinelas en fallos de app, proxy y PostgreSQL.
- `drizzle push` interactivo: prohibido fuera de desarrollo desechable; producto usa migraciones.
- Advisories: verificar fuentes oficiales y auditoría antes de fijar lockfile.
