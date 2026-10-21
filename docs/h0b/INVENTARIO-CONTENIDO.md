# Inventario de contenido real y modelo de contenido editable — jozeuzz.cl

> **Estado:** Propuesta (H0-b, 2026-10-21). No aprobado.
> **Autor:** jz-architect, unidad U2 de H0-b, rama `work/jozeuzz-autonomo` sobre `349388a`. No contiene datos reales: enumera qué contenido hace falta, quién lo aporta y cómo se verifica.
> **Etiquetas:** **[Definido]** lo fija una fuente citada (que puede seguir en borrador) · **[Propuesto]** recomendación sin aprobar · **[Pendiente]** decide el responsable.
> **Abreviaturas:** `ESP` = [ESPECIFICACION-FUNCIONAL.md](../ESPECIFICACION-FUNCIONAL.md) · `UX` = [UX-ARQUITECTURA-INFORMACION.md](../UX-ARQUITECTURA-INFORMACION.md) · `RM` = [ROADMAP-MVP.md](../ROADMAP-MVP.md) · `REG` = [REGISTRO-DECISIONES-H0A.md](../REGISTRO-DECISIONES-H0A.md) · `PROD` = [PRODUCTO.md](../PRODUCTO.md) · `EST` = [ESTADO-PROYECTO.md](../ESTADO-PROYECTO.md).

**Propósito.** Este documento cubre la parte de contenidos del criterio de salida de H0: «el contenido real (perfil, proyectos autorizados y servicios) puede seguir incompleto, pero su lista y su responsable quedan definidos» (`RM:557`). También mitiga R-01, el riesgo de que el contenido no llegue a tiempo (`RM:636`). H0-b bloquea H3, pero no H1 ni H2 (`REG:20`).

## 1. Reglas de veracidad

| ID | Regla | Fuente |
|---|---|---|
| V-01 | No se inventan experiencia, títulos, clientes, casos de éxito, testimonios, certificaciones, proyectos, precios ni datos personales. | ESP › §1; PROD › Pendientes de producto; UX › §6 |
| V-02 | Cada afirmación del perfil y de los proyectos tiene anotada su forma de verificación (repositorio, documento o permiso). No se publica nada cuya verificación siga en «Pendiente». [Propuesto] | ESP › §3 RF-02 («datos autorizados por el titular»); ESP › §8 |
| V-03 | Los proyectos de terceros (cliente, empleador o colaboración) sólo se publican con autorización expresa. La autorización se registra en un campo privado (§3.2) [Propuesto] y no se publica. | ESP › §8 («proyectos autorizados a publicar»); ESP › §6 «Datos de demostración» |
| V-04 | Los datos de demostración son sólo sintéticos y van marcados en el propio texto (por ejemplo, con el prefijo `[DEMO]`). Nunca llegan a producción. | ESP › §6; REG H0A-11 y H0A-14 |
| V-05 | Los estados vacíos son honestos: si no hay contenido real, la sección se oculta o muestra un mensaje pertinente. Nunca se rellena con tarjetas, testimonios ni precios. | UX › §4, §5; RM › §2 MVP-01.3, MVP-03.3 y MVP-05.4 |
| V-06 | Los precios se muestran sólo en CLP referencial o como «a cotizar», nunca con los valores de ejemplo del prototipo (`$20`, `USD`). | PROD › Reglas fundamentales, 3; UX › §5 |
| V-07 | Un campo opcional vacío no genera una sección vacía. | ESP › §3 RF-04 |
| V-08 | El texto legal (privacidad y retención) lo aprueba el responsable. Ningún agente lo redacta como definitivo. | RM › §2 MVP-08.3 |
| V-09 | Un agente puede redactar textos de interfaz (etiquetas, ayudas, errores y estados vacíos) sólo como borrador. Requieren aprobación. [Propuesto] | UX › §6 («el agente puede proponerlos»), por extensión |
| V-10 | Toda imagen tiene un texto alternativo descriptivo. Las imágenes de terceros se usan sólo con licencia o permiso, que se anota en el Medio. | ESP › §6 «Web»; permiso: [Propuesto] |
| V-11 | No se publican datos personales de terceros (clientes, colegas) ni datos personales del titular que no estén aprobados, como el domicilio, el teléfono o un documento de identidad. | ESP › §1 («mínima exposición de datos personales») |
| V-12 | Los medios que pueden llegar a ser públicos se sirven sin metadatos incrustados: imágenes sin EXIF (incluida la ubicación GPS), XMP, IPTC ni comentarios; PDF sin autor, creador, productor, XMP, revisiones anteriores, adjuntos, anotaciones ni capas ocultas. Lo garantiza el servidor al subir el archivo, no una limpieza manual. El nombre público del archivo lo genera el sistema y no se deriva del nombre original. Se verifica con una prueba. [Propuesto] | ESP › §1 («mínima exposición de datos personales»), por extensión |

## 2. Inventario por página y área

**Leyenda.** **Aporta:** `R` = Responsable; `A→R` = un agente redacta el borrador y el Responsable lo aprueba. **MVP:** `Oblig.` = obligatorio en el MVP; `Opc.` = opcional, se oculta si falta (V-07). Los formatos y límites son orientativos **[Propuesto]**. Que el contexto y la contribución (PRO-03, PRO-04) sean obligatorios también es **[Propuesto]**: RF-04 los pide «según datos disponibles». Todo el contenido está en estado **Pendiente**, porque no se ha aportado ni aprobado nada.

### 2.1 Inicio (MVP-01, RF-01)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| INI-01 | Nombre público de la identidad | Oblig. | ≤ 60 car. | Lo declara el titular | R | H3 | Pendiente |
| INI-02 | Titular profesional (rol o propuesta en una frase) | Oblig. | ≤ 90 car. | Coherente con SOB-02 y SOB-03 | R | H3 | Pendiente |
| INI-03 | Descripción breve | Oblig. | 1–3 frases, ≤ 300 car. | Sin afirmaciones que no respalden el Perfil o los Proyectos | R | H3 | Pendiente |
| INI-04 | Especialidades | Oblig. | 3–6 elementos, ≤ 40 car. cada uno | Cada una respaldada por un proyecto o una experiencia | R | H3 | Pendiente |
| INI-05 | Proyectos destacados (selección entre los publicados) | Opc. | 0–3 | Se derivan de PRO-01 | R | H3 | Pendiente |
| INI-06 | Bloque de acceso al servicio técnico, diferenciado del portafolio | Oblig. | ≤ 200 car. y CTA | No equipararlo a una competencia ni a una certificación (MVP-05.5). Si `/servicios` todavía no existe, el bloque se oculta (UX › §6, 5) | R | H3 | Pendiente |
| INI-07 | CTA «Explorar proyectos» y «Ver servicios técnicos» | Oblig. | ≤ 30 car. | Textos fijados en UX › §2 | A→R | H3; el enlace o CTA a una página de H4 se oculta hasta H4 (UX › §6, 5) | Pendiente |
| INI-08 | Imagen principal o retrato | Opc. | Medio con alt | Imagen propia o con licencia; ver DC-11 | R | H3 | Pendiente |

### 2.2 Sobre mí (MVP-02, RF-02)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| SOB-01 | Presentación | Oblig. | 150–600 palabras | Autodeclarada; sin cifras sin respaldo | R | H3 | Pendiente |
| SOB-02 | Formación: institución, programa, período y estado | Oblig. como pieza del Perfil (RF-02); sin datos aprobados la sección se oculta (V-07) | Lista, ≤ 6 entradas | El responsable conserva el certificado o el registro (no se publica) | R | H3 | Pendiente |
| SOB-03 | Experiencia: organización o contexto, rol, período y logros | Oblig. como pieza del Perfil (RF-02); sin datos aprobados la sección se oculta (V-07) | ≤ 8 entradas; ≤ 3 logros cada una | La organización se nombra sólo con autorización; los logros cuantificados, sólo con respaldo | R | H3 | Pendiente |
| SOB-04 | Competencias agrupadas | Oblig. | ≤ 6 grupos | Cada competencia respaldada por un proyecto o una experiencia; las evidencias pesan más que los logos (UX › §5) | R | H3 | Pendiente |
| SOB-05 | Hitos reales y certificaciones (nombre, emisor, fecha y enlace) | Opc. | Fecha y texto de ≤ 160 car. | Documento o enlace; certificaciones sólo con un enlace de verificación del emisor | R | H3 | Pendiente |
| SOB-06 | CV descargable | Opc. (DC-06) | PDF | Sin datos de V-11 | R | H3 | Pendiente |
| SOB-07 | CTA «Ver proyectos» y «Contactar» | Oblig. | ≤ 30 car. | — | A→R | H3; el enlace o CTA a una página de H4 se oculta hasta H4 (UX › §6, 5) | Pendiente |

### 2.3 Proyectos y caso de estudio (MVP-03, MVP-04, RF-03, RF-04)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| PRO-01 | Lista de proyectos candidatos, con su origen (propio o de un tercero) | Oblig. ≥ 1 para publicar; con 0, estado vacío (V-05) | Plantilla de §5 | Autorización por proyecto (V-03) | R | H3 | Pendiente |
| PRO-02 | Título y resumen para la tarjeta | Oblig. | ≤ 70 y ≤ 200 car. | — | R | H3 | Pendiente |
| PRO-03 | Contexto (obligatorio) y problema (opcional) | Oblig. | 1–3 párrafos cada uno | Coherente con el repositorio o con el permiso | R | H3 | Pendiente |
| PRO-04 | Contribución personal, separada de la del equipo | Oblig. | 1–3 párrafos | Historial del repositorio o declaración del tercero | R | H3 | Pendiente |
| PRO-05 | Stack y etiquetas | Opc. | 0–8 etiquetas | Visibles en el código o en la documentación | R | H3 | Pendiente |
| PRO-06 | Decisiones técnicas con su motivo | Opc. | ≤ 5, de ≤ 300 car. cada una | — | R | H3 | Pendiente |
| PRO-07 | Resultados verificables | Opc. | ≤ 5 | Cada uno con una evidencia (enlace, medición o documento) | R | H3 | Pendiente |
| PRO-08 | Medios (capturas y diagramas) | Opc. | ≤ 12, con alt | Sin datos personales ni secretos visibles; permiso si son de terceros | R | H3 | Pendiente |
| PRO-09 | Enlaces al repositorio y a la demo | Opc. | URL `https` | Accesibles y públicos; la demo, sin datos reales | R | H3 | Pendiente |
| PRO-10 | SEO por proyecto: título, descripción e imagen social | Oblig. (MVP-04.3), con valores derivados por defecto | ≤ 60 y ≤ 160 car. | Derivado de PRO-02 | A→R | H3 | Pendiente |
| PRO-11 | Estado vacío del catálogo | Oblig. | ≤ 160 car. | Sin tarjetas de relleno (V-05) | A→R | H3 | Pendiente |

### 2.4 Servicios (MVP-05, RF-05)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| SER-01 | Nombre comercial e introducción del área técnica | Oblig. | ≤ 60 y ≤ 300 car. | DC-01 | R | H4 | Pendiente |
| SER-02 | Catálogo: nombre, descripción y alcance de cada servicio | Oblig.: con 0 activos, estado vacío | Plantilla de §5 | Que el responsable lo preste de verdad | R | H4 | Pendiente |
| SER-03 | Modalidad de precio y valor en CLP | Oblig. por servicio | Entero en CLP o «a cotizar» | DC-04; V-06 | R | H4 | Pendiente |
| SER-04 | Condiciones de atención: cobertura, horarios y modalidad | Oblig. (UX › §3, «condiciones») | Texto breve | DC-02, DC-03 | R | H4 | Pendiente |
| SER-05 | Preguntas frecuentes | Opc. | 0–8 pares | Sin prometer plazos ni garantías no decididos | R | H4 | Pendiente |
| SER-06 | Categorías de servicio | Opc. (RF-15, *Should*) | DC-09 | — | R | H4 | Pendiente |
| SER-07 | Estado vacío y CTA «Solicitar revisión» | Oblig. | ≤ 160 car. | — | A→R | H4 | Pendiente |

### 2.5 Solicitar servicio (MVP-06): sólo los textos; los campos y estados del formulario van en `RECORRIDO-SOLICITUD.md` (pendiente) y la Solicitud no se remodela (§3.7)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| SOL-01 | Introducción: qué datos se piden y cuáles no (nunca contraseñas) | Oblig. | ≤ 300 car. | MVP-06.9 | A→R | H4 | Pendiente |
| SOL-02 | Etiquetas y ayudas de cada campo | Oblig. | ≤ 80 car. cada una | — | A→R | H4 | Pendiente |
| SOL-03 | Mensajes de error por campo, de red y de límite de envíos | Oblig. | ≤ 140 car. | MVP-06.6 y MVP-06.7 | A→R | H4 | Pendiente |
| SOL-04 | Aviso breve de privacidad y enlace a `/privacidad` | Oblig. (RF-13) | ≤ 300 car. | Lo aprueba el responsable; versión definitiva en H7 | R | H4 | Pendiente |
| SOL-05 | Confirmación genérica | Oblig. (MVP-06.5) | ≤ 200 car. | Sin PII y sin prometer plazos | A→R | H4 | Pendiente |
| SOL-06 | Tipos de equipo o categorías que se pueden elegir | Oblig. si DC-09 adopta lista cerrada; si no, texto libre | Lista cerrada o texto libre | DC-09 | R | H4 | Pendiente |

### 2.6 Contacto (MVP-07, RF-11)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| CON-01 | Canales profesionales aprobados | Oblig. (≥ 1) | Correo o enlace externo | El responsable confirma que controla el canal (DC-05) | R | H4 | Pendiente |
| CON-02 | Texto de contexto, que remite las reparaciones al formulario | Oblig. | ≤ 300 car. | — | A→R | H4 | Pendiente |
| CON-03 | Plazo de respuesta | Opc. | ≤ 80 car. | Sólo si el responsable lo compromete | R | H4 | Pendiente |

### 2.7 Privacidad (MVP-08, RF-13)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| PRI-01 | Política de privacidad: responsable del tratamiento, canal para ejercer derechos, versión y fecha de vigencia | Oblig. antes de producción | Texto legal | V-08 | R | H4 (estructura), H7 (texto) | Pendiente |
| PRI-02 | Plazos de retención y procedimiento de eliminación, incluidos los campos privados de contenido con datos de terceros (`autorizacion_tercero`, `notas_internas`, `permiso_referencia`, `fuentes_verificacion`) [Propuesto] | Oblig. | Tabla de plazos | V-08 | R | Antes de datos reales (H0A-11); a más tardar H6/H7 | Pendiente |

### 2.8 Página 404 y errores (MVP-13.5, RF-12)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| ERR-01 | Título y mensaje de la 404, con enlaces al inicio y a proyectos | Oblig. | ≤ 160 car. y 2 enlaces | UX › §4 | A→R | H3 | Pendiente |
| ERR-02 | Mensaje genérico de error del servidor | Oblig. (RF-12, «páginas de error») | ≤ 160 car. | Sin detalles técnicos ni PII | A→R | H3 | Pendiente |

### 2.9 Cabecera y pie (UX › §2)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| NAV-01 | Marca textual «jozeuzz.cl», que lleva al inicio | Oblig. | Texto | UX › §2 | R | H3 | Pendiente |
| NAV-02 | Navegación: «Sobre mí», «Proyectos», «Servicios técnicos» y «Contacto» | Oblig. | ≤ 20 car. cada una | UX › §2 | A→R | H3; el enlace o CTA a una página de H4 se oculta hasta H4 (UX › §6, 5) | Pendiente |
| NAV-03 | Contacto aprobado en el pie | Oblig. si existe CON-01 | Igual que CON-01 | CON-01 | R | H4 | Pendiente |
| NAV-04 | Enlaces profesionales verificables | Opc. | URL `https` | El responsable confirma que el perfil es suyo | R | H3 | Pendiente |
| NAV-05 | Enlace a privacidad | Oblig. | Enlace | Existe PRI-01 o su estructura | A→R | H4 | Pendiente |

### 2.10 SEO y metadatos (MVP-13, RF-12)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| SEO-01 | Título y descripción de cada página fija | Oblig. | ≤ 60 y ≤ 160 car. | Derivados de contenido aprobado | A→R | H3 (portafolio), H4 (servicios) | Pendiente |
| SEO-02 | Imagen social por defecto | Oblig. | 1200×630 px | Propia o con licencia | R | H3 | Pendiente |
| SEO-03 | Valores de los datos estructurados (DC-10) | Oblig. (MVP-13.4); los tipos están pendientes | Según el tipo | Coinciden con el contenido visible | R | H3 | Pendiente |
| SEO-04 | Idioma del sitio y, si lo hay, idioma secundario | Oblig. | Etiqueta de idioma | DC-07 | R | H3 | Pendiente |

### 2.11 Marca (dirección visual en `DIRECCION-VISUAL.md`, pendiente)
| ID | Pieza y descripción | MVP | Formato | Verificación | Aporta | Hito | Estado |
|---|---|---|---|---|---|---|---|
| MAR-01 | Logotipo gráfico de jozeuzz.cl, favicon e iconos | Opc. el logotipo (basta NAV-01); Oblig. el favicon | SVG | Diseño propio o con licencia; vive en el repositorio, no en el panel (§3.5) [Propuesto] | R | H3 | Pendiente |
| MAR-02 | Marca del servicio técnico y su diferencia visual | Oblig. | Según DC-01 | — | R | H4 | Pendiente |
| MAR-03 | Tono editorial (tratamiento y persona gramatical) | Oblig. | Guía de ≤ 10 líneas | DC-13 | R | H3 | Pendiente |
| MAR-04 | Paleta y tipografía | Oblig. | Tokens | Contraste WCAG 2.2 AA | R | H3 | Pendiente |

## 3. Modelo de contenido editable [Propuesto]

Este modelo es independiente del stack: los tipos son conceptuales y no fijan ningún CMS, API ni esquema, porque ADR-0001 sigue propuesto (EST › §2.1). **Tipos:** texto corto, texto largo, texto enriquecido (sin HTML arbitrario), slug, entero, booleano, enumeración, fecha (mes/año salvo que se indique otra cosa), URL `https`, referencia y lista.

**Visibilidad:**
- *Pública*: la ve un anónimo sólo si el contenido está publicado o activo, y sólo a través de la proyección pública. *Pública (efecto)*: el valor no se muestra, pero decide qué se destaca o en qué orden.
- *Privada*: sólo la ve el administrador, por ningún otro canal (INV-01, RM › §3.3).
- *Admin (efecto público)* [Propuesto]: la edita el administrador; no se proyecta como dato, pero decide si el anónimo ve algo (estado del Perfil y del Proyecto, `activo` del Servicio, visibilidad del Medio).
- *Sistema*: la asigna el servidor y no se edita. Se reserva para `publicado_en`, `retirado_en`, `actualizado_en`, `creado_en` y `editor`. *Sistema* no implica *Pública* [Propuesto]: cada campo indica si se proyecta. `publicado_en` y `actualizado_en` pueden proyectarse (por ejemplo, como `lastmod` del sitemap) [Propuesto]: `actualizado_en` proyectable equivale a la fecha de la última versión publicada, y guardar un borrador no la modifica; `retirado_en`, `creado_en` y `editor`, no.

**Proyección pública [Propuesto].** Lo que recibe un anónimo se construye en el servidor con una lista blanca explícita de los campos *Pública* y *Pública (efecto)*, más los campos *Sistema* que se indiquen expresamente como proyectables (por ejemplo, `publicado_en` y `actualizado_en` como `lastmod`); nunca se obtiene excluyendo campos del registro completo. Vale para todas las superficies: HTML, datos serializados en la página, API (REST, GraphQL u otra), sitemap, robots, feeds, metadatos OpenGraph y Twitter, JSON-LD, URLs y nombres de archivo de medios, mensajes de error y vista previa. Un campo nuevo es privado hasta que se añade a la lista. Verificación: una prueba negativa por superficie, que confirme que ningún campo fuera de la lista aparece en la respuesta anónima.

### 3.1 Perfil (entidad única; los enlaces externos que ESP › §5 le asigna se proponen en Ajustes, ver DC-12)
| Campo | Tipo | Oblig. | Validación | Visib. | Comentario |
|---|---|---|---|---|---|
| nombre_publico | texto corto | Sí | 1–60 car. | Pública | INI-01 |
| titular | texto corto | Sí | 1–90 car. | Pública | INI-02 |
| resumen | texto largo | Sí | ≤ 300 car. | Pública | INI-03; descripción SEO por defecto |
| presentacion | texto enriquecido | Sí | No vacío | Pública | SOB-01 |
| especialidades | lista de texto corto | Sí | 3–6 elementos, ≤ 40 car. cada uno, sin duplicados | Pública | INI-04; rango alineado con INI-04 (§2.1) [Propuesto] |
| formacion | lista {institución, programa, inicio, fin o «en curso»} | Sí (RF-02) | fin ≥ inicio | Pública | SOB-02; si la lista está vacía, la sección se oculta (V-07) |
| experiencia | lista {organización, mostrar_organizacion (booleano), rol, inicio, fin, logros (≤ 3)} | Sí (RF-02) | fin ≥ inicio | Pública | SOB-03; si `mostrar_organizacion` es falso, la proyección pública omite la organización y sólo publica un contexto genérico (V-03); la prueba negativa de la proyección (§3) lo verifica [Propuesto]; lista vacía: sección oculta (V-07) |
| competencias | lista {grupo, elementos} | Sí | ≤ 6 grupos | Pública | SOB-04 |
| certificaciones | lista {nombre, emisor, fecha, url_verificacion} | No | URL https obligatoria por entrada | Pública | SOB-05. Antes de enlazarla, el responsable revisa qué datos personales muestra la página de verificación del emisor (V-11) [Propuesto] |
| hitos | lista {fecha, texto} | No | texto ≤ 160 car. | Pública | SOB-05 |
| retrato, cv | referencia a Medio (imagen; PDF) | No | El CV sólo si DC-06 = sí | Pública | DC-11; SOB-06. Como todo Medio, llevan `permiso_uso`, `permiso_referencia` (si no es propio) y `contiene_datos_personales`; los datos propios que el titular aprobó como públicos no los bloquean (§3.5) [Propuesto] |
| fuentes_verificacion | texto largo | No | Sólo referencias a dónde consta cada dato, sin datos personales de terceros | Privada | Campo [Propuesto] (V-02) |
| estado | enumeración {borrador, publicado} | Sí | — | Admin (efecto público) | El anónimo ve sólo la última versión publicada; los borradores y los medios nuevos son privados (INV-01); vista previa según RF-16 |

### 3.2 Proyecto
| Campo | Tipo | Oblig. | Validación | Visib. | Comentario |
|---|---|---|---|---|---|
| titulo | texto corto | Sí | 1–70 car. | Pública | PRO-02 |
| slug | slug | Sí | Único (INV-02); `[a-z0-9-]`, ≤ 80 car. | Pública | El tratamiento de un slug ya publicado que cambia está pendiente (posible redirección) |
| resumen | texto largo | Sí | ≤ 200 car. | Pública | Tarjeta y descripción SEO por defecto |
| contexto | texto enriquecido | Sí | No vacío | Pública | PRO-03 |
| problema | texto enriquecido | No | — | Pública | PRO-03 |
| contribucion | texto enriquecido | Sí | No vacío | Pública | PRO-04 |
| periodo | {inicio, fin opcional} | No | fin ≥ inicio | Pública | — |
| etiquetas | lista de referencias o de texto corto | No | 0–8, sin duplicados | Pública | La forma depende de DC-09 |
| categoria | referencia | No | Sólo si se adopta RF-15 | Pública | DC-09 |
| decisiones | lista {decisión, motivo} | No | ≤ 5; motivo ≤ 300 car. | Pública | PRO-06 |
| resultados | lista {resultado, evidencia} | No | La evidencia es obligatoria en cada entrada | Pública | Una evidencia no publicable va en `notas_internas` |
| portada, medios | referencia a Medio; lista de referencias a Medio | No | ≤ 12 medios | Pública sólo si el proyecto está publicado | MVP-10.5 |
| enlace_repositorio, enlace_demo | URL | No | `https` | Pública | Se muestran sólo si existen (ESP › §4 F1, paso 4) |
| seo_titulo, seo_descripcion, imagen_social | texto corto, texto corto, referencia a Medio | No | ≤ 60 y ≤ 160 car. | Pública | Por defecto: titulo, resumen y portada |
| estado | enumeración {borrador, publicado, retirado} | Sí | borrador→publicado, publicado→retirado, retirado→publicado | Admin (efecto público) | Retirar no borra (INV-12); «retirado» como estado propio está pendiente (RM › §3.4, DC-14). Con cambios en borrador sobre un proyecto publicado, el anónimo ve sólo la versión publicada; los borradores y los medios nuevos son privados (INV-01) [Propuesto] |
| destacado | booleano | Sí (por defecto, no) | ≤ 3 proyectos destacados | Pública (efecto) | INI-05 |
| orden | entero | No | ≥ 0; en empate, la fecha de publicación | Pública (efecto) | — |
| origen | enumeración {propio, tercero} | Sí | — | Privada | V-03 |
| autorizacion_tercero | texto largo (rol u organización que autoriza, fecha, medio y dónde consta la evidencia) | Sí si origen = tercero | Sin este campo no se puede publicar | Privada | V-03. No se copian correos, teléfonos, RUT ni documentos del tercero (V-11) [Propuesto] |
| notas_internas | texto largo | No | Sólo referencias a dónde consta la evidencia, sin datos personales de terceros [Propuesto] | Privada | Respaldo de la contribución y los resultados (V-02); ya existe en la POC |
| publicado_en, retirado_en, actualizado_en | fecha y hora | — | — | Sistema | `publicado_en` y `actualizado_en` pueden proyectarse (sitemap); `actualizado_en` = fecha de la última versión publicada, no cambia al guardar un borrador [Propuesto]; `retirado_en`, no |

### 3.3 Servicio
| Campo | Tipo | Oblig. | Validación | Visib. | Comentario |
|---|---|---|---|---|---|
| nombre | texto corto | Sí | 1–60 car. | Pública | — |
| slug | slug | Sí | Único (INV-03) | Pública | — |
| descripcion | texto largo | Sí | ≤ 400 car. | Pública | — |
| alcance_incluye, alcance_excluye | lista de texto corto | No | ≤ 8 cada una | Pública | Evita que se confunda con una orden de trabajo (INV-10) |
| categoria | referencia o enumeración | Sí | — | Pública | RF-05; la forma depende de DC-09 |
| modalidad_precio | enumeración {clp_referencial, a_cotizar} | Sí | — | Pública | INV-14; DC-04 |
| precio_clp | entero | Sí si es clp_referencial; vacío si es a_cotizar | > 0, sin decimales | Pública | Se muestra con separador de miles |
| nota_precio | texto corto | No | ≤ 120 car.; sin moneda extranjera | Pública | Qué cubre el valor referencial |
| activo | booleano | Sí (por defecto, no) | — | Admin (efecto público) | INV-11; desactivar no altera solicitudes (INV-16). Con cambios sin publicar sobre un servicio activo, el anónimo ve sólo la versión publicada (INV-01) [Propuesto]; si Servicio tendrá borradores está [Pendiente] |
| orden | entero | No | ≥ 0 | Pública (efecto) | — |
| preguntas_frecuentes | lista {pregunta, respuesta} | No | ≤ 8; ≤ 120 y ≤ 600 car. | Pública | SER-05 |
| seo_titulo, seo_descripcion | texto corto | No | ≤ 60 y ≤ 160 car. | Pública | Por defecto: nombre y descripcion |
| notas_internas | texto largo | No | — | Privada | — |

### 3.4 Categoría o taxonomía — [Pendiente] (DC-09): entidad administrable o lista fija, y si proyectos y servicios la comparten (RM › §3.1). Si fuera una entidad:
| Campo | Tipo | Oblig. | Validación | Visib. | Comentario |
|---|---|---|---|---|---|
| nombre | texto corto | Sí | ≤ 40 car. | Pública | — |
| slug | slug | Sí | Único en su ámbito | Pública | — |
| ambito | enumeración {proyecto, servicio} | Sí si no se comparte | — | Privada | — |
| orden | entero | No | ≥ 0 | Pública (efecto) | No se muestran filtros que darían un resultado vacío (MVP-03.5) |

### 3.5 Medio
| Campo | Tipo | Oblig. | Validación | Visib. | Comentario |
|---|---|---|---|---|---|
| archivo | binario | Sí | Imagen; PDF sólo si DC-06 = sí; los formatos y tamaños dependen de D-06. No se aceptan SVG subidos por el panel: el logotipo y los iconos SVG viven en el repositorio (MAR-01) [Propuesto] | Según la visibilidad | Metadatos eliminados al subir (V-12); nombre público generado [Propuesto] |
| alt | texto corto | Sí | 1–150 car.; no es el nombre del archivo | Pública con el medio | Las imágenes decorativas son parte del diseño, no contenido editable |
| leyenda, credito | texto corto | No | leyenda ≤ 200 car. | Pública | — |
| permiso_uso, permiso_referencia | enumeración {propio, licencia, autorizacion}; texto corto | Sí; la referencia, sí si no es propio | La referencia indica la licencia o dónde consta la autorización, sin datos personales del tercero [Propuesto] | Privada | V-10 |
| contiene_datos_personales | booleano | Sí (por defecto, verdadero hasta que el responsable lo revisa) [Propuesto] | Si es verdadero, el medio no puede ser público | Privada | Marca datos personales de terceros o del titular no aprobados como públicos (V-11), por ejemplo en capturas de pantalla. Un retrato o un CV aprobados por el titular no quedan bloqueados por sus propios datos aprobados; RUT, domicilio, teléfono personal, fecha de nacimiento y similares cuentan como no aprobados salvo decisión expresa [Propuesto]. La anonimización es destructiva en el archivo, no por CSS ni recorte en la vista; no se suben medios con datos personales salvo necesidad [Propuesto] |
| visibilidad | enumeración {publico, privado}, o derivada | Sí | Un medio enlazado sólo desde contenido no publicado no se sirve a anónimos (MVP-10.5) | Admin (efecto público) | No revelar el id ni la ubicación de un medio privado (riesgo B7, EST › §6) |
| editor, creado_en | referencia, fecha y hora | — | — | Sistema | No se proyectan; ESP › §5 («propietario/editor») |

**Regla de referencias a Medio [Propuesto].** Al publicar o activar contenido, o al editar contenido ya publicado, el servidor rechaza la operación si alguna referencia a Medio (`portada`, `medios`, `imagen_social`, `retrato`, `cv`, la imagen social por defecto de Ajustes o un medio embebido en texto enriquecido) apunta a un medio no público, con `contiene_datos_personales` verdadero, o con `permiso_uso` distinto de propio y sin `permiso_referencia`. Si un medio ya referenciado por contenido publicado pasa a `contiene_datos_personales` verdadero o deja de ser público, deja de servirse públicamente de inmediato (retirada urgente) y el contenido que lo referencia muestra el estado sin medio hasta que el administrador lo sustituya; el contenido no se despublica automáticamente [Propuesto; decisión final del responsable]. La proyección pública de una referencia lleva sólo la URL pública, `alt`, `leyenda`, `credito` y, para reservar el espacio de la imagen, `ancho` y `alto` (los deriva el servidor al subir; no son datos sensibles) [Propuesto]; nunca el id interno, la colección ni el estado. Un enlace interno en texto enriquecido hacia contenido no publicado bloquea la publicación o se omite sin revelar su slug ni su título (cuál de las dos, [Pendiente]). Verificación: prueba negativa en H3. La regla responde al riesgo B7 de [ADR-0001](../adr/0001-stack.md) (§5) sin cerrarlo: decidir si cuenta como configuración nativa sigue siendo del responsable.

### 3.6 Ajustes del sitio (entidad única)
| Campo | Tipo | Oblig. | Validación | Visib. | Comentario |
|---|---|---|---|---|---|
| nombre_sitio, nombre_area_tecnica | texto corto | Sí | — | Pública | NAV-01; DC-01 |
| canales_contacto | lista {tipo, valor, etiqueta, uso: profesional o servicio_tecnico} | Sí (≥ 1) | Correo válido o URL `https`; los tipos dependen de DC-05. Una URL que incluye un número de teléfono cuenta como canal de teléfono y requiere aprobación (V-11) [Propuesto] | Pública | Sólo canales aprobados (MVP-07.2) |
| enlaces_profesionales | lista {plataforma, url, etiqueta} | No | `https`; titularidad confirmada | Pública | Pie, contacto y `sameAs` |
| condiciones_atencion | texto largo | No | — | Pública | DC-02 y DC-03 |
| textos_legales | lista {titulo, ruta, version, vigente_desde} | Sí antes de H7 | — | Pública | Si el texto es editable o fijo depende de DC-15 |
| seo_por_defecto | {plantilla_titulo, descripcion, imagen_social} | Sí | ≤ 60 y ≤ 160 car. | Pública | SEO-01 y SEO-02 |
| idioma | enumeración | Sí | — | Pública | DC-07 |

### 3.7 Solicitud: fuera de este modelo
No se remodela aquí. Sus estados, sus observaciones y sus eventos los fijan H0A-02, H0A-03 y H0A-04 (`REG:21-23`); su UX se definirá en `RECORRIDO-SOLICITUD.md` (pendiente). Su único vínculo con el contenido es la referencia opcional a un Servicio activo (INV-04) y, según DC-09, a la taxonomía (SOL-06): lista cerrada o texto libre. Esa dependencia no remodela la Solicitud. Como referencia, la POC la tiene en `poc1a/src/collections/Solicitudes.ts:55-74`.

### 3.8 Brechas con la POC (desechable; no es scaffold, H0A-14)
| Entidad | En la POC | En este modelo |
|---|---|---|
| Perfil | No existe: `poc1a/src/payload.config.ts:35` sólo declara colecciones | Entidad única (§3.1) |
| Proyecto | Mínimo: slug, titulo, resumen, medios, notas_internas y retiradoEn (`poc1a/src/collections/Proyectos.ts:33-44`) | Añade contexto, problema, contribución, etiquetas, decisiones, resultados, enlaces, SEO, destacado, orden y autorización |
| Estado del proyecto | Borrador o publicado, con la marca `retiradoEn` (`poc1a/src/collections/Proyectos.ts:9-16`, `:24`) | Estado `retirado` explícito, pendiente de DC-14 |
| Servicio | slug, titulo, descripcion y activo (`poc1a/src/collections/Servicios.ts:14-19`) | Añade categoría, modalidad de precio, precio en CLP, alcance, orden, preguntas frecuentes y SEO |
| Medio | `alt` opcional (`poc1a/src/collections/Medios.ts:14` y `:21`); visibilidad mediante dos colecciones (`poc1a/src/collections/Medios.ts:10-22`) | `alt` obligatorio; la visibilidad es una regla del modelo, sin fijar cómo se implementa |
| Categoría y Ajustes | No existen | §3.4 (pendiente) y §3.6 |

## 4. Decisiones de contenido pendientes del responsable (opciones neutrales, sin recomendación ni datos personales)

1. **DC-01. Nombre comercial del servicio técnico** (ESP › §8): (a) la marca jozeuzz.cl con un subtítulo; (b) un nombre propio con diferencia visual; (c) un rótulo descriptivo provisional.
2. **DC-02. Cobertura geográfica:** (a) no publicarla; (b) una zona descrita en texto; (c) una lista de localidades; (d) sólo atención remota.
3. **DC-03. Horarios:** (a) no publicarlos; (b) texto libre; (c) una tabla por día.
4. **DC-04. Política de precios** (RM › §2 MVP-05.3): (a) todos «a cotizar»; (b) CLP referencial por servicio; (c) una mezcla por servicio. También: si el valor incluye impuestos y cómo se indica.
5. **DC-05. Canales de contacto:** (a) correo; (b) enlace externo; (c) ambos; (d) otros que se decidan, revisando para cada uno su exposición de datos (V-11). También: si se separan el canal profesional y el del servicio técnico. Advertencia [Propuesto]: un correo o un teléfono publicados, también dentro de la URL de una aplicación de mensajería o en los datos estructurados, pueden ser recolectados por terceros; ofuscarlos no los protege. Alternativas: un alias dedicado, sólo perfiles profesionales o canales separados. Decide el responsable.
6. **DC-06. CV descargable:** (a) no; (b) sí, un PDF público; (c) sí, bajo petición por el canal de contacto. Riesgos [Propuesto]: un CV suele incluir RUT, domicilio, teléfono, fecha de nacimiento o foto (V-11); el PDF arrastra metadatos (V-12); un PDF público puede seguir indexado y en cachés después de retirarlo. La opción (c) evita la indexación, pero requiere atención manual.
7. **DC-07. Idiomas:** la etiqueta del idioma principal (`es` o `es-CL`) y un idioma secundario: (a) ninguno; (b) sólo para el portafolio; (c) para todo el sitio; (d) después del MVP.
8. **DC-08. `/experiencia` (C-10):** (a) integrada en `/sobre-mi`; (b) una página propia. Se cierra con `WIREFRAMES.md`.
9. **DC-09. Taxonomía** (RF-15, C-13): (a) categorías administrables; (b) una lista fija; (c) sin categorías en el MVP. También: si proyectos y servicios la comparten, y si las etiquetas de stack son una taxonomía aparte.
10. **DC-10. Datos estructurados** (MVP-13.4). Candidatos, todos **[Propuesto]** y **[Pendiente de verificar en schema.org]**: `Person` en Inicio y Sobre mí (Perfil, con `sameAs` desde `enlaces_profesionales`); `ProfilePage` en `/sobre-mi`; `CreativeWork` en `/proyectos/[slug]`, o `SoftwareSourceCode` si hay un repositorio público; `Service` en `/servicios`, con oferta en CLP sólo si es clp_referencial; `BreadcrumbList` en las páginas de detalle. Los tipos que exigen una dirección física quedan fuera mientras DC-02 no lo decida. Los datos estructurados se derivan sólo de la proyección pública (§3) [Propuesto]; `Person` no incluye `email`, `telephone` ni `address`, salvo un canal aprobado como público (DC-05).
11. **DC-11. Imagen personal:** (a) ninguna; (b) una fotografía; (c) una ilustración o la marca.
12. **DC-12. Enlaces profesionales:** (a) en el Perfil (ESP › §5); (b) en Ajustes (§3.6).
13. **DC-13. Tono editorial:** el tratamiento (tú o usted) y la persona gramatical (primera o tercera).
14. **DC-14. Estado del proyecto:** (a) «retirado» como estado propio; (b) volver a borrador con una marca de fecha (RM › §3.4).
15. **DC-15. Texto de privacidad:** (a) editable desde el panel; (b) fijo y versionado en el repositorio.

## 5. Plantilla de entrega para el responsable

Hay que copiar un bloque Perfil, un bloque Contacto y ajustes, un bloque por proyecto y otro por servicio. Los nombres de campo son los del modelo (§3). Si un campo no aplica, se escribe «no aplica»; nunca se inventa. En `medios`, el orden de entrega es el orden en que se muestran, y `portada` indica cuál de ellos encabeza el proyecto [Propuesto]. Un medio con `contiene_datos_personales: sí` (datos de terceros o del titular no aprobados) no se publica (§3.5). `slug` y `orden` no se piden: pueden generarse a partir del título y del orden de entrega [Propuesto].

```text
### Perfil
nombre_publico: <nombre público, ≤ 60 caracteres>
titular: <rol o propuesta en una frase, ≤ 90 caracteres>
resumen: <descripción breve, ≤ 300 caracteres>
presentacion: <presentación, 150–600 palabras>
especialidades: <especialidad 1>; <especialidad 2>; <especialidad 3>
formacion: <institución> | <programa> | <inicio>–<fin | en curso>; <…>
experiencia: <organización | genérica> | <rol> | <período> | <logros ≤3>; <…>
competencias: <grupo>: <elemento>, <elemento>; <…>
certificaciones: <nombre> | <emisor> | <fecha> | <url_verificacion>; <…>
hitos: <fecha> — <texto, ≤ 160 caracteres>; <…>
retrato: <referencia del archivo entregado (no se publica)> | alt: <texto alternativo> | permiso_uso: <propio | licencia | autorizacion> | permiso_referencia: <licencia o dónde consta | no aplica> | contiene_datos_personales: <sí | no> (DC-11)
cv: <referencia del archivo entregado (no se publica)> | permiso_uso: <propio | licencia | autorizacion> | permiso_referencia: <licencia o dónde consta | no aplica> | contiene_datos_personales: <sí | no> (DC-06)
fuentes_verificacion: <dónde consta cada dato; sólo referencias, sin datos de terceros>

### Contacto y ajustes
nombre_area_tecnica: <nombre comercial del servicio técnico | pendiente de DC-01>
canales_contacto: <tipo> | <valor> | <etiqueta> | <profesional | servicio_tecnico>; <…>
enlaces_profesionales: <plataforma> | <url> | <etiqueta>; <…>
condiciones_atencion: <cobertura, horarios y modalidad (DC-02, DC-03) | no aplica>
idioma: <es | es-CL> (DC-07)
seo_por_defecto.imagen_social: <referencia del archivo entregado (no se publica), 1200×630 px> | alt: <texto alternativo> | permiso_uso: <propio | licencia | autorizacion> | permiso_referencia: <licencia o dónde consta | no aplica> | contiene_datos_personales: <sí | no> (SEO-02)

### Proyecto <n>
titulo: <título, ≤ 70 caracteres>
resumen: <resumen para la tarjeta, ≤ 200 caracteres>
origen: <propio | tercero>
autorizacion_tercero: <rol u organización que autoriza, fecha, medio y dónde consta | no aplica>
contexto: <contexto>
problema: <problema | no aplica>
contribucion: <qué hiciste tú y qué hizo el equipo>
periodo: <mes/año de inicio> – <mes/año de fin | en curso>
etiquetas: <etiqueta 1>, <etiqueta 2>
decisiones: <decisión> — motivo: <motivo>; <decisión> — motivo: <motivo>
resultados: <resultado> — evidencia: <enlace o descripción>; <…>
portada: <una de las referencias de medios | no aplica>
medios: <referencia del archivo entregado (no se publica)> | alt: <texto alternativo> | credito: <crédito | no aplica> | permiso_uso: <propio | licencia | autorizacion> | permiso_referencia: <licencia o dónde consta | no aplica> | contiene_datos_personales: <sí | no>; <…>
enlace_repositorio: <URL | no aplica>
enlace_demo: <URL | no aplica>
destacado: <sí | no>
notas_internas: <dónde consta lo afirmado; sólo referencias, sin datos de terceros>

### Servicio <n>
nombre: <nombre, ≤ 60 caracteres>
descripcion: <descripción, ≤ 400 caracteres>
alcance_incluye: <elemento 1>; <elemento 2>
alcance_excluye: <elemento 1>; <elemento 2>
categoria: <categoría | no aplica>
modalidad_precio: <clp_referencial | a_cotizar>
precio_clp: <entero en CLP | no aplica>
nota_precio: <qué cubre el valor | no aplica>
preguntas_frecuentes: <pregunta> — <respuesta>; <…>
activo: <sí | no>
```
