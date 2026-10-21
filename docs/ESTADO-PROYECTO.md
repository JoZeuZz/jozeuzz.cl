# Estado del proyecto — jozeuzz.cl

> **Estado:** Propuesta de síntesis (2026-10-21), no aprueba nada.
> **Autor:** jz-architect, rama `work/jozeuzz-autonomo` sobre `df81964`. Resume las fuentes citadas; ante una discrepancia, prevalece la fuente.
> **Etiquetas:** **[Aprobado]** = el registro tiene fecha y referencia Git. **[Propuesto]** = recomendación sin aprobar. **[Medido]** = salida real registrada en la fuente citada. **[Declarado, no verificado]** = lo afirma el responsable, sin log en el repositorio. **[Deducido]** = inferencia de lectura. **[Pendiente]** = falta una decisión o una evidencia. **[Pendiente de verificar]** = este documento no pudo comprobarlo.
> **Abreviaturas:** `REG` = [REGISTRO-DECISIONES-H0A.md](REGISTRO-DECISIONES-H0A.md) · `RM` = [ROADMAP-MVP.md](ROADMAP-MVP.md) · `ADR` = [adr/0001-stack.md](adr/0001-stack.md) · `GATE` = [GATE-DOCKER-POC-3.md](GATE-DOCKER-POC-3.md) · `EVI` = [EVIDENCIA.md](../poc1a/EVIDENCIA.md) · `HO` = [HANDOFF-POC-1B.md](../poc1a/HANDOFF-POC-1B.md) · `PROD` = [PRODUCTO.md](PRODUCTO.md) · `ESP` = [ESPECIFICACION-FUNCIONAL.md](ESPECIFICACION-FUNCIONAL.md) · `UX` = [UX-ARQUITECTURA-INFORMACION.md](UX-ARQUITECTURA-INFORMACION.md) · `PLAN3` = [PLAN-POC-3.md](PLAN-POC-3.md) · `AUT` = [AUTONOMIA-JZ.md](AUTONOMIA-JZ.md).

**Resumen en una línea.** H0-a está cerrado; no hay stack aprobado ni código de producto; la única implementación es la POC desechable `poc1a/`; H1 está bloqueado por el gate Docker de POC-3 (D07 fallido), por POC-2 y por la aceptación de ADR-0001, y todo eso requiere al responsable.

## 1. Producto en una página

| Aspecto | Contenido | Fuente |
|---|---|---|
| Qué es | Identidad digital que une (1) un **portafolio** de ingeniería y desarrollo, que es la entrada principal, y (2) la **oferta y gestión de servicio técnico** informático | `PROD:5`; `ESP:8` |
| Separación | El portafolio no depende funcionalmente del sistema de reparaciones. Comparten infraestructura y diseño, pero no públicos, accesos ni procesos | `PROD:5`; `RM:53` |
| Públicos | Visitante profesional (reclutador, cliente de desarrollo); cliente de servicio técnico (registra una solicitud y recibe confirmación sin ver datos de terceros); un único rol privilegiado, el administrador | `PROD:8-11`; `ESP:14-16` |
| Datos | Público: perfil, proyectos y servicios publicados. Privado: borradores, solicitudes, `observaciones_internas`, medios privados. Autorización en el servidor para cada operación y canal | `ESP:18-29`; `REG:22,57` |
| MVP v0.1 | Inicio, perfil, proyectos y casos, catálogo de servicios, solicitud pública con aviso de privacidad, contacto, panel de contenido y de solicitudes, SEO, accesibilidad (WCAG 2.2 AA), observabilidad, backup y CI | `PROD:13-19`; `ESP:33-51`; `RM › §1.2` |
| Fuera del MVP | Pagos, reservas, órdenes de trabajo, presupuestos, portal de cliente, notificaciones, varios técnicos | `PROD:21-23`; `RM › §1.3` |
| Reglas fijas | No exponer solicitudes por correo; el cliente no controla estado, precio ni notas; precios en CLP o «a cotizar»; solicitud ≠ reserva ≠ orden; `/admin` no indexable | `PROD:34-39` |
| Estado documental | `PROD`, `ESP`, `UX` y `ARQUITECTURA.md` siguen como propuesta, borrador o hipótesis | `PROD:2`; `ESP:3`; `UX:3`; `RM:37` |

## 2. Decisiones

### 2.1 Aprobadas (registro H0-a)

| ID | Decisión (resumen) | Estado | Aprobación (fecha · texto revisado) | Fuente |
|---|---|---|---|---|
| H0A-01 | H0 se divide en H0-a (decisiones) y H0-b (wireframes, dirección visual, contenidos); H0-b bloquea H3, no H1 ni H2 | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:20` |
| H0A-02 | Estados `recibida`, `en_gestion`, `cerrada`, con 3 transiciones y `motivo_cierre` | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:21` |
| H0A-03 | Un campo `observaciones_internas`, sólo para el administrador | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:22` |
| H0A-04 | `EventoSolicitud` de sólo inserción, en la misma transacción | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:23` |
| H0A-05 | Un único administrador; alta y recuperación por procedimiento documentado | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:24` |
| H0A-06 | Sin notificaciones automáticas en el MVP | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:25` |
| H0A-07 | Publicar sin commit, con la propagación medida | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:26` |
| H0A-08 | Aprobación humana con fecha y referencia Git, sin firmas | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:27` |
| H0A-09 | El producto no depende de jz-ai M1–M3 ni de las fases 0C–0E | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:28` |
| H0A-10 | Un escritor por worktree; revisores de sólo lectura; sin secretos ni producción | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:29` |
| H0A-11 | Retención aprobada antes de datos reales y antes de H7 | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:30` |
| H0A-12 | Tres aprobaciones separadas: documental, técnica y de stack (sólo por ADR-0001) | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:31` |
| H0A-13 | Rama `producto/base`; las POC parten de ella | [Aprobado] con precisiones | 2026-10-15 · `90a66f3` | `REG:32` |
| H0A-14 | Entorno de POC-4 aplazado; POC-1 a POC-3 locales y sintéticas | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:33` |
| H0A-15 | Criterios de salida de H0-a y H1 | [Aprobado] | 2026-10-15 · `90a66f3` | `REG:34` |
| H0A-16 | Las POC se autorizan una a una | [Aprobado] con precisiones | 2026-10-15 · `4302e2d` | `REG:35` |
| H0A-16a | POC-1a autorizada | [Aprobado] | 2026-10-15 · `4302e2d` | `REG:36` |
| H0A-16b | POC-1b autorizada | [Aprobado] | 2026-10-16 · `f5296e5` | `REG:37` |
| H0A-16c | POC-3 autorizada (con P3-02 a P3-10 y la VM como diseño de etapa 1) | [Aprobado] | 2026-10-16 · `f45b2c9` | `REG:38`; `PLAN3:186` |
| ADR-0001 | Stack A (Next 16.4.1, Payload 3.90.2, PostgreSQL 18, Node 24) para D-01–D-04 y D-10 | **[Propuesto]**, no es una decisión | Sin aprobación (§8 del ADR vacío) | `ADR:3,119,176-188` |

### 2.2 Decisiones de stack D-01 a D-19 (`RM:418-438`) a 2026-10-21

| ID | Tema | Estado hoy | Fuente del estado |
|---|---|---|---|
| D-01 | Arquitectura y framework | Evidencia parcial: A medida en POC-1a/1b; falta gate POC-3, POC-2 y aceptación | `ADR:22,119`; `REG:34` |
| D-02 | CMS, panel y acceso a datos | Evidencia parcial (Payload, 5 puntos de extensión) | `EVI:148`; `ADR:119` |
| D-03 | Motor de base de datos | Evidencia parcial: constraints y transacciones medidos; backup y restauración en POC-4 | `ADR:58,119` |
| D-04 | Renderizado y propagación | Evidencia parcial: 53 ms con `force-dynamic`; sin POC-2 | `EVI:82,155`; `ADR:75` |
| D-05 | Estilos y UI | Pendiente; sólo el bundle medido (unos 172 KB gzip); dirección visual en H0-b | `EVI:128`; `REG:20` |
| D-06 | Almacenamiento de medios | Evidencia parcial (control de acceso medido; riesgo B7); proveedor pendiente | `REG:88`; `EVI:138` |
| D-07 | Autenticación administrativa | Evidencia parcial (cookies, CSRF, bloqueo medidos); M3 abierto; recuperación por procedimiento (H0A-05) | `EVI:27-33,130-132`; `REG:24` |
| D-08 | Antiabuso | Evidencia parcial: controles propios implementados y recomendados; pendiente D30 y H-6 | `GATE:1575` |
| D-09 | Antiduplicados | Pendiente: sin recomendación registrada | `GATE:1576` |
| D-10 | Runtime y versiones | Evidencia parcial: matriz y versiones fijadas en POC-1a | `EVI:3`; `ADR:22` |
| D-11 | Empaquetado y despliegue | Pendiente (POC-4; entorno aplazado por H0A-14) | `REG:33-34` |
| D-12 | Hosting | Pendiente (H0A-14) | `REG:33` |
| D-13 | CDN o túnel | Pendiente | `RM:432` |
| D-14 | Plataforma de CI | Pendiente (H2) | `RM:433` |
| D-15 | Herramientas de prueba | Evidencia parcial (Playwright y vitest usados en POC-1a) | `REG:88`; `EVI:17,22` |
| D-16 | Observabilidad (logs sin PII) | Evidencia parcial: logs del intake implementados; verificación Docker pendiente | `REG:145`; `GATE:76` |
| D-17 | Backups | Pendiente (POC-4) | `REG:34,166` |
| D-18 | Escaneo de dependencias | Pendiente; `npm audit` sin repetir desde la fase 1 (P5) | `EVI:164-168`; `ADR:59` |
| D-19 | Correo transaccional | Sin objeto en el MVP mientras rija H0A-06 [Deducido; el responsable no lo ha declarado] | `REG:25`; `RM:438` |

## 3. Preguntas C-01 a C-13 (`RM:691-703`)

La correspondencia C-nn → H0A-nn es [Deducido]: el registro no cita los C-nn.

| ID | Tema | Estado hoy | Fuente |
|---|---|---|---|
| C-01 | Estados de la solicitud | Resuelta por H0A-02 | `REG:21` |
| C-02 | Registro de transiciones | Resuelta por H0A-04 | `REG:23` |
| C-03 | Notas internas | Resuelta por H0A-03 | `REG:22` |
| C-04 | ¿Vista previa obligatoria para cerrar F3? | Abierta (la POC ya la implementa: `poc1a/src/collections/Proyectos.ts:22`) | `RM:694` |
| C-05 | ¿El MVP sale a producción antes de v0.2 (H7)? | Abierta | `RM:695` |
| C-06 | Número de administradores | Resuelta en el número por H0A-05; el procedimiento de alta y recuperación sigue pendiente antes de H2 | `REG:24` |
| C-07 | Notificaciones | Resuelta por H0A-06 | `REG:25` |
| C-08 | jz-ai frente a las POC | Resuelta por H0A-09 | `REG:28` |
| C-09 | ¿Comparación con Astro implementada? | Abierta: el ADR propone la opción 2 (descartar B sin POC, enmendando H0A-15) [Propuesto] | `ADR:89-102` |
| C-10 | Rutas `/privacidad`, `/404`, `/experiencia` | Abierta (se cierra con los wireframes de H0-b) | `RM:700` |
| C-11 | «No existe ninguna ADR» | Premisa obsoleta: ADR-0001 existe como **Propuesto** | `ADR:3` |
| C-12 | Fuentes no aprobadas | Parcial: H0A-12 separa la aprobación documental, que no consta registrada; las fuentes siguen como propuesta | `REG:31`; §1 |
| C-13 | Filtros de visitante frente a RF-15 *Should* | Abierta | `RM:703` |

## 4. Hitos H0 a H7 (`RM › §8`, `RM:554-615`)

| Hito | Estado | Qué lo bloquea | Quién desbloquea |
|---|---|---|---|
| H0-a | **Cerrado**: H0A-01 a H0A-14 y H0A-16 aprobadas (criterio de H0A-15) | — | — |
| H0-b | Sin artefactos. Iniciado el 2026-10-21 en `work/jozeuzz-autonomo` sólo como propuesta: hay un verificador (`df81964`, [README](../herramientas/verificar-docs/README.md)) y no existe `docs/h0b/` | Wireframes, dirección visual (2–3 opciones), lista de contenidos y su responsable; datos reales que ningún agente puede inventar (`PROD:49`) | Responsable (contenido y aprobación); agentes sólo proponen |
| H1 | **Bloqueado** | (1) gate Docker de POC-3 con D07 fallido; (2) POC-2 sin autorizar, o H0A-15 sin enmendar; (3) condiciones del ADR §6: B7, M3, P5–P7 y revisión de hito; (4) aceptación de ADR-0001 | Responsable (ejecución del gate, decisiones y aceptación) |
| H2 | No iniciado | H1; POC-4 o su paso a condición de entrada (H0A-15); procedimiento de H0A-05; entorno (H0A-14) | Responsable |
| H3 | No iniciado | H2 y H0-b (H0A-01); presupuestos de rendimiento (P9 del ADR §3.3) | Responsable |
| H4–H6 | No iniciados | El hito anterior; D-08 y D-09 [Deducido de `RM:427-428`] para H4 | Responsable |
| H7 | No iniciado | H6; C-05; D-12, D-13 y D-17; política de privacidad y retención (H0A-11, RF-13) | Responsable |

## 5. POC (desechables; ninguna es código de producto)

| POC | Autorización | Rama y referencia | Estado | Evidencia |
|---|---|---|---|---|
| POC-1a | H0A-16a | `poc/candidata-a` en `4b4b806` («no mover», `HO:23`) | **Cerrada** [Medido] | `EVI:13-22,79-97`; riesgos `EVI:122-140` |
| POC-1b | H0A-16b (registrada en `87c9fb1`, `EVI:143`) | `poc/candidata-a-1b` | **Cierre local** 2026-10-16 [Medido]: 44/44, vitest 72/72, E2E 3/3 | `EVI:142-152` |
| POC-3 | H0A-16c | `poc/candidata-a-3`; corrección D07 en `fix/poc3-drizzle-parametros` (`df576ed..42d7229`) | **Implementada; gate Docker fallido en D07** hasta una nueva ejecución autorizada | `GATE:3-8,54-79`; `EVI:170-184` |
| POC-2 | **No autorizada** (haría falta H0A-16d) | — | Recomendación de no hacerla [Propuesto] | `ADR:84,99` |
| POC-4 | **No decidida**; entorno aplazado | — | — | `REG:33,147-166` |
| POC-C | Condicional | — | No activada | `ADR:24` |

**POC-3: qué está probado y qué no.** El código de referencia del gate es `CODEREF = 42d7229` (`GATE:4`).

| Hecho | Etiqueta | Fuente |
|---|---|---|
| Suite `jz-run` de 23 archivos, 178/178, rc=0, sobre `95db8f4` | [Medido por jz-run; log no versionado y no presente en este worktree] | `EVI:184` |
| Sobre `42d7229`: `tsc` rc=0, `node --test contrato/` rc=0 y vitest de la corrección rc=0 (logs locales no versionados) | [Medido por jz-run; log no versionado y no presente en este worktree] | `GATE:69` |
| Sobre `42d7229`: vitest de `src test/estatico` rc=1, `Tests 11 failed`, `298 passed (309)` (I-A4T) | [Medido por jz-run; log no versionado y no presente en este worktree] | `GATE:69,1548` |
| Ejecución 1: D01–D06 sobre `de692a4`, con A4 incluido; D07 falló; D08 y siguientes, sin ejecutar | [Declarado, no verificado] | `GATE:3,58-60` |
| `poc3_intake` con 19 tablas en `public` | [Declarado, no verificado] | `GATE:61` |
| Respaldo de `poc3_intake` con lectura completa de `pg_restore` rc=0; **sin restauración real** | [Declarado, no verificado] | `GATE:62` |
| Regresión de la corrección 25/25 (Node 24.22.0, Docker sin red); no es un paso del gate | [Declarado, no verificado] | `GATE:63,79` |
| Causa de D07: el `pushSchema` de drizzle-kit 0.31.7 descarta parámetros; la salida de D07 no está en el repositorio | [Declarado, no verificado] | `GATE:67` |
| `de692a4` es el commit de A4 (axe) | [Deducido] de Git | `GATE:65`; `poc1a/package.json:28` |
| Pasos RP0–RP7, R0–R12, D01–D30, J y K de la reanudación | [Pendiente] | `GATE:76` |
| Latencia del envío y falsos positivos del antiabuso | [Pendiente] | `EVI:217-228` |

**Procedimiento de reanudación** (lo ejecuta sólo el responsable, como root): sesión RP0–RP7 de preparación (`GATE:90-293`), sesión R0–R12 de reanudación (`GATE:295-408`), decisiones de la reanudación (`GATE:81-88`) y criterio de cierre de U10 (`GATE:1588-1605`).

## 6. Incidencias y riesgos abiertos

| ID | Qué es | Fuente | Quién / cuándo |
|---|---|---|---|
| I-A4T | 11 fallos de `poc1a/test/estatico/gate-a4-git.test.ts` sobre `42d7229`; D11 no se aprueba mientras siga abierta | `GATE:1546-1549,1585`; diagnóstico estático en HP-18 ([HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md)) | Unidad aparte de jz-implementer, autorizada por el responsable |
| OB2 | CHECK sin nombre en la migración frente a los nombres de `esquema.ts`; D08b espera esos nombres en `public` | `GATE:1550-1554,1586` | Decisión del responsable; fuera de la reanudación |
| N-7 | `core.excludesFile` y `.git/info/exclude` pueden ocultar archivos a la guarda del gate | `GATE:1555` | Riesgo residual sin corregir |
| B7 | Un proyecto publicado revela id y colección de un medio privado; ver HP-09 | `ADR:108`; `EVI:138`; HP-09 ([HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md)) | Responsable: ¿se corrige por configuración (`REG:86`)? |
| M3 | `forgot-password` abierto al anónimo; correo del admin en logs; ver HP-07 | `ADR:109`; `EVI:130-132`; HP-07 ([HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md)) | Responsable: cerrar o aceptar |
| B4 | Contenedor sin `cap_drop`, `no-new-privileges` ni `read_only` | `ADR:110` | Requisito de POC-4 y H2 (POC-3 lo endurece; sin verificación Docker) |
| B3 | Salida a Internet de `app`, `app-prod` y `e2e` | `ADR:111` | Verificación en el gate (D07/D24) |
| FS | La acción `form-state` devuelve al admin el correo y los ids de sesión | `ADR:113`; `EVI:117-118` | Regla de logs del producto |
| NODE | Node del host 20.19.2 (EOL) ejecuta el driver y los scripts como root | `ADR:114` | Decisión aparte (H0A-09) |
| Otros | H-1 a H-10 y S-1 del gate | `GATE:1526-1544,1568` | U10 (jz-qa y jz-security) |
| M2-1 a M2-3 | **No están documentados en el repositorio legible**; no se puede describir su contenido | — | [Pendiente de verificar] con el responsable |
| HP-01 | [Propuesto, Alta] Un PATCH autenticado con sólo `motivo_cierre` lo cambia o lo vacía, también en una `cerrada`, sin transición ni evento (H0A-02) | [HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md) §2.1 | Responsable (HP-D01) |
| HP-22 | [Propuesto, Media (Alta si se confirma); efecto Deducido] Dos transiciones concurrentes desde `recibida` pueden aplicarse ambas y reabrir una `cerrada` (H0A-02, H0A-04) | [HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md) §2.1 | Responsable (HP-D01) |
| HP-07 | [Propuesto, Alta] El panel y REST permiten crear cuentas y cambiar correo o contraseña sin reautenticación [Deducido]; con una sesión robada, acceso persistente (H0A-05; agrava M3) | [HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md) §2.2 | Responsable (HP-D04) |
| Resto de HP (HP-02..HP-23 salvo HP-07 y HP-22) | Brechas de la POC detectadas por lectura de código el 2026-10-21 | [HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md) | Responsable |

**Discrepancias documentales detectadas (sin corregir aquí, por estar fuera del alcance):**

- La fila P3-05 de `GATE:1577` dice que falta autorizar la instalación, pero `GATE:3,65` y `poc1a/package.json:28` muestran que A4 ya la instaló en `de692a4`.
- `ADR:4,49` citaba `c8bbf0f` como código del gate. Lo corrige la nota de vigencia añadida al ADR en esta unidad.

## 7. Brechas entre la POC y la especificación (a resolver en el producto, no en la POC)

| Brecha | En la POC | Lo que pide la especificación |
|---|---|---|
| Sin aviso de privacidad en el formulario | `poc1a/src/lib/intake/html.ts:34` (el HTML completo no tiene aviso ni enlace) | RF-13 (`ESP:47`); `RM:180,192` |
| Ruta del formulario | `poc1a/src/app/(intake)/solicitar/route.ts:6` sirve `/solicitar` (`poc1a/e2e/intake-axe.spec.ts:28`) | `/servicios/solicitar` (`ESP:66`; `UX:19`) |
| Sin estados vacíos | `poc1a/src/app/(frontend)/proyectos/page.tsx:12-18` y `servicios/page.tsx:12-18` pintan la lista sin una rama vacía; el inicio es un marcador (`(frontend)/page.tsx:2`) | `UX:51,53`; `RM:149,172` |
| Sin 404 público propio | Sólo existe `poc1a/src/app/(payload)/admin/[[...segments]]/not-found.tsx`; `notFound()` (`proyectos/[slug]/page.tsx:16`) usa la página por defecto de Next | `UX:57`; `RM:273` |
| axe con WCAG 2.0 | `poc1a/e2e/intake-axe.spec.ts:23` usa `wcag2a` y `wcag2aa`, no `wcag22aa`, y sólo audita el formulario | WCAG 2.2 AA (`ESP:102`; `RM:279`) |
| Sin datos estructurados | No aparece `ld+json` en `poc1a/src` (búsqueda por lectura) | `PROD:18`; `RM:272` |
| Sin Perfil (global) | `poc1a/src/payload.config.ts:35` sólo declara colecciones; `payload-types.ts:100` da `globals: {}` | Perfil como entidad editorial única (`ESP:87`; RF-02) |
| `alt` opcional en medios | `poc1a/src/collections/Medios.ts:14,21` (`alt` de tipo `text` sin `required`) | Textos alternativos (`ESP:102`; `RM:161`) |
| Proyecto mínimo [hallazgo adicional] | `poc1a/src/collections/Proyectos.ts:33-44`: slug, título, resumen, medios, notas y `retiradoEn` | Contenido detallado, etiquetas, enlaces y SEO (`ESP:88`) |

## 8. Operaciones que requieren intervención humana (en orden)

1. **Decidir si se reanuda el gate de POC-3** y ejecutar RP0–RP7 y R0–R12 como root, sobre `poc/candidata-a-3` y la rama de corrección, nunca sobre `work/jozeuzz-autonomo` (§9). Antes: fijar `DOCREF` (`GATE:8,99`) y anotar `S1`.
2. Decidir RP5 (cómo retirar los contenedores), `DBMIG` y la restauración del respaldo (`GATE:1582-1584`).
3. Autorizar la unidad que corrige I-A4T y decidir sobre OB2 (`GATE:1585-1586`).
4. Decidir P-U1-01, D-08 y D-09 (`GATE:1574-1576`).
5. POC-2: autorizar H0A-16d o enmendar H0A-15 (`ADR:89-102`).
6. B7 y M3: corregir o aceptar (`ADR:108-109`).
7. P5–P7: `npm audit` (requiere red), licencias LGPL y WTFPL, y advisories de Next y Payload (`ADR:59-61`).
8. Revisión de hito U10 y aceptación o rechazo de ADR-0001 (`ADR:176-188`).
9. Designar el entorno y el destino de backup de POC-4 (H0A-14).
10. H0-b: aprobar la lista de contenidos y su responsable, revisar los wireframes y elegir la dirección visual; aportar los datos reales (`RM:705-720`).
11. Responder C-04, C-05, C-09, C-10 y C-13; registrar la aprobación documental de las fuentes (H0A-12).
12. Antes de H2, el procedimiento de alta y recuperación del administrador (H0A-05). Antes de datos reales, la política de retención (H0A-11).
13. Integrar ramas (`work/jozeuzz-autonomo` → `producto/base`), push y PR. Los agentes no pueden hacerlo (`AUT:50`).
14. Opcional: regenerar el `node_modules` del host con `npm ci --ignore-scripts` (`GATE:1565`) y decidir la subida de Node en el host (NODE).

## 9. Cómo reanudar

1. Ejecutar `.jz/bin/jz-state` en el worktree: debe dar `REANUDABLE` (`AUT:123`).
2. Leer `.jz-state/LATEST.md` (local, no versionado) y `.jz-state/notes/`, y después `git log` y `git diff` (`AUT:124`).
3. Leer este documento, `REG`, `ADR` y la cabecera de `GATE`.

| Rama | Worktree | Rol | Regla |
|---|---|---|---|
| `producto/base` | [Pendiente de verificar] | Base del producto y de las POC (`REG:32`; `HO:22`, en `4302e2d`) | Destino futuro de lo útil, sólo por integración humana |
| `poc/candidata-a` | [Pendiente de verificar] | Cierre de POC-1a en `4b4b806` | No mover (`HO:23`) |
| `poc/candidata-a-3` | `/home/proyectos/jozeuzz-poc-candidata-a` (`GATE:97`) | POC-3; recibe la corrección por fast-forward en RP6 | **Intacta**: sólo el responsable la mueve |
| `fix/poc3-drizzle-parametros` | `/home/proyectos/jozeuzz-poc-drizzle-fix` (`GATE:92`) | Corrección D07 (`df576ed..42d7229`); RP2 exige que apunte a `DOCREF` (`GATE:143`) | **Intacta**: no escribir ni ejecutar Git en ella durante el gate |
| `work/jozeuzz-autonomo` | `/home/proyectos/jozeuzz-trabajo-autonomo` | Rama autónoma de esta sesión: contiene `42d7229`, `5d8a9d9` (docs) y `df81964` (herramientas) | No sirve como HEAD del gate: `df81964` cambia archivos fuera de `docs/`, y A1 lo prohíbe (`GATE:4`) [Deducido] |

**Siguiente paso recomendado:** el responsable lee §8, decide los puntos 1 a 5 y, si autoriza el gate, lo ejecuta desde el worktree de `poc/candidata-a-3`. Mientras tanto, los agentes sólo pueden avanzar H0-b como propuesta en `work/jozeuzz-autonomo`.
