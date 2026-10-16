# Propuesta: ejecutor aislado para las pruebas con Docker

Estado: **propuesta, sin implementar** (2026-10-16). Revisada por jz-security en modo lectura; sus hallazgos 9 a 12 (ejecución del commit en el host de la VM, lista negra de Compose, integridad de la evidencia y precarga de npm) están incorporados en §3.1 y §4. Nada de este documento está autorizado. Complementa `docs/AUTONOMIA-JZ.md` §9 («Pendiente de decisión: pruebas con Docker»).

## 1. Problema

Las pruebas de integración, HTTP y e2e del POC (`poc1a/poc.sh`: Postgres, app y Playwright en `docker compose`) son 57 de las 72 de vitest, la batería de contrato con la app en marcha y los 3 e2e. Los agentes no pueden ejecutarlas: `jz-run` no expone Docker, y con razón. Cualquier acceso a `/var/run/docker.sock` del CT equivale a ser root en él.

Hechos del entorno, comprobados el 2026-10-16 sin usar Docker:

- El CT 103 es un LXC **no privilegiado** de Proxmox (`uid_map 0 100000 65536`), con Debian 13, 6 vCPU, 8 GiB de RAM y 46 GiB libres en un subvolumen ZFS.
- Docker 29.9.0, Compose 5.6.0 y containerd 2.4.1. Está instalado `docker-ce-rootless-extras` (`rootlesskit`, `dockerd-rootless-setuptool.sh`), pero faltan `newuidmap`/`newgidmap` (paquete `uidmap`), `slirp4netns`/`pasta` y `/dev/fuse`, y `/etc/subuid` está vacío.
- El daemon es compartido: en él corren Wealthfolio (proyecto `infra`) y los contenedores del POC (`jozeuzz-poc-a`; ahora mismo `next dev` y `next start` con `poc1a/` montado en lectura y escritura).

## 2. Requisitos

1. Pruebas autónomas reales: Postgres real, migraciones, HTTP y navegador, no simulaciones.
2. Ningún agente obtiene permisos equivalentes a root en el CT compartido.
3. No hay secretos reales en el entorno de pruebas, sólo datos sintéticos generados por ejecución.
4. Los servicios existentes (Wealthfolio, el POC en marcha y el resto del CT) no se ven afectados ni en datos, ni en red, ni en recursos.
5. La evidencia queda ligada a un commit concreto, como la de `jz-run`: comando, `rc`, SHA y log.
6. Las pruebas destructivas (`down -v`, bases nuevas, borrados) sólo tocan recursos desechables de esa ejecución.

## 3. Alternativas

### 3.1 VM de pruebas dedicada en Proxmox con daemon Docker propio (recomendada)

Se crea una VM KVM, `jz-poc-runner`, con su propio kernel y su propio `dockerd`. Los agentes nunca reciben un shell en ella. Sólo pueden pedir que se ejecute una suite fija sobre un commit.

**Flujo:**

1. El implementador, dentro del CT, hace commit y llama a `.jz/bin/jz-remote <suite>`, con `suite` ∈ {`vitest`, `contrato`, `e2e`, `migraciones`}. Este script formaría parte del plano de control, igual que `jz-run`. Se niega a ejecutar si el árbol no está limpio, así que lo que se prueba es exactamente `HEAD`.
2. `jz-remote` empaqueta `HEAD` con `git bundle`, que sólo incluye archivos versionados (nunca `poc1a/.env` ni `node_modules`), y lo envía por SSH con una clave dedicada. En el `authorized_keys` de la VM esa clave tiene un `command=` forzado (`jz-runner`) y `restrict` (sin PTY, sin reenvíos, sin shell).
3. En la VM, `jz-runner` lee el bundle y el nombre de la suite, y no admite ningún otro argumento. Después:
   - parte de un clon enlazado limpio de la VM (`base-limpia`) en cada ejecución;
   - extrae el bundle en `/srv/runs/<sha>-<ts>/`;
   - ignora cualquier `.env` del bundle y genera un `.env` sintético aleatorio para esa ejecución, sin variables `COMPOSE_*` ni `DOCKER_*`;
   - resuelve y valida el `compose.yaml` del commit (§4) y después ejecuta **exactamente el JSON validado** (`docker compose -f resolved.json`, proyecto `jzrun-<sha8>-<ts>`), lo que evita una carrera entre validar y ejecutar;
   - ejecuta la suite con **comandos fijos escritos en `jz-runner`**, no con `poc.sh`, `npm` ni otros scripts del commit en el host de la VM. El código del commit sólo corre dentro de los contenedores validados;
   - recoge los artefactos de rutas fijas con `docker cp` (sin extraer tars del área de trabajo) y redacta un manifiesto `{sha, suite, rc, sha256 de cada log}` firmado con una clave ed25519 propia de la VM;
   - destruye el proyecto (`down -v --remove-orphans`) y el directorio.
4. `jz-remote` comprueba la clave de host de la VM (`StrictHostKeyChecking yes`) y la firma del manifiesto. Sólo admite archivos regulares, con un tope de tamaño y sin rutas absolutas ni `..`. Después registra el resultado en `.jz-state/runs.jsonl` con `engine`, `remote: true`, `head`, la suite y la firma. Así `jz-state` y `jz-qa` pueden verificarlo igual que una ejecución de `jz-run`. Los logs se tratan como datos no confiables: pueden contener texto que intente instruir a los agentes.

**Quién habla con `dockerd`.** El usuario de `jz-runner` no pertenece al grupo `docker`. Las órdenes a Docker las da un daemon rootless por ejecución, con un usuario dedicado, o un envoltorio mínimo propiedad de root que sólo acepta `up`/`run`/`down` sobre el JSON validado. Así, aunque el código del commit lograra salir de un contenedor, no sería root en la VM.

**Aislamiento de datos y secretos.** La VM no monta nada del CT ni tiene credenciales de los agentes, de Proxmox o de Git remoto. El `.env` es sintético y distinto en cada ejecución. La clave SSH sólo permite `jz-runner`. Si una prueba se comporta mal, sólo puede afectar a la propia VM, que es desechable y se restaura desde un snapshot.

**Protección de servicios.** La VM tiene un kernel y un daemon distintos de los del CT, así que no comparte el socket, las redes Docker ni los volúmenes de Wealthfolio o del POC actual. Los recursos se limitan en Proxmox (vCPU, RAM, disco e I/O) y, dentro de la VM, con `cpus` y `mem_limit` en el override que genera `jz-runner`.

**Red.** La VM va en un bridge o una VLAN propios, con el firewall de Proxmox:

- entrada: sólo SSH desde la IP del CT;
- salida: denegada por defecto.

Las imágenes se descargan sólo durante una ventana autorizada, fijadas por digest según la matriz aprobada (`docs/MATRIZ-TECNOLOGIAS-POC.md`, H0A-16a). La caché de npm se precarga así:

- en un contenedor desechable, con `npm ci --ignore-scripts`;
- con salida sólo hacia el registro de npm, a través de un proxy con lista blanca;
- después de que el humano apruebe el diff del `package-lock.json`;
- al cerrar la ventana, la caché se exporta como artefacto con su hash, se incorpora a una nueva versión de `base-limpia` aprobada por el humano y se descarta la VM de la ventana.

En las ejecuciones, la caché se monta en sólo lectura y la instalación es `--offline` dentro del contenedor. Fuera de la ventana, las pruebas corren sin Internet. Dentro de Compose, la red de la base de datos se declara `internal: true`.

**Versiones y recursos propuestos:**

| Elemento | Propuesta |
|---|---|
| SO | Debian 13 (igual que el CT) |
| Docker / Compose | 29.9.0 / 5.6.0, fijados (iguales que el CT, para que los resultados sean comparables) |
| Imágenes | Node 24, PostgreSQL 18.6 y Playwright 1.64.1 por digest, iguales que en POC-1a/1b |
| vCPU / RAM / disco | 4 vCPU / 6 GiB / 40 GiB (Next build + Payload + Postgres + Chromium) |
| Opcional | `dockerd` rootless dentro de la VM, como defensa adicional (§3.2) |

Hay que confirmar que el nodo Proxmox tiene capacidad libre. Desde el CT no se ve.

**Cómo se ejecutan los tests remotos.** Por bundle de Git, no por montaje ni por `rsync` del worktree. Así sólo viaja lo versionado, la prueba queda ligada a un SHA y la VM no puede escribir en el CT.

**Bases sintéticas y pruebas destructivas.** Cada ejecución crea su base desde cero, con las migraciones del commit y la semilla de `scripts/reset-semilla.ts`. Si hace falta una base sintética de referencia (por ejemplo, para medir rendimiento con volumen), se guarda como un `pg_dump` versionado o como un artefacto de la VM, y se **restaura en una base efímera** de la ejecución; el original nunca se modifica. Las pruebas destructivas (`down -v`, `DROP DATABASE`, migraciones `down`, fallos inyectados) sólo se permiten sobre `jzrun-*`. Cada ejecución arranca de un clon enlazado de `base-limpia`, que se destruye al terminar. Así, una ejecución que comprometa la VM no puede falsear las siguientes. Si por coste se reutilizara la VM en un lote, esa garantía se pierde y debe constar en la evidencia.

### 3.2 Docker rootless en un entorno separado

**En este CT no es viable sin tocar el host.** Faltan `uidmap`, `slirp4netns`/`pasta` y `/dev/fuse`, y `/etc/subuid` está vacío. Además, el CT sólo tiene 65 536 IDs mapeados: un rango subordinado anidado dejaría menos de los 65 536 que esperan imágenes con usuarios altos, como `nobody` (65534). Habría que cambiar la configuración del CT en Proxmox (`nesting`, `keyctl`, `fuse` y un idmap mayor), es decir, configuración del host.

**En un LXC nuevo** se aísla del daemon compartido, pero sigue compartiendo el kernel del nodo Proxmox, y un LXC con `nesting=1` y Docker dentro reduce el aislamiento. Además, rootless tiene limitaciones: necesita delegar cgroup v2 para limitar recursos, el almacenamiento overlay depende de la versión del kernel, la red es más lenta y no admite puertos privilegiados.

**Veredicto.** Sola, la alternativa es intermedia. Como capa adicional dentro de la VM de §3.1 es buena: así, un escape del contenedor ni siquiera es root en la VM.

### 3.3 Broker `jz-compose` sobre el daemon compartido

El broker tendría verbos fijos (`up -d db app`, `exec -T app <cmd>`, `run --rm e2e`, `down`), un único proyecto, la validación de `docker compose config --format json` y el hash del `compose.yaml` aprobado por el humano. Ni siquiera así desaparecen los riesgos residuales:

- **El daemon es root en el CT.** Cualquier fallo de validación (una clave de Compose nueva, una interpolación o un `extends`/`include`) concede root sobre Wealthfolio y el resto del CT.
- **`exec -T app <cmd>` ejecuta código arbitrario** dentro de un contenedor cuyo root es el root del CT, con `poc1a/` montado en escritura y con red de salida. El contenedor puede reescribir `compose.yaml`, `poc.sh` o el código, exfiltrar datos por red y consumir CPU y RAM compartidas, con las 8 GiB que también usa Wealthfolio.
- **`build:` y las imágenes.** Un `Dockerfile` ejecuta `RUN` como root con red. Habría que prohibir `build` o fijarlo, y validar los digests.
- **Colisiones con el POC en marcha:** puertos 3101/3102, la base `poc` (ya hubo un incidente, documentado en `poc1a/EVIDENCIA.md`, en el que `e2e` conectó la app a la base equivocada) y nombres de volúmenes. Un `down -v` sobre el proyecto equivocado es destructivo.
- **Kernel compartido.** Un escape de contenedor afecta a todo el CT.

**Veredicto.** Sólo es aceptable como solución transitoria y con aprobación humana por ejecución, no para pruebas autónomas.

## 4. Controles comunes de Compose (en la VM, como defensa en profundidad)

`jz-runner` resuelve el `compose.yaml` del commit con `docker compose config --format json` y lo valida contra un **esquema de lista blanca**: claves y valores permitidos por servicio. Una lista negra deja huecos. Ejemplos de lo que se rechaza:

- `privileged`, `cap_add`, `devices` y `security_opt` que relaje el perfil;
- `pid`, `ipc`, `uts` o `cgroup: host`, `network_mode: host`, `network_mode: container:`, `userns_mode: host`, `cgroup_parent`, `sysctls` y `user` root cuando no haga falta;
- montajes `bind` fuera del directorio de la ejecución, volúmenes con nombre con `driver_opts` de tipo `bind`, `volumes_from`, montajes de `docker.sock`, `/proc` o `/sys`, y volúmenes `external`;
- `configs`/`secrets` con `file:` y `env_file` fuera del directorio de la ejecución;
- imágenes sin digest o fuera de la lista aprobada; `build:` (y sus `context` absolutos, `additional_contexts` y `secrets`) salvo aprobación;
- puertos publicados fuera de `127.0.0.1`.

Cada regla tiene una fixture maliciosa que debe ser rechazada.

Además, genera un override con `mem_limit`, `cpus` y `pids_limit` para cada servicio, `read_only: true` donde se pueda y redes `internal: true` salvo la del e2e hacia la app. El nombre del proyecto siempre es `jzrun-*`, y la limpieza se hace por esa etiqueta.

## 5. Recomendación

**Alternativa 1 (VM dedicada), con `dockerd` rootless dentro de la VM como mejora opcional.** Es la única que permite pruebas autónomas reales sin dar a los agentes un equivalente a root en el CT compartido. La superficie que se expone al CT es un único `command=` SSH con dos parámetros validados. Mientras la VM no exista, las pruebas con Docker las sigue lanzando el humano con `poc1a/poc.sh`, como hasta ahora.

## 6. Qué necesita aprobación del responsable

1. Crear la VM `jz-poc-runner` en Proxmox, con sus recursos (4 vCPU / 6 GiB / 40 GiB o los que haya disponibles), la red aislada y las reglas de firewall de entrada y salida.
2. Instalar Debian 13, Docker 29.9.0 y Compose 5.6.0 en la VM, y decidir si se usa rootless dentro de ella.
3. La ventana de red para descargar las imágenes por digest y la caché de npm, y su política de renovación.
4. Generar la clave SSH dedicada con `command=` forzado y añadir `jz-remote`/`jz-runner` al plano de control (`.jz/`).
5. Permitir que `jz-implementer` lance `jz-remote` de forma autónoma, o exigir confirmación humana por ejecución durante una fase inicial.
6. La política de snapshots y de reversión (`base-limpia`) y la retención de los logs de ejecución.
7. Explícitamente: **no** implementar el broker `jz-compose` sobre el daemon compartido, salvo como solución transitoria con aprobación por ejecución.
