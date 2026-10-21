# Verificador de contraste WCAG

Verifica la paleta de las direcciones visuales (H0-b). No es parte del
producto. Sólo módulos integrados de Node (probada en Node 20.19.2; compatible
por diseño con 24, sin verificar). No escribe archivos.
Pruebas: `node --test herramientas/contraste/contraste.test.mjs`.

## Uso

    node herramientas/contraste/contraste.mjs <archivo.json>...

Por par: `archivo: primero/fondo razón=X.XX nivel=N OK|FALLA uso`; por archivo,
`archivo (nombre): N pares, M fallos`; al final, `contraste: N pares, M fallos`.
Salida: 0 sin fallos, 1 con fallos, 2 uso o validación inválidos (incluye
`"pares": []`). Con varios archivos, uno inválido da 2 sin salida parcial.

## Entrada

    { "nombre": "...", "colores": { "<token>": "#hex" },
      "pares": [ { "primero": "<token>", "fondo": "<token>",
                   "nivel": "texto", "uso": "descripción" } ] }

Colores `#rgb` o `#rrggbb`, sin distinguir mayúsculas. Sin alfa: un color con
alfa no tiene contraste definido sin conocer el fondo.

## Niveles

| nivel              | mínimo | criterio WCAG |
|--------------------|--------|---------------|
| `texto`            | 4.5    | 1.4.3 (AA)    |
| `texto-grande`     | 3      | 1.4.3 (AA)    |
| `ui`               | 3      | 1.4.11 (AA)   |
| `texto-aaa`        | 7      | 1.4.6 (AAA)   |
| `texto-grande-aaa` | 4.5    | 1.4.6 (AAA)   |

Texto grande: >= 18 pt, o >= 14 pt en negrita (≈ 24 px y ≈ 18,66 px).
1.4.3 exceptúa componentes inactivos, texto decorativo y logotipos.

## Notas de cálculo

- La razón se muestra con 2 decimales, pero la decisión usa el valor sin
  redondear: 4.4999 se muestra 4.50 y no cumple 4.5.
- Luminancia con sRGB linealizado y umbral 0.04045. WCAG 2.x publicó
  históricamente 0.03928; no afecta a colores de 8 bits, pues ningún valor
  entero 0-255 cae entre ambos umbrales.
