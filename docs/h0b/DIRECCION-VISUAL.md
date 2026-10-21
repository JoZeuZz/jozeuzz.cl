# Direcciones visuales y tokens verificables — jozeuzz.cl

> **Estado:** Propuesta (H0-b, 2026-10-21). No aprobado. Ninguna dirección es la marca definitiva.
> **Autor:** jz-architect, unidad U7b de H0-b, rama `work/jozeuzz-autonomo` sobre `f5df388`. No contiene logotipo, nombre comercial ni datos reales.
> **Etiquetas:** **[Definido]** lo fija una fuente citada · **[Propuesto]** recomendación sin aprobar · **[Pendiente]** decide el responsable.
> **Abreviaturas:** `UX` = [UX-ARQUITECTURA-INFORMACION.md](../UX-ARQUITECTURA-INFORMACION.md) · `WF` = [WIREFRAMES.md](WIREFRAMES.md) · `INV` = [INVENTARIO-CONTENIDO.md](INVENTARIO-CONTENIDO.md) · `RM` = [ROADMAP-MVP.md](../ROADMAP-MVP.md).

**Propósito.** UX › §5 pide definir los tokens de color, espaciado y tipografía después de explorar de 2 a 3 direcciones visuales evaluadas con accesibilidad. Este documento propone tres, con tokens semánticos y pares de contraste comprobables con [la herramienta de contraste](../../herramientas/contraste/README.md). Alimenta D-05 (RM › §5, pendiente) y la pieza MAR-04 «Paleta y tipografía» (INV › §2, obligatoria, H3, contraste WCAG 2.2 AA). No decide la marca: el logotipo (MAR-01), la marca del servicio técnico (MAR-02, DC-01), el tono (MAR-03, DC-13), la paleta y la tipografía son decisiones del responsable. Las fuentes nombradas son ejemplos, no compromisos.

**Objetivo de accesibilidad.** [Definido] WCAG 2.2 AA (MVP-14.1, RM › §2). Este documento verifica 1.4.3 (contraste de texto) y 1.4.11 (contraste de componentes y del foco) con pares; 2.4.7, 2.4.11, 2.5.8 y el movimiento reducido se resuelven por reglas de estilo (§1) y se comprueban en H3 con el sitio real.

## 1. Principios comunes a las tres direcciones [Propuesto]

1. **Sobria, profesional, tecnológica y personal.** El sitio presenta a una persona con oficio técnico, no a una agencia: nada de degradados de moda, ilustraciones de relleno ni fotografía de banco de imágenes.
2. **Calidad editorial antes que animación** (UX › §5). La jerarquía la dan el tamaño, el peso y el espacio, no el movimiento.
3. **Evidencias antes que logos** (UX › §5). Las capturas, diagramas y resultados de los casos (PRO-xx) tienen más peso visual que cualquier lista de tecnologías; las tecnologías son texto o etiquetas, nunca muros de logotipos.
4. **Una sola marca con un área técnica diferenciada.** El servicio técnico se distingue dentro de la misma web con un subtítulo, un acento (`acento-tecnico`) o una iconografía propia, según DC-01 y MAR-02 (INV). Nunca es otra web, otra cabecera ni otra navegación. El color nunca es la única señal: el subtítulo o el rótulo siempre van en texto (WCAG 1.4.1).
5. **Modo claro como base.** El modo oscuro queda como decisión (DV-02); si se adopta, necesita su propio JSON de pares y la misma verificación.
6. **Contraste con margen.** Objetivo de diseño ≥ 5:1 para texto (el mínimo AA es 4.5:1) y ≥ 3.5:1 para componentes y foco (mínimo 3:1), para absorber variaciones de pantalla y de suavizado.
7. **Enlaces reconocibles sin depender del color.** Los enlaces dentro del texto van siempre subrayados (1.4.1); en la navegación, la posición y el estado activo (WF › §2: `aria-current` con indicación no cromática) cumplen ese papel.
8. **Foco siempre visible** (2.4.7) **y no oculto** (2.4.11). Contorno de al menos 2 px, de color `foco`, con contraste ≥ 3:1 frente a los colores adyacentes (1.4.11). Se usa `:focus-visible`; nunca `outline: none` sin sustituto. [Propuesto] El foco puede ir pegado sólo al botón primario; contra bordes de control y otros componentes, siempre va separado 2 px, porque el contraste entre `foco` y `borde-control` no alcanza 3:1 en todas las direcciones. [Propuesto] Con `forced-colors: active` (modo de alto contraste de Windows), el contorno de foco sigue visible y usa colores del sistema (por ejemplo `outline-color: Highlight`); los pares de este documento no se aplican en ese modo. Con WF-06 = (a), cabecera no fija, nada tapa el foco; con (b), el desplazamiento reserva la altura de la cabecera (WF › §2). El criterio 2.4.13 (AAA) sirve sólo de referencia: área de foco al menos equivalente a un perímetro de 2 px y contraste ≥ 3:1 entre el estado con y sin foco.
9. **Objetivos de al menos 24×24 CSS px** (2.5.8) o con la separación que exige la excepción; 44×44 en la navegación y los CTA de móvil si WF-08 = (b).
10. **Movimiento reducido.** Sin animaciones de entrada, de paralaje ni de desplazamiento. Sólo transiciones de color u opacidad de 150 ms o menos, y ninguna con `prefers-reduced-motion: reduce` (MVP-14.3; DV-09).
11. **Sin fuentes cargadas desde terceros** (privacidad y rendimiento): ninguna petición a un servicio externo de fuentes. Si se adopta una fuente, va autoalojada en WOFF2, con subconjunto latino y licencia libre [Pendiente de verificar licencia]; la pila del sistema es siempre la alternativa sin coste y el respaldo de carga. [Propuesto] Con una fuente propia: `font-display: swap`, con una fuente de respaldo ajustada con `size-adjust` y las métricas de la fuente (`ascent-override`, `descent-override`) para reducir el salto de maquetación, y un subconjunto latino que incluya Latin-1 Supplement (ñ, á, é, ü, ¿, ¡).
12. **Lectura cómoda.** Longitud de línea de 60 a 75 caracteres en la prosa (`max-width` entre `60ch` y `70ch`), altura de línea ≥ 1.5 en el cuerpo, texto ampliable al 200 % sin pérdida (1.4.4) y reflujo a 320 CSS px (1.4.10; WF › §0). [Propuesto] Sin alturas fijas ni `overflow: hidden` en contenedores de texto, para que el espaciado de texto de 1.4.12 no recorte contenido. La unidad `ch` mide el ancho del «0», no el de un carácter medio: la longitud real de línea (60 a 75 caracteres) se medirá con el texto real en H3.
13. **Tokens semánticos, no cromáticos.** Los componentes usan `texto`, `superficie`, `foco`…, nunca un hex directo, de modo que cambiar de dirección o añadir un modo oscuro sólo cambia la tabla de tokens.
14. **Punto de corte de la navegación.** WF › §2 delega aquí el ancho desde el que la cabecera muestra los cuatro accesos: se propone `48rem` (768 px) como valor común, a confirmar en DV-06 con los rótulos reales.
15. **Estados de los componentes** [Propuesto]. (a) Enlace visitado: sin cambio de color. (b) `hover`: se añade siempre una señal no cromática, subrayado más grueso o cambio de fondo, nunca sólo un cambio de color. (c) Deshabilitado: exento de 1.4.3 y 1.4.11 (componentes inactivos), por lo que no se declara par; sigue sin ser la única señal, con el atributo `disabled` o `aria-disabled` y una razón en texto cuando haga falta. (d) Placeholder: color `texto-secundario`, y nunca sustituye a la etiqueta. (e) Borde de tarjetas: no es informativo y no exige 3:1, salvo en tarjetas clicables, cuyo título enlazado ya las identifica.
16. **Sin controles sobre bandas coloreadas o imágenes** [Propuesto]. No se colocan controles interactivos (enlaces, botones, campos) sobre bandas de color ni sobre imágenes; si es inevitable, se declara el par en el JSON de la dirección y se verifica.

**Tokens de color comunes a las tres direcciones.** `fondo`, `superficie`, `texto`, `texto-secundario`, `borde-control`, `acento` (relleno del botón primario), `acento-texto` (rótulo sobre `acento`), `foco`, `enlace`, `exito`, `error`, `aviso` (siempre usado como texto, con icono y rótulo) y `acento-tecnico` (subtítulo y marcas del área técnica). Los separadores puramente decorativos no identifican controles y no exigen 3:1; su color se fija en H3 [Pendiente].

## 2. Direcciones

### 2.1 Dirección A — «Editorial sobria»

**Intención y público.** Una revista técnica personal: papel cálido, tinta oscura, titulares con serifa. Prioriza al visitante profesional que lee casos de estudio completos (UX › §6, criterio 1). Transmite criterio y oficio más que novedad.

**Paleta** ([tokens/direccion-a.json](tokens/direccion-a.json)).

| Token | Hex | Uso |
|---|---|---|
| fondo | `#faf8f3` | Papel cálido |
| superficie | `#f1ede4` | Tarjetas, ficha del caso, bloques |
| texto | `#1d1b18` | Tinta |
| texto-secundario | `#57524a` | Metadatos, leyendas, ayudas |
| borde-control | `#7a7468` | Campos y botones secundarios |
| acento | `#172338` | Botón primario (azul tinta) |
| acento-texto | `#ffffff` | Rótulo del botón primario |
| foco | `#c9541a` | Contorno de foco (terracota) |
| enlace | `#1d4f91` | Enlaces subrayados |
| exito / error / aviso | `#26662f` / `#a3221b` / `#8a5a00` | Estados, siempre con icono y texto |
| acento-tecnico | `#1e5a6b` | Subtítulo y filete del área técnica (petróleo) |

**Tipografía.** Titulares y prosa larga en una serifa de texto autoalojada con licencia libre, por ejemplo «Source Serif 4» [Pendiente de verificar licencia]; sin fuente, pila `ui-serif, Georgia, "Times New Roman", serif`. Navegación, formularios, etiquetas y metadatos en la pila del sistema sin serifa (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). Escala de razón 1.25 desde 1 rem: 0.8 · 1 · 1.25 · 1.563 · 1.953 · 2.441 rem; el cuerpo, de 1.125 rem, queda fuera de escala; en móvil el `h1` baja a 1.953 rem. Alturas de línea: 1.65 en el cuerpo, 1.25 en titulares. Prosa a `65ch`.

**Espaciado.** Base de 0.25 rem: 0.25 · 0.5 · 0.75 · 1 · 1.5 · 2 · 3 · 4 · 6 rem; separación entre secciones de 4 rem (móvil) a 6 rem (escritorio). Márgenes generosos: el blanco es parte del estilo.

**Radios, bordes y sombras.** Radio de 2 px en controles y 0 en tarjetas; tarjetas separadas por un filete de 1 px y por el cambio a `superficie`; sin sombras.

**Foco.** Contorno de 3 px `foco`, separado 2 px (`outline-offset: 2px`). Pares: `foco` frente a `fondo`, `superficie` y, por si el contorno queda pegado al botón primario en contenedores estrechos, frente a `acento`. El foco puede ir pegado sólo al botón primario; contra bordes de control y otros componentes, siempre va separado 2 px: `foco/borde-control` es de ≈ 1.05:1 y no cumpliría 3:1 (par no declarado).

**Iconografía.** Mínima: sólo estados, enlace externo y menú, de trazo fino. El área técnica se marca con el subtítulo en `acento-tecnico` y un filete de ese color sobre su bloque.

**Tono de imagen.** Capturas y fotografías del trabajo real, con leyenda debajo como en una publicación; sin recortes decorativos ni filtros.

**Riesgos y mantenimiento.** Una fuente autoalojada añade uno o dos archivos al primer render y obliga a verificar su licencia y su subconjunto [Pendiente medir peso]. El tono cálido puede leerse como «blog literario» si los casos no tienen imágenes fuertes. Mantenimiento medio: dos familias y una escala con más pasos.

```text
INICIO, MÓVIL ~360 px (A)
jozeuzz.cl                       (Menú)
------------------------------------- filete
h1 <INI-01>            serifa, 1.953 rem
<INI-02 titular>       serifa, 1.25 rem
<INI-03>               prosa, 65ch
[ Explorar proyectos ]  botón azul tinta
Ver servicios técnicos  enlace subrayado
------------------------------------- filete
h2 Proyectos destacados
+-----------------------------------+
| captura del caso                  |  superficie
| h3 Título del caso                |
| resumen · metadatos secundarios   |
+-----------------------------------+
═══ <nombre_area_tecnica> ═══ filete petróleo
```

### 2.2 Dirección B — «Técnica precisa»

**Intención y público.** Documentación técnica bien hecha: blanco, gris frío, retícula visible, datos en monoespaciada. Habla tanto al visitante profesional como al cliente del servicio técnico, que busca claridad sobre qué se hace y cómo pedirlo (UX › §6, criterio 2).

**Paleta** ([tokens/direccion-b.json](tokens/direccion-b.json)).

| Token | Hex | Uso |
|---|---|---|
| fondo | `#ffffff` | Fondo |
| superficie | `#f3f5f7` | Tarjetas, ficha técnica, bloques |
| texto | `#111827` | Texto |
| texto-secundario | `#4b5563` | Metadatos, leyendas, ayudas |
| borde-control | `#6b7280` | Campos y botones secundarios |
| acento | `#0b5cad` | Botón primario (azul) |
| acento-texto | `#ffffff` | Rótulo del botón primario |
| foco | `#1e3a8a` | Contorno de foco (azul profundo) |
| enlace | `#0b5cad` | Enlaces subrayados |
| exito / error / aviso | `#166534` / `#b91c1c` / `#92400e` | Estados, siempre con icono y texto |
| acento-tecnico | `#6d28d9` | Subtítulo, etiqueta y marca del área técnica (violeta) |

**Tipografía.** Pila del sistema sin serifa para todo (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) y monoespaciada del sistema para metadatos, etiquetas de tecnología y fichas (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`). Opción: una familia autoalojada con variante monoespaciada y licencia libre, por ejemplo «IBM Plex Sans» y «IBM Plex Mono» [Pendiente de verificar licencia]. Escala de razón 1.2: 1 (cuerpo) · 1.2 · 1.44 · 1.728 · 2.074 · 2.488 rem; metadatos y etiquetas con un mínimo de 0.875 rem, fuera de escala; en móvil el `h1` baja a 2.074 rem. Alturas de línea: 1.55 en el cuerpo, 1.2 en titulares. Prosa a `68ch`.

**Espaciado.** Retícula de 4 px: 0.25 · 0.5 · 0.75 · 1 · 1.25 · 1.5 · 2 · 2.5 · 3 · 4 rem; secciones a 3 rem (móvil) y 4 rem (escritorio). Densidad media: más información por pantalla que A.

**Radios, bordes y sombras.** Radio de 6 px en controles y tarjetas; borde de 1 px en tarjetas; una única sombra muy suave en elementos elevados (ninguno en el MVP salvo, quizá, el menú abierto).

**Foco.** Contorno de 2 px `foco`, **siempre separado 2 px** (`outline-offset: 2px`), de modo que el hueco muestra `fondo` o `superficie`. Es obligatorio, también junto al botón primario: ningún color de foco, salvo el negro puro y sin margen, supera 3:1 a la vez frente al blanco y a `acento` (el foco tendría que ser más oscuro y más claro que el azul medio de `acento` a la vez), así que el par `foco/acento` no se declara y la separación no puede eliminarse.

**Iconografía.** Iconos de trazo de 1.5 px en rejilla de 24 px, autoalojados como SVG en el repositorio (MAR-01), con licencia libre [Pendiente de verificar licencia]: estados, enlace externo, menú y un icono propio por servicio técnico (DV-08).

**Tono de imagen.** Capturas de interfaz a tamaño legible, diagramas de arquitectura y fotografías de equipos y montajes con fondo neutro; leyenda técnica en monoespaciada.

**Riesgos y mantenimiento.** Riesgo de parecer una plantilla de documentación genérica si no hay evidencias propias; el azul y el gris frío son muy comunes. Mantenimiento bajo sin fuente propia (sólo pilas del sistema); medio si se adopta la familia opcional.

```text
INICIO, MÓVIL ~360 px (B)
jozeuzz.cl                       (Menú)
=====================================
h1 <INI-01>                  2.074 rem
<INI-02 titular>
<INI-03>
[ Explorar proyectos ]   botón azul, r6
[ Ver servicios técnicos ] borde gris
-------------------------------------
h2 Proyectos destacados
+-----------------------------------+
| captura                           |
| h3 Título del caso                |
| resumen                           |
| <etiquetas en monoespaciada>      |
+-----------------------------------+
[icono] <nombre_area_tecnica>   violeta
```

### 2.3 Dirección C — «Contraste alto minimal»

**Intención y público.** Blanco y negro con un único color de interacción (violeta). Máxima legibilidad, incluso con baja visión, pantallas de baja calidad o luz exterior; el diseño se apoya casi sólo en tipografía y espacio. El texto apunta a AAA (1.4.6, 7:1) aunque el objetivo del proyecto es AA.

**Paleta** ([tokens/direccion-c.json](tokens/direccion-c.json)).

| Token | Hex | Uso |
|---|---|---|
| fondo | `#ffffff` | Fondo |
| superficie | `#f2f2f2` | Bloques y ficha |
| texto | `#0a0a0a` | Texto |
| texto-secundario | `#3d3d3d` | Metadatos y ayudas |
| borde-control | `#595959` | Campos y botones secundarios (borde de 2 px) |
| acento | `#000000` | Botón primario negro |
| acento-texto | `#ffffff` | Rótulo del botón primario |
| foco | `#7c3aed` | Contorno de foco (violeta) |
| enlace | `#5b21b6` | Enlaces subrayados |
| exito / error / aviso | `#0f5b25` / `#a10e0e` / `#6e4200` | Estados, siempre con icono y texto |
| acento-tecnico | `#0a3d8f` | Subtítulo y banda del área técnica (azul profundo) |

**Tipografía.** Sólo la pila del sistema sin serifa, sin fuentes propias. Pesos 400 y 700. Escala de razón 1.333 desde el cuerpo: 1.125 (cuerpo) · 1.5 · 2 · 2.667 rem; metadatos y etiquetas a 0.875 rem, fuera de escala (1.125 / 1.333 ≈ 0.844); en móvil el `h1` baja a 2 rem. Alturas de línea: 1.6 en el cuerpo, 1.15 en titulares. Prosa a `60ch`.

**Espaciado.** Base de 0.5 rem: 0.5 · 1 · 1.5 · 2 · 3 · 4 · 5 rem; secciones a 3 rem (móvil) y 5 rem (escritorio).

**Radios, bordes y sombras.** Radio 0; bordes de 2 px en controles; reglas horizontales de 2 px en `texto` entre secciones; sin sombras.

**Foco.** Contorno de 3 px `foco`, separado 2 px. Con el botón primario negro el contorno también funciona pegado (par `foco/acento`, 3.69:1), lo que tolera contenedores estrechos. El foco puede ir pegado sólo al botón primario; contra bordes de control y otros componentes, siempre va separado 2 px: `foco/borde-control` es de ≈ 1.23:1 y no cumpliría 3:1 (par no declarado).

**Iconografía.** Casi ninguna: estados y enlace externo. El área técnica se distingue por una banda superior en `acento-tecnico` con el subtítulo en texto.

**Tono de imagen.** Capturas y fotografías sin tratamiento, con borde de 1 px; ninguna imagen decorativa.

**Riesgos y mantenimiento.** Puede resultar austera o fría y dar poca personalidad a la marca; el negro puro en grandes superficies cansa en lecturas largas (por eso el cuerpo usa `#0a0a0a`, no `#000000`). El violeta sólo para interacción es una regla que hay que vigilar. Mantenimiento el más bajo: una pila, cinco tamaños, sin sombras.

```text
INICIO, MÓVIL ~360 px (C)
jozeuzz.cl                       (Menú)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ regla 2 px
h1 <INI-01>                    2 rem, 700
<INI-02 titular>
<INI-03>
[■ Explorar proyectos ■]  botón negro, r0
Ver servicios técnicos →  enlace violeta subrayado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
h2 Proyectos destacados
captura (borde 1 px)
h3 Título del caso
resumen
▀▀▀▀▀▀▀▀▀▀▀▀ banda azul profundo ▀▀▀▀▀▀▀▀
h2 <nombre_area_tecnica>
```

## 3. Comparación y recomendación

Valoración cualitativa [Propuesto], no medida: el rendimiento se medirá en H3 con el sitio real (MVP-14.5).

| Criterio | A «Editorial sobria» | B «Técnica precisa» | C «Contraste alto minimal» |
|---|---|---|---|
| Legibilidad | Alta en lectura larga; la serifa exige buen tamaño en móvil | Alta; pila del sistema familiar | Muy alta; tamaños mayores y contraste AAA |
| Accesibilidad (contraste, foco) | AA con margen; el foco puede ir pegado sólo al botón primario, y separado 2 px contra bordes de control y otros componentes | AA con margen; el foco va siempre separado 2 px, incluso junto al botón primario | AAA en texto; el foco puede ir pegado sólo al botón primario, y separado 2 px contra bordes de control y otros componentes |
| Diferenciación de áreas | Buena: filete y subtítulo en petróleo | Muy buena: color, icono por servicio y etiqueta | Media: banda y subtítulo, con poco color |
| Rendimiento | Medio: una o dos fuentes autoalojadas | Alto sin fuente propia; medio con la opcional | Muy alto: sin fuentes, sin sombras |
| Mantenimiento | Medio: dos familias, escala de 7 pasos | Bajo a medio | Bajo |
| Coherencia con marca tecnológica personal | Personal y de criterio; menos «tecnológica» | Muy tecnológica; riesgo de genérica | Neutra; poca personalidad |

**Recomendación [Propuesto].** Partir de **B «Técnica precisa»** y tomar de C la disciplina de contraste. Razones: (1) es la más coherente con una marca tecnológica personal y con dos públicos, profesional y cliente técnico; (2) diferencia el área técnica con más recursos (color, icono y rótulo) sin crear otra web; (3) funciona sin fuente propia, así que no añade peticiones, licencias ni peso hasta que el responsable lo decida (DV-03); (4) su retícula y la monoespaciada favorecen las fichas técnicas de los casos, que son la evidencia principal (UX › §5). Su punto débil, el parecido con plantillas genéricas, se mitiga con evidencias propias y no con decoración. Si el responsable prioriza la voz personal y la lectura larga, A es la alternativa; si prioriza la accesibilidad máxima y el mínimo mantenimiento, C. Se puede combinar (por ejemplo, la paleta de B con los tamaños de C) indicándolo en DV-01; toda combinación exige regenerar y verificar su JSON de pares. **Decide el responsable.**

## 4. Verificación

Los pares de cada dirección están en [tokens/direccion-a.json](tokens/direccion-a.json), [tokens/direccion-b.json](tokens/direccion-b.json) y [tokens/direccion-c.json](tokens/direccion-c.json), en el formato del [README de la herramienta](../../herramientas/contraste/README.md). Se comprueban desde la raíz del worktree con:

```
node herramientas/contraste/contraste.mjs docs/h0b/tokens/direccion-a.json docs/h0b/tokens/direccion-b.json docs/h0b/tokens/direccion-c.json
```

Niveles usados: `texto` (4.5:1, 1.4.3) y `ui` (3:1, 1.4.11) en A y B; en C, `texto-aaa` (7:1, 1.4.6) para todo el texto y `ui` para componentes y foco.

**Resultado de la última ejecución** (2026-10-21, `jz-run`, HEAD `f5df388`, árbol de trabajo `c4a25ef51e06f3ab`, que todavía no incluía este §4 ni el README): código de salida 0, log `.jz-state/runs/20261021T171546Z-629174.log`, salida `contraste: 64 pares, 0 fallos`. Las comprobaciones sobre el árbol confirmado figuran en el informe de la unidad, no en este documento. Sin fallos en ninguna dirección, y con el margen de diseño de §1.6 (texto ≥ 5:1 en A y B, ≥ 7:1 en C; componentes y foco ≥ 3.5:1).

| Archivo | Pares | Cubre | Resultado |
|---|---|---|---|
| `direccion-a.json` | 21 | Texto y texto secundario sobre fondo y superficie, enlace, botón primario, estados (error, éxito y aviso sobre fondo y superficie), bordes de control, foco (incluido frente a `acento`), área técnica | 21 pares, 0 fallos; razón mínima de texto 5.07 (`aviso/superficie`) y de componentes 3.57 (`foco/acento`) |
| `direccion-b.json` | 21 | Lo mismo salvo `foco/acento`, que no se declara porque el foco va siempre separado (§2.2); añade `acento-texto/acento-tecnico` para la etiqueta con relleno | 21 pares, 0 fallos; razón mínima de texto 5.92 (`error/superficie`) y de componentes 4.42 (`borde-control/superficie`) |
| `direccion-c.json` | 22 | Lo mismo que A, con texto en nivel AAA; añade `acento-texto/acento-tecnico` para la banda | 22 pares, 0 fallos; razón mínima de texto 7.26 (`error/superficie`) y de componentes 3.69 (`foco/acento`) |

Comprobación de documentación: `verificar-docs: 6 archivos, 0 hallazgos`, código de salida 0, log `.jz-state/runs/20261021T171546Z-629324.log` (mismo árbol).

En A no se declara `acento-texto/acento-tecnico`: usa un filete y un subtítulo, no un relleno. Si se adoptara una etiqueta con relleno de `acento-tecnico`, hay que añadir ese par.

Limitaciones: la herramienta comprueba colores sólidos; no comprueba el texto sobre imágenes (prohibido en las tres direcciones salvo con un fondo sólido debajo), los estados `hover` y deshabilitado (1.4.3 exceptúa los componentes inactivos), el tamaño del foco ni los objetivos táctiles. Eso se verifica en H3 con el sitio real, con teclado, con zoom al 200 % y a 320 CSS px.

## 5. Decisiones abiertas para el responsable

| Decisión | Opciones | Bloquea |
|---|---|---|
| **DV-01. Dirección visual** (D-05, MAR-04) | (a) A «Editorial sobria»; (b) B «Técnica precisa»; (c) C «Contraste alto minimal»; (d) una combinación, indicando qué se toma de cada una | H3 |
| **DV-02. Modo oscuro** | (a) sólo modo claro en el MVP; (b) modo oscuro según `prefers-color-scheme`, con su propio JSON de pares; (c) modo oscuro con conmutador manual, además de (b) | H3 |
| **DV-03. Tipografía** | (a) sólo pilas del sistema; (b) una familia autoalojada con licencia libre verificada, indicando cuál; (c) dos familias (titulares y texto) autoalojadas | H3 |
| **DV-04. Diferenciación del área técnica** (DC-01, MAR-02) | (a) sólo subtítulo en texto; (b) subtítulo y `acento-tecnico`; (c) subtítulo, `acento-tecnico` e iconografía propia | H3 |
| **DV-05. Estilo de foco** | (a) contorno siempre separado 2 px en todo el sitio; (b) contorno pegado sólo al botón primario donde el par `foco/acento` lo permita (A y C), y separado 2 px contra bordes de control y otros componentes; (c) doble contorno (claro y oscuro) | H3 |
| **DV-06. Punto de corte de la navegación** (WF › §2) | (a) `48rem` (768 px); (b) `64rem` (1024 px, el ancho de escritorio de los wireframes); (c) el que resulte de medir los rótulos reales | H3 |
| **DV-07. Nivel de contraste del texto** | (a) AA (4.5:1) con margen de diseño ≥ 5:1; (b) AAA (7:1) en el texto de cuerpo; (c) AAA en todo el texto | H3 |
| **DV-08. Iconografía** | (a) sólo iconos de estado, enlace externo y menú; (b) además, un icono por servicio técnico; en ambos casos, SVG en el repositorio con licencia verificada | H3 |
| **DV-09. Movimiento** | (a) sin transiciones; (b) transiciones de color u opacidad de 150 ms o menos, desactivadas con `prefers-reduced-motion: reduce` | H3 |
