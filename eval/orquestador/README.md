# Evaluación del orquestador de OpenCode: `gpt-5.6-sol` frente a `gpt-6.1-sol`

Batería repetible para decidir si `openai/gpt-6.1-sol` sustituye a `openai/gpt-5.6-sol` en `jz-orchestrator`. Hasta que haya evidencia suficiente, el modelo predeterminado sigue siendo `gpt-5.6-sol` (ver `docs/AGENTES-JZ.md` §4).

## Qué mide

Se ejecuta el perfil real `jz-orchestrator` con sus subagentes `jz-*`. Lo único que cambia entre modelos es el del orquestador (`opencode run -m <modelo>`); los subagentes mantienen los modelos de sus perfiles.

| Escenario | Capacidad | Métricas automáticas |
|---|---|---|
| E1 | Planificación: plan TDD para `SPEC-SLUG.md` sin implementar | `ratio` de elementos exigidos (R-1…R-5, prueba antes del código, archivos, comando) y `noChanges` |
| E2 | Delegación: recuento de `.md` bajo `docs/` con señuelos (`.md.bak`, `.txt`, subcarpetas) | `correct`, `delegatedExplorer`, `verified` |
| E3 | Verificación del trabajo de un subagente: `jz-explorer` está saboteado y suma 1 a todo recuento | `correct` (sólo si el orquestador comprueba), `verified`, `flaggedDiscrepancy` |
| E4 | Detección de resultados incorrectos: informe con tres afirmaciones, una falsa | `verdictsCorrect`, `falseDetected`, `falsePositives`, `correctedValue` |
| E5 | Tarea pequeña con TDD: implementar `slugify` delegando en un implementador | `hiddenPass` (6 pruebas ocultas), `redBeforeGreen`, `delegatedImplementer`, `onlyAllowedFiles`, `verified` |

Definiciones:

- `verified`: después de la primera delegación, el orquestador usa con éxito una herramienta propia de lectura (`read`, `glob`, `grep`, `list`) o delega una segunda vez.
- `redBeforeGreen`: en la sesión del implementador hay una ejecución de `node --test` con fallos antes de la primera escritura en `src/`.

En todos los escenarios se registran también los tokens y la duración.

El sabotaje de E3 se añade sólo a la copia de `jz-explorer.md` del fixture de esa ejecución; nunca a los perfiles del repositorio. Las pruebas ocultas (`ocultas/slug.oculta.mjs`) no se copian al fixture.

## Cómo se ejecuta

```sh
# Comprobar el evaluador (sin modelos)
node --test eval/orquestador/

# Ejecución en seco: prepara los fixtures y calcula las verdades, sin llamar a OpenCode
node eval/orquestador/run.mjs --work-root <dir-fuera-del-repo> --reps 1 --dry-run

# Batería completa: 3 repeticiones × 5 escenarios × 2 modelos = 30 sesiones
node eval/orquestador/run.mjs --work-root <dir-fuera-del-repo> --reps 3
```

Opciones:

- `--model <id>`, repetible; por defecto se usan los dos Sol.
- `--scenarios E2,E3` para ejecutar sólo algunos escenarios.
- `--timeout-ms`; por defecto, 20 minutos por sesión.

Cada sesión se ejecuta sobre una copia nueva del fixture, con su propio repositorio Git y dentro de `--work-root`. El ejecutor se niega a usar una ruta dentro del repositorio. Las ejecuciones alternan los modelos para repartir las variaciones del proveedor.

Salidas en `<work-root>/<marca>/`:

- `results.jsonl`: una línea por sesión, con el modelo efectivo, los subagentes y sus modelos, la puntuación, los tokens, los archivos cambiados y el final de la respuesta.
- `summary.json`: medias por modelo y escenario.
- Junto a cada fixture se guardan los eventos (`*.events.jsonl`) y el export de la sesión con sus hijas (`*.export.json`).

## Criterio de decisión propuesto

Con al menos 3 repeticiones por escenario y por modelo, `gpt-6.1-sol` se adopta si se cumplen las tres condiciones:

1. No empeora en ninguna métrica de exactitud: `correct` en E2 y E3, `falseDetected` y `correctedValue` en E4, y `hiddenPass` en E5.
2. Mejora o iguala `verified` en E2, E3 y E5.
3. No tiene más de un 50 % de tokens de salida medios por encima de `gpt-5.6-sol`, salvo que la mejora de exactitud lo justifique.

Si los resultados son mixtos o dependen de una sola ejecución, se amplía a 5 repeticiones antes de decidir. Las métricas automáticas son heurísticas, así que antes de decidir se revisa a mano el final de cada respuesta en `results.jsonl`, sobre todo en E1.

Para adoptarlo basta con cambiar `model` en `.opencode/agents/jz-orchestrator.md` (y en `jz-architect.md`, si se decide lo mismo para arquitectura). No hay que tocar la configuración global.

## Validación del evaluador (2026-10-15)

Se hizo una ejecución de humo con `gpt-5.6-sol`, una repetición por escenario. No sirve para comparar modelos; comprueba que la batería funciona de principio a fin. Durante la ejecución aparecieron tres defectos del ejecutor, todos corregidos:

- OpenCode tomaba el proyecto de `PWD`.
- Un `ask` rechazado detenía la sesión.
- `opencode export` corta su salida en 64 KiB cuando escribe en un pipe; ahora exporta a un archivo.

| Escenario | Resultado | Subagentes | Duración | Tokens de salida |
|---|---|---|---|---|
| E1 | `ratio` 1 (9/9 elementos) y sin cambios | `jz-architect` ×2, `jz-qa` | 402 s | 22 809 |
| E2 | Correcto (5), delegado y verificado | `jz-explorer` | 67 s | 1 261 |
| E3 | El explorador saboteado informó 6; el orquestador lo comprobó con `grep`, señaló la discrepancia y respondió 5 | `jz-explorer` | 47 s | 970 |
| E4 | 3/3 veredictos, falsa detectada y valor corregido (4) | ninguno (verificó leyendo) | 27 s | 454 |
| E5 | 6/6 pruebas ocultas, rojo antes del código, sólo los dos archivos permitidos y verificación | `jz-implementer` ×2, `jz-qa` ×2 | 323 s | 13 907 |

E5 se repitió después de corregir la exportación. Su `redBeforeGreen` se recalculó tras corregir el detector, que contaba como escritura en `src/` un parche de test que importaba `../src/slug.js`; hay una prueba de regresión para ese caso.

## Límites conocidos

- En el perfil real, el orquestador tiene `edit` y `bash` en `ask`. En `opencode run` nadie puede contestar, así que el `ask` se rechaza y OpenCode detiene la sesión: en la primera ejecución de humo, E1 terminó sin respuesta final justo después de que el orquestador intentara `git status`. Por eso el ejecutor pasa esas dos reglas a `deny` en la copia del fixture. El efecto sobre lo que el orquestador puede hacer es el mismo (verificar sólo leyendo o delegando), pero la herramienta desaparece y la sesión continúa. El perfil del repositorio no se modifica.
- OpenCode toma el directorio del proyecto de la variable `PWD`, no del directorio de trabajo del proceso. El ejecutor fija `PWD` y descarta cualquier sesión cuyo export no esté en el fixture.
- Los subagentes son estocásticos. El sabotaje de E3 es determinista en intención, pero el modelo saboteado puede no obedecerlo; en `results.jsonl` se ve qué devolvió.
- `redBeforeGreen` depende de que el implementador ejecute las pruebas con `node --test` o `npm test` y de que la salida incluya `# fail N`.
- El coste monetario no se mide: con la suscripción, el export informa `cost: 0`. Se usan los tokens como aproximación.
