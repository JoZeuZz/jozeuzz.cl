# Batería de contrato H0-a

Pruebas de caja negra, independientes del framework, para las decisiones H0A-02 a H0A-07
(`docs/REGISTRO-DECISIONES-H0A.md`) y la separación público/privado de POC-1a. Cada POC
implementa un *driver*; la batería lo juzga. Sólo Node 20 nativo (`node:test`, `node:assert/strict`).
Datos sintéticos (`SNT-…`, correos `example.invalid`).

## Ejecutar

```
node --test contrato/test/                                   # autoverificación (oráculo + 23 mutantes + CLI)
node contrato/run.mjs --driver <ruta/al/driver.mjs>          # batería contra un driver
node contrato/run.mjs --driver ... --solo ES-05,MO-01 --json
node contrato/run.mjs --driver ... --alcance poc-1a         # sólo exige el alcance indicado
```

Salida: una línea por caso, mediciones y `casos N · ok N · fail N`. Código 0 si todo pasa,
1 si falla alguno, 2 si falta `--driver` o no se puede cargar. `CONTRATO_TIMEOUT_PROPAGACION_MS`
(300000 por defecto) fija el máximo de espera de CO-05; el objetivo de 60 s sólo se informa.

## Interfaz del driver

Detalle normativo en `driver.mjs` (`assertDriverShape` valida la forma). El módulo exporta por
defecto `async function crearDriver()` y devuelve: `nombre`, `reset(semilla)` → Refs
(`CLAVES_REFS` en `fixture.mjs`), `canalesPublicos[]` (todos los canales anónimos de lectura),
`canalesEscritura[]` (todos los genéricos), `iniciarSesion()`, `sesionAnonima`, `sesionInvalida`,
`intake{limite{max},preparar,enviar}`, `admin(sesion)` y `logs()`. El juicio (denegado, rechazo,
aceptado, expuesto) vive en `juicio.mjs`; el driver nunca decide si algo pasa.

## Estructura

`fixture.mjs` semilla y centinelas · `juicio.mjs` · `runner.mjs` (`runCases`, sin `node:test`) ·
`casos/` (`util.mjs` ayudas) · `referencia/` oráculo en memoria (NO es código de producto),
`mutantes.mjs` (22) y `mutante-cli.mjs` · `test/`.

## Alcance

Cada caso declara `alcance` (`poc-1a`, `poc-1b`, `poc-3`). Con `--alcance X`, un driver que lanza
`NoImplementado` (`errores.mjs`) en un caso de `X` falla; fuera de `X` el caso se lista como
`pendiente`. Un fallo real nunca se oculta. Sin `--alcance`, `NoImplementado` es fallo.
`assertDriverShape` exige canales `html`, `api`, `medio` y `sitemap`, y que cada tipo de canal esté
en `canalesPublicos`, en `canalesCerrados` o en `noAplica` (justificación impresa por la CLI).

## Casos (56)

- **IN** intake: 01 válido sin eco · 02 servicio activo · 03 inactivo · 04 inexistente · 05 obligatorios ·
  06 tipos · 07 64 KiB · 08 campos administrativos · 09 doble envío · 10 dos envíos · 11 límite por origen · 12 logs.
- **ES** estados: 01–03 válidas · 04–08 inválidas · 09 desconocido · 10 canales genéricos · 11 filtro por estado.
- **MO** motivos: 01 sin motivo · 02 fuera de lista · 03 los 4 motivos · 04 motivo en transición abierta · 05 filtro.
- **AU** autorización: 01 anónima · 02 inválida · 03 admin (positivo) · 04 canales de escritura anónimos ·
  05–07 (poc-1a) lo mismo sobre contenido, sin eventos.
- **PR** privacidad: 01 solicitudes · 02 observaciones · 03 eventos · 04 medios · 05 logs admin · 06 barrido · 07 barrido de la semilla (poc-1a).
- **EV** eventos: 01 creación sin evento · 02 un evento por transición · 03 rechazada sin evento ·
  04 atomicidad · 05 inmutabilidad · 06 orden y actor.
- **CO** contenido: 01 publicado · 02 borrador ≡ inexistente · 03 servicios · 04 sitemap ·
  05 propagación · 06 retirar sin borrar · 07 medio privado ≡ inexistente.

- **CA** canales: 02 canales cerrados (GraphQL) sin 2xx ni centinelas, con sondeo propio si hay `baseUrl`.

## Notas

- Un canal que no soporta un objetivo debe responder 404/405 sin datos privados.
- Los límites exactos de validación (p. ej. longitud de `descripcion`) los fija cada POC; 64 KiB debe superarlos.
- Los mutantes son opciones del oráculo; `mutantes.test.mjs` exige que cada uno falle algún caso de `detectadoPor`.
