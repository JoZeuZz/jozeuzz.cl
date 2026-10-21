# H0-b — Wireframes, dirección visual y contenidos

> **Estado:** Propuesta (H0-b, 2026-10-21). No aprobado.
> **Autor:** jz-architect, rama `work/jozeuzz-autonomo` sobre `349388a`. Nada de esta carpeta está aprobado ni contiene datos reales.

## Propósito

H0-b reúne los wireframes, la dirección visual y la lista de contenidos. Bloquea H3, pero no H1 ni H2 (REGISTRO-DECISIONES-H0A.md › H0A-01). Su criterio de salida, en la parte de contenidos, dice que el contenido real puede seguir incompleto, pero su lista y su responsable tienen que quedar definidos (ROADMAP-MVP.md › §8 H0). Mitiga el riesgo R-01 (ROADMAP-MVP.md › §9.1).

Los agentes sólo proponen. El responsable aporta los datos reales y los aprueba; ningún agente puede inventarlos (PRODUCTO.md › Pendientes de producto). El estado general del proyecto está en [ESTADO-PROYECTO.md](../ESTADO-PROYECTO.md).

## Artefactos

| Artefacto | Contenido | Estado |
|---|---|---|
| [INVENTARIO-CONTENIDO.md](INVENTARIO-CONTENIDO.md) | Reglas de veracidad y de exposición de datos, inventario por página, modelo de contenido editable con su proyección pública, decisiones de contenido pendientes (DC-01 a DC-15) y plantilla de entrega | Propuesta |
| `WIREFRAMES.md` | Wireframes de baja fidelidad por página según los criterios de UX-ARQUITECTURA-INFORMACION.md › §6; cierra C-10 | Pendiente |
| `RECORRIDO-SOLICITUD.md` | UX de `/servicios/solicitar`: campos, estados, errores y confirmación, sobre H0A-02 a H0A-04 | Pendiente |
| `PANEL-ADMIN.md` | Recorridos del administrador: contenido, medios, servicios y bandeja de solicitudes | Pendiente |
| `DIRECCION-VISUAL.md` | De 2 a 3 direcciones visuales evaluadas con accesibilidad (UX-ARQUITECTURA-INFORMACION.md › §5) | Pendiente |

## Cómo verificar

```
node herramientas/verificar-docs/verificar-docs.mjs --exigir-propuesta docs/h0b
```

Se ejecuta desde la raíz del worktree. Resultado esperado: `verificar-docs: 2 archivos, 0 hallazgos` y código de salida 0; el número de archivos crece con cada artefacto nuevo. Las reglas están en el [README del verificador](../../herramientas/verificar-docs/README.md). El verificador no comprueba la veracidad del contenido: eso lo hace el responsable con el §1 del inventario.

## Checklist de aprobación del responsable

Se sigue el formato de H0A-08: la columna Aprobación lleva la fecha, la referencia Git del texto revisado y el medio (por ejemplo, una conversación). Un elemento sin esos tres datos no está aprobado.

| # | Elemento | Dónde | Aprobación (fecha · ref. Git · medio) |
|---|---|---|---|
| 1 | Reglas de veracidad V-01 a V-12 | INVENTARIO-CONTENIDO.md, §1 | |
| 2 | Lista de contenidos por área y quién aporta cada pieza (criterio de salida de H0) | INVENTARIO-CONTENIDO.md, §2 | |
| 3 | Modelo de contenido editable (Perfil, Proyecto, Servicio, Medio y Ajustes; Categoría pendiente, DC-09), con la proyección pública y la regla de referencias a Medio [Propuesto] | INVENTARIO-CONTENIDO.md, §3 | |
| 4 | Respuesta a cada decisión DC-01 a DC-15 | INVENTARIO-CONTENIDO.md, §4 | |
| 5 | Plantilla de entrega | INVENTARIO-CONTENIDO.md, §5 | |
| 6 | Wireframes revisados con los criterios de UX › §6 | `WIREFRAMES.md` (pendiente) | |
| 7 | Recorrido de la solicitud | `RECORRIDO-SOLICITUD.md` (pendiente) | |
| 8 | Recorridos del panel | `PANEL-ADMIN.md` (pendiente) | |
| 9 | Dirección visual elegida | `DIRECCION-VISUAL.md` (pendiente) | |
