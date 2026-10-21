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
- Sale con 2 (aviso por stderr) si una entrada explícita no aporta ningún `.md`
  (enlace simbólico rechazado, ruta fuera del directorio de trabajo, archivo que no es
  `.md`, directorio vacío), si el total de archivos es 0 o si un archivo no se puede leer.
- Evita ciclos y duplicados mediante el `realpath` de lo ya visitado.

## Reglas

- `enlace-roto`: enlaces `[texto](destino)` relativos (con ancla, título o `%20`)
  cuyo destino no existe. Se ignoran `http:`, `https:`, `mailto:`, `#ancla` y rutas absolutas.
- `estado-propuesta` (sólo con `--exigir-propuesta`): en las primeras 12 líneas debe
  haber una línea con `Estado` y `Propuesta`/`Propuesto`/`propuesta`.
- `marcador-prohibido`: `TU_URL`, `lorem ipsum`, `USD`, `US$` y `$` seguido de dígito.
  Una cita que deba mencionarlos va en código en línea.

Las reglas `enlace-roto` y `marcador-prohibido` ignoran bloques cercados (``` o ~~~,
también tras sangría o `>`; el cierre exige al menos la longitud de la apertura) y spans
de código en línea (racha exacta de backticks). Las imágenes `![alt](x.png)` se verifican
como enlaces.

## Límites conocidos (no implementados)

- Títulos con comillas simples o paréntesis, y destinos con paréntesis, no se interpretan.
- Los enlaces de referencia `[x]: ruta` no se verifican.
- `USD` se busca sin distinguir mayúsculas (decisión: se mantiene `/i`).
- `Estado` se busca en las líneas crudas, sin quitar el markdown ni el código.
- La invocación mediante un enlace simbólico al script no se reconoce como ejecución directa.

## API y pruebas

`verificarTexto(texto, { ruta, existe, exigirPropuesta })` devuelve `[{ linea, regla, detalle }]`;
`existe` es inyectable. Pruebas (Node 20 y 24):
`node --test herramientas/verificar-docs/verificar-docs.test.mjs`.
