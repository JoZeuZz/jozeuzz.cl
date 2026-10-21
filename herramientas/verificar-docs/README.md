# verificar-docs

Herramienta de desarrollo, sin dependencias (sólo módulos `node:`), que verifica
de forma determinista los documentos markdown de propuesta (`docs/h0b/`).
Funciona en Node 20 y 24. No escribe archivos.

## Uso

```
node herramientas/verificar-docs/verificar-docs.mjs [--exigir-propuesta] <archivo.md|directorio>...
```

- Los directorios se recorren de forma recursiva (`*.md`, orden alfabético).
- No sigue enlaces simbólicos que apunten fuera del directorio de trabajo.
- Salida: `ruta:linea: regla: detalle` y un resumen `verificar-docs: N archivos, M hallazgos`.
- Código de salida: 0 sin hallazgos, 1 con hallazgos, 2 por uso inválido.

## Reglas

- `enlace-roto`: enlaces `[texto](destino)` relativos (con ancla, título o `%20`)
  cuyo destino no existe. Se ignoran `http:`, `https:`, `mailto:`, `#ancla` y rutas absolutas.
- `estado-propuesta` (sólo con `--exigir-propuesta`): en las primeras 12 líneas debe
  haber una línea con `Estado` y `Propuesta`/`Propuesto`/`propuesta`.
- `marcador-prohibido`: `TU_URL`, `lorem ipsum`, `USD`, `US$` y `$` seguido de dígito.
  Una cita que deba mencionarlos va en código en línea.

Las reglas `enlace-roto` y `marcador-prohibido` ignoran bloques cercados (``` o ~~~)
y spans de código en línea.

## API y pruebas

`verificarTexto(texto, { ruta, existe, exigirPropuesta })` devuelve `[{ linea, regla, detalle }]`;
`existe` es inyectable. Pruebas: `node --test herramientas/verificar-docs/`.
