# Especificación técnica — `jz-ai` M0: inventario y diagnóstico de solo lectura

> Estado: **REVISADA** (OpenCode/OpenAI y OpenCode/Copilot; correcciones en §16). Fecha: 2026-10-14. Issue: [#6](https://github.com/JoZeuZz/jozeuzz.cl/issues/6). Decisión de arquitectura: [ADR 0002](../../adr/0002-jz-ai-m0-cli-solo-lectura.md).
> Rama: `feat/jz-ai-m0` (desde `main` 4946aa4). Worktree: `/home/proyectos/jozeuzz-jz-ai-m0`.

## 1. Contexto y dependencias documentales

`main` sólo contiene `README.md`. Las instrucciones vigentes del proyecto (`AGENTS.md`, `CLAUDE.md`, `docs/AGENTES.md`) y los documentos de los que depende este incremento (`docs/AUDITORIA-SKILLS-LOCALES.md`, `docs/ORQUESTACION-IA-PROPUESTA.md`, `docs/AI-BOOTSTRAP-DEBIAN.md`) existen únicamente en la rama `docs/fase-0-definicion` (PR #1, borrador).

Durante la implementación:

- Las instrucciones se leen desde el worktree documental `/home/proyectos/jozeuzz` (rama `docs/fase-0-definicion`, commit `e763b95` o posterior). Ese worktree no se modifica desde esta rama.
- Esta rama no copia ni cherry-pickea documentos de la PR #1. Los enlaces relativos hacia `docs/AUDITORIA-SKILLS-LOCALES.md` y similares quedarán rotos en esta rama hasta que la PR #1 se fusione en `main`.
- La PR de M0 **no se fusiona** hasta resolver la PR #1 (fusión o decisión explícita del responsable). Ambas PR no comparten archivos, por lo que el orden de fusión no genera conflictos de contenido.
- `jozeuzz.cl` sigue en Fase 0 para el producto. `jz-ai` es herramienta de desarrollo, no scaffold de la aplicación web; la ADR 0002 registra esa distinción. `docs/adr/0001-stack.md` queda reservado para la arquitectura de la aplicación.

## 2. Objetivo

Proporcionar dos comandos locales, deterministas y de solo lectura que den evidencia verificable sobre el entorno de agentes antes de construir el plano de control:

- `jz-ai doctor`: estado de herramientas, repositorio, configuraciones (sólo metadata) y entorno.
- `jz-ai skills`: inventario de manifiestos `SKILL.md`, procedencia, symlinks, duplicados y divergencias.

## 3. Alcance y no alcance

**Dentro:** `doctor`, `doctor --json`, `skills`, `skills --json`, `--help`, `--version`; ADR 0002; pruebas `node:test`; README de la herramienta.

**Fuera:** `dispatch`, `status` de tareas, locks y leases, `handoff`, `resume`, `review`, `council`, `bench`, selección de modelos, compresión Caveman, CI, despliegues, POC Next/Payload, cualquier operación de red y cualquier ejecución de Claude Code u OpenCode.

## 4. Invariantes de seguridad

Estas reglas son requisitos, no recomendaciones. Cada una tiene al menos una prueba dinámica (sección 11); las comprobaciones estáticas son una capa adicional, nunca la única garantía.

1. **Sin escrituras.** El proceso no crea, modifica, renombra ni borra archivos. Salida únicamente por stdout y stderr.
2. **Sin red.** No hay código de red. No existe opción para habilitarla.
3. **Sin ejecución de código inspeccionado.** No se ejecuta, importa ni evalúa `SKILL.md`, scripts de skills, hooks, plugins, configuración de Caveman ni JavaScript externo a `tools/jz-ai/`.
4. **Ejecución de procesos limitada a `git`.** Sólo `/usr/bin/git` validado (sección 10.1), con argumentos de una lista cerrada, mediante `execFile` sin shell y sin heredar `PATH`. Claude Code y OpenCode **nunca** se ejecutan en M0.
5. **Sin lectura de secretos.** El contenido de archivos de autenticación y de configuraciones potencialmente sensibles no se lee nunca. La sensibilidad depende de la naturaleza del archivo, no de sus permisos (sección 8).
6. **Lecturas de contenido acotadas.** Sólo se lee el contenido de: `SKILL.md` dentro de raíces autorizadas, `~/.agents/.skill-lock.json` y `~/.claude/plugins/installed_plugins.json`. Todo lo demás es metadata (`lstat`).
7. **Recorrido acotado.** No se recorren directorios a través de symlinks salvo en el caso de entradas de skill (sección 6.3), con resolución canónica y verificación de pertenencia a una raíz autorizada.
8. **Sin modificación de configuración global** ni de `main`.

El proceso se ejecuta como root por decisión del operador. Estas invariantes son controles del código; **no equivalen a un sandbox** del sistema operativo.

## 5. Interfaz de línea de comandos

```text
jz-ai doctor [--json]
jz-ai skills [--json]
jz-ai doctor --help
jz-ai skills --help
jz-ai --help
jz-ai --version
```

Ejecución: `node tools/jz-ai/bin/jz-ai.js <comando>`. No se instala globalmente ni se usa `npm link`.

Las opciones desconocidas, los argumentos posicionales sobrantes y la ausencia de comando son errores de uso. No hay opción `--offline`: el funcionamiento es siempre local.

Reglas de ayuda y versión (lista cerrada de formas válidas):

- `jz-ai --help`, `jz-ai doctor --help` y `jz-ai skills --help`: imprimen `USAGE` en stdout, código 0 y **no inspeccionan nada** (no se crea contexto ni se ejecuta `git`). La ayuda es la misma para los tres casos.
- `jz-ai --version`: sólo como único argumento; imprime `jz-ai <versión>` y código 0.
- Cualquier otra combinación es ambigua o inválida: código 2, `USAGE` en stderr y nada en stdout. Ejemplos: `--help --json`, `skills --help --json`, `skills --json --help`, `--help skills`, `nada --help`, `skills --version`, `--help --version`, `--version --version`. No hay forma corta `-h`.

Los mensajes de uso son fijos y en español; no reproducen el texto de error de `parseArgs`.

### 5.1 Códigos de salida

| Código | Significado |
|---|---|
| `0` | Resultado completo sin hallazgos de severidad `error`. Puede haber `warn` e `info`. |
| `1` | Resultado emitido pero parcial, o con al menos un hallazgo o check de severidad `error`. |
| `2` | Uso inválido. No se inspecciona nada. |
| `3` | Fallo interno inesperado. Se emite un documento de error con `completeness: "failed"` (sección 7.4). |

### 5.2 Salida de texto

- stdout contiene el resultado; stderr sólo mensajes de uso y fallos internos.
- Sin color ni secuencias ANSI. Todo texto procedente del sistema de archivos o de manifiestos se sanea (sección 9).
- Las rutas bajo `HOME` se abrevian con `~`.
- Las tablas usan columnas separadas por un tabulador con una cabecera, para que `cut -f` y `awk -F'\t'` funcionen. Las líneas de resumen y de hallazgos tienen formato fijo.
- `skills` imprime siempre: `Nota: la presencia de un manifiesto no implica que el host cargue la skill.`

Ejemplo ilustrativo de `skills` (valores abreviados; `PLUGIN` y `PATHS` recortados):

```text
jz-ai skills: 6 raíces (4 presentes), 129 manifiestos, 104 nombres, estado completo
Nota: la presencia de un manifiesto no implica que el host cargue la skill.

NAME	HOST	ROOT	SHA256	LINK	PLUGIN	PATH
caveman	agents	agents	fec5718a	-	-	~/.agents/skills/caveman/SKILL.md
caveman	claude	claude-plugins	daf9cec4	-	caveman@caveman 7066cc815414 installed=yes enabled=unknown loaded=unverified	~/.claude/plugins/cache/caveman/caveman/7066cc815414/skills/caveman/SKILL.md
caveman	claude	claude-user	fec5718a	~/.agents/skills/caveman	-	~/.claude/skills/caveman/SKILL.md
caveman	opencode	opencode-user	e38ec671	-	-	~/.config/opencode/skills/caveman/SKILL.md

SEVERITY	CODE	SUBJECT	MESSAGE	PATHS
warn	NAME_COLLISION_DIVERGENT	caveman	3 variantes de contenido: daf9cec4, e38ec671, fec5718a. El mismo nombre no implica que el host cargue la misma skill.	~/.agents/skills/caveman/SKILL.md …
info	SAME_REALPATH	caveman	Las entradas resuelven al mismo archivo canónico.	~/.agents/skills/caveman/SKILL.md ~/.claude/skills/caveman/SKILL.md

resumen: info=10 warn=5 error=0
```

Los mensajes no contienen rutas absolutas; las rutas van en la columna `PATHS` (o en `paths` en JSON).

## 6. `jz-ai skills`

### 6.1 Raíces

Todas se derivan de `HOME` (variable de entorno) y del directorio raíz del repositorio detectado desde el directorio de trabajo, sin ejecutar procesos: se busca hacia arriba un `.git` con `lstat`.

| `id` | Ruta | `host` | Disposición |
|---|---|---|---|
| `claude-user` | `~/.claude/skills` | `claude` | entradas = hijos directos |
| `claude-plugins` | `~/.claude/plugins/cache` | `claude` | `<marketplace>/<plugin>/<version>/…/SKILL.md` |
| `agents` | `~/.agents/skills` | `agents` | entradas = hijos directos |
| `opencode-user` | `~/.config/opencode/skills` | `opencode` | entradas = hijos directos |
| `project-claude` | `<repo>/.claude/skills` | `claude` | entradas = hijos directos |
| `project-opencode` | `<repo>/.opencode/skills` | `opencode` | entradas = hijos directos |

`host: agents` significa que la ruta es compartida y que no está comprobado qué host la descubre (hipótesis H1 de la auditoría).

Excluidos: `~/.claude/plugins/marketplaces` (clones fuente que el host no carga directamente), cualquier directorio `node_modules` y `.git`.

El **conjunto autorizado** es la lista de rutas canónicas (`realpath`) de las raíces existentes. Una raíz ausente no forma parte del conjunto.

### 6.2 Recorrido

- Raíces con entradas directas: se listan los hijos de la raíz. Cada hijo que sea directorio, o symlink de entrada válido (6.3), se trata como skill si contiene `SKILL.md`. No se busca más profundo.
- `claude-plugins`: búsqueda de `SKILL.md` en directorios de hasta 12 niveles bajo la raíz (el host tiene hoy un máximo de 8), usando `lstat`. Un directorio más profundo produce `LIMIT_REACHED` (error) y `completeness: partial`. Los symlinks dentro de esta raíz **no se siguen**; se reportan con `SYMLINK_NOT_FOLLOWED` (info).
- **Presupuesto de descubrimiento:** como máximo 20 000 entradas de directorio inspeccionadas para encontrar manifiestos (hijos de raíces de entradas y recorrido de `claude-plugins`). Superarlo produce un único `LIMIT_REACHED` (error) y `completeness: partial`.
- **Recuento de hermanos (separado):** en el directorio de cada skill se cuentan archivos hasta 3 niveles y como máximo 1 000 entradas **por skill**. Este recuento no consume el presupuesto de descubrimiento. Si se alcanza el tope, `siblingFiles` es una cota inferior, `scriptLike` puede ser un falso negativo y se emite `SIBLINGS_TRUNCATED` (info); no afecta `completeness`.
- El orden de lectura de directorios se normaliza por nombre (comparación por unidades de código) para que el resultado no dependa del sistema de archivos.
- **Enumeración acotada:** ningún directorio se enumera completo. Cada lectura materializa como máximo el presupuesto restante más una entrada (los nombres excluidos y, en el recuento de hermanos, el propio `SKILL.md` no cuentan). Si el directorio tiene más entradas que el presupuesto restante, no se procesa ninguna de ellas, porque un subconjunto dependería del orden del sistema de archivos: en descubrimiento se emite `LIMIT_REACHED` con la ruta del directorio; en hermanos, `SIBLINGS_TRUNCATED`. Si cabe, se ordena y se procesa en orden hasta agotar el presupuesto. Agotar un presupuesto es terminal: no se abren más directorios con cargo a él, incluidas raíces posteriores. Si el presupuesto restante es cero y queda un directorio por enumerar, no se abre: como su contenido queda sin verificar, aunque pudiera estar vacío, en descubrimiento se emite el único `LIMIT_REACHED` con la ruta de ese directorio (`completeness: partial`) y en hermanos `SIBLINGS_TRUNCATED`. Si al agotarse el presupuesto no queda ningún directorio pendiente, el resultado no se marca como parcial. El descriptor de directorio se cierra siempre, también ante errores.

### 6.3 Symlinks de entrada de skill

Caso real: `~/.claude/skills/caveman -> ../../.agents/skills/caveman`.

Para cada hijo directo que sea symlink:

1. Resolver la ruta canónica con `realpath`. Si falla con `ENOENT`, `BROKEN_LINK` (warn). Si falla con `ELOOP`, `LINK_CYCLE` (warn).
2. Si la ruta canónica no está dentro del conjunto autorizado, `LINK_OUTSIDE_ROOTS` (warn) y no se lee nada en ella.
3. Si la ruta canónica es la propia raíz, un ancestro de la entrada o una raíz completa (no un directorio de skill), `LINK_CYCLE` (warn) y no se lee.
4. Si la ruta canónica no es un directorio, `ENTRY_NOT_DIRECTORY` (warn).
5. En otro caso se lee `<canónica>/SKILL.md` (6.4) y el registro guarda `entryPath` (ruta vía enlace), `realPath` y `linkTarget`. No se recorre nada más dentro del destino.

Un `SKILL.md` que sea symlink de archivo se resuelve igual: su ruta canónica debe estar dentro del conjunto autorizado, llamarse `SKILL.md` y no coincidir con una regla de sensibilidad (sección 8). Si no, `LINK_OUTSIDE_ROOTS` o `SENSITIVE_PATH_SKIPPED`.

### 6.4 Lectura de `SKILL.md`

- `lstat` previo; sólo archivos regulares.
- Apertura con `O_RDONLY | O_NOFOLLOW | O_NONBLOCK` sobre la ruta canónica y verificación con `fstat` de que es un archivo regular. Un FIFO o dispositivo nunca bloquea el proceso.
- Tamaño máximo 256 KiB. Si se supera: `TOO_LARGE` (warn); el registro aparece sin hash ni frontmatter.
- SHA-256 de los bytes completos del archivo.
- Tras calcular el hash sólo se conservan en memoria los primeros 8 KiB (región de frontmatter). El contenido completo nunca forma parte del documento ni de los registros (sección 7).
- En el directorio de la skill se cuentan los archivos hermanos con `lstat` (sin leerlos) y se marca `scriptLike` si alguno tiene extensión `.js .cjs .mjs .ts .sh .bash .py .rb .pl` o bit de ejecución (límites en 6.2).

### 6.5 Frontmatter

Analizador mínimo, sin dependencias y sin interpretar YAML general:

- Opera sobre los **bytes** del archivo. Acepta BOM UTF-8 y finales CRLF.
- Requiere `---` en la primera línea y una línea de cierre `---` terminada en `\n` (o en el fin del archivo) cuyo último byte esté dentro de los primeros 8 192 bytes del archivo. El límite cuenta los bytes reales: BOM (3 bytes), `\r` y `\n` incluidos.
- La región entre delimitadores se decodifica como UTF-8 estricto; bytes no UTF-8 en esa región producen el problema `invalid-utf8`. Los bytes no UTF-8 en el cuerpo no se examinan (sólo se hashean).
- Sólo interpreta líneas de primer nivel `clave: valor` con valor escalar (sin comillas, con comillas simples o dobles). Ignora el resto sin error.
- Extrae `name` y `description`. `description` sólo aparece en JSON, recortada a 1 KiB; la salida de texto no la muestra.
- Si no hay frontmatter válido o falta `name`, el nombre es el del directorio de la skill, `nameSource: "directory"` y se emite `MANIFEST_INVALID` (warn) con el motivo (`missing-opening-delimiter`, `missing-closing-delimiter`, `invalid-utf8` o `missing-name`).
- Si `name` no coincide con el nombre del directorio: `MANIFEST_NAME_MISMATCH` (info).

### 6.6 Procedencia

**`~/.agents/.skill-lock.json`** (máx. 1 MiB). Se usa `skills.<name>` con lista blanca de campos: `source`, `sourceType`, `sourceUrl`, `skillPath`, `skillFolderHash`, `installedAt`, `updatedAt`. Los campos no listados se descartan. Las credenciales en URL (`https://usuario:token@host`) se reemplazan por `https://[redacted]@host`. Se asocia a los registros cuya ruta canónica está en `~/.agents/skills/<name>/`. `skillFolderHash` se reporta pero **no se verifica**.

**`~/.claude/plugins/installed_plugins.json`** (máx. 1 MiB). Se usa `plugins."<plugin>@<marketplace>"[]` con lista blanca: `scope`, `installPath`, `version`, `gitCommitSha`, `installedAt`, `lastUpdated`.

Estados de un plugin, separados explícitamente:

| Campo | Valores | Fuente en M0 |
|---|---|---|
| `installed` | `yes`, `no`, `unknown` | `installPath` se valida y se resuelve tal como figura en el JSON, sin sanear: el saneamiento (§9) sólo se aplica a los campos publicables y podría convertir una ruta inválida en otra válida. `yes` si el `realpath` de algún `installPath` absoluto del registro es igual al directorio de versión en caché, también canónico (`<raíz canónica>/<marketplace>/<plugin>/<versión>`). `realpath` es metadata: no abre el destino. Un `installPath` relativo, inexistente o no resoluble (`realpath` falla con `ENOENT`, `ENOTDIR` o `ELOOP`) no coincide. Si `realpath` falla con otro error (por ejemplo `EACCES`), la entrada no es verificable y se emite `PROVENANCE_INVALID` (warn) una vez por plugin, citando sólo el plugin y el código de error. `no` si el registro existe, nada coincide y todas sus entradas son verificables (versión obsoleta en caché, `PLUGIN_CACHE_NOT_INSTALLED`, info); `unknown` si el registro falta o es inválido, o si nada coincide y alguna entrada no es verificable. Tampoco son verificables, y por tanto nunca prueban ausencia: un valor de plugin que no es array, un array vacío, una entrada que no es objeto, un `installPath` ausente, vacío o que no es cadena, y un `installPath` malformado (contiene `U+0000`, que ninguna ruta POSIX admite; el mensaje usa el texto fijo «installPath malformado»). Otros caracteres de control sí son válidos en una ruta: la ruta original se resuelve sin modificarla y, si no existe, no coincide; cada plugin con alguna entrada no verificable produce un único `PROVENANCE_INVALID` (warn). Una coincidencia válida conserva prioridad (`yes`) frente a entradas no verificables del mismo plugin. `installPath` no se publica, y el identificador de plugin del registro sólo aparece en mensajes si tiene la forma `<nombre>@<marketplace>` con caracteres `[A-Za-z0-9._-]` (máx. 128 por parte); si no, el mensaje usa un texto fijo. |
| `enabled` | siempre `unknown` | La habilitación se declara en `~/.claude/settings.json`, que puede contener variables de entorno con credenciales; no se lee (sección 8). |
| `loaded` | siempre `unverified` | Sólo el host en ejecución sabe qué carga. |

Un archivo de procedencia ausente no es error. Uno ilegible, mayor que el límite o con JSON inválido produce `PROVENANCE_INVALID` (warn) y el inventario continúa sin esa procedencia.

### 6.7 Análisis

- **Agrupación por nombre** (`name` efectivo). Estados del grupo:
  - `single`: un solo archivo canónico.
  - `aliased`: varias entradas, una sola ruta canónica (`SAME_REALPATH`, info).
  - `identical`: varias rutas canónicas, un solo SHA-256 (`NAME_COLLISION_IDENTICAL`, info).
  - `divergent`: más de un SHA-256 (`NAME_COLLISION_DIVERGENT`, warn), con la lista de variantes.
  - `undetermined`: varias rutas canónicas, a lo sumo un SHA-256 conocido y alguna entrada sin hash; no se puede afirmar si son idénticas.
- Las entradas sin hash (ilegibles o demasiado grandes) se listan en el grupo con `sha256: null` y hacen que el grupo se marque `incomplete: true`.
- El nombre de plugin (`plugin:skill` en Claude Code) se reporta en `plugin`, pero la colisión se calcula por el nombre del frontmatter: dos skills con el mismo nombre en espacios distintos siguen siendo relevantes para el operador. El mensaje lo aclara.
- Todos los registros llevan `availability: "unverified"`.

### 6.8 Catálogo de códigos de hallazgo

| Código | Severidad | Afecta `completeness` |
|---|---|---|
| `HOME_UNSET` | error | sí |
| `LIMIT_REACHED` | error | sí |
| `UNREADABLE` | warn | sí |
| `ROOT_MISSING` | info | no |
| `ROOT_NOT_DIRECTORY` | warn | no |
| `BROKEN_LINK` | warn | no |
| `LINK_CYCLE` | warn | no |
| `LINK_OUTSIDE_ROOTS` | warn | no |
| `ENTRY_NOT_DIRECTORY` | warn | no |
| `ENTRY_NOT_FILE` | warn | no |
| `SENSITIVE_PATH_SKIPPED` | warn | no |
| `SYMLINK_NOT_FOLLOWED` | info | no |
| `SIBLINGS_TRUNCATED` | info | no |
| `TOO_LARGE` | warn | no |
| `MANIFEST_INVALID` | warn | no |
| `MANIFEST_NAME_MISMATCH` | info | no |
| `NAME_COLLISION_DIVERGENT` | warn | no |
| `NAME_COLLISION_IDENTICAL` | info | no |
| `SAME_REALPATH` | info | no |
| `PLUGIN_CACHE_NOT_INSTALLED` | info | no |
| `PROVENANCE_INVALID` | warn | no |

Esta tabla es la fuente de verdad. El código la replica en un catálogo único (`findings.js`) del que el constructor de hallazgos toma la severidad; una prueba compara ambos y otra exige un código conocido. Cada código tiene al menos una prueba que lo produce.

## 7. Esquemas JSON

Reglas comunes:

- `schemaVersion: 1`. Añadir campos opcionales no cambia la versión; eliminar o cambiar el significado de un campo sí.
- Claves en el orden documentado (no alfabético) para facilitar la lectura; el orden es fijo y forma parte del contrato.
- Arrays ordenados por reglas explícitas indicadas en cada sección; comparación por unidades de código, nunca por locale.
- Sin marcas de tiempo de ejecución ni duraciones. Dos ejecuciones sobre el mismo estado producen bytes idénticos.
- Rutas absolutas y sin abreviar (saneadas según la sección 9). Tri-estados como cadenas (`yes`/`no`/`unknown`), nunca `null` ambiguo.
- `completeness` toma exactamente uno de tres valores:
  - `complete`: se inspeccionó todo lo que el comando cubre.
  - `partial`: el documento se emitió, pero falta información. En `skills`: `LIMIT_REACHED`, `UNREADABLE` o `HOME_UNSET`. En `doctor`: `env.home-unset`, `repo.git-failed` o `repo.git-unavailable`. Que el working tree figure como `not-inspected` es alcance de M0, no un fallo: no vuelve el resultado `partial`. La razón aparece siempre como hallazgo o check de esa lista.
  - `failed`: sólo en el documento de error interno (7.4), con código de salida 3. Un documento normal nunca es `failed`.
- Los archivos de procedencia no afectan `completeness`: su fallo produce `PROVENANCE_INVALID` y el inventario sigue sin esa información.
- **Contrato público de contenido:** el JSON sólo contiene la metadata enumerada en 7.1–7.4. Nunca incluye el contenido de `SKILL.md` (salvo `name` y `description` acotada), campos de procedencia fuera de la lista blanca, `installPath`, valores de variables de entorno, contenido de configuraciones ni mensajes de excepciones.
- Severidades: `info` (dato), `warn` (requiere atención, no invalida el resultado), `error` (el resultado no es fiable en ese punto).

### 7.1 `skills --json`

```json
{
  "schemaVersion": 1,
  "command": "skills",
  "tool": { "name": "jz-ai", "version": "0.1.0" },
  "completeness": "complete",
  "roots": [
    { "id": "agents", "host": "agents", "path": "/root/.agents/skills", "realPath": "/root/.agents/skills", "status": "ok" }
  ],
  "skills": [
    {
      "name": "caveman",
      "nameSource": "frontmatter",
      "description": "…",
      "rootId": "claude-user",
      "host": "claude",
      "entryPath": "/root/.claude/skills/caveman/SKILL.md",
      "realPath": "/root/.agents/skills/caveman/SKILL.md",
      "linkTarget": "/root/.agents/skills/caveman",
      "sha256": "fec5…",
      "size": 4321,
      "siblingFiles": 1,
      "scriptLike": false,
      "manifest": { "valid": true, "problems": [] },
      "plugin": null,
      "provenance": { "kind": "skill-lock", "source": "JuliusBrussee/caveman", "sourceType": "github", "sourceUrl": "https://github.com/…", "skillPath": "…", "skillFolderHash": "…", "installedAt": "…", "updatedAt": "…" },
      "availability": "unverified"
    }
  ],
  "groups": [
    { "name": "caveman", "status": "divergent", "incomplete": false,
      "variants": [ { "sha256": "daf9…", "realPaths": ["…"], "entryPaths": ["…"] } ] }
  ],
  "findings": [
    { "severity": "warn", "code": "NAME_COLLISION_DIVERGENT", "subject": "caveman", "paths": ["…"], "message": "…" }
  ],
  "summary": { "roots": 6, "rootsPresent": 4, "manifests": 129, "uniqueFiles": 120, "names": 104, "divergentNames": 3, "info": 10, "warn": 5, "error": 0 }
}
```

`plugin`, cuando aplica: `{ "id": "caveman@caveman", "marketplace": "caveman", "name": "caveman", "cacheVersion": "7066cc815414", "installed": "yes", "enabled": "unknown", "loaded": "unverified", "registry": { "version": "…", "gitCommitSha": "…", "installedAt": "…", "lastUpdated": "…" } }`.

Valores de `roots[].status`: `ok`, `missing`, `not-directory`, `unreadable`.

Si `HOME` no está definido se omiten las raíces de usuario, se emite `HOME_UNSET` (error) y el resultado es `partial`.

Orden: `roots` según la tabla 6.1; `skills` por `name`, `rootId`, `entryPath`; `groups` por `name`; `variants` por `sha256` (null al final); `findings` por severidad (`error`, `warn`, `info`), `code`, `subject`, primer elemento de `paths`.

### 7.2 `doctor --json`

```json
{
  "schemaVersion": 1,
  "command": "doctor",
  "tool": { "name": "jz-ai", "version": "0.1.0" },
  "completeness": "complete",
  "runtime": { "node": "v20.19.2", "platform": "linux", "arch": "x64", "uid": 0, "isRoot": true },
  "tools": [
    { "name": "git", "found": "yes", "path": "/usr/bin/git", "version": { "value": "2.47.3", "confidence": "verified", "source": "git --version" } },
    { "name": "claude", "found": "yes", "path": "/root/.local/bin/claude", "version": { "value": "2.1.300", "confidence": "inferred", "source": "realpath" } },
    { "name": "opencode", "found": "yes", "path": "/root/.opencode/bin/opencode", "version": { "value": null, "confidence": "unknown", "source": null } },
    { "name": "node", "found": "yes", "path": null, "version": { "value": "20.19.2", "confidence": "verified", "source": "process.version" } }
  ],
  "repo": { "inside": "yes", "root": "/home/proyectos/jozeuzz-jz-ai-m0", "branch": "feat/jz-ai-m0", "head": "…", "detached": "no", "workingTree": "not-inspected" },
  "paths": [
    { "id": "claude-credentials", "path": "/root/.claude/.credentials.json", "category": "credentials", "sensitive": "yes", "exists": "yes", "type": "file", "mode": "0600", "ownerUid": 0, "contentRead": "no" }
  ],
  "env": [ { "name": "ANTHROPIC_API_KEY", "set": "no" } ],
  "checks": [ { "id": "runtime.root", "severity": "warn", "message": "…" } ]
}
```

**Confianza de versión:**

- `verified`: obtenida del propio proceso (`process.version`) o de `git --version` ejecutado por `jz-ai`.
- `inferred`: deducida de metadata sin ejecutar el binario. En M0 sólo la regla de Claude Code: ruta canónica del ejecutable con forma `…/versions/<semver>`.
- `unknown`: no determinable con metadata segura. OpenCode queda `unknown` salvo que en la implementación se identifique metadata segura equivalente; si se añade, se documenta en esta sección antes de codificarla.

`git` no se busca en `PATH`: se usa la ruta fija `/usr/bin/git` validada (10.1). `claude` y `opencode` se buscan recorriendo los directorios absolutos de `PATH` con `lstat`/`realpath`, sin ejecutar nada; nunca se ejecutan.

Orden: `tools` por la lista fija `git`, `node`, `claude`, `opencode`; `paths` por `id`; `env` por `name`; `checks` por `id` y, a igualdad, por severidad.

### 7.3 Texto de `doctor`

Bloques con cabecera fija (`[runtime]`, `[tools]`, `[repo]`, `[paths]`, `[env]`, `[checks]`). `[repo]` tiene las columnas `ROOT`, `BRANCH`, `HEAD`, `DETACHED`, `WORKING_TREE` y filas separadas por tabulador con cabecera. La versión y su confianza van en columnas separadas (`VERSION`, `CONFIDENCE`, `SOURCE`); una versión desconocida se muestra como `unknown`.

### 7.4 Documento de error interno (código 3)

Con `--json`, stdout contiene `{ "schemaVersion": 1, "command": "<cmd>", "tool": {…}, "completeness": "failed", "error": { "code": "INTERNAL", "message": "Fallo interno inesperado." } }`. El mensaje es **fijo**: nunca reproduce `error.message`, trazas ni rutas, porque una excepción puede contener rutas o fragmentos de archivos (por ejemplo, los errores de `JSON.parse` citan la entrada). Si la excepción trae un código de sistema con forma `E[A-Z0-9_]+` (por ejemplo `EACCES`), se añade entre paréntesis: `Fallo interno inesperado (EACCES).` Sin `--json`, la misma frase en una línea de stderr: `jz-ai <cmd>: fallo interno inesperado.` Los mensajes de hallazgos que citan errores de sistema siguen la misma regla: sólo el código validado, nunca el mensaje.

## 8. Rutas sensibles

**Regla general:** `doctor` nunca lee el contenido de ninguna configuración. `skills` sólo lee los tres tipos de archivo de la invariante 6. La lista siguiente define qué rutas se informan como metadata y con qué categoría.

| `id` | Ruta | `category` | `sensitive` |
|---|---|---|---|
| `claude-credentials` | `~/.claude/.credentials.json` | `credentials` | `yes` |
| `claude-state` | `~/.claude.json` | `account-state` | `yes` |
| `claude-settings` | `~/.claude/settings.json` | `host-config` | `yes` (puede definir `env` con secretos) |
| `claude-settings-local` | `~/.claude/settings.local.json` | `host-config` | `yes` |
| `project-claude-settings-local` | `<repo>/.claude/settings.local.json` | `host-config` | `yes` |
| `opencode-config` | `~/.config/opencode/opencode.json` | `provider-config` | `yes` |
| `opencode-config-jsonc` | `~/.config/opencode/opencode.jsonc` | `host-config` | `yes` (puede contener claves de proveedor) |
| `opencode-auth` | `~/.local/share/opencode/auth.json` | `credentials` | `yes` |
| `opencode-agents-md` | `~/.config/opencode/AGENTS.md` | `instructions` | `no` |
| `claude-caveman-flag` | `~/.claude/.caveman-active` | `session-state` | `no` |
| `opencode-caveman-flag` | `~/.config/opencode/.caveman-active` | `session-state` | `no` |
| `repo-env` | `<repo>/.env`, `<repo>/.env.*` | `secrets` | `yes` |

Además, cualquier archivo cuya ruta canónica tenga un nombre base que coincida con `auth.json`, `.credentials.json`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `.env`, `.env.*`, `.netrc`, `cookies*` o que contenga `token`, `secret` o `credential` se considera sensible **aunque esté dentro de una raíz de skills**: no se abre y se emite `SENSITIVE_PATH_SKIPPED` (warn). Los permisos Unix nunca convierten un archivo en no sensible; en `doctor`, una ruta sensible con `mode & 0o077` produce el check `paths.<id>.permissive` (warn). No existe otro código para permisos.

**Variables de entorno:** sólo se informa si están definidas (`set: yes|no`), nunca su valor. «Definida» significa propiedad propia del entorno (`Object.hasOwn`) con valor de tipo cadena, **aunque esté vacía**. Variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `FIREWORKS_API_KEY`, `LLM_COUNCIL_BASE_URL`, `LLM_COUNCIL_MODELS`, `LLM_COUNCIL_CHAIRMAN`, `CAVECREW_REVIEWER_MODEL`, `CAVECREW_BUILDER_MODEL`, `CAVECREW_INVESTIGATOR_MODEL`, `CAVEMAN_DEFAULT_MODE`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. El check `env.provider-keys` sólo considera claves con valor no vacío.

**`HOME`:** se usa sólo si está definida, no vacía y es una ruta absoluta. En otro caso se trata como no definida (`HOME_UNSET` / `env.home-unset`) y el mensaje indica el motivo (`no definida`, `vacía` o `relativa`).

## 9. Saneamiento de salida

Una sola política, aplicada en un solo punto por formato:

- **Qué se elimina:** secuencias ANSI/CSI (`ESC [ … final`), escapes de dos caracteres (`ESC` + `@`–`_`), todos los caracteres de control C0 (`U+0000`–`U+001F`), DEL (`U+007F`), C1 (`U+0080`–`U+009F`) y controles bidireccionales (`U+200E`, `U+200F`, `U+202A`–`U+202E`, `U+2066`–`U+2069`). Tras eliminar todos los C0 y C1 no puede sobrevivir ninguna secuencia de terminal (OSC, DCS, hipervínculos), aunque queden sus parámetros como texto inerte.
- **JSON:** `renderJson` sanea recursivamente **todos** los valores de cadena del documento antes de serializar (rutas, nombres, URLs, mensajes, ids, ramas, campos de procedencia). El escapado de `JSON.stringify` (`\u001b`) **no** es saneamiento: un consumidor que decodifica el JSON recibiría el carácter de control. Las claves son fijas y propias.
- **Texto:** cada celda pasa por `cell`: elimina lo mismo, pero antes muestra tabulador y saltos de línea como `\t` y `\n`, de modo que la estructura TSV no se rompe.
- **URLs:** en `sourceUrl` se redactan la información de usuario (`https://[redacted]@host/…`) y la consulta (`?[redacted]`).
- **Errores:** ver 7.4; nunca se publica `error.message`.
- Saneamiento aguas arriba (por ejemplo, en `finding()`) se permite porque es idempotente, pero la garantía la dan los dos puntos anteriores.

## 10. `jz-ai doctor`

### 10.1 Git

**Ejecutable.** `git` se ejecuta sólo desde la ruta absoluta fija `/usr/bin/git` (paquete Debian; `/bin` es un enlace a `/usr/bin` en Debian 13). Antes de usarla se valida con `realpath` + `lstat`: archivo regular, con bit de ejecución, propietario uid 0 y sin escritura para grupo u otros (`mode & 0o022 === 0`). No se consulta `PATH`. Si la ruta no existe: `tool.git.missing` (error). Si existe pero no supera la validación: `tool.git.untrusted` (error) y no se ejecuta. La ruta es inyectable en el contexto sólo para pruebas.

Comandos permitidos (lista cerrada, `execFile` sin shell, `cwd` = raíz del repositorio):

```text
git --version
git rev-parse --abbrev-ref HEAD
git rev-parse --verify HEAD
```

**`git status` no se ejecuta en M0.** Se verificó en el host que `git status` ejecuta filtros `clean` (`filter.<driver>.clean` / `.process`) definidos en la configuración local del repositorio cuando una entrada del índice tiene metadata desactualizada, incluso con todas las mitigaciones de esta sección; `GIT_ATTR_SOURCE` no basta porque `.git/info/attributes` sigue aplicando. Eso contradice la invariante 3. En consecuencia, el estado del working tree se informa como `repo.workingTree: "not-inspected"` (único valor en M0). La inspección segura del working tree queda para un incremento posterior con pruebas específicas; no se intenta desactivar filtros dinámicamente.

Se verificó también que los dos `rev-parse` permitidos no ejecutan filtros ni el comando `core.fsmonitor` (ni siquiera sin `-c core.fsmonitor=false`): sólo resuelven referencias.

Cada invocación de repositorio se prefija con:

```text
git --no-pager -c core.fsmonitor=false -c core.hooksPath=/dev/null
```

Entorno del proceso hijo, construido desde cero (no hereda el del padre): `PATH=/usr/bin:/bin` (fijo, no heredado), `HOME` (el validado, si existe), `LANG=C`, `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`. Sin `GIT_DIR` ni `GIT_WORK_TREE` heredados.

- `GIT_CONFIG_GLOBAL=/dev/null` y `GIT_CONFIG_NOSYSTEM=1` dejan fuera `~/.gitconfig`, `~/.config/git/config` y `/etc/gitconfig`. Consecuencia verificada: `safe.directory` del usuario no aplica, así que en un repositorio cuyo propietario no es el uid actual ambos `rev-parse` salen con código 128 («dubious ownership»); `doctor` lo informa como `repo.head-unavailable`, nunca como fallo interno.

- `GIT_OPTIONAL_LOCKS=0` es defensa adicional: ningún comando permitido debe tomar locks opcionales.
- `core.fsmonitor=false` es defensa adicional frente a un fsmonitor configurado en el repositorio.
- `core.hooksPath=/dev/null` es defensa adicional: ninguno de los comandos permitidos ejecuta hooks.
- Sin `fetch`, `pull`, `remote`, `gc` ni `maintenance`.

Límites: timeout 5 s, `maxBuffer` 1 MiB, `killSignal: SIGKILL`. `doctor` continúa con el resto en todos los casos.

| Situación | `tools[git]` | Checks | `repo` | `completeness` |
|---|---|---|---|---|
| `/usr/bin/git` ausente | `found: no`, `path: null`, versión `unknown` | `tool.git.missing` (error) | dentro de repo: `inside: yes`, `branch`/`head` `null`, `detached: unknown`, `workingTree: not-inspected` + `repo.git-unavailable` (warn); fuera: `repo.outside` (info) | dentro de repo: `partial`; fuera: `complete` |
| presente pero no validado | `found: yes`, ruta, versión `unknown` | `tool.git.untrusted` (error); no se ejecuta | igual que la fila anterior | igual que la fila anterior |
| `git --version` falla o no se reconoce | versión `unknown` | `tool.git.version-unknown` (warn) | se intentan los comandos de repositorio | según el resto |
| `rev-parse` sale con código distinto de 0 (repositorio sin commits, propietario ajeno) | — | `repo.head-unavailable` (warn) | `head`/`branch` `null`, `detached: unknown` | sin efecto |
| `rev-parse` agota el tiempo o excede `maxBuffer` | — | `repo.git-failed` (error) | `head`/`branch` `null`, `detached: unknown` | `partial` |
| cualquier caso dentro de un repositorio | — | — | `workingTree: not-inspected` | sin efecto |

En todas las filas con error el código de salida es 1.

Fuera de un repositorio Git: `repo.inside: "no"`, check `info`, sin error.

### 10.2 Checks

Como en 6.8, esta tabla es la fuente de verdad y el catálogo de `findings.js` la replica (`paths.<id>.*` se representa como `paths.*.…`).

| `id` | Severidad | Condición |
|---|---|---|
| `runtime.node` | `error` | Node < 20.19.0 |
| `runtime.root` | `warn` | uid 0: los controles son de código, no sandbox |
| `env.home-unset` | `error` | `HOME` no definida, vacía o relativa; resultado `partial` |
| `env.provider-keys` | `info` | hay claves de API no vacías: `llm-council` elige proveedor según el entorno |
| `tool.git.missing` | `error` | `/usr/bin/git` no existe |
| `tool.git.untrusted` | `error` | `/usr/bin/git` no supera la validación de 10.1; no se ejecuta |
| `tool.git.version-unknown` | `warn` | `git --version` falló o su salida no se reconoce |
| `tool.claude.missing` | `info` | `claude` no encontrado en `PATH` |
| `tool.claude.version-unknown` | `info` | versión no inferible sin ejecutar |
| `tool.opencode.missing` | `info` | `opencode` no encontrado en `PATH` |
| `tool.opencode.version-unknown` | `info` | versión no determinable sin ejecutar |
| `repo.outside` | `info` | no es repositorio Git |
| `repo.detached` | `warn` | HEAD separado |
| `repo.head-unavailable` | `warn` | `HEAD` no resoluble (repositorio sin commits o de otro propietario) |
| `repo.git-failed` | `error` | `rev-parse` agotó el tiempo o excedió `maxBuffer`; resultado `partial` |
| `repo.git-unavailable` | `warn` | dentro de un repositorio sin `git` utilizable; resultado `partial` |
| `paths.<id>.permissive` | `warn` | ruta sensible con `mode & 0o077` |
| `paths.<id>.unexpected-type` | `warn` | ruta esperada como archivo es symlink u otro tipo; se informa sin seguir |

## 11. Pruebas

Ejecución: `cd tools/jz-ai && node --test` (descubrimiento verificado en Node 20.19.2). Sin dependencias. Toda prueba crea su árbol en `fs.mkdtemp(os.tmpdir())` y lo elimina al terminar; los helpers de prueba sí escriben, el código de `src/` no.

Como el proceso corre como root, `chmod 000` no impide lecturas. Los casos de archivo ilegible se prueban inyectando errores `EACCES` mediante el adaptador de sistema de archivos.

| Archivo | Casos |
|---|---|
| `utils.test.js` | saneamiento adversarial (CSI, OSC, hipervínculos, C1, DEL, bidi, NUL) en `cleanText`, `cell` y `cleanDeep`; `redactUrl` con usuario, token y consulta; `safeErrorCode`; catálogo de severidades y código desconocido |
| `catalog.test.js` | las tablas 6.8 y 10.2 de esta especificación coinciden con el catálogo del código |
| `frontmatter.test.js` | válido; comillas simples y dobles; BOM y CRLF; sin delimitador; límite de 8 192 bytes exacto contando BOM y CRLF; bytes no UTF-8 en el frontmatter; multibyte válido; sin `name`; YAML complejo ignorado sin error; anclas y tags no interpretados |
| `read-file.test.js` | archivo regular y hash; symlink de archivo dentro y fuera de raíces; FIFO no bloquea; mayor que el límite; `EACCES` inyectado |
| `walk.test.js` | **symlink de entrada válido** hacia otra raíz autorizada; **enlace roto**; **enlace externo** a un directorio fuera de raíces; **enlace cíclico** (`a -> ..`, `a -> .`, `a -> a`); symlink dentro de `claude-plugins` no seguido; límite de profundidad; límite de entradas; skill con muchos hermanos que no consume el presupuesto de descubrimiento; `SIBLINGS_TRUNCATED`; raíz ausente; raíz que es archivo; exclusión de `node_modules`, `.git` y `marketplaces`; el manifiesto conserva sólo 8 KiB |
| `provenance.test.js` | lock válido; campos fuera de lista blanca descartados; credenciales y consulta en URL redactadas; JSON inválido; archivo > 1 MiB; ausencia; estructura hostil (`__proto__`, tipos inesperados); `installed_plugins` con versión instalada y versión obsoleta en caché; `installPath` vía symlink, con `/` final, relativo e inexistente; `enabled` siempre `unknown` y `loaded` siempre `unverified` |
| `inventory.test.js` | grupos `single`, `aliased`, `identical`, `divergent`; grupo incompleto por hash ausente; `MANIFEST_NAME_MISMATCH`; fixture con 3 variantes de `caveman` y 2 de `cavecrew` repartidas como en la auditoría |
| `git.test.js` | repositorio fixture con el entorno aislado real (`GIT_CONFIG_GLOBAL=/dev/null`, `PATH` fijo): rama, HEAD y `workingTree: not-inspected`; `status` fuera de la lista cerrada; HEAD separado; sin commits; fuera de repo; repositorio de otro propietario (`repo.head-unavailable`, sin código 3); `rev-parse` con timeout (`repo.git-failed`); timeout y salida excesiva con ejecutor inyectado; entorno hijo construido sin heredar variables |
| `doctor.test.js` | versión `verified`, `inferred` (realpath `versions/x.y.z`) y `unknown`; `claude`/`opencode` ausentes; `git` ausente dentro y fuera de repo; `git` no validado (modo amplio); `git --version` irreconocible; variables definidas vacías; `HOME` vacía o relativa; rutas sensibles con permisos amplios; symlink en ruta sensible no seguido; **determinismo de `doctor` y `doctor --json` byte a byte** |
| `cli.test.js` | `--help`, `doctor --help`, `skills --help` con código 0 sin inspeccionar (contexto que falla si se usa); `--version` solo; combinaciones ambiguas con código 2; `-h` rechazado; comando u opción desconocidos con código 2; `--offline` rechazado; `--json` válido; dos ejecuciones idénticas byte a byte; documento de error interno con mensaje fijo que no filtra `error.message`; ningún carácter de control en ningún valor del JSON |
| `safety.test.js` | ver 11.1 |
| `static-guard.test.js` | ver 11.2 |

### 11.1 Pruebas dinámicas de seguridad

Se ejecuta el binario real (`node bin/jz-ai.js`) como proceso hijo con `HOME` apuntando a un fixture:

1. **Secretos y contrato público:** el fixture contiene `.credentials.json`, `auth.json`, `opencode.json`, `settings.json`, `.env`, un `SKILL.md` symlink hacia `.credentials.json`, un `SKILL.md` con el canario en el cuerpo y en una clave de frontmatter no extraída, un lock con el canario en un campo fuera de la lista blanca y en la consulta de `sourceUrl`, y un `installPath` con el canario, además de una variable de entorno con el canario. El canario no aparece en stdout ni stderr de `doctor`, `doctor --json`, `skills` ni `skills --json`.
2. **Registro de aperturas:** se ejecuta `run()` en proceso con un adaptador de sistema de archivos que registra cada lectura de contenido. Las únicas rutas leídas son `SKILL.md` autorizados, `.skill-lock.json` e `installed_plugins.json`.
3. **Sin escrituras:** snapshot del árbol del fixture (rutas, tipo, tamaño, `mtimeMs`, SHA-256) idéntico antes y después.
4. **Git sin efectos, hooks ni filtros:** repositorio fixture con `core.fsmonitor` configurado a un script, un hook `post-index-change` y un filtro `clean` (`.gitattributes` + `filter.trap.clean`) con un archivo de metadata desactualizada, todos escribiendo un marcador. Control positivo: un `git status` manual sí escribe el marcador. Tras `doctor`: el marcador no existe, el SHA-256 y el `mtimeMs` de `.git/index` no cambian y `git status --porcelain` es igual.
5. **Sin ejecución de skills:** una skill con `scripts/postinstall.js`, `hooks/hook.sh` y un `caveman-config.cjs` que escribirían un marcador. Tras `skills`, el marcador no existe.
6. **Sin Claude, OpenCode ni `git` de `PATH`:** `PATH` del fixture con ejecutables `claude`, `opencode` y `git` falsos que escriben un marcador al ejecutarse. Tras `doctor`, el marcador no existe y la versión de `opencode` es `unknown`.
7. **Sin red** (control de prueba, no sandbox: el guard sólo intercepta APIs de Node en el proceso de prueba y no impide syscalls directas ni procesos hijos): el proceso hijo se lanza con `--import` de un módulo de prueba que sustituye `net.Socket.prototype.connect` (cubre `net`, `tls`, `http`, `https` y `fetch`, verificado en Node 20.19.2), `globalThis.fetch`, `dns.lookup`, `dns.promises.lookup` y `dgram.createSocket` por funciones que fallan y registran el intento. El registro queda vacío. Controles positivos: `net.connect`, `fetch`, `http.get` y `dns.lookup` sí quedan registrados con el guard cargado.

### 11.2 Capa estática (complementaria)

Escaneo de `src/` y `bin/`: prohíbe importar `node:http`, `node:https`, `node:http2`, `node:net`, `node:tls`, `node:dns`, `node:dgram`, `node:vm`, `node:worker_threads`, `node:inspector`, `node:module`; `node:child_process` sólo en `src/exec.js`; prohíbe `eval(`, `new Function`, `import(` dinámico, `require(`, `createRequire`, `process.binding`, `fetch(`, `WebSocket`, `EventSource` y `XMLHttpRequest`; prohíbe APIs de escritura de `fs` (`write`, `append`, `mkdir`, `rm`, `rmdir`, `unlink`, `rename`, `copyFile`, `cp`, `symlink`, `link`, `chmod`, `chown`, `utimes`, `truncate`) y flags de apertura distintos de lectura. Es una red de seguridad heurística; las garantías se validan con 11.1.

### 11.3 Verificación en el host (manual, no automatizada)

Tras las pruebas automáticas, en el worktree:

```bash
node tools/jz-ai/bin/jz-ai.js doctor
node tools/jz-ai/bin/jz-ai.js skills
node tools/jz-ai/bin/jz-ai.js skills --json > /dev/null; echo $?
git status --short
```

Criterios: reproduce las tres variantes de `caveman` y las dos de `cavecrew` de la auditoría §3.1 (si los hashes cambiaron por actualizaciones, se documenta la diferencia en lugar de forzar coincidencia); `git status --short` vacío; ningún archivo nuevo en `~/.claude`, `~/.agents` ni `~/.config/opencode` (comparación de listados con `mtime` antes y después). La salida se resume en la PR sin rutas ni datos sensibles.

## 12. Arquitectura del código

```text
tools/jz-ai/
├─ package.json            # private, "type": "module", "bin", "engines": {"node": ">=20.19"}, sin dependencias
├─ README.md               # uso, invariantes, dependencia documental
├─ bin/jz-ai.js            # punto de entrada: llama a run() y fija process.exitCode
├─ src/
│  ├─ cli.js               # parseArgs, despacho, códigos de salida, documento de error
│  ├─ context.js           # crea el contexto real: fsRead, exec, env, home validado, cwd, uid, gitPath
│  ├─ fs-read.js           # fachada de solo lectura: lstat, readdir, readdirBounded, realpath, readBounded
│  ├─ exec.js              # único uso de child_process; ejecutor de git con lista cerrada
│  ├─ paths.js             # raíces de skills, rutas sensibles, reglas por nombre
│  ├─ frontmatter.js
│  ├─ discover.js          # recorrido de raíces y symlinks de entrada
│  ├─ provenance.js
│  ├─ inventory.js         # registros, grupos y hallazgos (puro)
│  ├─ skills.js            # orquesta el comando skills y arma el documento
│  ├─ git.js               # consultas de repositorio sobre exec.js
│  ├─ doctor.js            # orquesta el comando doctor y arma el documento
│  ├─ findings.js          # catálogo de códigos y severidades, constructores, orden
│  ├─ order.js             # comparación por unidades de código
│  ├─ sanitize.js          # cleanText, cleanDeep, cell, redactUrl, safeErrorCode, tildify
│  └─ render.js            # texto y JSON
├─ test/                  # sólo *.test.js
└─ test-support/          # fixtures, snapshot, guard de red (fuera de test/: Node 20 ejecuta todo .js de test/)
```

Principios:

- Los comandos reciben un contexto. El contexto real sólo expone la fachada `fs-read` y el ejecutor de Git; el código de `src/` no importa `node:fs` fuera de `fs-read.js`, así que la ausencia de escrituras es estructural y no depende sólo de revisión.
- Funciones puras para análisis (`frontmatter`, `inventory`, `sanitize`, `render`); E/S concentrada en `fs-read`, `exec` y `discover`.
- Ningún objetivo de tamaño de archivo ni de número de líneas. Se divide un módulo cuando tiene más de una responsabilidad.
- Identificadores y códigos en inglés; mensajes al usuario en español.

## 13. Revisión independiente

El diseño permite revisiones posteriores sin acceso a la memoria de esta sesión:

- **OpenCode / OpenAI (semántica y pruebas):** contrastar secciones 5–7 y 11 con el código y la salida de `node --test`; verificar que cada código de hallazgo y check tiene prueba.
- **OpenCode / Copilot (seguridad):** contrastar secciones 4, 8, 9, 10.1 y 11.1–11.2; buscar lecturas fuera de la lista de la invariante 6, procesos distintos de `git`, rutas de escritura y fugas de valores de entorno.
- Los revisores trabajan en modo lectura sobre un commit fijo; no editan el worktree del implementador.
- La PR incluirá: commit revisado, resultado literal de `node --test`, resumen de la verificación 11.3 y lista de hipótesis aún abiertas.

## 14. Riesgos y limitaciones

1. **Root sin sandbox.** Las invariantes son de código. Un fallo de programación podría escribir; mitigado por la fachada estructural, las pruebas dinámicas y la capa estática.
2. **Working tree sin inspeccionar.** Como `git status` puede ejecutar filtros `clean` del repositorio (verificado; ver 10.1), M0 no lo ejecuta: `doctor` no informa cambios pendientes (`workingTree: not-inspected`). Se neutralizan además fsmonitor, hooks, locks opcionales y la configuración de sistema y global. La inspección segura del working tree queda para un incremento posterior.
3. **Hash sólo de `SKILL.md`.** Dos skills con igual `SKILL.md` y scripts distintos aparecerán idénticas. `siblingFiles` y `scriptLike` lo señalan parcialmente; el hash por carpeta queda para un incremento posterior.
4. **Analizador de frontmatter mínimo.** Puede no reconocer `name` en YAML complejo; hay respaldo al nombre del directorio y hallazgo explícito.
5. **Disponibilidad efectiva no verificable.** `availability`, `enabled` y `loaded` no se infieren. Las hipótesis H1, H2 y H6 de la auditoría siguen abiertas.
6. **Deriva del entorno.** Claude Code ya es 2.1.300 frente al 2.1.296 documentado. Los hashes de la auditoría pueden cambiar con actualizaciones.
7. **Versión de OpenCode desconocida.** Consecuencia aceptada de no ejecutar OpenCode.
8. **Repositorios de otro propietario.** Al ignorar la configuración global, `safe.directory` no aplica y `rev-parse` falla en repositorios ajenos; se informa como `repo.head-unavailable`. Es el comportamiento conservador deseado.
9. **Ruta fija de `git`.** Sólo `/usr/bin/git` (Debian). Otras distribuciones o instalaciones manuales aparecen como `tool.git.missing`; ampliar la lista exige actualizar esta especificación.
10. **Lista de rutas sensibles incompleta.** Las reglas por nombre cubren patrones comunes; nuevas herramientas pueden requerir ampliarla. Ante la duda, una ruta se clasifica como sensible.
11. **Dependencia documental.** Hasta fusionar la PR #1, `main` tendría código sin `AGENTS.md`; por eso la PR de M0 espera.
12. **Carrera en ancestros (TOCTOU).** La pertenencia a raíces autorizadas se comprueba sobre rutas (`realpath`, `lstat`) y la lectura posterior abre otra vez por ruta; `O_NOFOLLOW` sólo protege el componente final. Un actor que pueda escribir en un directorio ancestro dentro de una raíz y sustituirlo por un symlink entre la comprobación y la apertura consigue que se lea un archivo llamado `SKILL.md` fuera de las raíces (verificado con una simulación determinista), o que se enumere otro directorio. Alcance: sólo archivos con nombre final `SKILL.md`, regulares (`fstat`), ≤ 256 KiB; se publican su hash, tamaño, `name` y `description` acotada, y en enumeraciones nombres de entradas y metadata, siempre bajo la ruta autorizada original. En el host las raíces pertenecen a root sin escritura para grupo u otros, así que el actor necesita uid 0 (o `CAP_DAC_OVERRIDE`), con lo que ya podría leer esos archivos directamente. El riesgo crece si una raíz (por ejemplo `<repo>/.claude/skills`) pertenece a otro usuario. Mitigación posible no implementada en M0: tras abrir, comparar `readlink("/proc/self/fd/<fd>")` con la ruta canónica esperada antes de leer (sólo Linux; no cubre enumeraciones). Decisión del responsable: riesgo aceptado provisionalmente para el entorno actual, con raíces controladas por root; no se implementa la mitigación. Debe reevaluarse si cambian la propiedad, los permisos o la confianza de las raíces.
13. **Observaciones de la revisión del Checkpoint 1 (sin cambio de alcance).** (a) Un `SKILL.md` que sea hardlink de otro archivo se lee como regular; lo limita `fs.protected_hardlinks=1`, que exige ser propietario o tener lectura y escritura sobre el original. (b) Una raíz que sea symlink amplía el conjunto autorizado a su destino (§6.1); un repositorio hostil podría usarlo con `<repo>/.claude/skills`, pero sólo se leen archivos `SKILL.md`. (c) `opendir` lee internamente lotes de hasta 32 entradas: el límite de materialización es exacto en JavaScript, no en el kernel. (d) Si el cierre de un directorio falla tras un error de lectura, el error de cierre sustituye al de lectura; sólo cambia el código informado.

## 15. Criterios de aceptación (de Issue #6)

1. `doctor`, `skills` y `skills --json` producen salida estable sin efectos secundarios: pruebas 11.1 y determinismo en `cli.test.js`.
2. Pruebas de symlinks, manifiestos inválidos, copia idéntica y divergente, archivos inaccesibles, directorios ausentes y secretos ignorados: sección 11.
3. Informe en el host con las tres versiones de Caveman y las dos de Cavecrew: verificación 11.3.
4. Ningún mensaje afirma carga efectiva: `availability`, `loaded` y nota fija en texto.
5. `git status --short` sin cambios tras ejecutar M0: 11.1 punto 4 y 11.3.
6. PR de feature desde `main` sin fusionar hasta resolver la PR #1.

## 16. Registro de la revisión independiente

Revisiones de diseño: OpenCode/OpenAI (`gpt-5.6-sol`) y OpenCode/Copilot (`claude-sonnet-4.6`), 2026-10-14. Cada hallazgo se evaluó con evidencia; el plan de implementación enlaza cada cambio con su prueba.

| # | Hallazgo | Decisión | Dónde |
|---|---|---|---|
| O1 | Saneamiento unificado de datos externos | Aceptado | §9, §7 |
| O2 | Comparación canónica de `installPath` | Aceptado | §6.6 |
| O3 | `completeness` con `failed` | Aceptado | §7, §5.1, §7.4 |
| O4 | `error.message` crudo | Aceptado | §7.4 |
| O5 | Determinismo de `doctor` | Aceptado | §11 |
| O6 | `Object.hasOwn` para variables | Ajustado (también `HOME` vacía o relativa) | §8 |
| O7 | Git no disponible | Aceptado | §10.1, §10.2 |
| O8 | Códigos y severidades unificados | Aceptado (catálogo único y prueba contra esta spec) | §6.8, §10.2 |
| O9 | Límite de frontmatter con BOM y CRLF | Aceptado (análisis sobre bytes) | §6.5 |
| O10 / C15 | Presupuesto de hermanos | Aceptado (presupuestos separados) | §6.2 |
| O11 | Cobertura del guard de red | Aceptado | §11.1, §11.2 |
| O12 | `--help` / `--version` combinados | Ajustado por el responsable: `--help`, `doctor --help`, `skills --help` válidos; `--version` sólo global; resto código 2 | §5 |
| C13 | `GIT_CONFIG_GLOBAL=/dev/null` | Aceptado | §10.1 |
| C14 | `git` sin `PATH` heredado | Aceptado por el responsable: sólo `/usr/bin/git` validado, sin alternativa | §10.1 |
| C16 | Saneamiento adversarial | Aceptado (incluye bidi) | §9, §11 |
| R1 | Filtros `clean` en `git status` (verificado en el host) | Riesgo no aceptado por el responsable: `git status` eliminado de M0; `workingTree: not-inspected` | §10.1, §10.2, §14 |
| R2 | Contrato público del JSON | Aceptado (sólo 8 KiB en memoria tras el hash) | §6.4, §7 |
| CP1-A | Enumeración de directorios sin límite efectivo (revisión del Checkpoint 1) | Aceptado: lectura acotada, sin subconjuntos dependientes del orden del sistema de archivos | §6.2 |
| CP1-B | Registro de plugins inválido interpretado como ausencia | Aceptado: estructuras inválidas son no verificables (`unknown`) | §6.6 |
| CP1-C | Identificador del registro en mensajes | Aceptado: sólo identificadores con forma válida | §6.6 |
| CP1-D | Carrera en ancestros entre comprobación y lectura | Aceptado provisionalmente por el responsable (raíces controladas por root); sin mitigación en M0; reevaluar si cambian propiedad, permisos o confianza de las raíces | §14 |
| CP1-E | `installPath` saneado antes de resolverse: una ruta con `U+0000` final producía `installed: yes` (segunda revisión del Checkpoint 1) | Aceptado: se resuelve la ruta original; con `U+0000` es no verificable | §6.6 |
| CP1-F | Presupuesto agotado exactamente: se abría el directorio siguiente con máximo cero | Aceptado: con presupuesto cero no se abre; `LIMIT_REACHED` o `SIBLINGS_TRUNCATED` según el presupuesto | §6.2 |
| CP1-G | Listado de la raíz del repositorio en `doctor` para `<repo>/.env*` | Pendiente de decisión del responsable antes de Task 11: límite, señal y efecto en `completeness` (propuesta en el plan, Task 11) | §8, §10.2 |
