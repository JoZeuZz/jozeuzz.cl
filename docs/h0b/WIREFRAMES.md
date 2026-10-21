# Wireframes de baja fidelidad, navegación y arquitectura de componentes — jozeuzz.cl

> **Estado:** Propuesta (H0-b, 2026-10-21). No aprobado.
> **Autor:** jz-architect, unidad U3 de H0-b, rama `work/jozeuzz-autonomo` sobre `582df9a`. No contiene datos reales: cada hueco se marca con el ID de pieza del inventario o con `<…>`.
> **Etiquetas:** **[Definido]** lo fija una fuente citada (que puede seguir en borrador) · **[Propuesto]** recomendación sin aprobar · **[Pendiente]** decide el responsable.
> **Abreviaturas:** `INV` = [INVENTARIO-CONTENIDO.md](INVENTARIO-CONTENIDO.md) · `UX` = [UX-ARQUITECTURA-INFORMACION.md](../UX-ARQUITECTURA-INFORMACION.md) · `RM` = [ROADMAP-MVP.md](../ROADMAP-MVP.md) · `ESP` = [ESPECIFICACION-FUNCIONAL.md](../ESPECIFICACION-FUNCIONAL.md) · `EST` = [ESTADO-PROYECTO.md](../ESTADO-PROYECTO.md) · `ARQ` = [ARQUITECTURA.md](../ARQUITECTURA.md).

**Propósito.** Este documento es el «siguiente artefacto antes de implementación» que pide UX › §6: fija rutas, jerarquía, orden de bloques, estados y componentes del sitio público, y se revisa contra los criterios de UX › §6 y RM › §2 MVP-14. Cierra C-10 y DC-08 como propuesta (RM › §11.1; INV › §4). No fija estética (eso es `DIRECCION-VISUAL.md`, pendiente), ni el formulario de solicitud ([RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md)), ni el panel ([PANEL-ADMIN.md](PANEL-ADMIN.md)).

## 0. Convenciones

- **Formato.** Wireframes ASCII en bloques cercados. Dos anchos: **móvil ~360 px** (una columna) y **escritorio ≥ 1024 px**. Cuando el escritorio sólo limita el ancho de lectura, se indica en el propio bloque. El reflujo se comprueba además a 320 CSS px (WCAG 2.2, 1.4.10) [Propuesto].
- **Sin estética.** Sin colores, tipografías, marca, iconos ni proporciones: las cajas indican agrupación y orden, no tamaño.
- **Notación dentro de los bloques.** `h1`, `h2`, `h3` = nivel de encabezado · `(Texto)` = enlace o botón · `[…]` = bloque o componente (§4) · `<ID>` = pieza de INV › §2 · `opc.` = opcional, se oculta si falta (V-07) · `[H4]` = el destino existe desde H4 y el enlace se oculta antes (UX › §6, 5) · `×n` = repetición.
- **Orden.** El DOM conserva una secuencia de lectura significativa (WCAG 1.3.2 y 2.4.3) y coincide con el orden móvil; una columna lateral de escritorio va en el DOM donde va el bloque en móvil. La única columna lateral (la ficha del detalle) se justifica en 3.4 [Propuesto].
- **Textos.** Los rótulos de UX › §2 y §3 («Explorar proyectos», «Ver servicios técnicos», «Sobre mí», «Proyectos», «Servicios técnicos», «Contacto», «Solicitar revisión») son [Definido]. Cualquier otro rótulo de este documento es un borrador A→R (V-09).

## 1. Mapa de rutas propuesto (cierra C-10) [Propuesto]

| Ruta | Propósito | Hito | Indexable | CTA principal | Piezas |
|---|---|---|---|---|---|
| `/` | Identidad y acceso a las dos áreas | H3 | Sí | «Explorar proyectos» (secundario: «Ver servicios técnicos» [H4]) | INI-01 a INI-08 |
| `/sobre-mi` | Perfil: presentación, formación, **experiencia**, competencias, hitos | H3 | Sí | «Ver proyectos» (secundario: «Contactar» [H4]) | SOB-01 a SOB-07 |
| `/proyectos` | Catálogo de proyectos publicados | H3 | Sí | Abrir un caso (título de cada tarjeta) | PRO-01, PRO-02, PRO-05, PRO-11 |
| `/proyectos/[slug]` | Caso de estudio | H3 | Sí, sólo si está publicado | «Ver repositorio» o «Ver demo» si existen; si no, «Volver a proyectos», que además aparece siempre al final | PRO-02 a PRO-10 |
| `/servicios` | Catálogo técnico, condiciones y preguntas frecuentes | H4 | Sí | «Solicitar revisión» | SER-01 a SER-07 |
| `/servicios/solicitar` | Formulario de solicitud | H4 | WF-04 | Enviar la solicitud | SOL-01 a SOL-06 |
| `/contacto` | Canales profesionales aprobados | H4 | Sí | El canal aprobado | CON-01 a CON-03 |
| `/privacidad` | Política de privacidad y retención | H4 (estructura), H7 (texto) | WF-05 | — | PRI-01, PRI-02 |
| 404 | Respuesta a una ruta inexistente o no publicada | H3 | No | «Volver al inicio» (y «Ver proyectos») | ERR-01 |
| Error del servidor | Respuesta a un fallo interno | H3 | No | «Volver al inicio» | ERR-02 |
| `/admin` | Panel privado; **fuera de este documento**. Ninguna página pública lo enlaza [Propuesto] | H2 y H3 (RM › §12) | No | — | [PANEL-ADMIN.md](PANEL-ADMIN.md) |

**Experiencia integrada en `/sobre-mi` (DC-08, MVP-02.4) [Propuesto].** Motivos: (1) UX › §1 lo permite expresamente y UX › §2 no incluye «Experiencia» entre los cuatro accesos; (2) SOB-03 admite como máximo 8 entradas, un volumen que cabe en una sección; (3) formación y experiencia salen de la misma entidad Perfil (INV › §3.1), así que una página tiene un único estado de publicación; (4) si SOB-03 queda vacía, la sección se oculta (V-07), mientras que una página propia sería una ruta vacía que habría que ocultar (UX › §6, 5). La sección lleva el ancla `experiencia` para enlazarla directamente. **Alternativa:** `/experiencia` como página propia, si el volumen crece o el responsable quiere posicionarla aparte; exige un quinto acceso o un enlace desde `/sobre-mi` y la misma regla de ocultación (WF-01).

**Otras precisiones de C-10.** `/privacidad` y la página 404, que ARQ › Rutas tentativas no recoge, entran en el mapa. La 404 es una **respuesta** con código HTTP 404 en cualquier ruta desconocida, no una URL `/404` indexable [Propuesto].

**Respuesta única para lo no publicado [Propuesto].** Un proyecto en borrador, retirado o inexistente, y `/sobre-mi` o `/contacto` no disponibles (§2), reciben la misma respuesta: código 404, el mismo cuerpo ERR-01 y las mismas cabeceras de caché, sin 410 ni redirecciones (MVP-03.2). La normalización de la barra final (WF-11) es sintáctica: se aplica antes de cualquier consulta de datos y produce el mismo código y las mismas cabeceras para toda ruta, exista o no [Propuesto]. La consulta pública filtra por publicado en la propia consulta, no después de obtener el registro. La 404 no repite la ruta, el slug ni el título pedidos. Verificación: una prueba que compara código, cuerpo y cabeceras de un borrador, un retirado y un inexistente.

**Brecha conocida de la POC.** La POC sirve el formulario en `/solicitar` (EST › §7, «Ruta del formulario»). El producto usa `/servicios/solicitar` (ESP › §4 F2; UX › §1). La POC es desechable (H0A-14) y nunca se publicó, así que no hace falta redirección [Propuesto].

## 2. Navegación global responsive

```text
MÓVIL, menú cerrado            | ESCRITORIO (desde el punto de corte, DIRECCION-VISUAL)
(Saltar al contenido) al foco  | (Saltar al contenido) visible sólo al recibir el foco
jozeuzz.cl            (Menú)   | jozeuzz.cl   Sobre mí  Proyectos  Servicios técnicos  Contacto
------------------------------ | --------------------------------------------------------------
MÓVIL, menú abierto en flujo   | Pie (NAV-03 a NAV-05), igual en todas las páginas
jozeuzz.cl            (Menú)   | <CON-01 canal aprobado> [H4]      <NAV-04 perfiles, opc.>
  Sobre mí                     | Navegación: Sobre mí · Proyectos · Servicios técnicos · Contacto
  Proyectos  [aria-current]    | Privacidad (NAV-05) [H4]
  Servicios técnicos [H4]      | © <año calculado en el servidor> <INI-01>
  Contacto [H4]                |
<contenido desplazado abajo>   |
```

**Cabecera [Definido en UX › §2; detalle Propuesto].** La marca textual NAV-01 enlaza al inicio. Los cuatro accesos de NAV-02, en el orden de UX › §2. Landmarks: cabecera (`banner`), navegación con nombre accesible «Principal», un único contenido principal (`main`) y pie (`contentinfo`); la navegación del pie lleva otro nombre accesible («Pie») para distinguirlas.

**Patrón móvil: botón de menú con disclosure [Propuesto].**
1. Botón con texto visible «Menú» (su nombre accesible es ese texto) y `aria-expanded` en `false` o `true`. `aria-controls` apunta a la lista de enlaces como complemento; el patrón no depende de él.
2. Cerrada, la lista se oculta con `hidden` o `display: none`, de modo que sale del orden de tabulación y del árbol de accesibilidad. Al abrir, el foco se queda en el botón; el siguiente Tab entra en el primer enlace. Al cerrar con el botón, el foco sigue en él.
3. No es un diálogo modal: no hay trampa de foco ni contenido inerte detrás; Tab sigue desde el último enlace hacia el contenido.
4. El menú se despliega **en el flujo** y empuja el contenido hacia abajo; no se superpone. Mientras WF-06 = (a) (cabecera no fija), nunca tapa un elemento enfocado (WCAG 2.4.11).
5. Sin animación, o con la animación desactivada cuando el usuario prefiere movimiento reducido (MVP-14.3).
6. Como mejora, no como requisito WCAG: con **Escape**, si el foco está en el botón o en la lista, el menú se cierra y el foco vuelve al botón.
7. **Sin JavaScript** (fallback, WF-02): el HTML entrega «Menú» como un enlace al ancla de la navegación del pie, que repite los cuatro accesos; el script lo convierte en el botón de disclosure. Así no hay desplazamiento de contenido al cargar y la navegación siempre es alcanzable.

**Saltar al contenido (WCAG 2.4.1).** Es el primer elemento enfocable de cada página, visible al recibir el foco, y lleva al contenido principal, que es enfocable por programa para que el foco se mueva de verdad en todos los navegadores.

**Estado activo.** El enlace de la página actual lleva `aria-current="page"` y una indicación visual que no depende sólo del color. En una página hija (detalle de proyecto, solicitar), el acceso de su sección lleva la indicación visual y `aria-current="true"` [Propuesto]; `"page"` se reserva para la página exacta.

**Orden de tabulación.** Saltar al contenido → marca → «Menú» (sólo en móvil) → accesos → contenido principal → pie. Sin `tabindex` positivo.

**Objetivos táctiles y foco.** Todo objetivo mide al menos 24×24 CSS px o cumple la excepción de espaciado (WCAG 2.2, 2.5.8). En móvil, el botón de menú y los accesos se proponen de 44×44 (WF-08). El foco es siempre visible (2.4.7) y no queda oculto (2.4.11) mientras WF-06 = (a), cabecera no fija; con (b), el desplazamiento del foco y de las anclas reserva su altura.

**Pie (NAV-03 a NAV-05).** Contiene el canal aprobado para contacto profesional (CON-01, uso «profesional»), los perfiles profesionales verificables (NAV-04, opc.), el enlace a privacidad (NAV-05), la navegación de respaldo y el año, calculado en el servidor al generar la página (UX › §2). Sin canal aprobado, NAV-03 se omite.

**Regla de ocultación de destinos (UX › §6, 5) [Propuesto].** Un enlace o CTA se muestra sólo si su destino **existe en el hito desplegado** y **tiene contenido publicable**:
- En H3, «Servicios técnicos», «Contacto», «Privacidad», INI-06 y los CTA «Contactar» no se muestran (INV › §2.1, §2.2, §2.9).
- `/sobre-mi` sin Perfil publicado y `/contacto` sin CON-01 aprobado no se enlazan y responden la 404 única de §1.
- **Interpretación [Propuesto]:** los catálogos (`/proyectos`, `/servicios`) se enlazan siempre desde su hito, también con 0 elementos, porque su EstadoVacio cuenta como contenido pertinente (MVP-03.3 y MVP-05.4, frente a UX › §6, 5). Los CTA y los enlaces de navegación hacia un catálogo vacío siguen WF-03. En producción, PRO-01 exige al menos un proyecto para publicar (INV › §2.3), así que el catálogo de proyectos vacío es sobre todo un caso de staging o de retirada.
- **Disponibilidad de una ruta [Propuesto]** = (a) el indicador de hito de la configuración del despliegue **y** (b) una consulta a la proyección pública (Perfil publicado, CON-01 aprobado; los catálogos, según la interpretación anterior). Un único módulo de servidor la calcula; Cabecera, Pie, Hero y BloqueCTA sólo consumen su resultado. No es contenido editable.

## 3. Wireframes por página

### 3.1 Inicio `/` (MVP-01)

```text
MÓVIL ~360 px                  | ESCRITORIO ≥ 1024 px
[Cabecera, §2]                 | [Cabecera, §2]
============================== | ======================================================
h1 <INI-01 nombre>             | h1 <INI-01 nombre>                   +----------------+
<INI-02 titular>               | <INI-02 titular>                     | INI-08 imagen  |
<INI-03 descripción>           | <INI-03 descripción>                 | (opcional)     |
[INI-08 imagen, opcional]      |                                      +----------------+
(Explorar proyectos) INI-07    | (Explorar proyectos)  (Ver servicios técnicos) [H4]
(Ver servicios técnicos) [H4]  |
------------------------------ | ------------------------------------------------------
h2 Proyectos destacados        | h2 Proyectos destacados (INI-05, opcional)
TarjetaProyecto ×0..3 INI-05   | [TarjetaProyecto] [TarjetaProyecto] [TarjetaProyecto]
------------------------------ | ------------------------------------------------------
h2 Especialidades (INI-04)     | h2 Especialidades (INI-04)
• <especialidad> ×3..6         | <especialidad> · <especialidad> · … (de 3 a 6)
------------------------------ | ------------------------------------------------------
h2 <nombre_area_tecnica> [H4]  | h2 <nombre_area_tecnica> (SER-01) [H4]
<INI-06 texto ≤ 200 car.>      | <INI-06 texto ≤ 200 car.>      (Ver servicios técnicos)
(Ver servicios técnicos)       |
------------------------------ | ------------------------------------------------------
BloqueCTA (Contactar) [H4]     | BloqueCTA (Contactar) [H4]
[Pie, §2]                      | [Pie, §2]
```

**Jerarquía:** un `h1` (INI-01), un `h2` por bloque y `h3` en el título de cada tarjeta. **CTA:** primario «Explorar proyectos», secundario «Ver servicios técnicos» (UX › §2). Los destacados van antes de las especialidades porque las evidencias pesan más que las listas (UX › §5) [Propuesto]. El bloque técnico lleva como `h2` el nombre del área técnica (`nombre_area_tecnica`, SER-01, DC-01) y como texto INI-06; no se presenta como competencia (MVP-01.2, MVP-05.5).

### 3.2 Sobre mí `/sobre-mi` (MVP-02)

```text
MÓVIL ~360 px                  | ESCRITORIO ≥ 1024 px
[Cabecera, §2]                 | [Cabecera, §2]
============================== | ======================================================
h1 Sobre mí                    | h1 Sobre mí
<SOB-01 presentación>          | <SOB-01 presentación>   (una columna de ancho limitado)
h2 Formación (SOB-02)          | h2 Formación (SOB-02)
• <institución> · <programa>   | <institución> · <programa>   <período> · <estado>
  <período> · <estado>         | h2 Experiencia (SOB-03), ancla «experiencia»
h2 Experiencia (SOB-03)        | <rol> · <organización o contexto genérico>   <período>
• <rol> · <org. o genérico>    |   – <logro> (hasta 3)
  <período> · <logro> ×≤3      | h2 Competencias (SOB-04)
h2 Competencias (SOB-04)       | <grupo>: <elementos>    <grupo>: <elementos>   (rejilla)
<grupo>: <elementos> ×≤6       | h2 Hitos y certificaciones (SOB-05, opcional)
h2 Hitos y certificaciones     | (Descargar CV) SOB-06, opcional (DC-06)
  (SOB-05, opc.)               | (Ver proyectos)   (Contactar) [H4]        SOB-07
(Descargar CV) SOB-06, opc.    |
(Ver proyectos) SOB-07         |
(Contactar) [H4]               |
[Pie, §2]                      | [Pie, §2]
```

**Jerarquía:** `h1` «Sobre mí», `h2` por sección en el orden de UX › §3, `h3` para cada grupo de competencias si hace falta. **CTA:** «Ver proyectos»; «Contactar» desde H4; son enlaces simples, sin BloqueCTA. Una organización se nombra sólo si `mostrar_organizacion` es verdadero; si no, la proyección pública da un contexto genérico (INV › §3.1). El enlace del CV indica formato y tamaño en su texto [Propuesto].

### 3.3 Proyectos `/proyectos` (MVP-03)

```text
MÓVIL ~360 px                  | ESCRITORIO ≥ 1024 px
[Cabecera, §2]                 | [Cabecera, §2]
============================== | ======================================================
h1 Proyectos                   | h1 Proyectos
FiltroCategorias (Should)      | FiltroCategorias: [Todas] [<categoría>] … (Should, DC-09)
[Todas] [<cat>] … (DC-09)      | +----------------+ +----------------+ +----------------+
+----------------------------+ | | [portada]      | | [portada]      | | [portada]      |
| [portada, opcional]        | | | h2 <título>    | | h2 <título>    | | h2 <título>    |
| h2 <título> (enlace)       | | | <resumen>      | | <resumen>      | | <resumen>      |
| <PRO-02 resumen>           | | | <etiquetas>    | | <etiquetas>    | | <etiquetas>    |
| <etiquetas PRO-05, opc.>   | | +----------------+ +----------------+ +----------------+
+----------------------------+ | TarjetaProyecto ×n en rejilla de 2–3 columnas (PRO-01)
TarjetaProyecto ×n (PRO-01)    |
[Pie, §2]                      | [Pie, §2]
```

**Jerarquía:** `h1` «Proyectos» y `h2` por tarjeta. **CTA:** el título de cada tarjeta es su único enlace al caso, sin «Ver más» repetidos (WCAG 2.4.4). Orden: campo `orden` y, en empate, fecha de publicación (INV › §3.2). El filtro sólo aparece si DC-09 adopta categorías y nunca ofrece una categoría sin resultados (MVP-03.5). **Forma del filtro [Propuesto]:** con WF-10 (b), cada categoría es un enlace con el parámetro de consulta `?categoria=<slug>` (reglas en WF-10); las vistas filtradas llevan `noindex` y no declaran canonical (§5). Sin paginación en el MVP [Propuesto].

### 3.4 Detalle de proyecto `/proyectos/[slug]` (MVP-04)

```text
MÓVIL ~360 px                  | ESCRITORIO ≥ 1024 px
[Cabecera, §2]                 | [Cabecera, §2]
============================== | ======================================================
Migas: Inicio › Proyectos ›    | Migas: Inicio › Proyectos › <título>     (WF-12 a)
  <título>        (WF-12 a)    | h1 <PRO-02 título>
h1 <PRO-02 título>             | <resumen>
<resumen>                      | [portada, opcional]
[portada, opcional]            | h2 Contexto                         | Ficha
Ficha: <periodo, opc.>         | h2 Problema (opc.)                  | <periodo, opc.>
  Stack: <PRO-05>              | h2 Contribución                     | Stack: <PRO-05>
  (Ver repositorio) (Ver demo) | h2 Decisiones (opc.)                | (Ver repositorio)
  PRO-09, sólo si existen      | h2 Resultados (opc.)                | (Ver demo)
h2 Contexto (PRO-03)           |   <resultado> → <evidencia>
h2 Problema (PRO-03, opc.)     | h2 Medios (opc.): figuras con leyenda, en rejilla
h2 Contribución (PRO-04)       | (Volver a proyectos)   (Contactar) [H4]
h2 Decisiones (PRO-06, opc.)   |
h2 Resultados (PRO-07, opc.)   |
  <resultado> → <evidencia>    |
h2 Medios (PRO-08, opc.)       |
  Galeria: figura + leyenda    |
(Volver a proyectos)           |
(Contactar) [H4]               |
[Pie, §2]                      | [Pie, §2]
```

**Jerarquía:** `h1` con el título y un `h2` por sección presente, en el orden de INV › §2.3. **Orden de la ficha [Propuesto]:** la ficha (periodo, stack y enlaces) va en el DOM tras el resumen y la portada, igual que en móvil; en escritorio se muestra como columna lateral junto a las secciones. Es la excepción que anuncia §0: la secuencia sigue siendo significativa (1.3.2, 2.4.3) porque la ficha es un bloque autónomo que no corta el texto de ninguna sección, y deja el CTA principal cerca del inicio para teclado y lector de pantalla. **CTA:** «Ver repositorio» o «Ver demo» sólo si existen (MVP-04.2); «Volver a proyectos» aparece siempre al final y es el CTA principal cuando no hay ninguno de los dos (§1). Son enlaces simples, sin BloqueCTA. Cada resultado lleva su evidencia (PRO-07). Las migas suponen WF-12 (a) y dan una vuelta directa al catálogo.

### 3.5 Servicios `/servicios` (MVP-05, H4)

```text
MÓVIL ~360 px                  | ESCRITORIO ≥ 1024 px
[Cabecera, §2]                 | [Cabecera, §2]
============================== | ======================================================
h1 <SER-01 nombre comercial>   | h1 <SER-01 nombre comercial>
<SER-01 introducción>          | <SER-01 introducción>                (Solicitar revisión)
(Solicitar revisión) SER-07    | FiltroCategorias: [Todas] [<categoría>] … (Should, DC-09)
FiltroCategorias (SER-06)      | +-------------------------+ +-------------------------+
+----------------------------+ | | h2 <nombre>             | | h2 <nombre>             |
| h2 <nombre>                | | | <descripción>           | | <descripción>           |
| <descripción>              | | | Incluye/excluye (opc.)  | | Incluye/excluye (opc.)  |
| Incluye/excluye (opc.)     | | | <PrecioServicio>        | | <PrecioServicio>        |
| Precio: <CLP o a cotizar>  | | | (Solicitar: <nombre>)   | | (Solicitar: <nombre>)   |
| (Solicitar: <nombre>)      | | +-------------------------+ +-------------------------+
+----------------------------+ | h2 Condiciones de atención (SER-04)
h2 Condiciones (SER-04)        | h2 Preguntas frecuentes (SER-05, opcional)
h2 Preguntas frec. (SER-05)    | BloqueCTA (Solicitar revisión)
  h3 <pregunta> + <respuesta>  |
BloqueCTA (Solicitar revisión) |
[Pie, §2]                      | [Pie, §2]
```

**Jerarquía:** `h1` con el nombre comercial (DC-01), `h2` por servicio y por sección, `h3` por pregunta. **CTA:** «Solicitar revisión» al principio y al final. El enlace de cada tarjeta incluye el nombre del servicio en su texto. Si preselecciona el servicio en el formulario (lo decide [RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md)), usa un único parámetro `servicio=<slug>`, validado en el servidor contra los servicios activos; un valor desconocido o inactivo se ignora en silencio y la página es la misma que sin parámetro [Propuesto]. Las preguntas frecuentes se muestran abiertas, sin acordeón [Propuesto]. La diferencia visual con el portafolio es de `DIRECCION-VISUAL.md` (MAR-02).

### 3.6 Solicitar servicio `/servicios/solicitar` (MVP-06, H4)

```text
MÓVIL ~360 px; en escritorio, la misma columna con un ancho de lectura limitado
[Cabecera, §2]
Migas: Inicio › Servicios técnicos › Solicitar   (WF-12 a)
h1 <título del formulario, A→R>
<SOL-01 introducción: qué datos se piden y cuáles no>
+--------------------------------------------------+
| Formulario: campos, errores, carga, confirmación |
| → RECORRIDO-SOLICITUD.md                         |
+--------------------------------------------------+
AvisoPrivacidad (SOL-04) → enlace a /privacidad
[Pie, §2]
```

Este documento fija sólo la ubicación del formulario y las reglas de envío sin JavaScript de §3.10. Campos, estados, errores y confirmación van en [RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md), sobre H0A-02 a H0A-04. El aviso de privacidad es obligatorio (RF-13); en la POC falta (EST › §7). Las migas suponen WF-12 (a).

### 3.7 Contacto `/contacto` (MVP-07, H4)

```text
MÓVIL ~360 px; en escritorio, la misma columna con un ancho de lectura limitado
[Cabecera, §2]
h1 Contacto
<CON-02 contexto profesional; las reparaciones remiten a /servicios/solicitar>
h2 Canales
• <CON-01 canal aprobado: correo o enlace externo> ×1..n
<CON-03 plazo de respuesta, opcional>
h2 Perfiles profesionales (NAV-04, opcional)
[Pie, §2]
```

**CTA:** el canal aprobado. Sin formulario propio: el contacto profesional no guarda datos (MVP-07.3). Cada enlace externo indica su destino en el texto y sigue la regla (6) de §4.

### 3.8 Privacidad `/privacidad` (MVP-08)

```text
MÓVIL ~360 px; en escritorio, la misma columna con un ancho de lectura limitado
[Cabecera, §2]
h1 <título de la política> (PRI-01)
Versión <n> · vigente desde <fecha> (PRI-01)
[Texto legal pendiente: lo redacta y aprueba el responsable (MVP-08.3, V-08)]
h2 Responsable del tratamiento (PRI-01)
h2 Plazos de retención y eliminación (PRI-02)
h2 Cómo ejercer los derechos (PRI-01)
[Pie, §2]
```

Los `h2` son la estructura mínima que se deriva de PRI-01 y PRI-02 [Propuesto]; el texto aprobado manda sobre ella. Ningún agente redacta el texto como definitivo.

### 3.9 Página 404 y error del servidor (MVP-13.5, RF-12)

```text
404 (MÓVIL y ESCRITORIO, una columna)      ERROR DEL SERVIDOR (5xx)
[Cabecera, §2]                             [Cabecera mínima: sólo NAV-01]
h1 <ERR-01 título>                         h1 <ERR-02 título>
<ERR-01 mensaje>                           <ERR-02 mensaje genérico>
(Volver al inicio)  (Ver proyectos)        (Volver al inicio)
[Pie, §2]                                  [sin pie que dependa de datos]
```

La 404 responde con código 404 y es la respuesta única de §1; la página de error responde con 5xx; ninguna se indexa. Ninguna de las dos muestra trazas, ids, nombres de entidad o de colección ni la URL pedida [Propuesto]. La página de error no depende de la base de datos ni muestra PII (ERR-02) [Propuesto]. En la POC no hay 404 pública propia (EST › §7).

### 3.10 Estados por página

| Página | Vacío (V-05) | Error | Sin JavaScript (MVP-14.4) | Opcional ausente (V-07) |
|---|---|---|---|---|
| Inicio | 0 destacados: bloque oculto (MVP-01.3; WF-07). 0 publicados: CTA según WF-03. Sin Perfil publicado: WF-09 | Página de error del servidor (§3.9); nunca contenido de relleno | Todo legible; menú según §2 | Sin INI-08: el hero ocupa la columna. INI-06 oculto hasta H4 |
| Sobre mí | Sin Perfil publicado: la 404 única (§1) y sin enlace (§2) | Ídem | Todo legible | SOB-02, SOB-03 y SOB-05 vacías: sección oculta. Sin CV: sin enlace |
| Proyectos | 0 publicados: EstadoVacio (PRO-11), sin tarjetas ni filtro | Ídem | Lista completa; el filtro funciona como enlaces con `?categoria=` (WF-10) | Tarjeta sin portada ni etiquetas, sin huecos reservados |
| Detalle | No aplica: borrador, retirado o inexistente reciben la 404 única (§1; MVP-03.2) | Ídem | Todo legible; los medios sin ampliación | Cada sección opcional se omite con su `h2`; un medio retirado de urgencia desaparece sin hueco (INV › §3.5) |
| Servicios | 0 activos: EstadoVacio con «Solicitar revisión» (SER-07); sin filtro | Ídem | Todo legible | Sin SER-05: sin sección. Sin alcance: la tarjeta lo omite |
| Solicitar | [RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md) | Página: §3.9; formulario: ver `RECORRIDO-SOLICITUD.md` | [Propuesto] Formulario HTML con `method="post"`. Tras un envío válido, redirección 303 a una confirmación fija sin parámetros (ni id, correo, nombre ni servicio), con `Cache-Control: no-store` y `noindex`; la confirmación no repite lo enviado y es idéntica para una solicitud nueva, un duplicado o un correo ya conocido (MVP-06.5; PRODUCTO.md › Reglas fundamentales, 1). Con un error de validación, la respuesta al POST puede repoblar los campos, escapados y con `no-store`, nunca en la URL. Detalle en `RECORRIDO-SOLICITUD.md` | — |
| Contacto | Sin CON-01 aprobado: la 404 única (§1) y sin enlace (§2) | Ídem | Todo legible | Sin CON-03 ni NAV-04: se omiten |
| Privacidad | Sin texto aprobado: no se publica en producción (MVP-08.1); en staging lleva la marca de borrador | Ídem | Todo legible | — |
| 404 y error | No aplica | No aplica | Sin JavaScript | — |

## 4. Arquitectura de componentes [Propuesto, independiente del stack]

**Reglas.**
1. Ningún componente consulta el almacén de datos: todos reciben datos ya filtrados por la **proyección pública** (INV › §3), lo que sostiene el criterio 4 de UX › §6. La única excepción es la vista previa (regla 5).
2. «Servidor» significa que el HTML sale completo del servidor y no necesita JavaScript en el cliente.
3. Sólo NavegacionMovil necesita interactividad; el formulario de solicitud la decide su recorrido.
4. Sin componentes genéricos («Tarjeta», «Sección») mientras no haya una segunda necesidad real.
5. **Vista previa** (RF-16, *Should*): sólo bajo `/admin`, o tras comprobar en el servidor, en cada petición, la sesión y el rol de administrador; nunca un parámetro ni un token en la ruta pública que baste por sí solo. Sus respuestas llevan `Cache-Control: private, no-store` y `X-Robots-Tag: noindex, nofollow`, y quedan fuera del sitemap, de robots y de canonical. Una petición anónima recibe la misma 404 que una ruta inexistente (§1). El detalle va en [PANEL-ADMIN.md](PANEL-ADMIN.md).
6. **Enlaces externos** (todo enlace externo, por ejemplo PRO-09, NAV-04, CON-01, SOB-05 (`certificaciones.url_verificacion`) y los de texto enriquecido): sólo con esquema `https:` (o `mailto:` para un correo aprobado), comprobado al guardar y también al renderizar; se abren en la misma pestaña por defecto; si se usa `target="_blank"`, llevan `rel="noopener noreferrer"`. El sitio envía `Referrer-Policy: strict-origin-when-cross-origin`.
7. **Textos de interfaz:** INI-06 (R) y los demás textos sin campo en INV › §3, casi todos A→R (PRO-11, SER-07, ERR-01, ERR-02, INI-07, SOB-07, NAV-02, NAV-05, CON-02 y similares), son copia fija versionada en el repositorio, no una entidad editable. El responsable los aprueba como cualquier pieza y confirma la regla en WF-13.

| Componente | Responsabilidad | Páginas | Datos (proyección pública) | Estados | Accesibilidad | Ejecución |
|---|---|---|---|---|---|---|
| Cabecera | Marca y accesos principales | Todas | `nombre_sitio`; disponibilidad de rutas (§2) | Ruta activa; ancho móvil o escritorio | Landmark `banner`; navegación «Principal»; `aria-current` | Servidor; contiene NavegacionMovil |
| NavegacionMovil | Mostrar u ocultar los accesos en móvil | Todas (móvil) | Sólo `{ruta, rótulo, activo}` de cada acceso disponible | Cerrado; abierto; sin JS (WF-02) | `aria-expanded`; `aria-controls` como complemento; lista cerrada con `hidden`; foco al botón; sin trampa; Escape como mejora; ≥ 24×24 | **Interactividad mínima** (única) |
| Pie | Contacto, privacidad, perfiles, año, navegación de respaldo | Todas | `canales_contacto` ya filtrados a uso profesional en la proyección, `enlaces_profesionales` (ubicación según DC-12, pendiente), `textos_legales`, `nombre_publico` | Sin canal: se omite; en H3, sin privacidad | Landmark `contentinfo`; navegación «Pie»; enlaces externos según la regla 6 | Servidor |
| EnlaceSaltar | Saltar al contenido principal | Todas | — | Oculto hasta recibir el foco | Primer enfocable; visible al foco; destino enfocable (2.4.1) | Servidor |
| Hero | Identidad y CTA del inicio | `/` | `nombre_publico`, `titular`, `resumen`, `retrato` (opc.) | Con o sin retrato | `h1` único; `alt` del retrato | Servidor |
| TarjetaProyecto | Resumen enlazable de un proyecto | `/`, `/proyectos` | `titulo`, `slug`, `resumen`, `portada` (Medio) y `etiquetas` (opc.) | Con o sin portada o etiquetas | Un único enlace (el título); nivel de encabezado como parámetro | Servidor |
| ListaProyectos | Ordenar y listar tarjetas | `/`, `/proyectos` | Proyectos publicados (`orden`, `publicado_en`, `destacado`) | Vacía: EstadoVacio | Lista semántica | Servidor |
| FiltroCategorias (*Should*, C-13) | Acotar la lista por categoría | `/proyectos`, `/servicios` | Categorías con al menos un elemento visible (DC-09) | Sin categorías: no se muestra; categoría activa | Navegación con nombre propio; enlaces; `aria-current` en la activa | Servidor, con enlaces `?categoria=<slug>` (WF-10) |
| DetalleCaso | Secciones del caso de estudio | `/proyectos/[slug]` | Campos públicos del Proyecto (INV › §3.2) | Cada sección opcional presente u omitida | Un `h2` por sección; ficha tras el resumen en el DOM (3.4) | Servidor |
| Galeria / Medio | Mostrar imágenes con leyenda y crédito | Detalle; retrato (Hero); portada (TarjetaProyecto); imagen OG (§5) | URL pública, `alt`, `leyenda`, `credito`, `ancho` y `alto` (INV › §3.5; nunca el id interno) | Medio retirado: se omite | `alt` obligatorio; figura con leyenda; espacio reservado con `ancho` y `alto` para evitar saltos | Servidor; sin ampliación en el MVP |
| TarjetaServicio | Un servicio activo | `/servicios` | `nombre`, `slug`, `descripcion`, `alcance_incluye`, `alcance_excluye`, `categoria`, precio | Con o sin alcance | `h2`; el enlace a solicitar incluye el nombre del servicio | Servidor |
| ListaServicios | Ordenar y listar servicios activos | `/servicios` | Servicios activos (`orden`) | Vacía: EstadoVacio con CTA | Lista semántica | Servidor |
| PrecioServicio | Expresar el precio | TarjetaServicio | `modalidad_precio`, `precio_clp`, `nota_precio` | CLP referencial con separador de miles, o «a cotizar» (V-06); impuestos según DC-04 | La moneda y el carácter referencial van en texto, no sólo en un símbolo | Servidor |
| BloqueCTA | Encabezado breve y una o dos acciones | Inicio, servicios (sobre mí y el detalle usan enlaces simples) | Disponibilidad de destinos (§2) y su texto (regla 7) | Destino no disponible: se omite la acción, o el bloque si queda vacío | Enlaces para navegar, no botones; texto que describe el destino | Servidor |
| EstadoVacio | Mensaje honesto sin contenido | `/proyectos`, `/servicios` | PRO-11, SER-07 (regla 7) | — | Texto estático bajo el encabezado; sin región viva | Servidor |
| Migas | Ruta jerárquica de vuelta | Detalle, solicitar (WF-12 a) | Títulos públicos de la jerarquía | — | Navegación «Ruta de navegación»; lista ordenada; la última con `aria-current="page"`; `BreadcrumbList` sólo en el detalle (DC-10, §5) | Servidor |
| AvisoPrivacidad | Aviso breve y enlace a la política | `/servicios/solicitar` | SOL-04; ruta `/privacidad` | Sin aviso aprobado, el formulario no se publica [Propuesto] | Asociado al formulario según [RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md) | Servidor |
| PaginaError | 404 y error del servidor | 404, 5xx | ERR-01, ERR-02 (copia fija, regla 7) | 404; 5xx | `h1` único; código HTTP correcto; no indexable; sin trazas, ids ni URL pedida (§3.9) | Servidor, sin datos dinámicos |

## 5. SEO técnico por página [Propuesto]

Reglas comunes:
- `title` y `description` según la plantilla de Ajustes (`seo_por_defecto`, INV › §3.6) y SEO-01; OpenGraph y Twitter con título, descripción, imagen (SEO-02 por defecto) y URL canónica; idioma y `og:locale` según DC-07.
- `<origen>` es una constante de configuración del despliegue, con `https`, nunca derivada de `Host` ni de `X-Forwarded-*`. Canonical absoluto sobre `<origen>`, sin parámetros de consulta; la forma canónica (barra final) es WF-11. Las vistas filtradas (WF-10 b) llevan `noindex` y no declaran canonical, para no mezclar señales.
- Sitemap generado sólo desde la proyección pública, con URLs absolutas sobre `<origen>` [Propuesto] y con `lastmod` desde la fecha de la última versión publicada, nunca la de un borrador.
- `robots.txt` no enumera `/admin`, la vista previa ni otras rutas privadas. La no indexación de `/admin` va en la cabecera `X-Robots-Tag: noindex, nofollow` de todas sus respuestas, incluidos el login y los errores; su protección es la autorización en el servidor (MVP-09.1), sin tratar `robots` como seguridad (MVP-09.4).
- Los datos estructurados son candidatos de DC-10, **[Pendiente de verificar en schema.org]**, salen sólo de la proyección pública y se serializan escapando `<`, `>` y `&`. En la POC no hay datos estructurados (EST › §7).

| Página | title / description | Canonical | OG | Indexable | Sitemap | Datos estructurados candidatos (DC-10) |
|---|---|---|---|---|---|---|
| `/` | SEO-01; descripción por defecto `resumen` (INI-03) | `<origen>/` | Sí | Sí | Sí | `Person` |
| `/sobre-mi` | SEO-01 | `<origen>/sobre-mi` | Sí | Sí, con Perfil publicado | Sí, con Perfil publicado | `ProfilePage` con `Person` |
| `/proyectos` | SEO-01 | `<origen>/proyectos`; las vistas filtradas, ninguno | Sí | Sí; las vistas filtradas, `noindex` (WF-10) | Sólo la lista sin filtro | Ninguno previsto en DC-10 |
| `/proyectos/[slug]` | PRO-10: `seo_titulo` o `titulo`; `seo_descripcion` o `resumen` | `<origen>/proyectos/<slug>` | Imagen: `imagen_social`, si no `portada`, si no SEO-02 | Sólo publicado | Sólo publicados | `CreativeWork`, o `SoftwareSourceCode` con repositorio público; `BreadcrumbList` si hay migas visibles (WF-12) |
| `/servicios` | SEO-01 | `<origen>/servicios`; las vistas filtradas, ninguno | Sí | Sí, desde H4; las vistas filtradas, `noindex` | Sí, desde H4, sin filtro | `Service`; oferta en CLP sólo si es referencial |
| `/servicios/solicitar` | SEO-01 | `<origen>/servicios/solicitar` | Sí | WF-04; la respuesta al envío nunca se indexa | Según WF-04 | Ninguno: DC-10 limita `BreadcrumbList` a las páginas de detalle |
| `/contacto` | SEO-01 | `<origen>/contacto` | Sí | Sí, desde H4 | Sí, desde H4 | Ninguno; `Person` no lleva canales salvo aprobación (DC-05) |
| `/privacidad` | SEO-01 | `<origen>/privacidad` | Sí (MVP-13.1) | WF-05 | Según WF-05 | Ninguno |
| 404 y error | ERR-01, ERR-02 | Ninguno | No | No | No | Ninguno |

## 6. Comprobación contra UX › §6 y MVP-14

Verificación prevista en H3 (portafolio) y H4 (servicios): **E2E** con el ejecutor de ARQ › Políticas técnicas, en 320, 360 y 1280 px de ancho y con un proyecto sin JavaScript; **axe** sobre cada página pública y cada estado (con contenido y vacío), con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa` (la POC sólo usaba las dos primeras, EST › §7), más `best-practice` para las prácticas adoptadas que no son criterio WCAG (conjunto de reglas [Pendiente de verificar en la documentación de axe-core]); **revisión manual** con teclado y lector de pantalla, porque axe no detecta todo (por ejemplo, 2.4.11).

| Criterio | Cómo lo cumple el wireframe | Cómo se verificará |
|---|---|---|
| UX › §6, 1: el visitante profesional llega a un caso en pocos pasos | Destacados en el inicio (1 activación) o «Explorar proyectos» y una tarjeta (2) [Propuesto: como máximo 2] | E2E: desde `/` se llega a `/proyectos/<slug>` en ≤ 2 activaciones, con ratón y con teclado |
| UX › §6, 2: el cliente técnico sabe dónde contratar y cómo explicar su problema | Acceso «Servicios técnicos», bloque INI-06 y CTA «Solicitar revisión» al principio y al final de `/servicios`; SOL-01 explica qué se pide | E2E: de `/` al formulario en ≤ 2 activaciones; revisión del texto SOL-01 por el responsable |
| UX › §6, 3 y MVP-14.2: móvil y teclado | Una columna a 360 px; disclosure accesible; orden de tabulación de §2; objetivos ≥ 24×24 | E2E a 320 y 360 px; axe `wcag22aa` (2.5.8); revisión manual solo con teclado (Escape, como mejora) |
| UX › §6, 4: no se revela contenido privado ni solicitudes | Los componentes sólo reciben la proyección pública (§4); borrador, retirado e inexistente = 404 única (§1); vista previa sólo autorizada (§4, regla 5); ninguna ruta pública lista solicitudes | Pruebas negativas por superficie (INV › §3): HTML, datos serializados, sitemap, robots, metadatos, JSON-LD y URLs de medios; prueba comparativa de §1 |
| UX › §6, 5 y MVP-14.6: ninguna ruta ni CTA lleva a secciones vacías | Regla de ocultación de §2; secciones opcionales omitidas (§3.10) | E2E que recorre todos los enlaces internos de cada página, con contenido y con fixture vacío, y comprueba código 200 y contenido principal no vacío, o el EstadoVacio esperado |
| MVP-14.1: WCAG 2.2 AA | `h1` único y landmarks (práctica adoptada [Propuesto], no criterio WCAG); `alt` obligatorio; foco visible y no oculto; secuencia de lectura de §0 | axe con las etiquetas WCAG; para `h1` y landmarks, axe `best-practice` o aserciones E2E «exactamente 1 `h1` y 1 `main`»; revisión manual de foco, contraste (con DIRECCION-VISUAL) y reflujo: a 320 px y en el punto de corte con zoom, sin desplazamiento horizontal (1.4.10) |
| Regla 6 de §4: política de referrer [Propuesto] | El sitio envía `Referrer-Policy: strict-origin-when-cross-origin` | E2E: aserción sobre las cabeceras de una respuesta pública (cabecera presente y con ese valor) |
| MVP-14.3: movimiento reducido | Ningún wireframe exige animación; el menú sin animación o desactivable | Revisión manual con la preferencia de movimiento reducido activada |
| MVP-14.4: lectura sin JavaScript | Todo es de servidor salvo NavegacionMovil, con fallback (§2); envío del formulario sin script (§3.10) | E2E con JavaScript desactivado: contenido legible y navegación alcanzable en cada página |
| MVP-14.5: rendimiento | Una sola isla interactiva; imágenes con espacio reservado (`ancho` y `alto`) | [Pendiente] presupuestos tras la POC (RM › §2 MVP-14.5) |

## 7. Decisiones abiertas para el responsable

La columna **Bloquea** indica el primer hito que no puede cerrarse sin la respuesta [Propuesto].

| Decisión | Opciones | Bloquea |
|---|---|---|
| **WF-01. Experiencia** (C-10, DC-08) | (a) integrada en `/sobre-mi` con ancla; (b) página `/experiencia` propia | H3 |
| **WF-02. Menú móvil sin JavaScript** | (a) enlace «Menú» al ancla de la navegación del pie; (b) lista visible en el HTML que el script colapsa al cargar (puede desplazar el contenido); (c) disclosure nativo de HTML (`<details>`), sin script. Advertencia sobre (c): no está verificado que permita mostrar la lista siempre en escritorio sin script, y contradice el patrón de botón con `aria-expanded` de §2 [Pendiente de verificar] | H3 |
| **WF-03. CTA y enlaces de navegación hacia catálogos vacíos** (por ejemplo, «Explorar proyectos» con 0 publicados; §2) | (a) ocultarlos; (b) mantenerlos hacia el estado vacío del catálogo; (c) sustituir el CTA por un enlace a `/sobre-mi` con rótulo propio (A→R) | H3 (proyectos); H4 (servicios) |
| **WF-04. Indexación de `/servicios/solicitar`** | (a) indexable; (b) no indexable, con `/servicios` como página de entrada | H4 |
| **WF-05. Indexación de `/privacidad`** | (a) indexable; (b) no indexable | H4 |
| **WF-06. Cabecera** | (a) no fija; (b) fija, reservando su altura al desplazar el foco y las anclas | H3 |
| **WF-07. Inicio con proyectos publicados pero ninguno destacado** | (a) ocultar el bloque; (b) mostrar los últimos publicados (como máximo 3) | H3 |
| **WF-08. Tamaño de los objetivos táctiles** | (a) el mínimo de 24×24 (AA, 2.5.8) en todo el sitio; (b) 44×44 en la navegación y los CTA en móvil | H3 |
| **WF-09. Sitio sin Perfil publicado** | (a) inicio mínimo con NAV-01 como `h1` y los accesos disponibles; (b) no se despliega ningún entorno público hasta que exista (condición de salida de H3) | H3 |
| **WF-10. Filtro de categorías** (C-13, DC-09) | (a) sin filtro en el MVP; (b) enlaces resueltos en el servidor con un único parámetro `categoria=<slug>` de valor único, comparado con la lista de categorías con al menos un elemento visible; el servidor construye la consulta desde esa lista y nunca pasa el parámetro como filtro u operador a la capa de datos; los demás parámetros se ignoran; una categoría desconocida, sin publicados o malformada (repetida, array u operador) recibe la misma 404 (§1); las vistas filtradas llevan `noindex` y no declaran canonical; (c) control en el cliente con JavaScript | H3, si DC-09 adopta categorías |
| **WF-11. Forma canónica de la URL** | (a) sin barra final; (b) con barra final. En ambos casos, la otra forma redirige a la canónica. La redirección es sintáctica, se aplica antes de consultar datos y da el mismo código y cabeceras para toda ruta; `Location` es absoluta sobre `<origen>`, con las barras iniciales colapsadas a una, nunca derivada de `Host`, para evitar redirecciones abiertas del tipo `//otro-sitio` [Propuesto] | H3 |
| **WF-12. Migas visibles** | (a) sólo en detalle de proyecto y en solicitar; (b) en todas las páginas salvo el inicio; (c) sin migas visibles y sin `BreadcrumbList`. Los wireframes 3.4 y 3.6 dibujan migas suponiendo (a) | H3 |
| **WF-13. Textos de interfaz** (§4, regla 7) | (a) copia fija versionada en el repositorio; (b) campos editables en Ajustes | H3 |
