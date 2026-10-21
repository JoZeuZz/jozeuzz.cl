# ADR-0001 · Stack de aplicación (D-01, D-02, D-03, D-04, D-10)

- **Estado:** **Propuesto — pendiente de la evidencia Docker de POC-3 y de la aprobación del responsable.** No es una decisión. Hasta que se acepte, no hay scaffold (`AGENTS.md:6,26`; `RM:508,563`).
- **Borrador:** jz-architect, 2026-10-19, rama `poc/candidata-a-3`, HEAD `ca9b3ea`. El código evaluado por el gate es `c8bbf0f` (`GATE:4`).
- **Etiquetas:** **[Medido]** = salida real registrada en la fuente citada. **[Deducido]** = inferencia del arquitecto a partir de fuentes; no ejecutada. **[Pendiente]** = falta evidencia o una decisión. **[Propuesto]** = recomendación sin aprobar.
- **Nota de vigencia (2026-10-21, sin cambiar el estado):** la referencia de código del gate es ahora `42d7229` (`GATE:4`); las correcciones citadas abajo, `c8bbf0f` (cadena de `GATE:6`) y `b09d7ea` (anterior), quedaron superadas por la referencia actual. El gate sigue fallido en D07 hasta una nueva ejecución autorizada (`GATE:3`). Sobre `42d7229` hay 11 fallos estáticos conocidos (I-A4T, `GATE:1546-1549`). P3-05 (axe) está instalado en `de692a4` (`GATE:3,65`; `PKG:28`), así que la fila 4 del §7 ya no requeriría decisión [Deducido]; la E2E con axe sigue sin ejecutarse. Estado actual: `docs/ESTADO-PROYECTO.md`.
- **Abreviaturas:** `EVI` = `poc1a/EVIDENCIA.md`; `PKG` = `poc1a/package.json`; `REG` = `docs/REGISTRO-DECISIONES-H0A.md`; `RM` = `docs/ROADMAP-MVP.md`; `MAT` = `docs/MATRIZ-TECNOLOGIAS-POC.md`; `ARQ` = `docs/ARQUITECTURA.md`; `GATE` = `docs/GATE-DOCKER-POC-3.md`; `AN` = `docs/ANALISIS-INCONSISTENCIAS-ROADMAP-MVP.md`.

## 1. Contexto y decisiones cubiertas

- No hay stack aprobado. ARQ presenta A, B y C como hipótesis (`ARQ:2`; `RM:414`). Este ADR es la salida común de las POC (`ARQ:20`; `RM:508`).
- **Cubre:** D-01 (arquitectura y framework), D-02 (CMS, panel y acceso a datos), D-03 (motor de base de datos), D-04 (renderizado y propagación) y D-10 (runtime y versiones). Se resuelven juntas porque dependen entre sí (`RM:420-423,429,440`).
- **Sólo como referencia:** D-08 (antiabuso) y D-09 (antiduplicados). Las decide POC-3 (`RM:427-428`; `GATE:556-557`) y no forman parte de esta decisión.
- **Fuera de este ADR** (van a ADR posteriores): D-05 a D-07 y D-11 a D-19. Si POC-4 no se ha hecho, D-11 y D-17 quedan pendientes y POC-4 pasa a ser condición de entrada en H2 (`REG:34`).
- **Condición de cierre de H1 aprobada (H0A-15, `REG:34`):** el ADR se acepta con la evidencia medida de POC-1a, POC-1b, **POC-2** y POC-3. Cerrarlo sin POC-2 exige que el responsable enmiende H0A-15 (§4).
- H1 depende de H0-a, no de H0-b (`REG:20`). Por tanto, H0-b (wireframes, dirección visual, contenido) no bloquea este ADR, aunque `RM:562` diga «H0 cerrado».

## 2. Opciones

| Opción | Composición | Estado de la evidencia |
|---|---|---|
| **A** | Monolito modular en contenedor: Next.js 16.4.1, React y React DOM 19.2.9, Payload CMS 3.90.2 (`db-postgres`, `next`, `richtext-lexical`, `ui`), PostgreSQL 18.6, Node 24.22.0 (`engines >=24.22.0 <25`), TypeScript 5.9.3 y Playwright 1.64.1 (`PKG:16-38`; `EVI:3`; `ARQ:5`) | POC-1a y POC-1b cerradas; POC-3 implementada sin Docker |
| **B** | Astro (7.x con `@astrojs/node`, según `MAT:25`) para lo público, con un backend y un panel independientes que no están elegidos (`ARQ:8`) | Sin POC. Sólo papel (§4) |
| **C** | React Router 8.x en framework mode con backend propio; hay que construir el CMS y el panel (`ARQ:11`; `MAT:26`) | Condicional: sólo si A queda rechazada y B no ofrece alternativa (`REG:170`; `RM:503`). **No activada:** ningún criterio de rechazo de A se ha disparado (`EVI:120`) |

## 3. Evidencia de A

### 3.1 Medido (POC-1a y POC-1b)

Entorno: VM compartida de 6 vCPU y 8 GiB. Las cifras son **indicativas, no de laboratorio** (`EVI:9-11`). Las mediciones son la mediana de 3 ejecuciones en producción (`EVI:79`).

| Ámbito | Resultado | Cita |
|---|---|---|
| Pruebas POC-1a | Contrato 43/43 · vitest 64 · `tsc` sin errores · batería 13 ok/0 fail ×3 contra producción · HTTP contra producción 39 ok · E2E 3/3 (F3, F1 sin JS, acciones de servidor), todas con exit 0 | `EVI:16-22` |
| Control de acceso | Cookies `HttpOnly`, `Secure` y `SameSite=Strict`; CSRF rechaza un `Origin` ajeno y la ausencia de `Origin`; bloqueo tras 6 logins fallidos; anónimo sin borradores ni solicitudes por REST, versiones y `count`; GraphQL ≥ 400 | `EVI:27-33,52-54` |
| Las pruebas discriminan | Mutar las reglas de acceso rompe vitest y la batería. El acceso por campo sólo lo vigila vitest | `EVI:63-70` |
| Reglas de negocio (POC-1b) | Batería explícita 44/44; vitest 72/72; E2E 3/3; rollback con PostgreSQL real (EV-04); FK `RESTRICT`; migración incremental verificada desde cero | `EVI:144-152` |
| Código propio | 458 LOC (`wc -l`) y 5 puntos de extensión del control de acceso | `EVI:148` |
| Propagación (publicar → visible) | 53 ms en producción (objetivo provisional ≤ 60 s, `REG:64`). Mide `force-dynamic` sin caché; no se extrapola a ISR | `EVI:82,155` |
| JS público | 174,7 KB gzip en la lista y 171,5 KB en el detalle (runtime de Next y React, sin `use client` propio) | `EVI:83-84,128` |
| LCP, CLS y TBT **aproximados** | 376/376 ms · 0/0 · 140/188 ms. **No son Lighthouse.** El estrangulado de red tuvo un efecto limitado y las cifras no son comparables con Lighthouse | `EVI:85-87,95-97` |
| Operación | Build en frío 26,0 s (16,2 s en POC-1b); arranque 2,55 s; RAM en reposo: app 99,8 MiB y db 73,7 MiB | `EVI:88-91,147` |
| Dependencias | 10 directas, 8 de desarrollo, 429 instaladas; 1 LGPL-3.0-or-later (libvips, vía `sharp`) y 1 WTFPL | `EVI:92-93` |
| Soporte | Node 20 en EOL desde 2026-04-30; Node 24 LTS con soporte hasta 2028-04-30; PostgreSQL 18 hasta 2030-11-14 | `MAT:9,14,24` |

### 3.2 POC-3 sin Docker

- **[Medido]** Suite de agentes `jz-run` sobre `95db8f4`: 23 archivos, 178/178, rc=0 (`EVI:182`). Además, `tsc` rc=0, contrato 43/43 y funciones de medición 8/8 (`EVI:203-205`). R-1 retirado, con una prueba estática que lo exige (`EVI:175`).
- **[Deducido]** El gate es un procedimiento redactado leyendo el código, **no ejecutado**. Sus resultados esperados no están verificados (`GATE:3`). Las correcciones `b09d7ea` y `c8bbf0f` están pendientes de verificación Docker (`GATE:528-537`).

### 3.3 Pendiente (bloquea la aceptación o la condiciona)

| # | Qué falta | Dónde se resuelve | Bloquea |
|---|---|---|---|
| P1 | Gate Docker de POC-3, D01–D30 (`EVI:187-211`, todo PENDIENTE), con `--alcance poc-3` 12/12, E2E con axe (requiere A4/P3-05) y medición de latencia y falsos positivos (`EVI:218-228`) | `GATE` §A–J; criterio de U10 `GATE:560-575` | Sí (H0A-15) |
| P2 | Repetir la regresión sin R-1 contra el intake real: 44 en `app` y 43 en `app-prod` (P-U1-01) | `GATE` D16 y D26 | Sí |
| P3 | E2E contra el build de producción. POC-1a sólo lo ejecutó contra `next dev` (`EVI:156`) | `GATE` D28 | Sí |
| P4 | POC-4: backup y restauración de PostgreSQL y de los medios, imagen multi-stage y rollback (D-03 parcial, D-11, D-17) | POC-4, o ADR posterior y condición de entrada en H2 (`REG:34,147-166`) | Sólo D-03 en parte |
| P5 | `npm audit`: no se ejecuta desde la fase 1 de POC-1a, con 10 hallazgos en herramientas de build y desarrollo (`EVI:164-168`) | Antes de aceptar, en la sesión principal (requiere red) | Sí [Propuesto] |
| P6 | Revisión de las licencias LGPL-3.0-or-later (libvips) y WTFPL (`EVI:93`) | El responsable; no es una opinión legal de agentes | Sí [Propuesto] |
| P7 | Advisories abiertas de Next y Payload en la fecha de aceptación (`MAT:22,43`; `AGENTS.md:23`) | Verificación en la documentación oficial al aceptar | Sí [Propuesto] |
| P8 | Ventana de soporte de Next 16 y de Payload 3, con Payload v4 en beta. Las fuentes del repo no dan fechas (`MAT:22-23`) | Verificar en las fuentes oficiales | No; es un riesgo |
| P9 | Core Web Vitals con un método reconocido (Lighthouse o equivalente) | Antes de fijar los presupuestos de H3 (`RM:468,583`) | No |
| P10 | Revisión independiente única del hito (`REG:183`) | Tras P1 | Sí |

## 4. Comparación limitada con Astro (en papel)

**Regla de lectura.** Las cifras de A son aproximadas (`EVI:95-97`) y se tomaron en una VM compartida (`EVI:10,157`). **No son comparables con ninguna cifra de B sin un método común**, que es lo que exige `REG:116`. Por eso no hay columna numérica para B.

| Criterio | A: lo que se sabe (fuente) | B: lo que se sabe (fuente) | ¿Lo mediría una POC-2 reducida? |
|---|---|---|---|
| JS público | [Medido] unos 172 KB gzip de runtime aunque no haya componentes de cliente (`EVI:83-84,128`) | [Deducido] Astro sirve HTML sin runtime de framework salvo en las islas. No verificado en las fuentes del repo (verificar en docs.astro.build) | Sí, con `scripts/medir-js.mjs`. Diferencia previsible a favor de B |
| HTML legible sin JS | [Medido] F1 sin JS pasa, sólo contra `next dev` (`EVI:40,156`) | [Deducido] es el modo nativo de Astro | Sí |
| LCP, CLS y TBT | [Medido, aproximado] 376 ms, 0 y 140–188 ms (`EVI:85-87`) | Sin datos | Sí, pero LCP ≈ FCP en loopback (`EVI:96`): poca señal frente al ruido [Deducido] |
| Publicación sin commit (H0A-07, `REG:26`) | [Medido] 53 ms con `force-dynamic` (`EVI:82,155`) | [Deducido] con `@astrojs/node` bajo demanda no hace falta regenerar (`MAT:44`); en estático, sí (`REG:120`) | Sí |
| Borradores y medios privados | [Medido] cerrados por canal, con pruebas que discriminan (`EVI:31-33,63-70`); excepción B7 (§5) | Dependen de un backend sin elegir y de la exposición del origen de datos del build (`REG:117-118`) | Sólo «el borrador no llega al build»; el backend no |
| Panel y autenticación | [Medido] nativos de Payload (`EVI:27-30`) | Panel y backend aparte; dos autenticaciones (`MAT:25`) | **No**: sólo se estiman (`REG:114`) |
| Superficie de despliegue | Un contenedor (`ARQ:5`) | Dos superficies y dos despliegues (`ARQ:8`) | **No**: sólo se estima |
| Seguridad de la superficie pública | Expuesta a la clase de advisories de Next/RSC (`MAT:22`) | [Deducido] un sitio público sin servidor React reduce esa clase, pero el backend sigue expuesto | No |
| Mantenimiento y cadencia de majors | Parches rápidos de Next, rango de compatibilidad de Payload y v4 en beta (`MAT:22-23`) | Cadencia rápida de majors de Astro, más un backend y un panel por elegir (`MAT:25`) | No |
| Experiencia con agentes | [Medido] 458 LOC y 5 puntos de extensión (`EVI:148`); incidentes operativos: `drizzle push` interactivo y la base `poc` contaminada (`EVI:114-115,123`) | Sin datos | No |

**Coste de una POC-2 reducida [Deducido; no hay cifra de horas en las fuentes].**
- Requiere una autorización nueva (H0A-16d), con instalación de Astro 7.x y `@astrojs/node` por versión exacta, auditoría (`MAT:25`) y un worktree `poc/candidata-b` (`REG:44`).
- Hay que decidir el origen de datos (fixture o la base de A), sin precedente en las fuentes. [Pendiente]
- Requiere un gate Docker humano, porque los agentes no ejecutan Docker (`REG:38`), la mediana de 3 (`REG:47`) y **volver a medir A en la misma sesión**, porque la VM es compartida.
- Sólo mide 5 de los 10 criterios; los decisivos para B (panel, autenticación, doble despliegue y mantenimiento) siguen estimados (`REG:114`).

**Opciones para el responsable** (el corte orientativo es `REG:123`: ≥ 20 % en LCP de laboratorio o en JS público):

- **Opción 1 · Autorizar la POC-2 reducida (H0A-16d) con un límite de tiempo.**
  - Alcance: `RM:474` y `REG:113-125`, con una ejecución y como mucho una repetición (`REG:52`).
  - Regla de parada: el resultado se registra aquí sea cual sea, y sólo se abre una POC completa de B si la tabla de costes estimados no es peor que la de A.
  - Cumple H0A-15 y `docs/ROADMAP.md:11` («comparar con Astro») tal como están (`AN:322-324`).
- **Opción 2 · Descartar B sin POC, con la justificación de este §4.**
  - Exige enmendar H0A-15 (POC-2 deja de ser evidencia obligatoria) y dejar resuelta C-09 por vía documental (`RM:699`; `AN:324`, opción B).
  - Se reabre ante las señales del §6.

**[Propuesto] Recomendación del arquitecto: opción 2.**
- El corte de `REG:123` previsiblemente se cumpliría sólo por el JS [Deducido]. `REG:124` lo declara orientativo, así que la decisión volvería a los costes, que la POC-2 reducida tampoco mide.
- Un umbral absoluto informa más que una comparación relativa. Por ejemplo, que A cumpla el presupuesto de rendimiento de H3, medido con Lighthouse (P9). Si no lo cumple, se activa la opción 1.
- Si el responsable valora tener la cifra de JS de B medida, la opción 1 con límite es la alternativa válida.

## 5. Riesgos abiertos de A (aceptar o exigir corrección)

| ID | Riesgo | Fuente | Propuesta [Propuesto] |
|---|---|---|---|
| B7 | Un proyecto publicado expone `{relationTo:"medios-privados", value:<id>}` a un anónimo: revela que el medio existe y su id, no su contenido. No hay un control nativo trivial | `EVI:56-60` | **Decisión previa:** `REG:86` rechaza A si hay «una exposición que la configuración no corrige». El responsable decide si las opciones de modelado (dos campos, o validar en `beforeChange` que un publicado no referencie privados) cuentan como configuración nativa. Si cuentan: corregirlo en H3 con una prueba negativa. Si no: se activa el criterio de rechazo. Ninguna de las dos opciones está probada |
| M3 | `forgot-password` está abierto al anónimo, deja el correo del admin en los logs y escribe un token. No se probó por HTTP | `EVI:130-132` | Cerrar el endpoint, coherente con H0A-05 (recuperación por procedimiento, `REG:24`), con una prueba negativa. Cómo se cierra en Payload no está verificado [Pendiente] |
| B4 | Contenedor sin `cap_drop`, `no-new-privileges` ni `read_only`; `./` montado con escritura | `EVI:135` | Requisito de la imagen en POC-4 y H2 |
| B3 | `app`, `app-prod` y `e2e` tenían salida a Internet. POC-3 los saca de `externa` (`POC-3-DISENO.md:19-20`), pendiente del gate D07/D24 | `EVI:133-134` | Verificar en P1; requisito de H2 |
| E2E | E2E de POC-1a sólo contra `next dev` | `EVI:156` | Lo cierra D28 (P3) |
| FS | La acción `form-state` devuelve al admin el correo y los ids de sesión | `EVI:117-118` | Regla de logs del producto: no registrar respuestas de acciones de servidor |
| NODE | El Node del host es 20.19.2, en EOL; con él corren el driver y los scripts del gate como root | `EVI:4-6`; `MAT:9`; `GATE:11` | La subida del host es una decisión aparte (H0A-09, `REG:28`). El producto usa la imagen de Node 24 |
| Otros | Bloqueo por cuenta (denegación al único admin); `first-register` y `/api/users/init`; migraciones acopladas al nombre del schema | `EVI:124-125,140,104` | Crear el admin por CLI antes de exponer el servicio; fijar el schema antes de H2 |

## 6. Propuesta de decisión (recomendación, no decisión)

**[Propuesto] Adoptar la opción A** (versiones del §2) para D-01, D-02, D-04 y D-10. D-03 se adopta de forma parcial: PostgreSQL 18, con constraints y transacciones medidas (`EVI:145-151`); backup y restauración quedan en POC-4.

Condiciones de aceptación:
1. Gate Docker de POC-3 en verde según `GATE:560-575`, con P-U1-01 decidida.
2. B7 y M3 cerrados o aceptados de forma expresa (§5).
3. P5 a P7 resueltos.
4. POC-4 para D-03 (restauración) y D-11, o su paso a un ADR posterior como condición de entrada en H2 (`REG:34`).
5. Decisión sobre POC-2 (§4).
6. Revisión de hito (P10).

**Consecuencias.**
- Un solo contenedor, un panel y una autenticación.
- Unos 172 KB de JS público como base (`EVI:128`).
- Dependencia del rango de compatibilidad Payload↔Next y obligación de parchear Next con rapidez (`MAT:22-23`).
- Habrá que migrar a Payload v4 más adelante.
- No se añade un ORM paralelo (`ARQ:5`).

**Coste de revertir [Deducido].**
- Antes de H2 es nulo: el código de la POC es desechable (`RM:451`).
- Después de H3, los datos en PostgreSQL se conservan, pero habría que rehacer las colecciones, las reglas de acceso (5 puntos y 458 LOC, `EVI:148`), el panel y la superficie pública.

**Señales que reabrirían la decisión:**
- un fallo de diseño en el gate de POC-3 (`REG:52,144`);
- B7 o M3 sólo corregibles eludiendo el control nativo (`REG:86`; `RM:469`);
- una restauración incompleta en POC-4 (`REG:165`);
- una advisory de Next sin parche dentro del rango de Payload;
- que A no cumpla el presupuesto de rendimiento de H3;
- que el portafolio gane mucho más peso que la gestión (`ARQ:8`).

## 7. Decisiones humanas necesarias para aceptar

| # | Decisión | Opción que se recomienda | Fuente |
|---|---|---|---|
| 1 | P-U1-01: 44 en `app` y 43 en `app-prod` sin EV-04 | Aceptar | `GATE:555` |
| 2 | D-08: antiabuso | Controles propios, con el desafío externo bajo demanda; tras D30 y H-6 | `GATE:556`; `EVI:247` |
| 3 | D-09: antiduplicados | **Sin recomendación registrada.** El único mecanismo es el nonce con HMAC (recargar la página y reenviar crea otro registro) | `GATE:557` |
| 4 | P3-05: instalar axe (A4) | Autorizar | `GATE:558` |
| 5 | POC-2: sí (H0A-16d) o no (enmendar H0A-15) | Opción 2 (§4) | `REG:34,123` |
| 6 | B7: ¿es corregible por configuración (`REG:86`)? | Sí, con corrección y prueba en H3 | `EVI:56-60` |
| 7 | M3: cerrar o aceptar | Cerrar | `EVI:130-132` |
| 8 | Matriz de pesos (`REG:49` pide ponderar y no fija pesos) | La tabla de abajo | `REG:49` |
| 9 | P5 a P7: `npm audit`, licencias y advisories | Ejecutar y revisar antes de aceptar | §3.3 |

**[Propuesto] Matriz de pesos simple.**
- **Escala por criterio:** 0 = bloqueante, 1 = riesgo abierto, 2 = cumple con condiciones, 3 = cumple medido.
- **Veto:** un 0 en Seguridad o en Cumplimiento funcional rechaza la opción, sea cual sea el total (coherente con `REG:86`).

| Criterio | Peso |
|---|---|
| Seguridad (control de acceso por canal, superficie expuesta) | 30 |
| Cumplimiento funcional (F1–F4, H0A-02 a H0A-04) | 25 |
| Mantenimiento y actualizaciones (cadencia, compatibilidad, parches) | 15 |
| Rendimiento público (JS, LCP de laboratorio) | 10 |
| Coste operativo y superficies de despliegue | 10 |
| Accesibilidad (WCAG 2.2 AA; depende poco del stack) | 5 |
| Experiencia con agentes (LOC propio, incidentes) | 5 |

## 8. Aprobación (H0A-08, H0A-12)

Se rellena sólo con la aprobación expresa del responsable. La referencia Git es la del commit cuyo texto se revisó, nunca la del commit que registra la aprobación (`REG:8-14`).

| Campo | Valor |
|---|---|
| Decisión (Aceptado / Aceptado con precisiones / Rechazado) | |
| Alcance aceptado (D-01, D-02, D-03, D-04, D-10) | |
| Fecha | |
| Responsable | |
| Referencia Git del texto revisado | |
| Medio (conversación, PR o commit propio) | |
| Precisiones | |
