# Panel administrativo: contenido (F3) y solicitudes (F4) — jozeuzz.cl

> **Estado:** Propuesta (H0-b, 2026-10-21). No aprobado.
> **Autor:** jz-architect, unidad U5 de H0-b, rama `work/jozeuzz-autonomo` sobre `5e6befc`. No contiene datos reales, credenciales, rutas de operación ni comandos.
> **Etiquetas:** **[Definido]** lo fija una fuente citada (que puede seguir en borrador) · **[Propuesto]** recomendación sin aprobar · **[Pendiente]** decide el responsable · **[POC]** leído en el código de `poc1a/` o medido en su evidencia (desechable, no es scaffold, H0A-14) · **[Pendiente de verificar]** este documento no pudo comprobarlo.
> **Abreviaturas:** `RM` = [ROADMAP-MVP.md](../ROADMAP-MVP.md) · `REG` = [REGISTRO-DECISIONES-H0A.md](../REGISTRO-DECISIONES-H0A.md) · `ESP` = [ESPECIFICACION-FUNCIONAL.md](../ESPECIFICACION-FUNCIONAL.md) · `ADR` = [adr/0001-stack.md](../adr/0001-stack.md) · `EST` = [ESTADO-PROYECTO.md](../ESTADO-PROYECTO.md) · `ARQ` = [ARQUITECTURA.md](../ARQUITECTURA.md) · `UX` = [UX-ARQUITECTURA-INFORMACION.md](../UX-ARQUITECTURA-INFORMACION.md) · `INVENTARIO` = [INVENTARIO-CONTENIDO.md](INVENTARIO-CONTENIDO.md) · `WIREFRAMES` = [WIREFRAMES.md](WIREFRAMES.md) · `RECORRIDO` = [RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md) · `EVI` = [EVIDENCIA.md](../../poc1a/EVIDENCIA.md). Las citas a la POC van como `archivo:línea` relativas a `poc1a/`. `INV-nn` son las invariantes de RM › §3.3.

**Propósito.** Completa lo que WIREFRAMES › §1 (fila `/admin`) y §4 (regla 5) y RECORRIDO › §2 (paso 5) y §3 dejan a este documento: el acceso al panel (MVP-09, H2), la administración de contenido y medios (MVP-10, H3), la del catálogo de servicios (MVP-11, H4) y la gestión interna de solicitudes (MVP-12, H5). No remodela el contenido (INVENTARIO › §3) ni la Solicitud (H0A-02 a H0A-04). Los rótulos son borradores A→R (V-09).

**Independencia del stack.** ADR-0001 sigue **Propuesto** (EST › §2.1). Cada requisito indica su resolución probable: **N** = lo trae de forma nativa un CMS integrado como el de la opción A, si el ADR se acepta; **C** = configuración o extensión del CMS (reglas de acceso, hooks, vistas propias); **P** = código u operación propios con cualquier stack; **?** = sin evidencia. Con las opciones B o C del ADR, todo lo marcado N o C pasa a P (el panel se construye).

## 1. Alcance

| Incluido en el MVP | Fuente |
|---|---|
| Un único administrador, sin roles adicionales: «administrador» = sesión válida de la única cuenta (en la POC, cualquier usuario autenticado de la colección `users`, `src/access/index.ts:4-5`) | REG › H0A-05; ESP › §2 |
| Contenido: Perfil, Proyectos, Servicios, Medios y Ajustes (INVENTARIO › §3); Categoría sólo si DC-09 la adopta | RM › MVP-10, MVP-11 |
| Solicitudes: bandeja, detalle, observaciones internas, transiciones e historial | RM › MVP-12; REG › H0A-02 a H0A-04 |

| Fuera del MVP o del panel | Motivo |
|---|---|
| Interfaz de gestión de cuentas (alta, baja, invitaciones, recuperación por correo) | H0A-05: alta y recuperación por procedimiento (§2.3). Brecha de la POC: `Users` permite `create` al administrador (`src/collections/Users.ts:17`), lo que abriría una segunda cuenta; ver PA-04 |
| Notificaciones (correo, push, avisos externos) | H0A-06. Un contador dentro del panel no es una notificación [Propuesto] |
| Exportaciones (CSV u otras) | Salvo PA-16 |
| Borrado de solicitudes y de eventos desde cualquier canal | H0A-04 (eventos inmutables) y H0A-11 (sólo borrado por retención, por procedimiento y no por la API). Ningún canal borra solicitudes: `delete` cerrado en el servidor para REST, acciones de servidor y UI [Propuesto, deducido de ambas]. Brecha de la POC: `delete: soloAdmin` (`src/collections/Solicitudes.ts:11`); la FK `RESTRICT` de los eventos (`src/migrations/20261016_055416_poc1b.ts:21`; `EVIDENCIA.md:147`) sólo protege a las solicitudes que ya tienen eventos. Prueba PA-P26 |
| Respuesta al solicitante desde el panel, adjuntos, presupuestos, citas, órdenes de trabajo, reapertura, varios técnicos, aprobación entre administradores | INV-10; H0A-02 (`cerrada` terminal); ESP › §3 «No incluidos»; v0.2 (RM › §1.3) |

**Reparto probable [Propuesto].**

| Pieza | Resolución | Evidencia |
|---|---|---|
| Login, cookies, sesión, CSRF por origen, bloqueo por intentos | N | [POC] cookies, CSRF y bloqueo medidos (`EVIDENCIA.md:27-29`); caducidad y revocación de la sesión, sin medir |
| Cierre de recuperación por correo, `first-register` e `init` | C | Recuperación por correo sin probar por HTTP, sólo lectura de código (`EVIDENCIA.md:130-132`); `first-register` con admin existente e `init` medidos (`:30`, `:55`); `first-register` abierto sin usuarios e `init` que revela si hay admin, riesgos registrados (`:125`, `:140`). Cómo se cierran: [Pendiente de verificar] (ADR › §5, M3) |
| Segundo factor | ? | Sin evidencia |
| Listas, formularios, borradores, versiones, publicación, retirada y vista previa | N y C | [POC] F3 en E2E (`EVIDENCIA.md:38-39`); retirada con hook propio (`src/collections/Proyectos.ts:9-16`) |
| Validaciones al publicar, regla de referencias a Medio (B7), destacados ≤ 3 | C | B7 sin corregir (`EVIDENCIA.md:56-60`) |
| Eliminación de metadatos, rechazo de SVG por contenido, retirada urgente | C o P | [Pendiente de verificar]; la POC acepta `image/*` (`src/collections/Medios.ts:8`), que incluiría SVG |
| Bandeja con filtros cerrados | C o P | PA-10 |
| Transiciones, evento atómico, inmutabilidad | C | [POC] 111 LOC por `wc -l` (Solicitudes 69, Eventos 17, reglas 25; medición de POC-1b, hoy el archivo tiene 75 líneas) y 5 puntos de extensión, uno de ellos las guardas del driver y R-1 (`EVIDENCIA.md:148`; el total de 458 incluye driver y R-1, retirado después, `:177`). Brechas en §5.2 y §5.3 |
| Aislamiento bidi, confirmación de cierre, conflicto entre pestañas | C o P | Sin evidencia |
| Cabeceras (CSP, `frame-ancestors`, `no-store`, `X-Robots-Tag`) | P | Fuera del alcance de la POC (`EVIDENCIA.md:139`) |
| Accesibilidad de la UI del CMS | ? | [Pendiente de verificar] (§8) |

## 2. Acceso e identidad (MVP-09, H2)

### 2.1 Controles

| Control | Requisito [Propuesto salvo indicación] | Res. | En la POC |
|---|---|---|---|
| Autorización | [Definido] Toda operación administrativa, por cualquier canal, exige sesión y autorización comprobadas en el servidor; denegación por defecto (RM › MVP-09.1 y 09.2) | N y C | Reglas por colección y por campo (`src/access/index.ts:7-16`) |
| Login | Identificador y contraseña con mensaje de error único («Los datos de acceso no son válidos»), igual para cuenta inexistente, contraseña errónea o cuenta bloqueada, y con tiempo de respuesta similar (ESP › §6, enumeración). El identificador de acceso no coincide con ningún canal publicado (CON-01): es defensa en profundidad, no un control, y ninguna opción de PA-02 depende de que siga oculto. Que el CMS no distinga en su mensaje la cuenta bloqueada: [Pendiente de verificar] | N y ? | — |
| Cookies de sesión | `Secure`, `HttpOnly`, `SameSite` (`Strict` o `Lax`, según funcione la vista previa), prefijo `__Host-` si el stack lo permite [Pendiente de verificar], sin dominio padre. Con `Lax`, ninguna operación con efecto responde a `GET` | N | `Strict` y `Secure` (`src/collections/Users.ts:13`; `EVIDENCIA.md:27`) |
| Caducidad | Por inactividad, con aviso previo y extensión; absoluta, con aviso previo y reautenticación (§8): **PA-01**. Renovar el token no extiende la caducidad absoluta. Cerrar sesión invalida la sesión en el servidor, no sólo la cookie [Pendiente de verificar el soporte] | N y ? | Expiración del token de 7.200 s (`src/collections/Users.ts:11`); inactividad, caducidad absoluta y revocación, sin medir |
| CSRF | Toda mutación (REST, formularios, acciones de servidor, subida de medios) exige `Origin` exacto igual a `<origen>`; sin `Origin`, rechazo. `SameSite` es defensa adicional, no la única | N | Medido sólo por REST: `Origin` ajeno y ausente rechazados (`EVIDENCIA.md:28`; `src/payload.config.ts:25`) |
| Límite de intentos | **PA-02**. Riesgo: un bloqueo por cuenta permite a cualquiera que conozca o adivine el identificador dejar fuera al único administrador de forma repetida. Las opciones de PA-02 combinan límite por IP (sólo la IP que entrega un proxy de confianza), retroceso progresivo y red restringida; el desbloqueo es por el procedimiento de §2.3 | N (por cuenta) y P (por IP) | Bloqueo por cuenta tras 5 intentos durante 10 min (`src/collections/Users.ts:9-10`; `EVIDENCIA.md:29,124`) |
| Recuperación por correo | **Cerrada** en todos los canales, con la del cambio de contraseña por token: la recuperación es por procedimiento (H0A-05; ADR › §5, M3). Prueba negativa PA-P05 | C | Abierta al anónimo; deja el correo en los logs y escribe un token (`EVIDENCIA.md:130-132`) |
| Primer registro e inicialización | La cuenta se crea por el procedimiento antes de exponer el servicio; el registro inicial y la consulta de inicialización se cierran o responden siempre igual (ADR › §5, «Otros») | C y P | Con admin existente, el registro inicial falla ≥ 400 (`EVIDENCIA.md:30`); abierto sin usuarios (`:125`); `init` revela si hay admin (`:55,140`) |
| Más cuentas | Ningún canal crea, borra ni desbloquea cuentas ni cambia el identificador de acceso salvo el procedimiento: **PA-04**. Si PA-04 = (b), cambiar la contraseña exige la actual comprobada en el servidor e invalida las demás sesiones | C | `create`, `update` y `unlock` para el admin; `delete` cerrado (`src/collections/Users.ts:15-21`; `update` en `:18`) |
| Secreto de firma de sesiones | Aleatorio, de 32 bytes o más, fuera del repositorio; el servicio no arranca sin él (§2.3) | P y ? | `secret: process.env.PAYLOAD_SECRET \|\| ''` (`src/payload.config.ts:39`); que Payload rechace el secreto vacío: [Pendiente de verificar] |
| Claves de API | Desactivadas | N | `useAPIKey: false` (`src/collections/Users.ts:12`) |
| Segundo factor | **PA-03**. Si se adopta, sus códigos de recuperación entran en el procedimiento de §2.3 | ? | No existe |

### 2.2 `/admin` fuera de lo público [Definido en RM › MVP-09.4; detalle Propuesto]

- Todas las respuestas bajo `/admin` y de la API administrativa, incluidos el login, los errores y las redirecciones, llevan `X-Robots-Tag: noindex, nofollow` y `Cache-Control: no-store` (WIREFRAMES › §5). `robots.txt` y el sitemap no lo nombran; ninguna página pública lo enlaza (WIREFRAMES › §1). No es una medida de seguridad: la protección es la autorización (MVP-09.4).
- Un anónimo que pide una ruta interna recibe el login, sin datos ni identificadores en el cuerpo (`EVIDENCIA.md:49-50`). La vuelta tras el login sólo acepta rutas relativas bajo `/admin`, nunca una URL absoluta (redirección abierta).

### 2.3 Procedimiento de alta y recuperación del acceso (esquema; H0A-05, antes de H2)

Sólo pasos; el documento operativo se redacta en H2 sin secretos, y los agentes no lo ejecutan (H0A-10). **Factor de confianza: PA-05.**

```text
ALTA (una vez por entorno)
1. Precondición: entorno sin exposición pública y sin ninguna cuenta.
2. Ejecuta: el responsable, con el factor de confianza de PA-05. Nunca un agente.
3. Genera la credencial en su gestor de contraseñas: aleatoria y con la longitud
   mínima que comprueba el servidor. No va a Git, chat, tickets, capturas ni
   variables de entorno (persistentes o no) ni argumentos de órdenes.
3b. Genera el secreto de firma de sesiones: aleatorio, de 32 bytes o más, fuera
   del repositorio. El servicio no arranca sin él.
4. Crea la única cuenta con la orden de operación del servidor definida en H2:
   no es una ruta HTTP ni se activa al arrancar; lee la contraseña por entrada
   interactiva o stdin (nunca como argumento ni variable de entorno, persistente o no) y falla si
   ya existe una cuenta. Nunca por el registro inicial expuesto.
5. Comprueba: inicio de sesión correcto; registro inicial, inicialización y
   recuperación por correo cerrados (PA-P05); exactamente una cuenta.
6. Si PA-03 adopta segundo factor: lo enrola y guarda los códigos fuera del host.
7. Registra fecha, entorno y referencia Git del procedimiento, sin credenciales
   ni identificador de acceso. Sólo entonces se expone el servicio.

RECUPERACIÓN (contraseña perdida, bloqueo o segundo factor perdido)
1. Sólo el responsable, acreditado por el factor de confianza (no por correo).
2. Bloqueo temporal: esperar su fin o desbloquear por la orden de operación.
3. Restablece la credencial por la orden de operación; nunca por un endpoint público.
4. Invalida todas las sesiones abiertas; si el stack no lo permite, rota siempre
   el secreto de firma [Pendiente de verificar el soporte; la POC tiene la tabla
   users_sessions, src/migrations/20261015_174323_inicial.ts:11].
5. Revisa los registros de acceso (sin PII) en busca de intentos anómalos.
6. Si sospecha compromiso: rota el secreto de firma (si no se rotó en el paso 4)
   y revisa los eventos de solicitudes y los cambios de contenido recientes.
7. Registra el hecho como en el paso 7 del alta.
ENSAYO: ambos se ensayan en staging, siguiendo sólo el documento, antes de cerrar H2 (PA-P07).
```

## 3. Navegación e información del panel

**Secciones [Propuesto].** Navegación con nombre accesible «Panel»: **Inicio** · **Contenido**: Perfil, Proyectos, Servicios (desde H4), Medios, Ajustes · **Operación**: Solicitudes (desde H5). Barra superior: marca, «Ver sitio» y «Cerrar sesión». Las colecciones técnicas del CMS (cuentas, salvo PA-04 (b) o (c); eventos, preferencias, migraciones) no aparecen en la navegación [Propuesto]; el historial se ve sólo dentro de cada solicitud. En móvil, una columna y la navegación con el patrón de disclosure de WIREFRAMES › §2.

**Pantalla inicial [Propuesto].** Sin PII: recuentos de solicitudes `recibida` y `en_gestion` (sin nombres, contactos ni descripciones); estado del Perfil (publicado, borrador o con cambios sin publicar); recuentos de proyectos por estado y de servicios activos; avisos accionables: medios con `contiene_datos_personales` sin revisar y contenido publicado que muestra un medio retirado de urgencia.

Wireframes de escritorio; `(Texto)` = botón o enlace, `<…>` = dato, `*` = obligatorio.

```text
LISTA DE PROYECTOS
[Barra: jozeuzz.cl · Panel]                              (Ver sitio) (Cerrar sesión)
[Navegación «Panel»]
h1 Proyectos                                                       (Nuevo proyecto)
Estado: [Todos | Borrador | Publicado | Retirado]    Orden: [Orden | Actualizado]
| Título    | Estado                           | Destacado | Actualizado | Acción             |
| <titulo>  | Publicado                        | Sí        | <fecha>     | (Editar <titulo>)  |
| <titulo>  | Publicado · cambios sin publicar | No        | <fecha>     | (Editar <titulo>)  |
| <titulo>  | Retirado                         | No        | <fecha>     | (Editar <titulo>)  |
Vacío: «Todavía no hay proyectos.» (Nuevo proyecto)
```

```text
EDICIÓN DE PROYECTO
Migas: Panel › Proyectos › <titulo>
h1 Editar proyecto: <titulo>
Estado: Publicado · hay cambios sin publicar · guardado a las <hora>     [role=status]
(Guardar borrador) (Vista previa) (Publicar cambios) (Retirar…)  ← sólo las del estado
[Resumen de errores, si los hay: un enlace por campo]
h2 Contenido     titulo* · slug* · resumen* · contexto* · problema · contribucion*
h2 Ficha         periodo · etiquetas · enlace_repositorio (https) · enlace_demo (https)
h2 Decisiones y resultados   listas con (Añadir) (Subir) (Bajar) (Quitar), sin arrastre obligatorio
h2 Medios        portada [elegir de la biblioteca] · medios ×≤12 · aviso si alguno bloquea
h2 SEO           seo_titulo · seo_descripcion · imagen_social (muestra el valor por defecto)
h2 Publicación   destacado (≤ 3 en total) · orden
h2 Privado, no se publica    origen* · autorizacion_tercero · notas_internas
Sólo lectura: publicado_en · retirado_en · actualizado_en
```

```text
BIBLIOTECA DE MEDIOS
h1 Medios                                                            (Subir medio)
Visibilidad: [Todos | Público | Privado]   Revisión: [Todos | Con datos personales o sin revisar]
| Miniatura | alt   | Visib.  | Datos personales | Permiso  | Usado en     | Acción                        |
| [img]     | <alt> | Privado | Sí, sin revisar  | propio   | 0            | (Editar <alt>)                |
| [img]     | <alt> | Público | No               | licencia | 2 proyectos  | (Editar <alt>) (Retirar ya…)  |
Subir: archivo* · alt* · leyenda · credito · permiso_uso* · permiso_referencia
       [x] Contiene datos personales (marcada por defecto)    (Subir)
Tras subir: «Metadatos eliminados. Nombre público generado.» [role=status]
```

```text
BANDEJA DE SOLICITUDES (formulario GET; sólo valores de lista blanca)
h1 Solicitudes
Estado [Abiertas | Recibida | En gestión | Cerrada | Todas]   Motivo [Cualquiera | Atendida |
Descartada | Duplicada | Spam] (con Cerrada)   Recibida entre [fecha] y [fecha] (PA-11)
(Aplicar) (Quitar filtros)          «<n> solicitudes · página 1 de <m>» [role=status]
| Recibida | Estado     | Equipo              | Servicio                  | Acción                        |
| <fecha>  | Recibida   | <bdi tipo_equipo>   | <nombre> (desactivado)    | (Abrir solicitud del <fecha>) |
| <fecha>  | En gestión | <bdi tipo_equipo>   | Sin preferencia           | (Abrir solicitud del <fecha>) |
(Anterior) Página 1 de <m> (Siguiente)          Columnas según PA-13
Vacío con filtros: «Ninguna solicitud cumple estos filtros.» (Quitar filtros)
```

```text
DETALLE DE SOLICITUD
Migas: Panel › Solicitudes › Solicitud del <fecha>
h1 Solicitud del <fecha y hora>                         Estado: Recibida
h2 Datos del solicitante     (texto plano, cada valor en <bdi> o dir="auto")
   Nombre <bdi>  ·  Contacto <bdi> (sin enlace automático)  ·  Equipo <bdi>
   Servicio: <nombre> (desactivado) | Sin preferencia
   Descripción: <bloque con saltos de línea conservados, sin HTML>
h2 Cambiar estado            ← sólo transiciones válidas
   Recibida:   (Pasar a «En gestión»)  (Cerrar…)
   En gestión: (Cerrar…)
   Cerrada:    «Cerrada el <fecha> · motivo: <Motivo>». Sin acciones.
   Cerrar… → Motivo* [Atendida | Descartada | Duplicada | Spam]  (Confirmar cierre) (Cancelar)
h2 Observaciones internas (privadas)   [área de texto]   (Guardar observaciones)
h2 Historial (sólo lectura)
   <fecha> · Recibida (registro de la solicitud, no es un evento)
   <fecha> · Recibida → En gestión · Administrador
   <fecha> · En gestión → Cerrada · motivo: Atendida · Administrador
```

Listas y bandeja usan tablas con encabezados de columna; el estado va en texto, no sólo en color (1.4.1). La UI muestra rótulos legibles («En gestión», «Atendida»); los códigos (`en_gestion`, `atendida`) sólo viajan en formularios y datos [Propuesto].

## 4. F3: administración de contenido (MVP-10, MVP-11; H3 y H4)

### 4.1 Acciones por entidad y estado [Propuesto sobre INVENTARIO › §3]

| Entidad | Estados | Acciones visibles | Notas |
|---|---|---|---|
| Perfil (único) | borrador, publicado | Guardar borrador · Vista previa · Publicar (cambios) · Volver a borrador (confirmación: `/sobre-mi` pasa a la 404 única y se ocultan sus enlaces, WIREFRAMES › §2) | No se crea ni se borra: existe desde el alta |
| Proyecto | borrador, publicado, retirado (DC-14) | Borrador: Guardar, Vista previa, Publicar · Publicado: Guardar borrador, Vista previa, Publicar cambios, Retirar · Retirado: Guardar, Vista previa, Re-publicar | Borrar: PA-07 |
| Servicio | activo / inactivo; si tiene borradores, [Pendiente] (INVENTARIO › §3.3) | Guardar · Activar · Desactivar | Borrar uno referenciado por solicitudes se rechaza [Propuesto]. [POC] la FK de `servicio` es `SET NULL` (`src/migrations/20261015_174323_inicial.ts:193`): borrar un servicio vacía la referencia de sus solicitudes, contra INV-16; brecha a corregir en H4 (PA-P14) |
| Medio | público / privado | Subir · Editar metadatos · Retirar ya · Borrar sólo si no está referenciado | §4.4. [POC] las relaciones de proyectos y de sus versiones a medios son `CASCADE` (`src/migrations/20261015_174323_inicial.ts:187-188,191-192`): borrar un medio quita la referencia sin aviso; brecha (PA-P12) |
| Ajustes (único) | PA-06 | Guardar (o Guardar borrador y Publicar) | Las mismas validaciones de enlaces y de Medio |

- **Crear y guardar.** Un proyecto nuevo nace en borrador y un servicio, inactivo (`activo` por defecto falso, `src/collections/Servicios.ts:18`). Guardar un borrador valida tipos y límites, no la obligatoriedad, para permitir trabajo incompleto [Propuesto; si el CMS lo permite, Pendiente de verificar].
- **Borrador sobre publicado.** El anónimo ve sólo la última versión publicada; los borradores y los medios nuevos son privados (INV-01). Guardar un borrador no cambia `actualizado_en` proyectable (INVENTARIO › §3). Descartar los cambios o restaurar versiones: PA-08.
- **Publicar.** Valida todo (§4.2) y aplica el cambio de forma atómica: o se publica entero o no cambia nada. Tras publicar, «Publicado» y un enlace «Ver en el sitio». Propagación sin redespliegue (H0A-07; MVP-10.8): la POC midió 53 ms sin caché (`EVIDENCIA.md:82`), cifra no extrapolable a ISR ni a una caché (`EVIDENCIA.md:155`); con caché, publicar la invalida y el tiempo se vuelve a medir en H3 contra el objetivo provisional de 60 s (REG › POC-1a).
- **Retirar.** Confirmación que explica el efecto (la página pasa a la 404 única y sale del sitemap). No borra el registro (INV-12; MVP-10.3). Re-publicar repite las validaciones. La POC lo modela volviendo a borrador con la marca `retiradoEn` (`src/collections/Proyectos.ts:9-16`) y lo verificó en E2E (`EVIDENCIA.md:39`).
- **Desactivar un servicio** lo saca del catálogo y del selector (INV-11) y no modifica las solicitudes que lo referencian (INV-16; MVP-11.2), que siguen mostrándolo como «(desactivado)» (§5.2).

### 4.2 Validaciones al publicar o activar (servidor; resolución C)

1. Campos obligatorios y límites de INVENTARIO › §3.1 a §3.3 y §3.6 (por ejemplo, `contexto` y `contribucion` del Proyecto; `precio_clp` sólo y siempre con `clp_referencial`; `autorizacion_tercero` si `origen = tercero`; evidencia en cada resultado).
2. Slug único (INV-02, INV-03) y con formato `[a-z0-9-]`, con error comprensible que nombra el campo (MVP-10.4). El cambio de slug de un publicado sigue pendiente (INVENTARIO › §3.2).
3. Regla de referencias a Medio (INVENTARIO › §3.5): se rechaza si alguna referencia apunta a un medio privado, con `contiene_datos_personales` verdadero o sin `permiso_referencia` cuando no es propio. El error nombra el campo y el motivo. Responde a B7 (ADR › §5) sin cerrarlo.
4. Enlaces externos sólo `https:` (o `mailto:` aprobado), al guardar y al renderizar (WIREFRAMES › §4, regla 6). Los enlaces internos hacia contenido no publicado siguen INVENTARIO › §3.5 [Pendiente].
5. Como máximo 3 proyectos destacados.
6. El texto enriquecido no admite HTML arbitrario (INVENTARIO › §3).

### 4.3 Vista previa (RF-16, *Should*; C-04 abierta)

Sigue WIREFRAMES › §4, regla 5: sólo bajo `/admin`, o con sesión y rol comprobados en el servidor en cada petición; nunca un parámetro o token que baste por sí solo; `Cache-Control: private, no-store`; `X-Robots-Tag: noindex, nofollow`; fuera del sitemap, de robots y de canonical; un anónimo recibe la misma 404 que una ruta inexistente. El modo borrador del framework, su cookie o un secreto compartido de vista previa no bastan: cada petición que devuelve datos de borrador vuelve a comprobar la sesión en el servidor [Propuesto]. Además [Propuesto]: usa los componentes públicos con los datos del borrador, lleva una franja «Vista previa: no publicado» en texto, y muestra los medios privados sólo al administrador. En la POC, la vista previa es la ruta pública con `?preview=1` (`src/collections/Proyectos.ts:22`) y el anónimo recibe 404 (`EVIDENCIA.md:38`): cumple la regla sólo si el parámetro nunca basta sin la sesión.

### 4.4 Medios (V-10, V-11, V-12; resolución C o P)

- **Subida.** El servidor elimina los metadatos (EXIF con GPS, XMP, IPTC, comentarios; en PDF, autor, productor, revisiones, adjuntos y capas) y genera el nombre público (V-12); también en los derivados redimensionados. Tipo comprobado por contenido, no por extensión ni por el tipo declarado; **sin SVG** (INVENTARIO › §3.5); formatos y tamaño según D-06 (la POC limita a 5 MB, `src/payload.config.ts:43`).
- **Metadatos obligatorios.** `alt` de 1 a 150 caracteres y distinto del nombre del archivo (en la POC es opcional, `src/collections/Medios.ts:14,21`); `permiso_uso`; `contiene_datos_personales` **verdadero por defecto** hasta que el responsable lo revisa; con él verdadero, el medio no puede ser público.
- **«Usado en».** Cada medio lista qué contenido lo referencia (sólo en el panel). Borrar un medio referenciado se rechaza.
- **Retirada urgente («Retirar ya…»).** Una acción con confirmación que deja el medio privado y deja de servirlo a anónimos de inmediato, incluidos sus derivados y las copias en cachés propias (optimizador de imágenes, CDN propia, ISR), que se purgan en la misma acción [Propuesto]; el contenido que lo usa se muestra sin el medio y sin hueco, y no se despublica (INVENTARIO › §3.5). Lo mismo ocurre cuando un medio referenciado por contenido publicado pasa a privado o a `contiene_datos_personales` verdadero (INVENTARIO › §3.5). El panel avisa de que las copias en cachés externas y buscadores no se controlan desde aquí (purga según D-13, [Pendiente]).
- **Entrega de archivos [Propuesto].** Toda respuesta de un archivo de medios lleva `X-Content-Type-Options: nosniff`, el `Content-Type` del tipo verificado por contenido y `Content-Security-Policy: default-src 'none'; sandbox`; un PDF se sirve con `Content-Disposition: attachment`. Además del tamaño en bytes, hay un límite de dimensiones en píxeles (D-06). [POC] se aceptan `image/*` y `text/plain` (`src/collections/Medios.ts:8`).
- **Privados.** Un medio enlazado sólo desde contenido no publicado no se descarga de forma anónima aunque se conozca su URL (MVP-10.5); la proyección pública nunca lleva su id ni su colección (B7).

## 5. F4: gestión interna de solicitudes (MVP-12, H5)

### 5.1 Bandeja

- **Filtros de lista blanca [Definido en MVP-12.3; valores Propuestos].** `estado` ∈ {`abiertas` (recibida y en_gestion, por defecto), `recibida`, `en_gestion`, `cerrada`, `todas`}; `motivo` ∈ {`atendida`, `descartada`, `duplicada`, `spam`}, sólo con `cerrada`; rango de fechas de recepción, PA-11. El servidor traduce cada valor admitido a una consulta fija; nunca pasa un parámetro como campo, operador ni filtro a la capa de datos (ARQ › Seguridad relevante heredada del prototipo). Parámetros desconocidos: se ignoran. Valor no admitido, repetido, en forma de array u operador: se aplica el valor por defecto de ese filtro y se avisa «Se ignoró un filtro no válido». La regla vale para todo canal que liste Solicitudes con sesión, no sólo para la bandeja: la lista nativa de un CMS y su REST admiten filtros genéricos, y cómo se cierran es **PA-10**.
- **Sin búsqueda libre** por contacto, nombre ni descripción en el MVP (minimización; ARQ › Seguridad relevante heredada del prototipo): **PA-15**.
- **Orden y paginación.** Orden por defecto: PA-12. Tamaño de página fijo; la página es un entero validado; fuera de rango, la última página. El usuario no controla el límite.
- **Columnas.** Nunca el contacto ni la descripción completa en la lista por defecto: PA-13. La deduplicación manual de D-09 (c) (RECORRIDO › §5.3) puede necesitar ver más.

### 5.2 Detalle

- **Escrituras permitidas [Propuesto].** En el servidor, el administrador sólo escribe `observaciones_internas` (según PA-14) y ejecuta transiciones (§5.3). `nombre`, `contacto`, `tipo_equipo`, `descripcion`, `servicio`, `estado`, `motivo_cierre` y las marcas de tiempo tienen `update` cerrado por campo en todos los canales. Sólo el intake crea solicitudes: `create` cerrado por REST, acciones de servidor y UI, salvo el intake, que es el único canal de creación. [POC] `create` y `update` son `soloAdmin` (`src/collections/Solicitudes.ts:11`) y esos campos no tienen acceso por campo (`:56-68`). Prueba PA-P27.
- **Título.** En todo el panel (`<title>`, migas, selectores de relación, historial) una solicitud se nombra `Solicitud del <fecha>`, nunca con un dato del solicitante [Propuesto]. [POC] `useAsTitle: 'nombre'` (`src/collections/Solicitudes.ts:10`) lo contradice. Aislar los valores con `<bdi>` en las vistas nativas del CMS exige componentes propios [Pendiente de verificar].
- **Datos del solicitante.** Texto plano escapado; cada valor aislado con `<bdi>` o `dir="auto"` (RECORRIDO › §3, caracteres admitidos), aunque el intake ya rechace los caracteres bidi: los datos pueden venir de antes de esa regla o de otra vía. La descripción conserva los saltos de línea, no interpreta HTML ni Markdown y parte las cadenas largas sin romper la maquetación. El contacto no se convierte en enlace `mailto:` ni `tel:` [Propuesto]: es un dato no confiable. La respuesta al solicitante va fuera del sistema (RECORRIDO › §2, paso 5).
- **Servicio.** Si fue desactivado después, se muestra igual, con «(desactivado)» (INV-16).
- **Observaciones internas (H0A-03).** Un único campo, sólo para el administrador, con límite de longitud [Propuesto: el mismo orden que la descripción] y una ayuda que pide no copiar contraseñas ni datos de terceros. Guardarlo no cambia el estado ni crea un evento (el evento no lleva texto libre, H0A-04). Si se edita en `cerrada`: PA-14. En la POC, acceso por campo sólo para el administrador (`src/collections/Solicitudes.ts:69-73`).
- **Historial (H0A-04).** Lista de eventos con estado anterior, nuevo, actor, fecha y motivo; sin edición ni borrado por ningún canal. [POC] acceso cerrado en `src/collections/EventosSolicitud.ts:8`; REST denegado medido (`EVIDENCIA.md:146`); el resto de canales, PA-P19. La recepción se muestra desde la marca de creación, no como evento.
- **Actor [Propuesto].** Sale sólo de la sesión comprobada en el servidor: una transición sin administrador autenticado se rechaza; no se registra con un actor genérico (INV-07). Se guarda como referencia a la cuenta o identificador de formato fijo, nunca como texto libre ni como correo, y se muestra como «Administrador». [POC] `String(req.user?.id ?? 'sistema')` (`src/collections/Solicitudes.ts:44`) en un campo de texto (`src/collections/EventosSolicitud.ts:13`). Prueba PA-P16.

### 5.3 Transiciones (H0A-02)

| Estado actual | Acciones ofrecidas | Rechazadas en el servidor aunque se envíen |
|---|---|---|
| `recibida` | Pasar a `en_gestion` · Cerrar (exige `motivo_cierre`) | `recibida → recibida`, estado desconocido, motivo sin cerrar, `motivo_cierre` sin `estado` |
| `en_gestion` | Cerrar (exige `motivo_cierre`) | `en_gestion → recibida`, `en_gestion → en_gestion`, motivo sin cerrar, `motivo_cierre` sin `estado` |
| `cerrada` | Ninguna (terminal, sin reapertura) | `cerrada → *`, incluida `cerrada → cerrada`; cambiar o vaciar `motivo_cierre` |

- **La regla vive en el servidor [Propuesto].** La interfaz sólo ofrece las válidas. `estado` y `motivo_cierre` sólo se escriben mediante la operación de transición; cualquier otra escritura que los incluya se rechaza aunque no cambie el estado. [POC] `validarTransicion` (`src/lib/solicitudes.ts:58-69`; motivo sólo al cerrar, `:63-65`) sólo se aplica cuando cambia `estado` (`src/collections/Solicitudes.ts:25`) y el evento sólo se crea en ese caso (`:37`): por lectura de código, un PATCH con sólo `motivo_cierre` lo modifica sin evento. Brecha a corregir en H5 (PA-P17).
- **Confirmación al cerrar.** Diálogo accesible: título, motivo obligatorio, foco inicial en el selector de motivo, Escape cancela y el foco vuelve a «Cerrar…». Sin JavaScript, una página de confirmación en dos pasos. Avisa de que `cerrada` es terminal.
- **Atomicidad.** Estado y evento en la misma transacción (H0A-04): o ambos o ninguno. La interfaz anuncia el éxito sólo tras el commit; si falla, muestra el estado real sin cambios y el error recuperable. [POC] El evento se crea con la misma petición (`src/collections/Solicitudes.ts:36-50`) y el rollback se verificó con PostgreSQL (`EVIDENCIA.md:145-146`).
- **Reintento.** Repetir una transición ya aplicada falla como inválida (por ejemplo, `en_gestion → en_gestion`) y se presenta como conflicto, no como error: nunca crea un segundo evento.
- **Concurrencia [Propuesto, no opcional].** La transición envía el estado esperado y el servidor la aplica sólo si el estado almacenado coincide, de forma atómica (actualización condicionada o bloqueo de fila) en la misma transacción que el evento; si no coincide, responde conflicto sin evento. Ejemplo: la pestaña A muestra `recibida`; B la cierra; A pulsa «Pasar a en gestión» y recibe conflicto. Sin actualización condicionada, dos transiciones válidas concurrentes desde `recibida` (a `en_gestion` y a `cerrada`) podrían aplicarse ambas, con dos eventos: el control es requisito de H5 (PA-P22). [POC] la validación compara con `originalDoc` (`src/collections/Solicitudes.ts:25`), sin actualización condicionada en ese código; el aislamiento real, [Pendiente de verificar]. Observaciones que se sobrescriben en silencio: **PA-14** y **PA-17**.

## 6. Estados y errores del panel (UX › §4; MVP-09.5)

| Estado | Comportamiento [Propuesto] | Accesibilidad |
|---|---|---|
| Carga | Indicador en texto; el contenido no salta al llegar | `role="status"` moderado; `aria-busy` en la región |
| Guardado | «Guardado a las <hora>» o «Publicado» con «Ver en el sitio» | `role="status"`; el foco no se mueve |
| Error de validación al publicar | No se publica nada; resumen con un enlace por campo y mensaje junto al campo; el borrador queda guardado | Foco al resumen; `aria-invalid`; prefijo «Error:» (3.3.1, 3.3.3) |
| Sesión expirada | Aviso previo con «Seguir conectado» por inactividad; aviso previo y nuevo login al llegar la absoluta (PA-01). Si expira con cambios pendientes: el panel los conserva **en memoria**, pide volver a entrar (diálogo o pestaña nueva) y ofrece reenviarlos. Nunca guarda PII en `localStorage` ni `sessionStorage`. Sin JavaScript, el login vuelve a la ruta interna y lo no enviado puede perderse: el aviso lo dice | Aviso con tiempo suficiente (§8) y foco al diálogo |
| Acceso denegado | Sin sesión: login. Con sesión y recurso inexistente: 404 del panel, sin datos | Página con `h1` y enlace a Inicio |
| Conflicto | «Esta solicitud cambió desde que la abriste (ahora: <estado>). Recarga para ver el estado actual.» Nunca sobrescribe un estado (§5.3) | `role="alert"`; botón «Recargar» |
| Bloqueo por intentos | El mismo mensaje del login; no revela si la cuenta existe ni si está bloqueada | — |
| Medio bloqueado por la regla | Error al publicar que nombra el campo y el motivo (privado, datos personales, permiso) | Enlace al campo y a «Editar medio» |
| Error recuperable (red, 5xx) | «No se pudo guardar. Tus cambios siguen aquí.» con «Reintentar»; mensaje genérico sin datos técnicos | `role="alert"`; datos intactos |

## 7. Seguridad y privacidad del panel

**Denegación por defecto por canal.** Cada canal tiene una prueba negativa anónima y otra con sesión caducada o manipulada, de lectura (PA-P01) y de escritura (PA-P28), con control positivo (con un solo rol no hay «sesión no administrativa»; MVP-12.7) [Propuesto].

| Canal | Requisito | [POC] |
|---|---|---|
| UI del panel y su RSC | Sin datos ni ids para el anónimo | Login 200 sin datos; RSC 307 (`EVIDENCIA.md:49-50`) |
| REST de colecciones, versiones, `count`, cuentas, preferencias, bloqueos, migraciones, permisos | Sin datos; `where`, `sort`, `select` y `depth` sobre campos privados sin efecto | `EVIDENCIA.md:31-32,52-54` |
| GraphQL | Deshabilitado si no se usa; si existe, mismas reglas | Deshabilitado (`src/payload.config.ts:28`); todo ≥ 400 (`EVIDENCIA.md:33`) |
| Acciones de servidor | Autorización en cada acción; sin sesión, `Unauthorized` | Una sola acción (`form-state`) reenviada sin cookies, `Unauthorized`, sólo en `next dev` (`EVIDENCIA.md:41-43,156`) |
| Colección de medios | Sin listado ni metadatos para el anónimo; el archivo sólo se sirve si es público y lo referencia contenido publicado | `read: () => true` en medios públicos (`src/collections/Medios.ts:12`): por lectura de código, expone el listado y sus metadatos; sin medir |
| Medios privados y vista previa | §4.3 y §4.4 | `EVIDENCIA.md:38` |
| Acceso por campo | Pruebas propias además de las de colección: en la POC sólo vitest detectaba su relajación | `EVIDENCIA.md:68-70` |

- **Respuestas de acciones de servidor (FS).** Pueden devolver al administrador su correo y los ids de sesión (`EVIDENCIA.md:117-118`): nunca se registran, ni en logs ni en el gestor de errores (ADR › §5, FS). Reducir lo que devuelven: [Pendiente de verificar].
- **Logs (INV-15).** Sin PII, sin cuerpos de petición ni de respuesta, sin cookies ni cabeceras de autorización, sin el identificador de acceso en los fallos de login; sólo evento, código, duración y correlación, como el intake (RECORRIDO › §8). La consulta de la bandeja no lleva PII porque sus valores son de lista blanca.
- **Cabeceras [Propuesto].** CSP propia del panel, tan estricta como permita su UI [Pendiente de verificar]; `frame-ancestors 'none'`, con la excepción `'self'` sólo si la vista previa se embebe en el panel; archivos de medios según §4.4; `X-Content-Type-Options: nosniff`; `Cache-Control: no-store`; `X-Robots-Tag` (§2.2); `Referrer-Policy: no-referrer` en el panel; HSTS en el despliegue. Sin recursos de terceros en el panel. Los medios privados se sirven con `no-store` y nunca como HTML.
- **B7.** Regla de referencias a Medio (§4.2, punto 3) con prueba PA-P11; si cuenta como configuración nativa lo decide el responsable (ADR › §5).
- **Retención [Pendiente, H0A-11].** Solicitudes, observaciones, eventos, medios privados, campos privados de contenido, registros de acceso y backups siguen la política que se apruebe antes de datos reales; hasta entonces sólo datos sintéticos y los eventos no se borran. Ningún canal borra solicitudes: `delete` cerrado en el servidor (§1; PA-P26).

## 8. Accesibilidad del panel

- **Objetivo [Propuesto].** WCAG 2.2 AA también en el panel: ESP › §6 «Web» no lo limita al sitio público y el administrador también es un usuario.
- **UI de terceros.** La conformidad de la UI de un CMS, incluido su editor de texto enriquecido, es **[Pendiente de verificar]**; lo que no cumpla se trata según PA-09.
- **Requisitos propios mínimos.** Todo operable con teclado, incluidos el editor, los selectores de medios y el diálogo de cierre; reordenar con botones, sin depender de arrastrar (2.5.7); foco visible y no oculto por barras fijas (2.4.7, 2.4.11); etiqueta visible en cada campo (3.3.2); errores identificados y con sugerencia (3.3.1, 3.3.3); contraste de texto y de componentes (1.4.3, 1.4.11); estados en texto (1.4.1); mensajes de estado (4.1.3); objetivos de 24×24 (2.5.8); reflujo a 320 px (1.4.10); login que admite pegar y gestores de contraseñas, con `autocomplete` de usuario y contraseña actual, sin pruebas cognitivas (3.3.8).
- **Límites de tiempo.** 2.2.1 (A): aviso y extensión (al menos 20 s para extender con una acción simple, al menos 10 veces) para la caducidad por inactividad; la absoluta debe superar 20 h o apoyarse en la excepción «esencial» [Pendiente de verificar] (Understanding 2.2.1). Conservar los cambios y reautenticar (§6) se alinea con 2.2.5 y 2.2.6 (AAA), no exigibles en AA.
- **Cómo se comprueba.** axe con `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa` en login, listas, edición, biblioteca, bandeja, detalle y diálogo, con contenido y vacíos; revisión manual con teclado y con un lector de pantalla; los defectos de la UI de terceros se registran con su criterio WCAG y su decisión PA-09.

## 9. Pruebas de aceptación por hito

Tipos: **I** = integración (servidor y base de datos), **E** = E2E con navegador, **M** = manual, **S** = estática. Datos sintéticos con centinelas (prefijo `SNT-`).

| ID | Prueba | Tipo | Hito | Fuente |
|---|---|---|---|---|
| PA-P01 | Anónimo y con sesión caducada o manipulada contra cada canal de §7 (UI, RSC, REST con versiones y `count`, GraphQL, acciones de servidor, colección de medios, medios privados, vista previa): sin datos, sin ids, sin centinelas | I, E | H2 con los canales existentes; se repite en H3, H4 y H5 | MVP-09.1; RM › H2 |
| PA-P02 | Cookies `Secure`, `HttpOnly`, `SameSite`; caducidad por inactividad y absoluta según PA-01 (con reloj simulado); la renovación del token no extiende la caducidad absoluta; cerrar sesión invalida la sesión en el servidor | I | H2 | MVP-09.3 |
| PA-P03 | Mutación con `Origin` ajeno y sin `Origin`: rechazada y sin efecto; con el propio, aplicada (control positivo) | I | H2 | MVP-09.3 |
| PA-P04 | Límite de intentos según PA-02 (por cuenta y, si se elige, por IP); mismo mensaje y mismo código para cuenta existente, inexistente y bloqueada. La similitud de tiempos no se mide aquí: no hay tolerancia fijada | I | H2 | ESP › §6 |
| PA-P05 | M3 cerrado: recuperación por correo y cambio por token anónimos rechazados, sin token escrito, sin el identificador en logs y con respuesta igual exista o no la cuenta; registro inicial con cuenta existente ≥ 400 y recuento sin cambios; inicialización cerrada o constante; ningún canal crea una segunda cuenta; cambiar el identificador de acceso por cualquier canal, rechazado siempre; cambiar la contraseña, rechazado salvo con PA-04 (b) y entonces sólo con la actual, con prueba de que se invalidan las demás sesiones; la orden de alta falla si ya existe una cuenta; el servicio no arranca sin el secreto de firma | I | H2 | ADR › §5; H0A-05 |
| PA-P06 | Login, errores y rutas de `/admin` con `X-Robots-Tag: noindex, nofollow`, `no-store` y `frame-ancestors` según §7; `/admin` ausente de `robots.txt`, del sitemap y de los enlaces públicos; la vuelta tras el login con `https://…`, `//host`, `/\host`, `%2F%2Fhost` o una ruta fuera de `/admin` se ignora | I, E | H2 | MVP-09.4 |
| PA-P07 | Alta y recuperación ensayadas en staging siguiendo sólo el documento, con registro y sin secretos en él | M | H2 | H0A-05 |
| PA-P08 | Login accesible: pegar permitido, `autocomplete`, axe y teclado | E, M | H2 | 3.3.8 |
| PA-P09 | F3 en E2E: crear borrador (anónimo: 404 en detalle, lista, sitemap y API) → vista previa sólo para el admin, con las cabeceras de §4.3 (con la cookie de modo borrador y sin sesión: la 404 única) → publicar (visible dentro del tiempo medido) → borrador sobre publicado (el anónimo ve la versión publicada) → retirar (404, fuera del sitemap, registro intacto) → re-publicar | E | H3 | RM › H3; MVP-10 |
| PA-P10 | Al publicar Perfil, Proyecto o Ajustes, cada validación de §4.2 falla con su mensaje (las de Servicio, PA-P14): obligatorio ausente, slug duplicado en Proyecto, slug mal formado, enlace `http:`, `javascript:` o `data:`, cuarto destacado, `tercero` sin autorización, resultado sin evidencia; nada cambia en el sitio público | I | H3 | MVP-10.4 |
| PA-P11 | Regla de Medio: publicar con un medio privado, con datos personales o sin permiso falla; ninguna respuesta anónima de un publicado lleva id ni colección de un medio privado, a ningún `depth` | I | H3 | B7 |
| PA-P12 | Imagen con EXIF y GPS, XMP, IPTC y comentario centinela: el archivo servido no los lleva y su nombre no deriva del original; SVG rechazado también con extensión de imagen; `alt` vacío rechazado; datos personales verdadero por defecto; medio privado 404 anónimo aunque se conozca la URL; retirada urgente, y medio referenciado por un publicado que pasa a privado o a «con datos personales»: 404 inmediato en el original, los derivados y la URL optimizada, y contenido sin hueco; archivo políglota imagen/HTML servido con las cabeceras de §4.4 y sin interpretarse; borrar un medio referenciado: rechazado | I, E | H3 | V-12; MVP-10.5 |
| PA-P13 | Campos privados (`notas_internas`, `origen`, `autorizacion_tercero`, `fuentes_verificacion`, `permiso_referencia`) ausentes de toda superficie anónima, con pruebas por campo y por colección | I | H3 | INV-01 |
| PA-P14 | Desactivar un servicio: fuera del catálogo y del selector; sus solicitudes intactas y mostradas «(desactivado)»; borrarlo con solicitudes se rechaza y conservan la referencia; al activar, slug duplicado o mal formado, `modalidad_precio` fuera de {`clp_referencial`, `a_cotizar`}, `precio_clp` ausente con `clp_referencial` o presente con `a_cotizar`: rechazado con su mensaje | I, E | H4 | INV-11; INV-16; MVP-11.3 |
| PA-P15 | Accesibilidad de las pantallas de F3 según §8, incluido reordenar sin arrastre | E, M | H3 | MVP-14.1 |
| PA-P16 | Las 3 transiciones válidas se aplican y cada una crea exactamente un evento con sus campos y como actor la cuenta de la sesión; una transición sin administrador autenticado se rechaza sin evento | I | H5 | H0A-02; H0A-04; INV-07 |
| PA-P17 | Inválidas, como mínimo `cerrada → recibida`, `cerrada → en_gestion`, `cerrada → cerrada` explícita, `en_gestion → recibida` y cerrar sin motivo, más motivo inválido, motivo sin cerrar, mismo estado y estado desconocido; `motivo_cierre` sin `estado` en `recibida`, `en_gestion` y `cerrada` (cambiarlo o vaciarlo): rechazadas, sin evento ni cambios y no ofrecidas en la UI | I, E | H5 | H0A-02 |
| PA-P18 | Fallo inyectado tras cambiar el estado (sólo en el entorno de prueba): ni estado ni evento. Prueba estática: el build de producción no contiene el gancho de fallo (en la POC, `src/collections/Solicitudes.ts:51`) | I, S | H5 | H0A-04 |
| PA-P19 | Crear, modificar o borrar un evento por REST, GraphQL, acciones de servidor o la UI: rechazado | I | H5 | H0A-04 |
| PA-P20 | `observaciones_internas` ausente de toda respuesta anónima, logs, sitemap y errores; filtrar, ordenar o seleccionar por ella siendo anónimo no tiene efecto; guardarla no crea evento | I | H5 | H0A-03; MVP-12.2 |
| PA-P21 | Con sesión, por la bandeja, la URL de la lista del panel, `GET /api/solicitudes` y `count`: `where[...]`, operadores, arrays, parámetros repetidos, valores fuera de la lista, `sort`, `depth`, `select` y un límite de página arbitrario no llegan a la consulta (resultado del valor por defecto) o se rechazan, según PA-10 | I | H5 | MVP-12.3 |
| PA-P22 | Dos sesiones sobre la misma solicitud: transiciones concurrentes desde `recibida` (a `en_gestion` y a `cerrada`) aplican exactamente una, la otra recibe conflicto y hay un solo evento; transición con estado esperado obsoleto: conflicto sin evento; observaciones según PA-17 | I, E | H5 | §5.3 |
| PA-P23 | Solicitud de fixture interno con caracteres bidi, `<script>`, `</textarea>`, saltos de línea y una cadena larga sin espacios: se muestra como texto, aislada y sin romper la maquetación; el contacto no es un enlace | E | H5 | RECORRIDO › §3 |
| PA-P24 | Cierre con teclado: foco inicial, Escape, vuelta del foco; sin JavaScript, confirmación en dos pasos | E | H5 | §5.3 |
| PA-P25 | Operaciones de F3 y F4 con centinelas: ningún log ni gestor de errores contiene PII ni respuestas de acciones de servidor | I | H5 | INV-15; FS |
| PA-P26 | Con sesión válida, `DELETE` de una solicitud `recibida` sin eventos y de otra con eventos, por REST, acciones de servidor y UI: rechazado y registro intacto | I, E | H5 | H0A-11; H0A-04 |
| PA-P27 | Con sesión válida, por REST, acciones de servidor y UI: modificar `nombre`, `contacto`, `tipo_equipo`, `descripcion`, `servicio`, `estado` fuera de la transición, `motivo_cierre` o las marcas de tiempo, o crear una solicitud: rechazado y sin cambios | I, E | H5 | §5.2; INV-07 |
| PA-P28 | Escritura anónima y con sesión caducada o manipulada en cada colección (crear, actualizar, borrar, subir un medio, activar o desactivar un servicio, cambiar el estado o las observaciones) por REST, acciones de servidor y formularios: rechazada y sin efecto; con sesión válida, aplicada (control positivo) | I | H3, H4 y H5, según la colección | MVP-11.4; MVP-12.1; F4 |
| PA-P29 | F4 en E2E: bandeja con filtros → detalle → guardar observaciones (sin evento) → «En gestión» → cerrar con motivo → historial con 2 eventos y actor «Administrador»; `cerrada` sin acciones | E | H5 | RM › H5; MVP-12 |
| PA-P30 | Estados de §6 en E2E: sesión expirada y acceso denegado (H2); cambios pendientes y 5xx (H3); carga, guardado y conflicto (texto y `role="alert"`) en H5. Textos de §6; cambios conservados en memoria; `localStorage` y `sessionStorage` sin PII; 5xx sin datos técnicos | E | H2, H3 y H5 | MVP-09.5 |
| PA-P31 | Accesibilidad de bandeja y detalle de solicitud: axe con etiquetas WCAG 2.2, teclado y lector de pantalla; título sin datos del solicitante en `<title>`, migas y selectores (M11) | E y M | H5 | MVP-14.1 |

## 10. Decisiones para el responsable

La columna **Bloquea** indica el primer hito que no puede cerrarse sin la respuesta [Propuesto]. Las opciones son neutrales; «mientras no se decida» indica lo que rige hasta la respuesta.

| Decisión | Opciones | Bloquea |
|---|---|---|
| **PA-01. Caducidad de la sesión** | Inactividad, con aviso previo y extensión: (a) 15 min; (b) 30 min; (c) 60 min. Absoluta, con aviso previo y reautenticación: (a) 8 h; (b) 12 h; (c) 24 h; sólo la (c) supera 20 h (§8) | H2 |
| **PA-02. Límite de intentos** (§2.1) | (a) bloqueo temporal por cuenta (la POC), admisible sólo combinado con (d); (b) límite por IP (sólo la que entrega un proxy de confianza) más retroceso progresivo por cuenta, sin bloqueo total; (c) por cuenta y por IP con retroceso, sin bloqueo total; (d) cualquiera de las anteriores más login sólo desde una red restringida. En todas: contraseña aleatoria con longitud mínima comprobada en el servidor y desbloqueo por el procedimiento. El límite por IP es P salvo evidencia | H2 |
| **PA-03. Segundo factor** (D-07) | (a) sin segundo factor en el MVP; (b) código temporal (TOTP); (c) llave de seguridad o passkey; (d) ninguno, apoyándose en la red restringida de PA-02 (d), que entonces se elige también allí. Soporte del CMS: [Pendiente de verificar] | H2 |
| **PA-04. Cuentas en el panel** | (a) colección de cuentas oculta y sin alta, baja ni desbloqueo por ningún canal; (b) visible sólo para cambiar la propia contraseña, que exige la actual comprobada en el servidor e invalida las demás sesiones; (c) visible en sólo lectura. Mientras no se decida rige (a), coherente con H0A-05. En todas, ningún canal crea, borra ni desbloquea cuentas ni cambia el identificador salvo el procedimiento. (b) y (c) son una excepción a H0A-05 (sin interfaz de gestión de cuentas) y requieren modificarla | H2 |
| **PA-05. Factor de confianza de la recuperación** (§2.3) | (a) acceso de operación al host; (b) acceso a la consola del proveedor del entorno; (c) códigos de recuperación guardados fuera de línea, que sólo se presentan a la orden de operación del servidor, nunca a un endpoint público; (d) combinación | H2 |
| **PA-06. Ajustes** | (a) sin borrador: guardar es publicar, con confirmación; (b) con borrador y publicación, como el Perfil | H3 |
| **PA-07. Borrado de contenido** | (a) nada se borra desde el panel; (b) sólo proyectos y servicios nunca publicados ni referenciados, con confirmación; (c) cualquier registro no referenciado, con confirmación | H3 |
| **PA-08. Versiones** | (a) sin acciones de versión; (b) «Descartar cambios» vuelve a la versión publicada; (c) además, restaurar versiones anteriores | H3 |
| **PA-09. Defectos de accesibilidad de la UI del CMS** | (a) aceptarlos con registro y plan de corrección; (b) sustituir o adaptar la vista afectada; (c) no cerrar el hito hasta corregirlos | H3 (contenido); H5 (bandeja) |
| **PA-10. Implementación de la bandeja** (MVP-12.3) | (a) vista propia con los filtros de §5.1, con la lista y la REST genéricas de Solicitudes cerradas o restringidas en el servidor; (b) lista nativa del CMS con sus filtros genéricos: incompatible con MVP-12.3 [Definido] salvo modificación expresa de MVP-12.3 y RF-09; (c) lista nativa sólo si un control de servidor rechaza o reemplaza `where`, `sort`, `limit`, `depth` y `select` fuera de la lista blanca en la lista del panel, la REST, `count` y versiones [Pendiente de verificar] | H5 |
| **PA-11. Filtro por fecha** | (a) sin filtro; (b) desde y hasta, por fecha de recepción; (c) periodos fijos (7, 30 y 90 días) | H5 |
| **PA-12. Orden y página** | Orden: (a) abiertas, la más antigua primero; (b) la más reciente primero. Tamaño: (a) 25; (b) 50 | H5 |
| **PA-13. Columnas de la bandeja** | (a) fecha, estado, equipo y servicio; (b) además el nombre; (c) además el contacto (útil con D-09 c) | H5 |
| **PA-14. Observaciones en `cerrada`** | (a) editables; (b) sólo lectura tras cerrar | H5 |
| **PA-15. Búsqueda** | (a) sin búsqueda en el MVP; (b) coincidencia exacta por contacto, sólo para el administrador; (c) texto en equipo y descripción | H5 |
| **PA-16. Exportación** | (a) ninguna en el MVP (rige mientras no se decida); (b) exportación de solicitudes sin observaciones, con registro de cada exportación y neutralizando las celdas que empiezan por `=`, `+`, `-`, `@`, tabulador o retorno de carro, servida con `Content-Disposition: attachment` y `Cache-Control: no-store`; la copia exportada queda fuera del control de retención de H0A-11 (advertencia); (c) sólo mediante el backup | H5 |
| **PA-17. Concurrencia de las observaciones** (§5.3) | Las transiciones usan siempre el control de servidor de §5.3 [Propuesto, no opcional]. Observaciones: (a) control optimista con versión o marca de actualización; (b) la última escritura gana, aceptando el riesgo. El bloqueo de edición nativo del CMS (la POC expone su colección de bloqueos, `EVIDENCIA.md:31`) no sustituye al control de servidor; si distingue pestañas, [Pendiente de verificar] | H5 |
