# H0-b — Wireframes, dirección visual y contenidos

> **Estado:** Propuesta (H0-b, 2026-10-21). No aprobado.
> **Autor:** jz-architect, rama `work/jozeuzz-autonomo`. Nada de esta carpeta está aprobado ni contiene datos reales.

## Propósito

H0-b reúne los wireframes, la dirección visual y la lista de contenidos. Bloquea H3, pero no H1 ni H2 (REGISTRO-DECISIONES-H0A.md › H0A-01). Su criterio de salida, en la parte de contenidos, dice que el contenido real puede seguir incompleto, pero su lista y su responsable tienen que quedar definidos (ROADMAP-MVP.md › §8 H0). Mitiga el riesgo R-01 (ROADMAP-MVP.md › §9.1).

Los agentes sólo proponen. El responsable aporta los datos reales y los aprueba; ningún agente puede inventarlos (PRODUCTO.md › Pendientes de producto). El estado general del proyecto está en [ESTADO-PROYECTO.md](../ESTADO-PROYECTO.md).

## Artefactos

| Artefacto | Contenido | Estado |
|---|---|---|
| [INVENTARIO-CONTENIDO.md](INVENTARIO-CONTENIDO.md) | Reglas de veracidad y de exposición de datos, inventario por página, modelo de contenido editable con su proyección pública, decisiones de contenido pendientes (DC-01 a DC-15) y plantilla de entrega | Propuesta |
| [WIREFRAMES.md](WIREFRAMES.md) | Wireframes de baja fidelidad por página según los criterios de UX-ARQUITECTURA-INFORMACION.md › §6; cierra C-10 | Propuesta |
| [RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md) | UX de `/servicios/solicitar`: campos, estados, errores, aviso de privacidad, antiabuso visto desde la UX, confirmación, pruebas de aceptación para H4 y decisiones RS-01 a RS-08, sobre H0A-02 a H0A-04 | Propuesta |
| [PANEL-ADMIN.md](PANEL-ADMIN.md) | Panel administrativo: acceso e identidad (con el esquema del procedimiento de alta y recuperación), navegación y wireframes, F3 contenido y medios, F4 bandeja y transiciones, estados y errores, seguridad, accesibilidad, pruebas por hito (H2 a H5) y decisiones PA-01 a PA-17 | Propuesta |
| [DIRECCION-VISUAL.md](DIRECCION-VISUAL.md) | Tres direcciones visuales evaluadas con accesibilidad (UX-ARQUITECTURA-INFORMACION.md › §5): principios comunes, paleta con tokens semánticos, tipografía, espaciado, foco, comparación, recomendación y decisiones DV-01 a DV-09; pares de contraste en `tokens/direccion-a.json`, `-b.json` y `-c.json` | Propuesta |

## Cómo verificar

```
node herramientas/verificar-docs/verificar-docs.mjs --exigir-propuesta docs/h0b
```

Se ejecuta desde la raíz del worktree. Resultado esperado: `verificar-docs: N archivos, 0 hallazgos`, con N igual al número de archivos `.md` de `docs/h0b` (hoy 6), y código de salida 0. Las reglas están en el [README del verificador](../../herramientas/verificar-docs/README.md). El verificador no comprueba la veracidad del contenido: eso lo hace el responsable con el §1 del inventario.

Los pares de contraste de las direcciones visuales se comprueban, también desde la raíz del worktree, con:

```
node herramientas/contraste/contraste.mjs docs/h0b/tokens/direccion-a.json docs/h0b/tokens/direccion-b.json docs/h0b/tokens/direccion-c.json
```

Resultado: `contraste: 64 pares, 0 fallos` y código de salida 0 (21 pares en A, 21 en B y 22 en C; DIRECCION-VISUAL.md, §4). Formato y niveles en el [README de la herramienta](../../herramientas/contraste/README.md).

## Checklist de aprobación del responsable

Se sigue el formato de H0A-08: la columna Aprobación lleva la fecha, la referencia Git del texto revisado y el medio (por ejemplo, una conversación). Un elemento sin esos tres datos no está aprobado.

| # | Elemento | Dónde | Aprobación (fecha · ref. Git · medio) |
|---|---|---|---|
| 1 | Reglas de veracidad V-01 a V-12 | INVENTARIO-CONTENIDO.md, §1 | |
| 2 | Lista de contenidos por área y quién aporta cada pieza (criterio de salida de H0) | INVENTARIO-CONTENIDO.md, §2 | |
| 3 | Modelo de contenido editable (Perfil, Proyecto, Servicio, Medio y Ajustes; Categoría pendiente, DC-09), con la proyección pública y la regla de referencias a Medio [Propuesto] | INVENTARIO-CONTENIDO.md, §3 | |
| 4 | Respuesta a cada decisión DC-01 a DC-15 | INVENTARIO-CONTENIDO.md, §4 | |
| 5 | Plantilla de entrega | INVENTARIO-CONTENIDO.md, §5 | |
| 6 | Wireframes, rutas, navegación, componentes y SEO revisados con los criterios de UX › §6 y MVP-14 | [WIREFRAMES.md](WIREFRAMES.md), §1 a §6 | |
| 7 | Respuesta a cada decisión WF-01 a WF-13 | WIREFRAMES.md, §7 | |
| 8 | Recorrido de solicitud y respuestas RS-xx (RS-01 a RS-08) | [RECORRIDO-SOLICITUD.md](RECORRIDO-SOLICITUD.md), §1 a §10 | |
| 9 | Panel administrativo y respuestas PA-xx (PA-01 a PA-17) | [PANEL-ADMIN.md](PANEL-ADMIN.md), §1 a §10 | |
| 10 | Dirección visual elegida y respuestas DV-xx (DV-01 a DV-09) | [DIRECCION-VISUAL.md](DIRECCION-VISUAL.md), §1 a §5 | |
