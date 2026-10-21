# Decisiones pendientes del responsable — jozeuzz.cl

> **Estado:** Propuesta de priorización (2026-10-21). No decide nada.
> **Autor:** jz-architect, rama `work/jozeuzz-autonomo`. Reúne las decisiones abiertas de seis documentos y de [ESTADO-PROYECTO.md](ESTADO-PROYECTO.md) §8. Si este documento y el de origen no coinciden, prevalece el de origen.
> **Abreviaturas:** `EST` = [ESTADO-PROYECTO.md](ESTADO-PROYECTO.md) · `GATE` = [GATE-DOCKER-POC-3.md](GATE-DOCKER-POC-3.md) · `ADR` = [adr/0001-stack.md](adr/0001-stack.md) · `REG` = [REGISTRO-DECISIONES-H0A.md](REGISTRO-DECISIONES-H0A.md) · `HP` = [HALLAZGOS-POC-2026-10-21.md](propuestas/HALLAZGOS-POC-2026-10-21.md) · `INV` = [INVENTARIO-CONTENIDO.md](h0b/INVENTARIO-CONTENIDO.md) · `WF` = [WIREFRAMES.md](h0b/WIREFRAMES.md) · `REC` = [RECORRIDO-SOLICITUD.md](h0b/RECORRIDO-SOLICITUD.md) · `PAN` = [PANEL-ADMIN.md](h0b/PANEL-ADMIN.md) · `DV` = [DIRECCION-VISUAL.md](h0b/DIRECCION-VISUAL.md).

**Qué está hecho (detalle en EST).** H0-a está cerrado: H0A-01 a H0A-16 y H0A-16a a H0A-16c aprobadas. POC-1a está cerrada y POC-1b tiene cierre local. POC-3 está implementada, pero su gate Docker se detuvo en D07. ADR-0001 (stack A) sigue como **[Propuesto]**. De H0-b hay cinco propuestas en `docs/h0b/`: inventario, wireframes, recorrido de la solicitud, panel y dirección visual. Las tres direcciones visuales tienen tokens verificados: 64 pares de contraste y 0 fallos según DV › §4. Hay además dos herramientas de verificación (`herramientas/verificar-docs`, `herramientas/contraste`) y 23 hallazgos sobre la POC encontrados por lectura de código (HP). **Nada de esto está aprobado.**

**Qué decidir primero.** Primero, el gate de POC-3 y los hallazgos que afectan al ADR (Sesión 1 de §3), porque son lo único que bloquea H1 y su ejecución es larga y manual. El contenido real y H0-b pueden avanzar en paralelo, porque H0A-01 establece que H0-b no bloquea H1 ni H2.

## 1. Cómo usarlo

- Cada decisión se registra **al aprobarse** con el formato de H0A-08 (REG › «Cómo se aprueba»): la fecha, la referencia Git del commit que contiene el texto revisado (nunca la del commit que registra la aprobación) y el medio (conversación, comentario de PR o commit propio). Sin esos tres datos, la decisión sigue abierta.
- Los IDs remiten al documento de origen. Allí están las opciones completas, los riesgos y las dependencias; esta tabla sólo resume la pregunta.
- [Pendiente] Dónde se registran las decisiones de H0-b y las HP-Dnn: en REG o en un registro nuevo. Lo decide el responsable.
- **Bloquea** indica el primer hito que no puede cerrarse sin la respuesta. Lo toma del documento de origen si este tiene esa columna; si no, se deduce de él (y se marca [Deducido]).
- **Prioridad** [Propuesto]. P1: bloquea H1 o H2, o el gate de POC-3 (las decisiones que bloquean H2 se tratan como P1). P2: bloquea H3 (contenido, wireframes, dirección visual, panel F3). P3: bloquea H4, H5 o H7, o es de bajo riesgo y ya tiene un valor por defecto propuesto.
- **Recomendada** recoge la opción sólo si el documento de origen la marca como [Propuesto]. Si no la marca, aparece «—». Si la recomendación viene de GATE sin la etiqueta [Propuesto], se cita como «GATE recomienda».

## 2. Decisiones abiertas

| ID | Pregunta | Origen | Bloquea | Prio. | Depende de | Recomendada |
|---|---|---|---|---|---|---|
| GATE-POC-3 | ¿Se reanuda el gate Docker (RP0–RP7 y R0–R12, como root), y con qué `DOCREF` y `S1`? | [EST](ESTADO-PROYECTO.md) › §8.1; [GATE](GATE-DOCKER-POC-3.md) › cabecera | H1 | P1 | Se decide junto con HP-D07 (momento) y RP5 | — |
| RP5 · DBMIG · Restauración | ¿Cómo se retiran los contenedores de la ejecución 1, qué base nueva se usa y se restaura el respaldo? | [EST](ESTADO-PROYECTO.md) › §8.2; [GATE](GATE-DOCKER-POC-3.md) › «Decisiones humanas que bloquean el cierre» | H1 (gate) | P1 | Se decide junto con GATE-POC-3 | — (GATE recomienda `./poc.sh down` + A3e; `poc3_migraciones_r<n>`; no restaurar salvo daño) |
| P-U1-01 | ¿T-10 se da por cumplido con 44 en `app` y 43 en `app-prod`, sin EV-04? | [EST](ESTADO-PROYECTO.md) › §8.4; [GATE](GATE-DOCKER-POC-3.md) › ídem | H1 (ADR §6, cond. 1) | P1 | — | — (GATE recomienda aceptar la propuesta implementada; ADR §7 coincide) |
| D-08 | ¿Qué mecanismo antiabuso tiene el MVP? | [EST](ESTADO-PROYECTO.md) › §8.4; [REC](h0b/RECORRIDO-SOLICITUD.md) › §5.3 | H1 (cierre de U10 según GATE); H4 | P1 | D30 y H-6 del gate | — (GATE recomienda controles propios, con el desafío externo sólo bajo demanda; ADR §7 coincide) |
| D-09 | ¿Qué mecanismo antiduplicados tiene el MVP? | [EST](ESTADO-PROYECTO.md) › §8.4; [REC](h0b/RECORRIDO-SOLICITUD.md) › §5.3 | H1 (cierre de U10 según GATE); H4 | P1 | H0A-11 si (b); PA-13 si (c) | — (GATE: sin recomendación registrada) |
| POC-2 | ¿Se autoriza H0A-16d (POC-2) o se enmienda H0A-15? | [EST](ESTADO-PROYECTO.md) › §8.5; [ADR](adr/0001-stack.md) › §4 | H1 | P1 | C-09 | No hacer POC-2 [Propuesto] |
| C-09 | ¿Se implementa la comparación con Astro? | [EST](ESTADO-PROYECTO.md) › §3; [ADR](adr/0001-stack.md) › §4 | H1 | P1 | Es la misma decisión que POC-2 | Opción 2: descartar B sin POC, enmendando H0A-15 [Propuesto] |
| B7 | Un proyecto publicado revela el id y la colección de un medio privado: ¿se corrige o se acepta? | [EST](ESTADO-PROYECTO.md) › §6 y §8.6; [ADR](adr/0001-stack.md) › §5 | H1 (ADR §6, cond. 2) | P1 | HP-D05; HP-D10 | — (ADR §7 recomienda: sí es corregible por configuración, con corrección y prueba en H3) |
| M3 | `forgot-password` está abierto al anónimo y el correo del admin queda en los logs: ¿se cierra o se acepta? | [EST](ESTADO-PROYECTO.md) › §6 y §8.6; [ADR](adr/0001-stack.md) › §5 | H1 (ADR §6, cond. 2) | P1 | HP-D04 | — (ADR §7 recomienda: cerrar) |
| P5 | ¿Se autoriza `npm audit` (requiere red) antes de aceptar el ADR? | [EST](ESTADO-PROYECTO.md) › §8.7; [ADR](adr/0001-stack.md) › §3.3 | H1 (ADR §6, cond. 3) | P1 | — | — (ADR §7 recomienda: ejecutar y revisar antes de aceptar) |
| P6 | ¿Se aceptan las licencias LGPL-3.0-or-later (libvips) y WTFPL? | [EST](ESTADO-PROYECTO.md) › §8.7; [ADR](adr/0001-stack.md) › §3.3 | H1 (ADR §6, cond. 3) | P1 | — | — (ADR §7 recomienda: ejecutar y revisar antes de aceptar) |
| P7 | ¿Qué hacer con las advisories abiertas de Next y Payload en la fecha de aceptación? | [EST](ESTADO-PROYECTO.md) › §8.7; [ADR](adr/0001-stack.md) › §3.3 | H1 (ADR §6, cond. 3) | P1 | — | — (ADR §7 recomienda: ejecutar y revisar antes de aceptar) |
| U10 | Revisión independiente del hito (P10) tras el gate | [EST](ESTADO-PROYECTO.md) › §8.8; [GATE](GATE-DOCKER-POC-3.md) › «Criterio de cierre de U10» | H1 | P1 | GATE-POC-3; HP-D07 (I-A4T) | — |
| ADR-0001 | ¿Se acepta o se rechaza el stack A? | [EST](ESTADO-PROYECTO.md) › §8.8; [ADR](adr/0001-stack.md) › §6 | H1 | P1 | ADR §6 cond. 1 a 6 (GATE-POC-3, P-U1-01, B7, M3, P5 a P7, POC-4 o su paso a H2, POC-2, U10); HP-D06 | Opción A, con las condiciones del §6 [Propuesto]; incluye la matriz de pesos (ADR §7 #8) |
| POC-4 | ¿Qué entorno y qué destino de backup tiene POC-4, o se pasa a condición de entrada de H2? | [EST](ESTADO-PROYECTO.md) › §8.9; [ADR](adr/0001-stack.md) › §6 | H1 (ADR §6, cond. 4); H2 | P1 | H0A-14 | — |
| H0A-05 (proc.) | Procedimiento de alta y recuperación del administrador | [EST](ESTADO-PROYECTO.md) › §8.12; [PAN](h0b/PANEL-ADMIN.md) › §2.3 | H2 | P1 | PA-04; PA-05; HP-D04 | — |
| HP-D01 | HP-01 y HP-22: ¿requisito de H5, verificación tras el gate o REG:52? ¿El SQL sobre la transacción interna cuenta como eludir el CMS? | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H1 (POC-1b y ADR) [Deducido de HP §3] | P1 | HP-D10 | — |
| HP-D04 | Cuentas en el panel frente a H0A-05 (`create` y `update`) | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H2; agrava M3 [Deducido de HP §3] | P1 | M3; PA-04 | — |
| HP-D05 | ¿Qué hace público un medio, y cuenta eso como configuración (REG:86)? | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H1 (B7) [Deducido de HP §3] | P1 | HP-D10 (verificación del `Where`) | — |
| HP-D06 | ¿Se amplían el §5 y las condiciones del §6 del ADR con las filas de HP §3? | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H1 [Deducido de HP §3] | P1 | — | — |
| HP-D07 | ¿Cómo y cuándo se corrigen I-A4T y HP-21? (= EST §8.3, I-A4T) | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H1 (D11 del gate) | P1 | Se decide junto con GATE-POC-3 | — |
| HP-D08 | Deriva de esquema (OB2, HP-20): ¿unidad en la POC o requisito de H2? (= EST §8.3, OB2) | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H1 (evidencia de D-03); H2 [Deducido de HP §3] | P1 | — | — |
| HP-D10 | ¿Se autorizan verificaciones sobre Payload 3.90.2 (código, ejecución o red)? | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H1 [Deducido de HP §3] | P1 | — | — |
| PA-01 | Caducidad de la sesión: por inactividad y absoluta | [PAN](h0b/PANEL-ADMIN.md) › §10 | H2 | P1 | — | — |
| PA-02 | Límite de intentos de acceso | [PAN](h0b/PANEL-ADMIN.md) › §10 | H2 | P1 | PA-03 (d) | — |
| PA-03 | Segundo factor | [PAN](h0b/PANEL-ADMIN.md) › §10 | H2 | P1 | PA-02 (d) | — |
| PA-04 | ¿Se ven las cuentas en el panel? | [PAN](h0b/PANEL-ADMIN.md) › §10 | H2 | P1 | H0A-05; HP-D04 | — (rige (a) mientras no se decida) |
| PA-05 | Factor de confianza de la recuperación | [PAN](h0b/PANEL-ADMIN.md) › §10 | H2 | P1 | H0A-05 (proc.) | — |
| H0-b (lista) | Aprobar la lista de contenidos y su responsable, y entregar los datos reales | [EST](ESTADO-PROYECTO.md) › §8.10; [INV](h0b/INVENTARIO-CONTENIDO.md) › §5 | H3 | P2 | — | — |
| H0A-12 (doc.) | Registrar la aprobación documental de las fuentes (PROD, ESP, UX, ARQUITECTURA) | [EST](ESTADO-PROYECTO.md) › §3 (C-12) y §8.11 | H3 [Deducido: H0-b se apoya en ESP y UX] | P2 | — | — |
| C-04 | ¿La vista previa es obligatoria para cerrar F3? | [EST](ESTADO-PROYECTO.md) › §3; [PAN](h0b/PANEL-ADMIN.md) › §4.3 | H3 [Deducido] | P2 | — | — |
| C-13 | Filtros del visitante frente a RF-15 (*Should*) | [EST](ESTADO-PROYECTO.md) › §3 | H3 [Deducido] | P2 | DC-09; WF-10 | — |
| DC-01 | Nombre comercial del servicio técnico | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H4 (SER-01, MAR-02) [Deducido]; condiciona DV-04 (H3) | P2 | — | — |
| DC-06 | ¿Habrá CV descargable? | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 (SOB-06) [Deducido] | P2 | — | — |
| DC-07 | Idioma principal y secundario | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 (SEO-04) [Deducido] | P2 | — | — |
| DC-08 | `/experiencia`: ¿integrada en `/sobre-mi` o página propia? (C-10) | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 [Deducido] | P2 | Es la misma decisión que WF-01 | — |
| DC-09 | Taxonomía: ¿categorías administrables, lista fija o ninguna? ¿Compartida? | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 (proyectos); H4 (SER-06, SOL-06) [Deducido] | P2 | C-13; WF-10 | — |
| DC-10 | Tipos de datos estructurados | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 (SEO-03) [Deducido] | P2 | DC-02; DC-05 (sin DC-02 ni DC-05 rige la exclusión por defecto); WF-12 | — |
| DC-11 | Imagen personal | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 (INI-08) [Deducido] | P2 | — | — |
| DC-12 | Enlaces profesionales: ¿en el Perfil o en Ajustes? | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 [Deducido] | P2 | — | — |
| DC-13 | Tono editorial: tratamiento y persona gramatical | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 (MAR-03) | P2 | — | — |
| DC-14 | Proyecto «retirado»: ¿estado propio o vuelta a borrador con fecha? | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H3 [Deducido] | P2 | — | — |
| WF-01 | Experiencia: ¿ancla en `/sobre-mi` o página propia? (C-10) | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | DC-08 | — |
| WF-02 | Menú móvil sin JavaScript | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | DV-06 | — |
| WF-03 | CTA y enlaces hacia catálogos vacíos | [WF](h0b/WIREFRAMES.md) › §7 | H3 (proyectos); H4 (servicios) | P2 | — | — |
| WF-06 | Cabecera: ¿fija o no fija? | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | — | — |
| WF-07 | Inicio con proyectos publicados pero ninguno destacado | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | — | — |
| WF-08 | Tamaño de los objetivos táctiles | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | — | — |
| WF-09 | Sitio sin Perfil publicado | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | — | — |
| WF-10 | Filtro de categorías | [WF](h0b/WIREFRAMES.md) › §7 | H3, si DC-09 adopta categorías | P2 | DC-09; C-13 | — |
| WF-11 | Forma canónica de la URL (con o sin barra final) | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | — | — |
| WF-12 | Migas visibles y `BreadcrumbList` | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | DC-10 | — |
| WF-13 | Textos de interfaz: ¿copia versionada o editables en Ajustes? | [WF](h0b/WIREFRAMES.md) › §7 | H3 | P2 | — | — |
| DV-01 | Dirección visual | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | Una combinación exige regenerar y verificar su JSON | B «Técnica precisa», con la disciplina de contraste de C [Propuesto, DV §3] |
| DV-02 | Modo oscuro | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | DV-01 (JSON propio si se adopta) | — |
| DV-03 | Tipografía | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | DV-01 | — |
| DV-04 | Cómo se diferencia el área técnica | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | DC-01 | — |
| DV-05 | Estilo de foco | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | DV-01 | — |
| DV-06 | Punto de corte de la navegación | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | WF-02; rótulos reales | — |
| DV-07 | Nivel de contraste del texto | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | DV-01 | — |
| DV-08 | Iconografía | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | DV-04 | — |
| DV-09 | Movimiento | [DV](h0b/DIRECCION-VISUAL.md) › §5 | H3 | P2 | — | — |
| PA-06 | Ajustes: ¿con borrador o guardar es publicar? | [PAN](h0b/PANEL-ADMIN.md) › §10 | H3 | P2 | — | — |
| PA-07 | ¿Qué se puede borrar desde el panel? | [PAN](h0b/PANEL-ADMIN.md) › §10 | H3 | P2 | — | — |
| PA-08 | Acciones de versión | [PAN](h0b/PANEL-ADMIN.md) › §10 | H3 | P2 | C-04 | — |
| PA-09 | Defectos de accesibilidad de la UI del CMS | [PAN](h0b/PANEL-ADMIN.md) › §10 | H3 (contenido); H5 (bandeja) | P2 | ADR-0001 | — |
| H0A-11 (retención) | Política de retención, antes de los datos reales | [EST](ESTADO-PROYECTO.md) › §8.12 | H3 (carga de datos reales) y H7 | P2 | Condiciona D-09 (b), HP-D02, PA-16 y RS-03 | — |
| DC-02 | Cobertura geográfica | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H4 (SER-04) [Deducido] | P3 | — | — |
| DC-03 | Horarios | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H4 (SER-04) [Deducido] | P3 | — | — |
| DC-04 | Política de precios (CLP o «a cotizar»; impuestos) | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H4 (SER-03) [Deducido] | P3 | — | — |
| DC-05 | Canales de contacto y su exposición | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H4 (CON-01) [Deducido] | P3 | — | — |
| DC-15 | Texto de privacidad: ¿editable o fijo y versionado? | [INV](h0b/INVENTARIO-CONTENIDO.md) › §4 | H7 (`textos_legales`, INV §3.6) [Deducido] | P3 | RS-03; H0A-11 | — |
| WF-04 | ¿Se indexa `/servicios/solicitar`? | [WF](h0b/WIREFRAMES.md) › §7 | H4 | P3 | — | — |
| WF-05 | ¿Se indexa `/privacidad`? | [WF](h0b/WIREFRAMES.md) › §7 | H4 | P3 | — | — |
| RS-01 | Forma del contacto en el formulario | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | PA-13; PA-15 | — |
| RS-02 | JavaScript en el envío: ¿sólo HTML o HTML con mejora? | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | — | — |
| RS-03 | ¿Aviso informativo o casilla de consentimiento? | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 (estructura); H7 (texto) | P3 | Base legal que fije el responsable | — (sin recomendación, REC §4) |
| RS-04 | ¿Cómo se abre `/privacidad` desde el formulario? | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | — | — |
| RS-05 | Envío antes del tiempo mínimo, y valor de ese tiempo en producción | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | D-09 (a) o (c) para §5.2; D30 para el valor | (a) mensaje recuperable [Propuesto, REC §5.1] |
| RS-06 | ¿El mensaje de límite da una cifra de espera? | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | — | — |
| RS-07 | ¿Se da un plazo en la confirmación? | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | — | — |
| RS-08 | ¿Se repuebla tras un `csrf_invalido` con origen válido? | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | — | — |
| RS-09 | ¿El contador de intentos va antes o después de validar el origen? | [REC](h0b/RECORRIDO-SOLICITUD.md) › §10 | H4 | P3 | D-08 | — |
| PA-10 | Implementación de la bandeja frente a MVP-12.3 | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | ADR-0001 | — |
| PA-11 | Filtro por fecha | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | — | — |
| PA-12 | Orden y tamaño de página | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | — | — |
| PA-13 | Columnas de la bandeja | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | D-09; RS-01 | — |
| PA-14 | Observaciones en `cerrada`: ¿editables? | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | — | — |
| PA-15 | Búsqueda en la bandeja | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | RS-01 | — |
| PA-16 | Exportación de solicitudes | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | H0A-11 | — (rige (a) mientras no se decida) |
| PA-17 | Concurrencia de las observaciones | [PAN](h0b/PANEL-ADMIN.md) › §10 | H5 | P3 | HP-D01 | — |
| HP-D02 | Borrado de solicitudes | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H5 [Deducido de HP §3] | P3 | H0A-11 | — |
| HP-D03 | Datos del solicitante y creación | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H5 [Deducido de HP §3] | P3 | — | — |
| HP-D09 | Requisitos del intake de H4: ¿se adoptan los de REC? | [HP](propuestas/HALLAZGOS-POC-2026-10-21.md) › §5 | H4 | P3 | RS-09; D-08; D-09 | — |
| C-05 | ¿El MVP sale a producción antes de v0.2 (H7)? | [EST](ESTADO-PROYECTO.md) › §3 | H7 | P3 | — | — |
| Integración | Integrar `work/jozeuzz-autonomo` en `producto/base`, y hacer push y PR | [EST](ESTADO-PROYECTO.md) › §8.13 | Nada inmediato | P3 | — | — |
| NODE | Regenerar el `node_modules` del host y subir el Node del host | [EST](ESTADO-PROYECTO.md) › §8.14 | Nada inmediato | P3 | — | — |

**Qué no figura como fila.** Las decisiones puntuales de ejecución del GATE (A2 REV, aprobación y deshacer A4, RP6) quedan dentro de GATE-POC-3. Los artefactos de H0-b se aprueban en bloque según el checklist de [docs/h0b/README.md](h0b/README.md).

**Coberturas cruzadas.** C-10 se cierra con WF-01 y DC-08. C-09 = POC-2. I-A4T y OB2 (EST §8.3) se tratan en HP-D07 y HP-D08. En REC §10 también aparecen WF-04, DC-09 y DC-13, que figuran arriba una sola vez.

**Recuento.** 97 filas (C-09 y POC-2 son una sola decisión; WF-01 y DC-08, también): EST §8, 24; HP, 10; INV, 15; WF, 13; REC, 9; PAN, 17; DV, 9. Por prioridad: P1, 28; P2, 39; P3, 30.

## 3. Ruta recomendada [Propuesto]

Las sesiones 1 a 3 forman la vía de H1. Las sesiones 4 y 5 pueden hacerse en paralelo con ellas, porque H0-b no bloquea H1 ni H2 (H0A-01). La sesión 6 puede esperar a que H3 esté en marcha.

**Sesión 1. Gate de POC-3 y hallazgos que afectan al ADR.**
- Decide: GATE-POC-3; HP-D07 (si I-A4T se corrige antes o después de reanudar); RP5, DBMIG y Restauración; P-U1-01; HP-D10; HP-D01; HP-D05 (y con ella, la vía de B7); B7; HP-D06.
- Resultado esperado: el gate queda autorizado con su `DOCREF`, o aplazado por escrito. Quedan autorizadas, o no, la unidad de I-A4T y las verificaciones sobre Payload. Queda fijado el criterio para HP-01, HP-22 y los medios públicos.
- Desbloquea: que el responsable ejecute el gate como root desde `poc/candidata-a-3`, y una unidad de jz-architect que amplíe el §5 y el §6 del ADR (si HP-D06 = a).

**Sesión 2. Resto de condiciones del ADR y entrada a H2.**
- Decide: POC-2 y C-09; M3 y HP-D04; P5 a P7 (P5 exige autorizar la red); HP-D08; POC-4; H0A-05 (procedimiento) con PA-01 a PA-05; D-08 y D-09 sólo como orientación, sin cerrarlas.
- Resultado esperado: las condiciones 2 a 5 del ADR §6 quedan resueltas o con un camino fijado, y el modelo de acceso de H2 queda definido.
- Desbloquea: redactar el procedimiento de H0A-05 y el plan de H2.

**Sesión 3. Tras el gate: U10 y ADR-0001.**
- Requisito: el gate en verde, con evidencia registrada.
- Decide: D-08 y D-09 (con D30 y H-6 medidos); la revisión de hito U10, y la aceptación o el rechazo de ADR-0001 (H0A-12).
- Desbloquea: el cierre de H1; el inicio de H2 además requiere lo decidido en la Sesión 2.

**Sesión 4. Contenido real.**
- Decide: H0-b (lista); H0A-12 (doc.); DC-01, DC-06, DC-07 y DC-09 a DC-14; H0A-11 (retención), antes de los datos reales. El responsable entrega la plantilla de INV › §5.
- Resultado esperado: el inventario aprobado y los datos reales entregados. Ningún agente puede inventarlos.
- Desbloquea: DV-04, la parte de WF que depende del contenido y el contenido de H3.

**Sesión 5. Wireframes, dirección visual y panel F3.**
- Decide: WF-01 y DC-08, WF-02 y WF-03, WF-06 a WF-13 y C-13; DV-01 a DV-09; C-04 y PA-06 a PA-09.
- Resultado esperado: los wireframes aprobados y la dirección visual elegida. Si se elige una combinación, hace falta una unidad que regenere su JSON y repita la comprobación de contraste.
- Desbloquea: H3, junto con H2.

**Sesión 6. Solicitud, bandeja y H7.**
- Decide: RS-01 a RS-09; WF-04 y WF-05; DC-02 a DC-05 y DC-15; HP-D09; PA-10 a PA-17; HP-D02 y HP-D03; C-05.
- Desbloquea: H4, H5 y la preparación de H7.

**Sin sesión fija:** Integración y NODE, cuando el responsable lo considere.

## 4. Valores por defecto que podrían aprobarse en bloque

Aprobarlos en bloque es **opción del responsable**, no una recomendación de procedimiento. Cada uno se registraría por separado con el formato de §1. Sólo figuran los que tienen un valor por defecto escrito en su documento de origen.

- **Del gate, junto con la Sesión 1** (GATE las recomienda sin la etiqueta [Propuesto]):
  - P-U1-01: aceptar la propuesta implementada.
  - RP5: `./poc.sh down` seguido de A3e.
  - DBMIG: `poc3_migraciones_r<n>`.
  - Restauración: no restaurar salvo daño comprobado.
- **Lo que rige mientras no se decida:**
  - PA-04 (a), equivale a HP-D04 (b); decidir ambas juntas: la colección de cuentas, oculta y sin alta, baja ni desbloqueo por ningún canal.
  - PA-16 (a): sin exportación en el MVP.
- **[Propuesto] en el documento de origen:**
  - RS-05 (a), sólo si D-09 es (a) o (c): mensaje recuperable. El valor del tiempo mínimo en producción sigue esperando a D30.

**Excluidas del bloque**, aunque tienen recomendación, por su impacto o por depender de mediciones:
- ADR-0001 (opción A);
- POC-2 y C-09 (no hacer POC-2, opción 2);
- DV-01 (B), que es una elección de identidad;
- D-08, que necesita D30 y H-6.
