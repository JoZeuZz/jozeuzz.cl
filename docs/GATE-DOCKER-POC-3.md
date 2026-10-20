# Gate Docker de POC-3 (U2–U9): procedimiento para ejecución humana

- **Estado:** procedimiento para ejecución humana. **No se ha ejecutado.** Lo redactó jz-architect el 2026-10-19 leyendo el código y lo revisó en dos ciclos (ver «Historial de revisiones»). Ningún resultado esperado de este documento está verificado en ejecución: son deducciones del código, con su cita.
- **HEAD de referencia del código:** `0231888` (rama `poc/candidata-a-3`). Es la **referencia vinculante de código** del gate: el último commit que cambia código o pruebas. A1 la copia en `CODEREF` y exige que, entre ella y HEAD, sólo cambie `docs/`.
  - `0231888` es el commit A de la corrección A0/A4 (`fix(poc-3): close A0 and A4 gate failures`): cambia el gate y las pruebas estáticas `gate-a4-git.test.ts`. El commit siguiente, sólo de `docs/`, escribe su hash en esta cabecera y en `CODEREF` de A1. Antes la referencia era `e7fc5e8` (corrección A4 I-1/I-2), anterior a ella `ce500a7` (commit A del ciclo de corrección 2, `fix(poc-3): harden gate container retirement and A4 apply`, que cambió `poc1a/poc.sh` —sólo un comentario de `init`— y una prueba estática), anterior a ella `14278c1` (commit A del ciclo 1, `fix(poc-3): close review findings for write isolation`) y, antes de ése, `69e1883`.
  - Las citas de línea no actualizadas siguen refiriéndose a `69e1883`; **la referencia vinculante de código es el commit A**, no esas líneas.
  - Se acepta como HEAD de ejecución el commit que confirme este documento y `docs/adr/0001-stack.md`, o uno posterior que sólo cambie `docs/` (A1 lo comprueba). Si se hace el paso A4 (instalación de axe), la referencia pasa a ser el commit que deja A4. Ese HEAD se anota en cada fila de evidencia.
- **Quién lo ejecuta:** el responsable del proyecto, como root en el host de la POC, con Docker y Compose v2 y con Node ≥ 20 en el host (`poc1a/README.md:34-36`). Los agentes no tienen Docker (`docs/PLAN-POC-3.md:157`, P3-07 `:199`). Mientras dure el gate, ningún agente escribe en este worktree.
- **Duración:** no está medida. La estimación orientativa del ciclo 1 era de 1,5 a 3 h sin contar descargas de imágenes, y **puede quedarse corta**:
  - Referencias: una batería de 56 casos tardó 232 s en POC-1a (`poc1a/EVIDENCIA.md:20`), aunque sólo tenía 13 activos; el build tardó 16 s (`poc1a/EVIDENCIA.md:152`).
  - Este gate ejecuta unos 167 casos activos en cinco baterías (D13, D16, D17, D26 y D27), dos tandas E2E y 150 envíos de medición.
  - **Coste nuevo:** ahora `exec-en` ejecuta `scripts/verificar-db.ts` antes de cada orden (`poc.sh:83`), y eso arranca Payload completo (`verificar-db.ts:11`). El driver llama a `exec-en` una vez por caso para el reset (`contrato-driver.mjs:291`; `contrato/runner.mjs:22-27`). Cada caso suma, por tanto, un arranque de Payload a los del reset. Esto puede alargar notablemente las baterías. No hay medición de cuánto.
- **Desbloquea:** U10, la revisión del hito por jz-security y jz-qa (`docs/PLAN-POC-3.md:172`).

## Advertencia de seguridad (leer antes de nada)

1. `poc1a/poc.sh` y los scripts Node del host (driver, batería, pruebas `test/docker`, `test/build` y `medicion`) se ejecutan **como root con acceso a `docker.sock`**. Su contenido lo editaron agentes. **Antes de ejecutar nada**, el humano revisa el diff del paso A2, que es obligatorio.
2. **Los contenedores no deben poder escribir en `poc1a/`.** Los servicios `app`, `app-prod`, `deps` y `e2e` montan `./` (`poc1a/`) en `/app` como bind **de sólo lectura**, con raíz `read_only: true`, uid 1000 y `/tmp` en `tmpfs`. Sólo escriben en volúmenes nombrados de la lista cerrada de A2 y en `/tmp` (corrección del hallazgo S-1, **pendiente de verificación Docker**: A2 y A3f la comprueban). `next-env.d.ts` se monta como bind de archivo RO desde `contenedor/next-env.dev.txt` (`app`) y `contenedor/next-env.prod.txt` (`app-prod`), porque Next 16.4.1 lo reescribe si difiere y `/app` es RO. Por eso `r()` sigue comprobando la integridad del árbol antes de cada orden (A3) y se comprueba `.tls` tras cada orden que lo regenera. `../contrato` no se monta en ningún contenedor (deducción de `compose.yaml`). Los scripts Node del host sólo importan módulos `node:` (deducción por lectura de sus `import`), así que no cargan `node_modules`. `volumes-init` (A3f1) es el único servicio root con acceso a volúmenes de aplicación: sin red, sin bind, sin socket y con `cap_drop`. `db` y `proxy` son root de imagen sin bind RW del repositorio (`db` sólo monta su volumen; `proxy`, binds RO de configuración y `.tls`), así que no tienen camino de escritura al árbol.
3. Sólo se usan bases `poc3_*`: `poc3_intake` y `poc3_migraciones` (`docs/POC-3-DISENO.md:8`). La guarda de `poc.sh:31-39` y la del driver (`poc1a/contrato-driver.mjs:15`) rechazan cualquier otra base.
4. **No usar la base `poc` (contaminada).** Quedan prohibidas las órdenes heredadas que la usan: `up`, `up-prod`, `migrate`, `migrate-create`, `build`, `exec`, `resetdb` (hace `DROP SCHEMA` de `poc`, `poc.sh:77`), `e2e` y `destroy` (`poc1a/README.md:8`). `./poc.sh psql` se conecta a `poc` (`poc.sh:74`); aquí sólo se usa para listar y crear bases (`poc1a/README.md:10,99`).
5. No tocar otros servicios del host. Todas las órdenes Docker pasan por `./poc.sh`, que fija el proyecto Compose `jozeuzz-poc-a` (`poc.sh:2-6`). Hay dos excepciones documentadas, ambas de sólo lectura:
   - `docker compose -p jozeuzz-poc-a … config --no-interpolate` en A2c;
   - `docker image inspect` en D05 (`docs/POC-3-DISENO.md:264`).

   Prohibidos: `docker system prune`, `docker volume rm`, `./poc.sh destroy` (borra con `down -v` los once volúmenes: el volumen `db` con todas las bases y los diez de aplicación, `poc.sh:149`) y cualquier `docker stop` fuera del proyecto. Si alguna vez se ejecutara `destroy` por decisión humana, hay que repetir después `init-volumes`, `deps` y `probe-mounts` (A3f1-A3f3), porque los volúmenes se recrean como root y vacíos.
6. No exportar `POC_BASE_URL`, `POC_TARGET_DATABASE`, `POC_RESET_ENV`, `INTAKE_SECRETO` ni `E2E_RESET`: se pasan siempre en línea. La única variable exportada es `NODE_EXTRA_CA_CERTS`.
7. **Nunca pasar un secreto real en línea a `r()`.** `r()` escribe la orden completa (`$*`) en la cabecera del log. La única excepción es el valor falso deliberado `INTAKE_SECRETO=abcd` de D22a.
8. No imprimir `.env` (A3 y B1 lo validan sin mostrar valores). No usar `sh -x` con `poc.sh`, porque expondría `E2E_RESET`, que lleva la contraseña del admin sintético (`poc.sh:96,107`). No usar `NODE_TLS_REJECT_UNAUTHORIZED=0` (`docs/POC-3-DISENO.md:64`).
9. **Los agentes corren como root** en este host. La protección de la carpeta de salidas (modo 700, A3) y de este documento (blob fijado en A1) es **de política**, no de permisos: un agente con root podría saltársela. Por eso el hash final de `SHA256SUMS` se guarda fuera del host (K3).

## Tipos de parada

- **Parada dura:** se detiene el procedimiento, se dejan los servicios como están, se registra lo ocurrido y se avisa al orquestador. Aplica en estos casos:
  - fallos de infraestructura: `init`, `db-up`, `up-*` o base equivocada;
  - fallos de seguridad: aislamiento de red, IP forjada, fugas en logs, inyección en el build o NV-8;
  - fallos de integridad: `ARBOL ALTERADO` (rc=99), `TLS ALTERADO`, blob del documento distinto o configuración Git, atributos o ruta de ejecución de Git sin explicar (A0);
  - fallos de aislamiento de escritura (stop conditions de montajes):
    - A2 no coincide exactamente con la matriz, o runc no cumple el mínimo de su rama o no tiene formato `X.Y.Z` (A2d);
    - A3e: el proyecto conserva contenedores tras `docker rm -f` o algún contenedor del host tiene un montaje RW sobre `/`, `/home`, `/home/proyectos`, `/home/proyectos/jozeuzz`, el worktree o su `.git`;
    - A3f1-A3f3 divergen de ownership, UID, denegaciones o allowlist; la salida del `find` host A3d no bloquea;
    - cualquier contenedor escribe bajo el bind `/app`: se conserva la evidencia y no se ejecuta ningún script del árbol;
    - EROFS/EACCES de `next-env.d.ts` o de un punto de montaje es parada dura; prohibido resolverlo abriendo el bind del repositorio (ni con un bind RW, ni quitando `read_only`);
    - cualquier otro `EACCES`/`EROFS` en ruta no declarada se investiga con el mismo criterio;
    - D12 crea un `.tsbuildinfo` bajo `poc1a/`;
    - D21 no ve el `BUILD_ID` de `next_prod`, detecta build obsoleto o encuentra marcador;
    - A4 emite cambios fuera de los tres archivos esperados (`package.json`, `package-lock.json` y `tsconfig.json`), elimina versiones/integridades existentes, agrega paquetes distintos de `@axe-core/playwright` y `axe-core`, usa URL fuera de `https://registry.npmjs.org/` o informa firmas inválidas: no se aplica el parche. También son parada dura: un hash no aprobado o distinto del parche leído, HEAD movido desde A4a, el árbol sucio, la configuración Git o los atributos sin explicar, o un commit firmado (`gpgsig`).
- **Fallo registrable:** se registra la salida completa y se sigue con el paso siguiente, que es independiente. El gate no se cierra mientras quede un fallo registrable. Aplica a vitest, a las baterías y a E2E.
- Si se repite un paso, se registran **todos** los intentos (`D11`, `D11-r2`, …) con identificadores distintos (`r()` rechaza un identificador repetido). No se elige el intento verde.

---

## A. Antes de empezar (sin Docker, salvo A2c)

### A0 · Sesión de shell y Git sin efectos laterales (S8)

El procedimiento asume `bash`, por `pipefail` y la sustitución de procesos de K2.

```sh
bash
cd /home/proyectos/jozeuzz-poc-candidata-a
set -o pipefail
umask 077
S="/root/jz-gate-poc3/$(date -u +%Y%m%dT%H%M%SZ)"
test ! -L /root/jz-gate-poc3 && install -d -m 700 /root/jz-gate-poc3 "$S" && echo salidas-ok
# A0.1 · ruta de ejecución de Git (parada dura si algo falla)
# usr-merge puede listar /bin/git y /usr/bin/git: se admiten sólo si ambos canonicalizan al mismo ejecutable.
a0_tipo="$(type -a git)"; printf '%s\n' "$a0_tipo"
a0_rutas="$(printf '%s\n' "$a0_tipo" | sed -n 's/^git is \(\/.*\)$/\1/p')"
a0_lineas="$(printf '%s\n' "$a0_tipo" | sed '/^$/d' | wc -l)"
a0_n_rutas=0; a0_malo=0; a0_canonico=
while IFS= read -r ruta; do
  test -n "$ruta" || continue
  a0_n_rutas=$((a0_n_rutas+1))
  if test ! -x "$ruta"; then a0_malo=1; continue; fi
  canonica="$(readlink -f -- "$ruta")" || { a0_malo=1; continue; }
  if test ! -x "$canonica"; then a0_malo=1; continue; fi
  if test -z "$a0_canonico"; then a0_canonico="$canonica"; elif test "$a0_canonico" != "$canonica"; then a0_malo=1; fi
done <<EOF
$a0_rutas
EOF
if test "$a0_n_rutas" -gt 0 && test "$a0_lineas" -eq "$a0_n_rutas" && test "$a0_malo" -eq 0; then
  GIT_BIN="$a0_canonico"; echo "$GIT_BIN"; "$GIT_BIN" --version; GIT_EXEC="$("$GIT_BIN" --exec-path)"; echo "$GIT_EXEC"; echo ruta-git-ok
else
  echo "A0 FALLÓ: git sombreado (alias, función, ruta no ejecutable o ejecutables canónicos distintos): parada dura" >&2
fi
a0_malos="$(find -L "$GIT_BIN" "$GIT_EXEC" -maxdepth 1 '(' ! -user root -o -perm /022 ')')" && test -z "$a0_malos" || { echo "A0 FALLÓ: binario o exec-path no son de root, son escribibles por grupo/otros o find falló: parada dura" >&2; printf '%s\n' "$a0_malos" >&2; }
printf '%s\n' "$PATH" | awk -F: '{for(i=1;i<=NF;i++) if ($i=="" || $i=="." || substr($i,1,1)!="/" || $i ~ "^/home(/|$)") {bad=1; print "A0: entrada de PATH no válida: [" $i "]"}} END{exit bad}' || echo "A0 FALLÓ: PATH con entradas relativas, vacías o bajo /home: parada dura" >&2
test -x /bin/false && echo bin-false-ok || echo "A0 FALLÓ: falta /bin/false: parada dura" >&2
# A0.2 · variables GIT_* (cubre GIT_CONFIG_*, GIT_CONFIG_PARAMETERS, GIT_EXEC_PATH, GIT_DIR, GIT_EDITOR, GIT_SSH…)
env | cut -d= -f1 | grep '^GIT_' && echo "A0 FALLÓ: hay variables GIT_* en el entorno (nombres arriba): parada dura" >&2
# A0.3 · configuración efectiva: sólo nombres (nunca valores) y fallando cerrada
git config --show-scope --show-origin --name-only -l > "$S/A0-git-config-nombres.txt" || echo "A0 FALLÓ: git config no se pudo leer: parada dura" >&2
sha256sum "$S/A0-git-config-nombres.txt" >> "$S/SHA256SUMS"
grep -iE 'fsmonitor|hookspath|pager|editor|sshcommand|askpass|attributesfile|gitproxy|textconv|\.command|driver|process|clean|smudge|program|helper|external|gpg|gpgsign|signingkey|showsignature|alias|filter\.|include|includeif|credential|sequence\.editor|difffilter|uploadpack|receivepack|maintenance|gc\.auto|submodule|url\.|protocol|tool' "$S/A0-git-config-nombres.txt"   # vacío o explicado
# A0.4 · g endurecida: la usan todas las órdenes Git del procedimiento
g() { git -c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.attributesFile=/dev/null -c commit.gpgSign=false -c tag.gpgSign=false -c log.showSignature=false -c gpg.program=/bin/false -c gpg.ssh.program=/bin/false -c gpg.x509.program=/bin/false -c gc.auto=0 -c maintenance.auto=false --no-pager "$@"; }
# A0.5 · configuración efectiva tras definir g: cada clave anulada debe valer lo que dice g (el último -c gana)
g_efectiva() {
  a0_fallos=0
  for par in core.fsmonitor=false core.hooksPath=/dev/null core.attributesFile=/dev/null commit.gpgSign=false tag.gpgSign=false log.showSignature=false gpg.program=/bin/false gpg.ssh.program=/bin/false gpg.x509.program=/bin/false gc.auto=0 maintenance.auto=false; do
    k="${par%%=*}"; v="${par#*=}"
    if test "$(g config --get "$k")" = "$v"; then echo "$k=$v"; else echo "A0 FALLÓ: $k no vale $v" >&2; a0_fallos=$((a0_fallos+1)); fi
  done
  test "$a0_fallos" -eq 0
}
g_efectiva && echo g-efectiva-ok || echo "A0 FALLÓ: la configuración efectiva de g difiere: parada dura" >&2
# A0.6 · atributos: los filtros clean/smudge sólo actúan si un atributo los activa
atributos_limpios() {
  a0_atributos=; a0_atributos_rc=0
  a0_atributos="$(g check-attr -a -- poc1a/package.json poc1a/package-lock.json poc1a/tsconfig.json)" || a0_atributos_rc=$?
  test "$a0_atributos_rc" -eq 0 && test -z "$a0_atributos"
}
atributos_limpios && echo atributos-ok || echo "A0 FALLÓ: atributos sobre los manifiestos o check-attr falló: parada dura" >&2
ls -l "$(g rev-parse --git-common-dir)/hooks"   # informativo: hooks del repositorio común (g fija core.hooksPath=/dev/null y por eso rev-parse --git-path hooks devolvería /dev/null)
```

- **Esperado:** sale `salidas-ok` (la carpeta de salidas `S` se crea aquí para que A2 pueda registrar su salida), `ruta-git-ok`, `bin-false-ok`, `g-efectiva-ok` y `atributos-ok`; `type -a git` muestra una o más rutas ejecutables que canonicalizan al mismo binario (usr-merge admite `/bin/git` y `/usr/bin/git`); no muestra alias ni función; `git --exec-path` y el binario canónico son de root y no escribibles por grupo ni otros; el `PATH` sólo tiene rutas absolutas fuera de `/home`; el `env | … | grep '^GIT_'` no imprime nada; el último `grep` sobre `A0-git-config-nombres.txt` no imprime nada; `g check-attr -a` termina con rc=0 y no imprime nada; y no aparece ningún `A0 FALLÓ`.
- **Si no:** parada dura. Lo que imprima el `grep` de nombres lo explica el humano antes de seguir (por ejemplo `credential.helper` o un `include` global); si no puede explicarlo, es parada dura. La comprobación ya **no imprime valores**, que podrían ser secretos: la lista contiene sólo ámbito, origen y nombre de clave, y falla cerrada (si `git config` no se puede leer, imprime `A0 FALLÓ` en lugar de parecer limpia). Para ver el valor de una clave concreta, el humano lo pide a mano sólo después de comprobar que no es un secreto.
- **Por qué `g` y por qué no basta con ella.** El humano ejecuta `g commit`, `g add` o `g apply` como root, y Git puede ejecutar programas según su configuración: `gpg.program`, `gpg.ssh.program` y `gpg.x509.program` con `commit.gpgSign` o `tag.gpgSign`; `log.showSignature` al leer el historial; hooks; `core.fsmonitor`; filtros `clean`/`smudge` (si un atributo los activa); y `gc`/`maintenance` automáticos. Esa configuración puede venir del repositorio, de `/home/proyectos/jozeuzz/.git/config` (común a todos los worktrees), de `config.worktree`, de la global, de `include`/`includeIf` o de `GIT_CONFIG_*`. `g` anula en la propia invocación los programas de firma, los hooks (`core.hooksPath=/dev/null`), `fsmonitor`, el archivo global de atributos y el mantenimiento automático. Un filtro declarado en `.gitattributes` o en `.git/info/attributes` junto con `filter.<nombre>.clean` no lo puede anular `g`: lo detiene `check-attr -a` (A0.6) y el `grep` de nombres (A0.3). Los diffs llevan `--no-ext-diff --no-textconv` y las lecturas de blobs con `show` (A1), `--no-textconv`.
- **Ajuste respecto del diseño:** `g rev-parse --git-path hooks` devuelve `/dev/null` con la `g` endurecida; por eso el listado informativo de hooks usa `--git-common-dir`.
- **Riesgo residual (advertencia 9).** Los agentes corren como root en este host: un binario sustituido (`/usr/bin/git`, `diff`, `node`) o un `PATH` manipulado después de A0 no lo detecta esta comprobación, que sólo mira propietario y permisos. Es revisión humana.

### A3e · Retirada de contenedores de la era RW (primer paso tras A0, parada dura)

Antes de A1, A2 y A3d, y antes de ejecutar nada del árbol, hay que comprobar que ningún contenedor creado antes del aislamiento sigue existiendo: un contenedor viejo conserva su bind RW de `poc1a/` y de nada sirve que el `compose.yaml` actual lo monte RO; además podría alterar el árbol mientras el humano lo revisa. Por eso es el primer paso tras A0 y **no usa Compose**: Compose interpolaría `.env` y leería el árbol. Se usan sólo `docker ps`, `docker rm -f` y `docker inspect` por etiqueta (Docker root-equivalente; ver la clasificación; lo ejecuta el humano). No depende de `GUARDA` (se define en A3) ni de `poc1a/`.

```sh
# A3e.1 · registrar los contenedores del proyecto (incluidos los parados), retirarlos y verificar que no quedan
docker ps -a --filter label=com.docker.compose.project=jozeuzz-poc-a --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}}' > "$S/A3e-antes.txt" 2>&1
sha256sum "$S/A3e-antes.txt" >> "$S/SHA256SUMS"
docker ps -aq --filter label=com.docker.compose.project=jozeuzz-poc-a | xargs -r docker rm -f   # no borra volúmenes (db incluido): no lleva la opción de volúmenes
docker ps -a --filter label=com.docker.compose.project=jozeuzz-poc-a --format '{{.ID}} {{.Names}} {{.Status}}' > "$S/A3e1.txt" 2>&1
sha256sum "$S/A3e1.txt" >> "$S/SHA256SUMS"
test ! -s "$S/A3e1.txt" && echo proyecto-sin-contenedores
# A3e.2 · listar todos los montajes RW de todos los contenedores y parar si alguno toca raíz, /home o el worktree
docker ps -aq | xargs -r docker inspect --format '{{.Name}}{{range .Mounts}}{{if .RW}} {{.Source}}{{end}}{{end}}' > "$S/A3e2-montajes-rw.txt" || echo "A3e.2 FALLÓ: parada dura" >&2
awk '{for(i=2;i<=NF;i++){s=$i; if (s=="/"||s=="/home"||s=="/home/proyectos"||s=="/home/proyectos/jozeuzz"||index(s,"/home/proyectos/jozeuzz-poc-candidata-a")==1||index(s,"/home/proyectos/jozeuzz/.git")==1) print $1, s}}' "$S/A3e2-montajes-rw.txt" > "$S/A3e2.txt"
sha256sum "$S/A3e2-montajes-rw.txt" "$S/A3e2.txt" >> "$S/SHA256SUMS"
test ! -s "$S/A3e2.txt" && echo sin-montajes-rw
```

- **A3e.1:** el registro previo (`A3e-antes.txt`) conserva qué se retiró. `docker rm -f` nunca lleva `-v`. Si tras retirarlos `A3e1.txt` no queda vacío, **parada dura**. Sólo se retiran contenedores con la etiqueta del proyecto `jozeuzz-poc-a`.
- **A3e.2:** es **parada dura** si alguna `Source` RW es exactamente `/`, `/home`, `/home/proyectos` o `/home/proyectos/jozeuzz`, o empieza por `/home/proyectos/jozeuzz-poc-candidata-a` o `/home/proyectos/jozeuzz/.git` (comparación anclada con `awk`). Un fallo de `docker` o de `xargs` también lo es (`pipefail` de A0). Limitación: enlaces simbólicos, rutas alternativas del CT (por ejemplo otro punto de montaje del mismo directorio) y otros daemons Docker quedan como **revisión humana**; no los detecta esta comprobación. Si sale algo: no tocar contenedores ajenos al proyecto `jozeuzz-poc-a`; el humano decide cómo retirarlo.
- **A3e.3:** no hay repetición de la guarda aquí. A1 (incluido `g status --short`) y A3 comprueban el árbol justo después; tras B1 se repite B1v. Cualquier salida distinta es parada dura.
- Es **parada dura** si, tras `docker rm -f`, A3e.1 sigue sin quedar vacío, o si A3e.2 no queda vacío.

### A1 · Estado del repositorio y blob del procedimiento

El humano lee este documento desde Git (`g show --no-textconv HEAD:docs/GATE-DOCKER-POC-3.md`), no desde el árbol de trabajo. Tras leerlo, anota su blob con `g rev-parse HEAD:docs/GATE-DOCKER-POC-3.md`. Al ejecutar, sigue el texto de ese mismo blob; si quiere evitar cualquier cambio posterior, lo lee con `g show --no-textconv <rev>:docs/GATE-DOCKER-POC-3.md`.

```sh
BLOB=<blob anotado por el humano tras leer el documento>
g branch --show-current                               # poc/candidata-a-3
CODEREF=0231888                                       # referencia vinculante de código (cabecera): commit A de la corrección A0/A4
g rev-parse --short HEAD                              # CODEREF o un commit posterior que sólo cambie docs/
g diff --name-only "$CODEREF"..HEAD                   # vacío o sólo rutas bajo docs/
g diff --name-only "$CODEREF"..HEAD | grep -v '^docs/'   # vacío (rc=1 es lo esperado)
g status --short                                      # vacío
test "$(g rev-parse HEAD:docs/GATE-DOCKER-POC-3.md)" = "$BLOB" && echo blob-ok
```

Es **parada dura** en cualquiera de estos casos:

- la rama no coincide;
- entre `CODEREF` y HEAD cambia algo fuera de `docs/` (el `grep -v '^docs/'` imprime alguna ruta);
- el árbol no está limpio, por ejemplo porque `docs/adr/` sigue sin confirmar;
- no sale `blob-ok`, es decir, el documento cambió después de que el humano lo leyera.

### A2 · Revisión obligatoria del contenido editado por agentes (S2, S4)

`<REV>` es el último commit que el humano revisó. **PENDIENTE:** lo fija el humano, porque este documento no lo conoce.

**A2a · Todo lo que el host ejecuta como root o que configura contenedores e instalación (diff completo, obligatorio):**

```sh
REV=<último commit revisado por el humano>
g log --format='%h %an %ad %s' --date=short "$REV"..HEAD -- poc1a contrato .gitattributes
g diff --no-ext-diff --no-textconv "$REV"..HEAD -- \
  poc1a/poc.sh 'poc1a/compose*.yaml' poc1a/proxy poc1a/scripts poc1a/package.json poc1a/package-lock.json poc1a/.npmrc \
  poc1a/test/docker poc1a/test/build poc1a/medicion poc1a/contrato-driver.mjs poc1a/driver \
  contrato poc1a/playwright.config.ts poc1a/playwright.medicion.config.ts .gitattributes poc1a/.gitattributes poc1a/contenedor
```

- `contrato` incluye `run.mjs`, `runner.mjs`, `casos/` y `fixture.mjs`, que importa `scripts/reset-e2e.mjs` (`reset-e2e.mjs:3`).
- En el árbol de `c8bbf0f` no existe ningún `.gitattributes` (deducción por listado). Si el diff lo muestra, es parada dura salvo explicación, porque podría declarar filtros o drivers de diff.
- En `c8bbf0f`, `package-lock.json` tiene 557 `resolved`, todos en `https://registry.npmjs.org/`, y ninguna mención de `axe-core` (lectura del archivo).

**A2b · Resto del código que corre en contenedores (al menos el resumen, obligatorio):**

```sh
g diff --no-ext-diff --stat "$REV"..HEAD -- poc1a/e2e poc1a/src poc1a/test/http poc1a/test/integracion poc1a/vitest.config.ts poc1a/tsconfig.json 'poc1a/next.config*'
```

Todo archivo del resumen que el humano no sepa explicar se abre con `g diff --no-ext-diff --no-textconv`.

**A2c · Configuración efectiva de Compose:**

```sh
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
grep -nE 'docker\.sock|privileged|network_mode|cap_add|pid:|ipc:|ports:|127\.0\.0\.1:' compose.yaml compose.pruebas.yaml
grep -n 'docker' poc.sh
docker compose -p jozeuzz-poc-a -f compose.yaml -f compose.pruebas.yaml --profile volumes-init --profile prod --profile e2e --profile deps config --no-interpolate > "$S/A2-compose-resuelto.yaml"
sed -n '/^services:/,/^networks:/p' "$S/A2-compose-resuelto.yaml" | grep -nE '^(  [a-z]|    (image|user|profiles|network_mode|security_opt|cap_drop|cap_add|privileged|read_only|tmpfs|volumes):|      - type:|        (source|target|read_only):)'
grep -nE 'external|name:|driver_opts|build:|devices|env_file|sock' "$S/A2-compose-resuelto.yaml"
```

- **`--no-interpolate` es obligatorio.** Sin él, `config` sustituye `${POC_DB_PASSWORD}`, `${PAYLOAD_SECRET}` e `${INTAKE_SECRETO}` desde `.env` (`compose.yaml:45,85,88,131,134`) e imprime los secretos.
- Los perfiles `volumes-init`, `deps`, `prod` y `e2e` existen (`compose.yaml:21,60,126,180`).
- La salida normalizada se guarda en `S` y el humano la abre y la compara con la matriz de abajo. El formato exacto de la salida de Compose (montajes en formato largo con `- type:`) no está verificado: si el `grep` no muestra los montajes, se lee el archivo completo.
- Las demás citas de línea de `poc.sh` y `compose.yaml` de este documento corresponden al código de `69e1883` y se desplazaron con el aislamiento de escritura; las de A2c ya están actualizadas. Las citas no actualizadas siguen refiriéndose a `69e1883`; la referencia vinculante de código es el commit A (ver la cabecera).

Qué hay que ver:

- **Primer `grep`:** `ports:` y los dos `127.0.0.1:3443/3444` del proxy (`compose.yaml:169-171`), más `network_mode: none` de `volumes-init` (`compose.yaml:24`). `volumes-init` es el único servicio con `network_mode: none`, `security_opt`, `cap_drop` y `user: 0:0`. Nada de `docker.sock`, `privileged` ni `cap_add`.
- **`grep` de `poc.sh`:** sólo `poc.sh:6` (`C="docker compose -p jozeuzz-poc-a …"`), `poc.sh:185` (`docker run` de `manifest-patch-axe`, usado sólo en A4) y `poc.sh:203` (`docker stats`).
- **`config`:** debe coincidir exactamente con esta matriz.

  | Servicio | `/app` | RW nombrados | RO nombrados | Binds de archivo RO | `/tmp` |
  |---|---|---|---|---|---|
  | `volumes-init` | ninguno | los diez volúmenes de aplicación bajo `/volumes/*`, sólo para ownership | ninguno | ninguno | no necesita |
  | `deps` | bind RO | `node_modules`, `npm_cache` | ninguno | ninguno | tmpfs |
  | `app` | bind RO | `next_dev`, `media_dev`, `media_test`, `media_prod` | `node_modules` | `contenedor/next-env.dev.txt` en `/app/next-env.d.ts` | tmpfs |
  | `app-prod` | bind RO | `next_prod`, `media_prod` | `node_modules` | `contenedor/next-env.prod.txt` en `/app/next-env.d.ts` | tmpfs |
  | `e2e` | bind RO | `test_results`, `playwright_report`, `blob_report` | `node_modules` | ninguno | tmpfs |

  - todos los `name:` empiezan por `jozeuzz-poc-a`, sea el proyecto, las redes o los volúmenes nombrados;
  - los `user:` son `1000:1000` en `deps`, `app`, `app-prod` y `e2e`, y `0:0` sólo en `volumes-init`;
  - los `source:` son rutas bajo `/home/proyectos/jozeuzz-poc-candidata-a/poc1a`: `.`, `contenedor/…`, `proxy/…` y `.tls`;
  - cada bind lleva `read_only: true`; los cuatro servicios Node tienen `read_only: true` y `/tmp` en tmpfs;
  - no aparece `external`, `driver_opts`, `build:`, `devices`, `env_file`, `privileged`, `cap_add` ni `sock`.
- **Parada dura de A2:** bind sin `read_only: true`, destino no listado, volumen `external`, `driver_opts`, source absoluta no aprobada, `node_modules` RW fuera de `deps`, caché npm fuera de `deps`, falta de `read_only: true` de servicio o falta de `/tmp` tmpfs. Para `volumes-init`, también cualquier bind, red distinta de `none`, `privileged`, `cap_add`, socket, volumen ajeno a los diez aprobados, imagen sin digest, usuario distinto de `0:0` o `cap_drop` distinto de la lista fijada por `test/estatico/compose-write-isolation.test.ts`.
- **En el diff:** ninguna escritura fuera de `poc1a/`, ninguna descarga ejecutada (`curl | sh`), ningún `rm` fuera de `.tls` y ningún otro proyecto Compose.

**A2d · Versión del motor y de runc (S-M10).** El aislamiento depende de que runc no tenga la fuga de descriptores de CVE-2024-21626 (corregida en runc 1.1.12). Es lectura del demonio (`docker version`), así que va en la clase Docker.

```sh
docker version > "$S/A2-docker-version.txt" 2>&1
runc --version > "$S/A2-runc-version.txt" 2>&1 || true   # puede no estar en PATH: entonces vale la versión de runc que informa docker version
RUNC="$(docker version --format '{{range .Server.Components}}{{.Name}} {{.Version}}{{"\n"}}{{end}}' | sed -n 's/^runc //p')"
sha256sum "$S/A2-docker-version.txt" "$S/A2-runc-version.txt" >> "$S/SHA256SUMS"
{ test -n "$RUNC" \
  && printf %s "$RUNC" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  && printf %s "$RUNC" | awk -F. '{ ok = ($1 > 1) || ($1 == 1 && $2 >= 4) || ($1 == 1 && $2 == 3 && $3 >= 3) || ($1 == 1 && $2 == 2 && $3 >= 8); exit !ok }' \
  && echo "runc-ok $RUNC"; } || echo "RUNC-PARADA: versión ausente, no numérica o inferior al mínimo de su rama"
```

- **Esperado:** `runc-ok <versión>` y ningún `RUNC-PARADA`. Se anotan `docker version` y `runc --version` en la fila A2.
- **Formato:** `X.Y.Z` numérico (sin sufijos como `-rc1`, `+dfsg` ni `~`). Cualquier otra cosa es parada dura.
- **Mínimo por rama de runc:** 1.2.x ≥ 1.2.8; 1.3.x ≥ 1.3.3; ≥ 1.4.0 pasa; inferior a 1.2 es parada dura. Cubre CVE-2024-21626 (fuga de descriptores, corregida en runc 1.1.12; las ramas 1.1.x ya no se aceptan), CVE-2025-31133, CVE-2025-52565 y CVE-2025-52881 (escapes por montajes y `/proc` en runc, corregidos en 1.2.8, 1.3.3 y 1.4.0-rc.3).
- **Parada dura** si runc es inferior al mínimo de su rama, si no se puede determinar su versión o si no sale `runc-ok`: sin esas correcciones, un contenedor puede alcanzar el árbol del host aunque el bind sea RO.
- **Versiones de distribución con retroportes o no numéricas** (por ejemplo `1.1.12+ds1-1`): parada y decisión humana documentada; la comprobación no las acepta automáticamente aunque la distribución afirme haber retroportado las correcciones.

Parada dura ante cualquier cosa no explicada.

### A3 · Carpeta de salidas, `r()`, guardas y listas de casos (S1, S7)

Las salidas se guardan **fuera del repositorio**, en una carpeta de modo 700. Recuerde la advertencia 9: esa protección es de política, no de permisos. Alternativa: `.jz-state/` está ignorada (`.gitignore:1`) y la leen los revisores, pero es zona de escritura de agentes. Si se usa para la revisión de U10, debe ser una copia con su `SHA256SUMS`.

```sh
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
test -d "$S" && test ! -L "$S" && test ! -L /root/jz-gate-poc3 && test "$(stat -c '%U %a' "$S")" = "root 700" && echo salidas-ok   # S se creó en A0; no se crea otra ruta
GUARDA='poc.sh contrato-driver.mjs driver scripts test/docker test/build medicion package.json package-lock.json compose.yaml compose.pruebas.yaml contenedor proxy .npmrc ../contrato'
r() {
  id="$1"; shift
  if [ -e "$S/$id.log" ]; then echo "ID REPETIDO: $id (usar $id-r2, …)" >&2; return 98; fi
  alterado="$(g status --porcelain -- $GUARDA)" || { echo "GIT FALLÓ" >&2; return 97; }
  if [ -n "$alterado" ]; then
    { echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ) :: $*"; echo "ARBOL ALTERADO"; printf '%s\n' "$alterado"; echo "rc=99"; } | tee "$S/$id.log"
    sha256sum "$S/$id.log" >> "$S/SHA256SUMS"; return 99
  fi
  { echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ) HEAD=$(g rev-parse --short HEAD) :: $*"; "$@"; } 2>&1 | tee "$S/$id.log"
  rc=$?; echo "rc=$rc" | tee -a "$S/$id.log"
  sha256sum "$S/$id.log" >> "$S/SHA256SUMS"; return "$rc"
}
tls_ok() { if test ! -L .tls && test ! -L .tls/ca.crt && [ "$(stat -c '%U' .tls)" = root ]; then echo TLS_OK; else echo "TLS ALTERADO"; return 99; fi; }
L44='AU-05,AU-06,AU-07,PR-04,PR-07,CO-01,CO-02,CO-03,CO-04,CO-05,CO-06,CO-07,CA-02,ES-01,ES-02,ES-03,ES-04,ES-05,ES-06,ES-07,ES-08,ES-09,ES-10,ES-11,MO-01,MO-02,MO-03,MO-04,MO-05,AU-01,AU-02,AU-03,AU-04,PR-01,PR-02,PR-03,PR-05,PR-06,EV-01,EV-02,EV-03,EV-04,EV-05,EV-06'
L43="$(printf %s "$L44" | tr ',' '\n' | grep -vx 'EV-04' | paste -sd, -)"
LIN='IN-01,IN-02,IN-03,IN-04,IN-05,IN-06,IN-07,IN-08,IN-09,IN-10,IN-11,IN-12'
for l in "$L44" "$L43" "$LIN"; do printf %s "$l" | tr ',' '\n' | wc -l; done   # 44, 43, 12
env | cut -d= -f1 | grep -E '^(POC_|E2E_|INTAKE_|NODE_TLS)'                     # vacío
node --version                                                                # ≥ v20
r A3d find . -maxdepth 2 '(' -user 1000 -o -perm -0002 ')' -not -path './node_modules*' -not -path './.n*'
```

**Guarda de integridad (S1).** Antes de ejecutar cada orden, `r()` comprueba con `git status --porcelain` las rutas de `GUARDA`, que son las que el host ejecuta o que configuran los contenedores. Si hay cambios o archivos nuevos sin seguimiento, imprime `ARBOL ALTERADO`, registra el log y devuelve 99.

- Es una **parada dura**: no se restaura nada sin decisión humana.
- `.npmrc` se añadió a la lista que propuso jz-security porque fija `ignore-scripts` para los contenedores, y `./.n*` lo excluye del listado A3d. `contenedor` se añadió porque contiene los `next-env.d.ts` que se montan en `app` y `app-prod`.
- **Excepción conocida:** entre la aplicación humana del parche de A4 (A4p) y su commit (A4k), `package.json` y `package-lock.json` están modificados, así que `r()` devolverá 99. Por eso A4b0, A4b y A4c van **después** del commit.
- La guarda no ve archivos ignorados por Git. Esto es aceptable porque los scripts del host no cargan `node_modules` (advertencia 2).

**A3d · find diagnóstico no vinculante.** Lista lo que el uid 1000 del host puede escribir en `poc1a/`. Se registra, pero **no bloquea**: `poc1a/` puede pertenecer a uid 1000 en el host y el bind efectivo en los contenedores es RO. No se infieren los permisos del contenedor desde ownership o bits de modo del host; los decide A3f.

**A3f (parada dura)** es el comprobante efectivo de montajes. Se ejecuta en la sección B, después de B1/B1v (`./poc.sh init`, que prepara los puntos de montaje) y antes de `db-up`. El `node_modules` del host no es prerrequisito de nada.

**A3e (parada dura)** se ejecuta antes de A1, justo después de A0 (véase «A3e · retirada de contenedores de la era RW»). La guarda de integridad de este apartado y B1v se repiten después, no dentro de A3e.

**Guarda de `.tls` (S1).** `tls_ok` se encadena tras cada orden que regenera `.tls`. Es **parada dura** si imprime `TLS ALTERADO` (enlace simbólico o propietario distinto de root).

**Listas y entorno.**

- `L44` es la lista literal de `poc1a/README.md:103`. `L43` es la misma sin EV-04, igual que `README.md:111`.
- **Parada dura** si los conteos no son 44, 43 y 12, si hay variables `POC_*`, `E2E_*`, `INTAKE_*` o `NODE_TLS*` en el entorno, o si no sale `salidas-ok`.
- El volumen nombrado `node_modules` lo puebla A3f2 (`./poc.sh deps`, `npm ci` con red). Un `poc1a/node_modules` en el host no cuenta como prerrequisito ni se consulta (queda enmascarado por el volumen).

**`NODE_EXTRA_CA_CERTS`.** Toda orden que recrea el proxy ejecuta `tls_efimera` y regenera la CA (`poc.sh:9-30`): `up-en`, `up-pruebas-en`, `up-fallos-en`, `up-prod-en`, `up-prod-pruebas-en`, `e2e-en` y `e2e-prod-en`. El valor de la variable no cambia (`$PWD/.tls/ca.crt`). Cada proceso Node lee el archivo al arrancar, así que lo que importa es lanzarlo después de la orden. Aun así se reexporta tras cada una, después de `tls_ok`, como pide `poc1a/README.md:94`, y siempre desde `poc1a/`.

### A4 · P3-05: instalación de `@axe-core/playwright@4.13.0` (S3)

**Requiere autorización explícita del humano en el momento de ejecutarla.** Sin este paso, los 3 tests de `e2e/intake-axe.spec.ts` se omiten (`intake-axe.spec.ts:22`), U8-axe queda PENDIENTE y el criterio de cierre «E2E con auditoría» no se cumple (`docs/PLAN-POC-3.md:179`).

- La opción está aprobada: P3-05 es `@axe-core/playwright` 4.13.0 (`docs/PLAN-POC-3.md:186`; `docs/POC-3-DISENO.md:7,286`).
- La versión aparece igual en `poc1a/README.md:77,80`. Que exista en el registro y que sea compatible con `@playwright/test` 1.64.1 (`package.json:28`) **no está verificado**: lo comprueba la propia instalación.
- Conviene hacerlo **antes** de D01, para que toda la evidencia corresponda a un único HEAD.
- **`--ignore-scripts` no protege la ejecución posterior.** Evita los scripts de instalación, pero el código de `@axe-core/playwright` y `axe-core` se ejecuta después en E2E (D18 y D28), dentro del contenedor `e2e`, con uid 1000, en la red interna `e2e` y con `./` montado como bind RO. Por eso se revisa el lockfile antes del commit.
- **Nuevo modelo (sin escritura del repositorio desde contenedores).** El contenedor `deps` ya no puede editar `package.json` ni el lockfile (bind RO). `./poc.sh manifest-patch-axe` copia ambos manifiestos a un `tmpfs`, ejecuta `npm install --package-lock-only --ignore-scripts --save-exact --save-dev` como uid 1000 con `--cap-drop ALL` y `no-new-privileges`, y emite un único JSON con los dos manifiestos en base64. El host (root humano) valida, decodifica y genera el parche con `diff`; la **aplicación humana revisada** es un paso separado. No instala `node_modules`; el volumen se actualiza después con `npm ci` (A4b0).

**Orden de ejecución.** A4 completo (generación, revisión humana con aprobación por hash, aplicación, verificación, commit y los pasos A4b0, A4b y A4c) se ejecuta **después de B1/B1v y de A3f1-A3f3**, aunque figure en la sección A por legibilidad: A4b0, A4b y A4c usan el servicio `deps`, que necesita los puntos de montaje de `init` (B1) y el ownership de los volúmenes (A3f1-A3f3). Los pasos de generación sólo usan `docker run` de `manifest-patch-axe`, pero se mantiene un único orden para no mezclar HEADs.

**Fases (I-2).** A4 se divide en cinco fases, cada una en su bloque y con una parada explícita entre ellas. Un agente nunca aprueba ni aplica.

| Fase | Qué hace | rc | Escribe en el árbol |
|---|---|---|---|
| A4a · Generación | Genera `manifest-patch-axe`, decodifica, construye `A4-tsconfig.json` y el parche de los tres archivos; `apply --check` | `a4a_rc` | No |
| A4r · Revisión | Comprueba automáticamente los archivos de `$S` contra el árbol (antes de aplicar nada); el humano lee el parche completo, teclea su hash y registra la aprobación | `a4r_rc` | No |
| A4p · Aplicación | Sólo si el hash actual del parche es el aprobado, HEAD no se movió y el árbol está limpio | `a4p_rc` | Sí (`apply`) |
| A4v · Verificación | Exactamente tres rutas modificadas, idénticas byte a byte a las aprobadas | `a4v_rc` | No |
| A4k · Commit | Commit local sin hooks ni firma y comprobaciones posteriores | `a4k_rc` | Sí (commit) |

**Salidas de error.** Cada fase corre en una subshell `( … )`: una salida por error (guarda alterada, `diff` inválido, `manifest-patch-axe` con rc≠0, hash distinto) termina sólo la subshell y no cierra la sesión interactiva ni se pierde `$S`. Cada subshell abre con `set -eu` (sólo funciona porque no se usa como condición de `||`/`&&`; `set -u` hace que un `A4_APROBADO` sin definir falle cerrado) y A4a se detiene si `$S` ya contiene archivos A4 de un intento anterior. Tras cada subshell, su rc debe ser 0; si no, es parada dura y las fases siguientes quedan bloqueadas.

```sh
# A4a · Generación (no escribe nada en el árbol)
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
(
set -eu
for f in "$S/A4-package.json" "$S/A4-package-lock.json" "$S/A4-tsconfig.json" "$S/A4-manifiestos.json" "$S/A4-manifiestos.patch" "$S/A4-base.txt" "$S/A4-verificacion.txt" "$S/A4-aprobacion.txt"; do
  if [ -e "$f" ] || [ -L "$f" ]; then echo "A4: $f ya existe (A4-package.json de un intento anterior): parada, no reutilizar" >&2; exit 1; fi
done
grep -c '^ignore-scripts=true$' .npmrc          # 1 (EVIDENCIA.md:167); no se imprime .npmrc
alterado="$(g status --porcelain -- $GUARDA)" || { echo "GIT FALLÓ" >&2; exit 97; }
test -z "$alterado" || { echo "ARBOL ALTERADO" >&2; exit 99; }
g rev-parse HEAD > "$S/A4-base.txt"
command -v node
node --version
node -e 'const m=Number(process.versions.node.split(".")[0]); if (m < 20) process.exit(1)'
command -v diff
diff_version="$(diff --version | head -n 1)"
printf '%s\n' "$diff_version"
case "$diff_version" in *'GNU diffutils'*) ;; *) echo "diff host no es GNU diffutils" >&2; exit 1 ;; esac
rc=0
./poc.sh manifest-patch-axe > "$S/A4-manifiestos.json" 2> "$S/A4a.stderr.log" || rc=$?
printf 'rc=%s\n' "$rc" >> "$S/A4a.stderr.log"
sha256sum "$S/A4a.stderr.log" "$S/A4-manifiestos.json" >> "$S/SHA256SUMS"
test "$rc" -eq 0 || exit "$rc"
node - "$S/A4-manifiestos.json" "$S" tsconfig.json <<'NODE'
const fs = require('node:fs')
const [entrada, salida, tsconfig] = process.argv.slice(2)
const datos = JSON.parse(fs.readFileSync(entrada, 'utf8'))
if (Object.keys(datos).sort().join(',') !== 'packageJson,packageLockJson') throw new Error('claves A4 inválidas')
function escribir(nombre, contenido) {
  fs.writeFileSync(`${salida}/${nombre}`, contenido, { flag: 'wx', mode: 0o600 })
}
function decodificar(nombre, valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(valor)) throw new Error(`${nombre}: base64 inválido`)
  const contenido = Buffer.from(valor, 'base64')
  if (contenido.toString('base64') !== valor) throw new Error(`${nombre}: base64 no canónico`)
  JSON.parse(contenido.toString('utf8'))
  escribir(nombre, contenido)
}
decodificar('A4-package.json', datos.packageJson)
decodificar('A4-package-lock.json', datos.packageLockJson)
// tsconfig.json: se quita exactamente una ocurrencia de e2e/intake-axe.spec.ts de "exclude" (no hay edición manual)
const viejo = '    "node_modules",\n    "e2e/intake-axe.spec.ts"\n'
const nuevo = '    "node_modules"\n'
const actual = fs.readFileSync(tsconfig, 'utf8')
if (actual.split(viejo).length - 1 !== 1) throw new Error('tsconfig.json: el bloque exclude no aparece exactamente una vez')
const resultado = actual.replace(viejo, () => nuevo)
JSON.parse(resultado)
escribir('A4-tsconfig.json', resultado)
NODE
: > "$S/A4-manifiestos.patch"
diff_rc=0
diff -u --label a/poc1a/package.json --label b/poc1a/package.json package.json "$S/A4-package.json" >> "$S/A4-manifiestos.patch" || diff_rc=$?
test "$diff_rc" -eq 1 || { echo "A4 package.json sin diff válido: rc=$diff_rc" >&2; exit 1; }
diff_rc=0
diff -u --label a/poc1a/package-lock.json --label b/poc1a/package-lock.json package-lock.json "$S/A4-package-lock.json" >> "$S/A4-manifiestos.patch" || diff_rc=$?
test "$diff_rc" -eq 1 || { echo "A4 package-lock.json sin diff válido: rc=$diff_rc" >&2; exit 1; }
diff_rc=0
diff -u --label a/poc1a/tsconfig.json --label b/poc1a/tsconfig.json tsconfig.json "$S/A4-tsconfig.json" >> "$S/A4-manifiestos.patch" || diff_rc=$?
test "$diff_rc" -eq 1 || { echo "A4 tsconfig.json sin diff válido: rc=$diff_rc" >&2; exit 1; }
sha256sum "$S/A4-package.json" "$S/A4-package-lock.json" "$S/A4-tsconfig.json" "$S/A4-manifiestos.patch" "$S/A4-base.txt" >> "$S/SHA256SUMS"
test -s "$S/A4-manifiestos.patch"
g -C .. apply --check "$S/A4-manifiestos.patch"
)
a4a_rc=$?
echo "A4a rc=$a4a_rc"   # debe ser 0; si no, parada dura (se conservan $S/A4a.stderr.log y los demás archivos)
test "$a4a_rc" -eq 0 || echo "A4a FALLÓ: parada dura, no continuar" >&2
```

```sh
# A4r · Comprobación automática previa (sobre los archivos de $S; el árbol no se modifica)
# Compara package.json y package-lock.json del árbol con $S/A4-package.json y $S/A4-package-lock.json; no mira ningún archivo ya aplicado.
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
(
set -eu
test "$a4a_rc" -eq 0
if grep -qE '"(git\+|file:|http:)' "$S/A4-package-lock.json"; then echo "A4r: URL git+, file: o http: en el lockfile propuesto" >&2; exit 1; fi
node - "$S" <<'NODE'
const fs = require('node:fs')
const { isDeepStrictEqual } = require('node:util')
const S = process.argv[2]
const NOMBRE = '@axe-core/playwright'
const VERSION = '4.13.0'
const REGISTRO = 'https://registry.npmjs.org/'
const leer = (ruta) => JSON.parse(fs.readFileSync(ruta, 'utf8'))
const informe = []
let desviaciones = 0
function exigir(condicion, texto) {
  if (!condicion) desviaciones++
  informe.push(`${condicion ? 'ok' : 'DESVIACIÓN'}: ${texto}`)
}
const sinDev = (objeto) => { const { devDependencies, ...resto } = objeto; return resto }
const conAxe = (dev) => ({ ...dev, [NOMBRE]: VERSION })
// package.json: sólo cambia devDependencies, añadiendo la dependencia exacta
const pkg0 = leer('package.json')
const pkg1 = leer(`${S}/A4-package.json`)
exigir(!(NOMBRE in (pkg0.devDependencies ?? {})), 'package.json del árbol no declaraba ya la dependencia')
exigir(isDeepStrictEqual(sinDev(pkg1), sinDev(pkg0)), 'package.json: todo salvo devDependencies es profundamente igual')
exigir(isDeepStrictEqual(pkg1.devDependencies, conAxe(pkg0.devDependencies ?? {})), `package.json: devDependencies = las anteriores + "${NOMBRE}": "${VERSION}"`)
// package-lock.json
const lock0 = leer('package-lock.json')
const lock1 = leer(`${S}/A4-package-lock.json`)
const { packages: p0, ...resto0 } = lock0
const { packages: p1, ...resto1 } = lock1
exigir(lock1.name === lock0.name && lock1.version === lock0.version && lock1.lockfileVersion === lock0.lockfileVersion, 'lockfile: name, version y lockfileVersion iguales')
exigir(isDeepStrictEqual(resto1, resto0), 'lockfile: las demás claves de primer nivel son iguales')
const claves0 = Object.keys(p0)
const claves1 = Object.keys(p1)
exigir(claves0.filter((k) => !(k in p1)).length === 0, 'lockfile: ninguna clave de packages eliminada')
const nuevas = claves1.filter((k) => !(k in p0)).sort()
exigir(isDeepStrictEqual(nuevas, ['node_modules/@axe-core/playwright', 'node_modules/axe-core']), `lockfile: claves nuevas = ${nuevas.join(', ')}`)
const cambiadas = claves0.filter((k) => k !== '' && k in p1 && !isDeepStrictEqual(p1[k], p0[k]))
exigir(cambiadas.length === 0, `lockfile: ${claves0.length - 1} entradas preexistentes profundamente iguales${cambiadas.length ? ` (cambiadas: ${cambiadas.slice(0, 5).join(', ')})` : ''}`)
const raiz0 = p0[''] ?? {}
const raiz1 = p1[''] ?? {}
exigir(isDeepStrictEqual(sinDev(raiz1), sinDev(raiz0)), 'lockfile packages[""]: todo salvo devDependencies igual')
exigir(isDeepStrictEqual(raiz1.devDependencies, conAxe(raiz0.devDependencies ?? {})), `lockfile packages[""]: sólo gana "${NOMBRE}": "${VERSION}" en devDependencies`)
for (const k of nuevas) {
  const entrada = p1[k]
  exigir(typeof entrada.resolved === 'string' && entrada.resolved.startsWith(REGISTRO), `${k}: resolved empieza por ${REGISTRO}`)
  exigir(typeof entrada.integrity === 'string' && entrada.integrity.startsWith('sha512-'), `${k}: integrity sha512-`)
}
exigir(claves1.every((k) => p1[k].resolved === undefined || String(p1[k].resolved).startsWith(REGISTRO)), 'lockfile: todo resolved está en el registro npm')
exigir(p1[`node_modules/${NOMBRE}`]?.version === VERSION, `${NOMBRE} = ${VERSION} en el lockfile`)
informe.push(`versión de axe-core (transitiva): ${p1['node_modules/axe-core']?.version}`)
informe.push(`desviaciones: ${desviaciones}`)
fs.writeFileSync(`${S}/A4-verificacion.txt`, `${informe.join('\n')}\n`, { flag: 'wx', mode: 0o600 })
console.log(informe.join('\n'))
if (desviaciones > 0) process.exit(1)
NODE
test -s "$S/A4-verificacion.txt"
sha256sum "$S/A4-verificacion.txt" >> "$S/SHA256SUMS"
)
a4r_rc=$?
echo "A4r rc=$a4r_rc"   # debe ser 0; si no, parada dura y no se aplica nada
test "$a4r_rc" -eq 0 || echo "A4r FALLÓ: parada dura, no aplicar" >&2
cat "$S/A4-verificacion.txt"
cat "$S/A4-manifiestos.patch"       # el humano lee el parche COMPLETO
sha256sum "$S/A4-manifiestos.patch"
```

```sh
# A4r (aprobación humana) · PARADA: no continuar a A4p sin aprobación
A4_APROBADO=<sha256 del parche leído, tecleado por el humano>
APROBADOR=<responsable que aprueba>
(
set -eu
test "$a4a_rc" -eq 0
test "$a4r_rc" -eq 0
printf %s "$A4_APROBADO" | grep -Eq '^[0-9a-f]{64}$' || { echo "A4r: A4_APROBADO no es un sha256" >&2; exit 1; }
test -n "$APROBADOR" || { echo "A4r: falta responsable humano" >&2; exit 1; }
actual="$(sha256sum "$S/A4-manifiestos.patch" | cut -d' ' -f1)"
test "$actual" = "$A4_APROBADO" || { echo "A4r: el parche actual no es el aprobado" >&2; exit 1; }
( set -C; printf 'sha256=%s\nresponsable=%s\nfecha_utc=%s\n' "$A4_APROBADO" "$APROBADOR" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$S/A4-aprobacion.txt" )
sha256sum "$S/A4-aprobacion.txt" >> "$S/SHA256SUMS"
)
a4h_rc=$?
echo "A4r aprobación rc=$a4h_rc"   # debe ser 0; si no, parada dura y no se aplica nada
test "$a4h_rc" -eq 0 || echo "A4r aprobación FALLÓ: parada dura, no aplicar" >&2
```

```sh
# A4p · Aplicación (única fase que modifica el árbol de trabajo)
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
(
set -eu
test "$a4a_rc" -eq 0
test "$a4r_rc" -eq 0
test "$a4h_rc" -eq 0
printf %s "$A4_APROBADO" | grep -Eq '^[0-9a-f]{64}$' || { echo "A4p: A4_APROBADO no es un sha256" >&2; exit 1; }
actual="$(sha256sum "$S/A4-manifiestos.patch" | cut -d' ' -f1)"
test "$actual" = "$A4_APROBADO" || { echo "A4p: el parche actual no es el aprobado" >&2; exit 1; }
grep -qx "sha256=$A4_APROBADO" "$S/A4-aprobacion.txt" || { echo "A4p: el hash no consta en A4-aprobacion.txt" >&2; exit 1; }
test "$(g rev-parse HEAD)" = "$(cat "$S/A4-base.txt")" || { echo "A4p: HEAD se movió desde A4a" >&2; exit 1; }
st="$(g -C .. status --porcelain)" || { echo "GIT FALLÓ" >&2; exit 97; }
test -z "$st" || { echo "A4p: el árbol no está limpio" >&2; exit 1; }
g_efectiva || { echo "A4p: configuración efectiva de g alterada" >&2; exit 1; }
atributos_limpios || { echo "A4p: atributos de manifiestos alterados o check-attr falló" >&2; exit 1; }
g -C .. apply --check "$S/A4-manifiestos.patch"
g -C .. apply "$S/A4-manifiestos.patch"
)
a4p_rc=$?
echo "A4p rc=$a4p_rc"   # debe ser 0; si no, parada dura
test "$a4p_rc" -eq 0 || echo "A4p FALLÓ: parada dura" >&2
```

```sh
# A4v · Verificación previa al commit (no modifica nada)
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
(
set -eu
test "$a4p_rc" -eq 0
st="$(g -C .. status --porcelain)" || { echo "GIT FALLÓ" >&2; exit 97; }
test "$(printf '%s\n' "$st" | LC_ALL=C sort)" = "$(printf '%s\n' ' M poc1a/package.json' ' M poc1a/package-lock.json' ' M poc1a/tsconfig.json' | LC_ALL=C sort)" || { echo "A4v: el estado no son exactamente las tres rutas" >&2; exit 1; }
cmp package.json "$S/A4-package.json"
cmp package-lock.json "$S/A4-package-lock.json"
cmp tsconfig.json "$S/A4-tsconfig.json"
)
a4v_rc=$?
echo "A4v rc=$a4v_rc"   # debe ser 0; si no, parada dura
test "$a4v_rc" -eq 0 || echo "A4v FALLÓ: parada dura, no confirmar" >&2
g diff --no-ext-diff --no-textconv -- package.json tsconfig.json   # para lectura: una línea nueva de dependencia y la quitada de exclude
g diff --no-ext-diff --no-textconv --stat -- package-lock.json
```

```sh
# A4k · Commit local (sin hooks ni firma)
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
(
set -eu
test "$a4v_rc" -eq 0
base="$(cat "$S/A4-base.txt")"
test "$(g rev-parse HEAD)" = "$base" || { echo "A4k: HEAD se movió desde A4a" >&2; exit 1; }
cmp package.json "$S/A4-package.json"
cmp package-lock.json "$S/A4-package-lock.json"
cmp tsconfig.json "$S/A4-tsconfig.json"
g_efectiva || { echo "A4k: configuración efectiva de g alterada" >&2; exit 1; }
atributos_limpios || { echo "A4k: atributos de manifiestos alterados o check-attr falló" >&2; exit 1; }
g -C .. add -- poc1a/package.json poc1a/package-lock.json poc1a/tsconfig.json
test "$(g -C .. diff --cached --no-ext-diff --name-only | LC_ALL=C sort)" = "$(printf '%s\n' poc1a/package-lock.json poc1a/package.json poc1a/tsconfig.json | LC_ALL=C sort)" || { echo "A4k: lo preparado no son exactamente las tres rutas" >&2; exit 1; }
g -C .. commit --no-verify --no-gpg-sign -m "chore(poc-3): add @axe-core/playwright 4.13.0 (P3-05)"
test "$(g cat-file commit HEAD | sed -n '/^$/q;p' | grep -c '^gpgsig')" = 0 || { echo "A4k: el commit lleva gpgsig" >&2; exit 1; }
test "$(g diff-tree --no-commit-id --name-only -r HEAD | LC_ALL=C sort)" = "$(printf '%s\n' poc1a/package-lock.json poc1a/package.json poc1a/tsconfig.json | LC_ALL=C sort)" || { echo "A4k: el commit no contiene exactamente las tres rutas" >&2; exit 1; }
test "$(g rev-parse HEAD~1)" = "$base" || { echo "A4k: HEAD~1 no es la base" >&2; exit 1; }
g rev-parse --short HEAD                          # nuevo HEAD de referencia
)
a4k_rc=$?
echo "A4k rc=$a4k_rc"   # debe ser 0; si no, parada dura
test "$a4k_rc" -eq 0 || echo "A4k FALLÓ: parada dura" >&2
```

```sh
# A4b · Tras el commit (antes de él, r devolvería 99 por la guarda)
test "$a4k_rc" -eq 0 && r A4b0 ./poc.sh deps                              # npm ci: puebla el volumen node_modules con el lockfile nuevo (con red)
r A4b ./poc.sh deps npm ls @axe-core/playwright axe-core @playwright/test
r A4c ./poc.sh deps npm audit signatures
```

- **A4a genera un parche, no instala ni aplica nada por sí mismo.** `node --version` debe informar Node 20 o superior. `diff --version` debe identificar GNU diffutils; si falta o no se identifica, A4 se detiene antes de Docker. `manifest-patch-axe` usa red y Docker sólo en la ejecución humana futura, corre como uid 1000 con la imagen fijada, dirige npm a stderr y emite sólo JSON por stdout. El host valida claves, base64 canónico y JSON, escribe salidas root 600 y genera el parche con la herramienta host ya comprobada. No existe bind RW ni dependencia de `diff` dentro de la imagen. Ningún agente aprueba ni aplica el parche.
  - **Esperado / Si no: parada dura.** Esperado: `A4a rc=0`, `A4-base.txt` con el HEAD actual y `apply --check` sin salida. Si no: parada dura y no se continúa a A4r.
- **tsconfig dentro del parche (I-2).** `e2e/intake-axe.spec.ts` sale de `exclude` en `tsconfig.json` sin edición manual: el script de A4a sustituye exactamente una ocurrencia de `"node_modules"` + `"e2e/intake-axe.spec.ts"` por `"node_modules"` (falla si no hay exactamente una) y lo escribe en `$S/A4-tsconfig.json` con `wx` y modo 0600. El parche contiene los tres archivos (`package.json`, `package-lock.json` y `tsconfig.json`) con etiquetas `a/poc1a/…` y `b/poc1a/…`, así que lo que el humano revisa y aprueba es lo único que se aplica.
- **A4r · revisión humana obligatoria, antes de cualquier aplicación (I-2).**
  1. **Comprobación automática** (`a4r_rc`), sobre los archivos de `$S` y **no sobre el árbol ya modificado**. Exige: en `package.json` sólo cambia `devDependencies`, añadiendo `"@axe-core/playwright": "4.13.0"` (todo lo demás, profundamente igual); en el lockfile, `name`, `version`, `lockfileVersion` y demás claves de primer nivel iguales; las claves nuevas de `packages` son exactamente `node_modules/@axe-core/playwright` y `node_modules/axe-core`; no se elimina ninguna clave; toda entrada preexistente es profundamente igual salvo `packages[""]`, que sólo puede ganar esa devDependency; las dos entradas nuevas tienen `resolved` que empieza por `https://registry.npmjs.org/` e `integrity` `sha512-`; y la versión de `@axe-core/playwright` es 4.13.0. Registra además la versión de `axe-core`. El informe va a `$S/A4-verificacion.txt` (con su `sha256` en `SHA256SUMS`) y se mantienen las comprobaciones de URL `git+`, `file:` y `http:` sobre `$S/A4-package-lock.json`. Cualquier desviación es parada dura y no se aplica nada.
   2. **Lectura y aprobación.** El humano lee el parche **completo** (`cat "$S/A4-manifiestos.patch"`) y `A4-verificacion.txt`, obtiene `sha256sum "$S/A4-manifiestos.patch"` y, sólo si aprueba, **teclea el hash leído** en `A4_APROBADO=<…>` (marcador como `BLOB`/`REV`: no se calcula por script, porque un script aprobaría cualquier parche) y declara un `APROBADOR` no vacío. Antes de crear `$S/A4-aprobacion.txt`, el bloque vuelve a exigir A4a/A4r verdes, forma SHA-256 válida y coincidencia del hash actual: una confirmación ausente, incorrecta o para un parche alterado no crea registro. **PARADA: no continuar a A4p sin aprobación.**
  - **Esperado / Si no: parada dura.** Esperado: `A4r rc=0`, ninguna línea `DESVIACIÓN` en `A4-verificacion.txt` y el hash tecleado igual al del parche leído. Si no: parada dura, sin aplicar.
- **A4p · aplicación.** Exige `a4a_rc`, `a4r_rc` y aprobación verde en 0; `A4_APROBADO` definido (con `set -u` un valor sin definir falla cerrado) y con forma de `sha256`; el `sha256` actual del parche igual a `A4_APROBADO` y presente en `A4-aprobacion.txt`; HEAD igual a `A4-base.txt`; y `g -C .. status --porcelain` vacío (el árbol entero limpio). Inmediatamente antes de `apply --check` vuelve a validar la configuración efectiva endurecida de `g` y los atributos de los tres manifiestos. Sólo entonces ejecuta `g -C .. apply --check` y `g -C .. apply`.
  - **Esperado / Si no: parada dura.** Esperado: `A4p rc=0`. Si no (hash no aprobado o distinto, HEAD movido, árbol sucio): parada dura; no se aplica nada porque `git apply` es atómico.
- **A4v · verificación previa al commit.** Exige `a4p_rc=0`; `g -C .. status --porcelain` debe ser exactamente ` M poc1a/package.json`, ` M poc1a/package-lock.json` y ` M poc1a/tsconfig.json`, y `cmp` de los tres archivos del árbol con los de `$S` aprobados debe ser idéntico. Los diffs para lectura llevan `--no-ext-diff --no-textconv`.
  - **Esperado / Si no: parada dura.** Esperado: `A4v rc=0`. Si no: parada dura, sin confirmar.
- **A4k · commit.** Exige `a4v_rc=0`, repite `cmp` y HEAD igual a la base; inmediatamente antes de preparar cambios vuelve a validar configuración efectiva de `g` y atributos de manifiestos. Entonces prepara exactamente las tres rutas (`g -C .. add -- …`, con `diff --cached --name-only` exacto) y confirma con `g -C .. commit --no-verify --no-gpg-sign` (con `g` endurecida y sin hooks ni firma). Después comprueba, con fontanería que no invoca gpg, que la cabecera del commit no tiene `gpgsig` (`g cat-file commit HEAD | sed -n '/^$/q;p' | grep -c '^gpgsig'` debe dar 0), que `g diff-tree --no-commit-id --name-only -r HEAD` lista las tres rutas y que `HEAD~1` es la base. El HEAD nuevo es la referencia de código si se hace A4.
  - **Esperado / Si no: parada dura.** Esperado: `A4k rc=0` y el HEAD nuevo. Si no (commit firmado, rutas distintas, HEAD~1 distinto de la base): parada dura.
- **Etiquetas del parche (M-2).** Las etiquetas `a/poc1a/package.json` y `b/poc1a/package.json` (y las del lockfile y de `tsconfig.json`) son rutas del parche relativas a la raíz del repositorio. `g` (A0) no lleva `-C`, así que A4a se ejecuta en `poc1a/`. **Prueba decisiva (ciclo 2, ejecutada con `jz-run`):** en un repositorio temporal con `sub/f` se generó el parche con GNU `diff -u --label a/sub/f --label b/sub/f sub/f nuevo > p` (parche tradicional, no `git diff`). Resultado: `(cd sub && git apply --check ../p)` rc=0 y `git apply --check p` desde la raíz rc=0; `git apply` desde `sub/` modificó `sub/f`. Es decir, las etiquetas son rutas desde la raíz y funcionan también desde el subdirectorio. Con un parche de un archivo de la raíz (`top`), en cambio, `git apply --check`/`git apply` desde `sub/` devolvieron rc=1 sin tocar nada: desde un subdirectorio `git apply` sólo aplica archivos bajo el directorio actual. Por eso la forma robusta es ejecutar `--check` y la aplicación humana desde la raíz del worktree (`g -C .. apply …`, con la ruta absoluta `$S/…`): no depende del directorio actual aunque el parche llegara a incluir otras rutas, y las etiquetas `a/poc1a/…` y `b/poc1a/…` son entonces exactamente las que se resuelven. `a/package.json` no sería correcto. Cada subshell lleva `set -eu`: cada paso fallido la termina y deja su rc ≠ 0; A4r exige A4a, A4p exige A4r y aprobación, A4v exige A4p y A4k exige A4v, así que una fase fallida bloquea toda mutación posterior.
- **A4b0 (añadido por el relevo):** como `node_modules` es un volumen nombrado, instalar el parche en el repositorio no lo actualiza; `npm ci` (A4b0) lo hace antes de `npm ls` y de los E2E con axe.
- **Sustituye a los conteos con `grep` sobre el diff:** las comprobaciones del lockfile (claves nuevas exactas, entradas preexistentes intactas, `resolved` y `integrity`) las hace A4r con un script sobre los archivos de `$S`, **antes** de aplicar nada; ya no se infieren de conteos de líneas del diff después de aplicar. El humano además lee el parche completo.
- **`npm audit signatures`:** `./poc.sh deps` acepta cualquier orden y la ejecuta en el servicio `deps`, que tiene red externa (`poc.sh:78`; `compose.yaml:58-77`). El texto exacto de su salida no está verificado. Se registra completo.
- **Parada dura**, antes de aplicar o de confirmar, si ocurre cualquiera de estas cosas:
  - `manifest-patch-axe` falla: `E404`, `ETARGET` o `EACCES`. Un `EACCES`/`EROFS` en los manifiestos del repositorio no se resuelve abriendo el bind ni cambiando permisos sin decisión humana;
  - A4r informa una desviación: cambian otros paquetes de `package.json`, aparecen claves `node_modules/…` distintas de las dos esperadas (por ejemplo una copia anidada de `axe-core`), se elimina o cambia alguna entrada preexistente, o algún `resolved` no está en `https://registry.npmjs.org/`;
  - el hash tecleado no es el del parche leído o falta la aprobación;
  - HEAD se movió, el árbol no está limpio o el estado no son exactamente las tres rutas;
  - la configuración Git o los atributos no se explican (A0), o el commit lleva `gpgsig`.
- **Parada dura después del commit** si `npm ls` informa `invalid` o `UNMET PEER`, o si `npm audit signatures` informa firmas inválidas. **PENDIENTE (decisión humana):** cómo deshacer el commit local de A4 en ese caso. No hay push.
- La fila A4 registra la versión de `@axe-core/playwright` y la de `axe-core`.

### Clasificación de operaciones por privilegio

| Clase | Operaciones | Regla |
|---|---|---|
| setpriv UID 1000, sin grupo docker | Sólo D21b (`node --test test/build/comprobar-build.test.mjs`) y D30 (`env POC_BASE_URL=https://127.0.0.1:3444 node medicion/intake-latencia.mjs`), porque no invocan `poc.sh` ni Docker | Lanzar con `setpriv --reuid=1000 --regid=1000 --clear-groups`. D30 hereda `NODE_EXTRA_CA_CERTS` y necesita leer `.tls/ca.crt`, no socket. Si cualquiera empieza a invocar `poc.sh`, cambia automáticamente a la clase Docker |
| Docker: privilegio equivalente a root | Todo `docker compose up/run/exec/logs/down`, `docker version`, `docker ps`, `docker inspect` y `docker rm -f` (A2d y A3e: retirada de contenedores de la era RW sin Compose), `docker image inspect`, `docker stats`, `init-volumes`, `deps`, `probe-mounts`, `run-prod-en`, `manifest-patch-axe` y los pasos D01-D29 que los usan. D13, D16, D17, D26 y D27 también pertenecen aquí: el driver llama `poc.sh exec-en` para resetear cada caso | Sólo humano autorizado. Pertenecer al grupo Docker o usar el socket como no-root sigue siendo root-equivalente sobre el CT. No delegar a agentes |
| root real: `.env`, `.tls` y salidas | `./poc.sh init`, creación/validación de `.env` 600, generación/reemplazo de `.tls` root-owned, creación de `/root/jz-gate-poc3`, `SHA256SUMS`, búsqueda por valores secretos, captura del parche A4 y la aplicación y el commit de A4 (A4p y A4k, que ejecutan Git como root: siempre con la `g` endurecida de A0, sin hooks ni firma, tras la aprobación por hash) | Ejecutar como root humano con `umask 077`. No abrir ni copiar valores secretos |
| Compose sin daemon | El comando literal `docker compose -p jozeuzz-poc-a -f compose.yaml -f compose.pruebas.yaml --profile volumes-init --profile prod --profile e2e --profile deps config --no-interpolate` de A2c | Usa el parser Compose y no necesita socket. Corre como **root humano** (necesita leer `.env` root 600 aunque no interpola) y no necesita estar en el grupo Docker. `--no-interpolate` no exige variables: Compose no sustituye `${…}`, así que A2c no depende de que `.env` sea válido y no hace falta reordenarlo tras B1v. Toda orden compose que **sí** interpole (cualquier `./poc.sh`) va después de validar `.env` con B1v. A3e ya no interpola: retira los contenedores con `docker rm -f` sin Compose. Aun así se revisa como configuración que luego consumirá el daemon |

## B. Prerrequisitos Docker

Todos desde `poc1a/`, con el entorno de A0 y A3. **A3e (sin contenedores de la era RW y sin montajes RW peligrosos; primer paso tras A0) debe haber pasado antes de B1.**

| Paso | Orden | Esperado | Parada |
|---|---|---|---|
| B1 | `r B1 ./poc.sh init` | rc=0; sin salida. `./poc.sh init` prepara los puntos de montaje (directorios `node_modules`, `.npm-cache`, `.next`, `.next-prod`, `media-store`, `media-store-test`, `media-store-prod`, `test-results`, `playwright-report` y `blob-report`, y un `next-env.d.ts` vacío si no existe, creado de forma exclusiva con `set -C` (`O_EXCL` cubre también un enlace colgante creado tras la comprobación; un enlace a un archivo no regular creado a la vez se detecta después con `-L`; la garantía depende de que A3e haya retirado los escritores concurrentes); un enlace simbólico en cualquiera de ellos es error y `exit 1`) y después crea `.env` si falta y añade `INTAKE_SECRETO` si no está (`poc.sh:41-54`). No abrir `.env`. A3f depende de ello: runc no puede crear destinos dentro de un bind RO | dura |
| B1v | validación de `.env` sin imprimir valores (S5), abajo | `0`, `3` y `root 600` | dura |
| A3f | `r A3f1 ./poc.sh init-volumes`, `r A3f2 ./poc.sh deps` y `r A3f3 ./poc.sh probe-mounts` (abajo) | tres rc=0; A3f3 imprime `MOUNT_PROBE_OK` cuatro veces | dura |
| A4 | Si el humano lo autoriza: A4 completo (A4a generación, A4r revisión y aprobación por hash, A4p aplicación, A4v verificación, A4k commit, A4b0, A4b y A4c), **después de A3f y antes de B2** | ver A4 | dura |
| B2 | `r B2 ./poc.sh db-up` | rc=0 (`poc.sh:80`) | dura |
| B3 | `r B3 ./poc.sh psql -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'poc3%' ORDER BY 1"` | rc=0; lista las `poc3*` existentes | dura si rc≠0 |
| B4 | `r B4a ./poc.sh psql -c 'CREATE DATABASE poc3_intake'` y `r B4b ./poc.sh psql -c 'CREATE DATABASE poc3_migraciones'`, cada una **sólo si no aparece en B3** (`README.md:99`; `POC-3-DISENO.md:276`) | rc=0, `CREATE DATABASE` | dura |

**B1v · `.env` (S5).** `init` sólo crea `POC_DB_PASSWORD`, `PAYLOAD_SECRET` e `INTAKE_SECRETO`, con `openssl rand -hex` (hexadecimal en minúsculas), y con `umask 077` si el archivo no existía (`poc.sh:50-54`).

```sh
grep -cvE '^(POC_DB_PASSWORD|PAYLOAD_SECRET|INTAKE_SECRETO)=[0-9a-f]+$' .env   # 0 (rc=1 es lo esperado)
grep -cE '^(POC_DB_PASSWORD|PAYLOAD_SECRET|INTAKE_SECRETO)=' .env             # 3
stat -c '%U %a' .env                                                          # root 600
```

- **Parada dura** si algún resultado difiere.
- Si hay líneas de más, se puede ver qué claves hay sin imprimir valores con `cut -d= -f1 .env`.
- El modo 600 con propietario root impide que los contenedores, con uid 1000, lean `/app/.env` a través del montaje de `./`. Compose lee `.env` en el host sólo para interpolar.

**A3f (parada dura) · bootstrap de volúmenes y prueba efectiva de montajes.** Va después de B1/B1v y antes de B2. Depende de que `./poc.sh init` haya preparado los puntos de montaje (B1); si no, Docker no puede crear los destinos dentro del bind `/app` de sólo lectura.

```sh
r A3f1 ./poc.sh init-volumes
r A3f2 ./poc.sh deps
r A3f3 ./poc.sh probe-mounts
```

- **A3f1** crea/monta sólo los diez volúmenes aprobados y corrige su ownership a `1000:1000`: es el único bootstrap elevado de volúmenes de aplicación (`volumes-init`, root sin red, sin bind y sin socket).
- **A3f2** puebla el volumen nombrado `node_modules` y su `npm_cache` como uid 1000 (`npm ci`, con red). El directorio `poc1a/node_modules` del host no se consulta ni cuenta como prerrequisito. Valida también que `npm ci` funciona con `node_modules` montado y `HOME=/tmp`.
- **A3f3** lanza cuatro contenedores con uid 1000. Cada uno debe imprimir `MOUNT_PROBE_OK`. Deben fallar las escrituras a `/app`, `package.json`, `package-lock.json`, `poc.sh`, `compose.yaml`, `next-env.d.ts` y `node_modules` en `app`, `app-prod` y `e2e`; deben funcionar sólo los destinos RW de la tabla de A2, incluido `media_prod` dentro de `app`.
- Cualquier rc distinto de 0, escritura denegada en la allowlist, escritura permitida fuera de ella, servicio con uid distinto de 1000 o matriz diferente es **parada dura**. Se conservan servicios y logs; no se abre ningún bind ni se ejecuta código posterior del árbol. Un `EROFS`/`EACCES` de `next-env.d.ts` o de un punto de montaje también es parada dura (ver «Tipos de parada»).

Si `poc3_migraciones` ya existe, la prueba «desde cero» de U4 no vale con ella, y borrarla está prohibido (`poc1a/README.md:20,28`). **PENDIENTE (decisión humana):** usar una base nueva con otro nombre válido para la guarda (por ejemplo `poc3_migraciones_r2`) y anotarla. D01–D03 se ejecutan sobre esa base.

## C. U4 · Migración desde cero (`poc3_migraciones`)

**D01 · Primera migración** (U4; `docs/POC-3-DISENO.md:276`)

```sh
r D01 ./poc.sh migrate-en poc3_migraciones
```

- Esperado: rc=0 (`poc.sh:126-128`). Payload aplica `20261015_174323_inicial`, `20261016_055416_poc1b` y `20261017_120000_poc3_intake` (`src/migrations/`). El texto exacto de Payload 3.90.2 no está verificado.
- Parada: dura.
- Registrar: rc y los nombres de las migraciones aplicadas.

**D02 · Segunda migración, sin pendientes** (U4)

```sh
r D02 ./poc.sh migrate-en poc3_migraciones
```

- Esperado: rc=0, sin migraciones aplicadas.
- Parada: fallo registrable si aplica algo.

**D03 · Tablas y restricciones en `poc_prod`** (U4; diseño §3.1)

```sh
r D03a ./poc.sh psql-en poc3_migraciones -Atc "SELECT tablename FROM pg_tables WHERE schemaname='poc_prod' AND tablename LIKE 'intake_%' ORDER BY 1"
r D03b ./poc.sh psql-en poc3_migraciones -Atc "SELECT conrelid::regclass, contype, count(*) FROM pg_constraint WHERE conrelid IN ('poc_prod.intake_envio'::regclass,'poc_prod.intake_limite'::regclass) AND contype IN ('c','p') GROUP BY 1,2 ORDER BY 1,2"
```

- **D03a, esperado:** `intake_envio` e `intake_limite`.
- **D03b, esperado:** `poc_prod.intake_envio|c|1`, `poc_prod.intake_envio|p|1`, `poc_prod.intake_limite|c|3` y `poc_prod.intake_limite|p|1`, según `src/migrations/20261017_120000_poc3_intake.ts:5-16`.
- D03b es un complemento a la consulta del diseño.
- Parada: fallo registrable.

## D. `app` (3443) con el proxy de producción: U5a, NV-15, NV-17 y T-01

**D04 · Levantar `app` en `poc3_intake`** (U5a)

```sh
r D04 ./poc.sh up-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:50-54`) y `TLS_OK`.
- La primera vez descarga imágenes fijadas por digest, lo que requiere red.
- `next dev` tarda en estar listo: `./poc.sh logs 50` debe mostrar `Ready` (HUECO H-8).
- Parada: dura.

**D05 · Digest del proxy** (NV-15; `docs/POC-3-DISENO.md:264`)

```sh
r D05 docker image inspect --format '{{json .RepoDigests}}' nginx:1.30.6-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5
```

- Esperado: rc=0 y la lista contiene `nginx@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5`.
- Parada: dura si no coincide.

**D06 · Base correcta**

```sh
r D06 ./poc.sh comprobar-en poc3_intake
```

- Esperado: rc=0 (`poc.sh:64-66`) y `DATABASE_OK:poc3_intake` (`scripts/verificar-db.ts:16`).
- Parada: dura.

**D07 · Sonda de red** (U5a; T-02, NV-3)

```sh
r D07 ./poc.sh sonda-red
```

- Esperado: rc=0 (`poc.sh:109`) y tres líneas (`scripts/sonda-red.mjs:4-21`):
  - `OK: inaccesible http://app:3000/`
  - `OK: inaccesible http://app-prod:3000/`
  - `OK: proxy TLS /solicitar 200`
- Parada: dura ante cualquier `FALLO:`.
- `app-prod` todavía no existe, así que su línea es débil: D24 la repite con `app-prod` levantado.

**D08 · `push` crea las tablas con sus CHECK** (U4, NV-17; `docs/POC-3-DISENO.md:266,276`)

```sh
r D08a ./poc.sh psql-en poc3_intake -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'intake_%' ORDER BY 1"
r D08b ./poc.sh psql-en poc3_intake -Atc "SELECT conname, contype FROM pg_constraint WHERE conrelid='public.intake_limite'::regclass ORDER BY 1"
r D08c ./poc.sh psql-en poc3_intake -Atc "SELECT conname, contype FROM pg_constraint WHERE conrelid='public.intake_envio'::regclass ORDER BY 1"
```

- **D08a:** `intake_envio` e `intake_limite`.
- **D08b:** incluye `intake_limite_clave_hmac_hex_check|c`, `intake_limite_n_positivo_check|c`, `intake_limite_tipo_check|c` y una fila `|p` (`src/lib/intake/esquema.ts:37-40`).
- **D08c:** incluye `intake_envio_clave_hex_check|c` y una fila `|p` (`esquema.ts:24`).
- PostgreSQL 18 también registra los `NOT NULL` en `pg_constraint`, así que pueden aparecer filas `|n`.
- Si D08a sale vacía: `push` no corrió o se colgó con la pregunta interactiva (`docs/POC-3-DISENO.md:142`). Hay que revisar `./poc.sh logs 200` y aplicar parada dura.

**D09 · El proxy de producción reemplaza las IP forjadas** (T-01 (ii), NV-4, NV-1)

```sh
r D09 node --test test/docker/ip-produccion.test.mjs
```

- Esperado: rc=0, `# pass 2`, `# fail 0`. La sexta creación da 429 `limite_creaciones` (`ip-produccion.test.mjs:28-30`).
- **Precondición: proxy de producción.** Hay que lanzarlo justo después de D04. Con el proxy de pruebas, `x-poc-ip-sintetica` se respeta, cada envío sale de una IP distinta y la prueba falla.
- La prueba gasta el cupo de la IP real del gateway (`ip-produccion.test.mjs:6-7`). Para repetirla hay que esperar ≥ 10 min, porque la ventana es fija de 10 min (`docs/POC-3-DISENO.md:165`; HUECO H-9).
- Parada: dura (seguridad).

## E. `app` (3443) con el proxy de pruebas: U2, U5b y U6

**D10 · Modo pruebas**

```sh
r D10 ./poc.sh up-pruebas-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:55-59`) y `TLS_OK`. Recrea `app` con el override (`compose.pruebas.yaml:5-10`).
- Esperar a `Ready` en `./poc.sh logs 50`.
- Parada: dura.

**D11 · vitest completo dentro de `app`, con verificación de H-1 y H-2** (U2 hook y NV-12, U5b T-03 (i)/(ii), U6 T-03 (iii), HTTP U5b/U6, NV-7, POC-1b)

```sh
r D11 ./poc.sh exec-en poc3_intake npx vitest run --configLoader runner
```

- **`--configLoader runner` es obligatorio** en toda invocación de vitest dentro de un contenedor. Vite carga `vitest.config.ts` por defecto con el cargador bundle y escribe `node_modules/.vite-temp`: con el volumen `node_modules` RO el resultado es EROFS/EACCES y el fallback de Vite no lo cubre (`node_modules/vite/dist/node/chunks/node.js:38115-38130`; ya se observó como EACCES en `.jz-state/runs/20261016T135909Z-661834.log`). El cargador `runner` no escribe archivos temporales.

- Incluye `src/**/*.test.ts` y `test/**/*.test.ts` (`vitest.config.ts:9`), y entre ellos:
  - `test/integracion/intake-hook.int.test.ts`
  - `test/integracion/intake-persistir.int.test.ts`
  - `test/integracion/intake-limites.int.test.ts`
  - `test/http/intake.test.ts`
- `exec-en` imprime antes `DATABASE_OK:poc3_intake` por stderr (`poc.sh:83`), y queda en el log.
- Esperado: rc=0 y `Tests N passed (N)`. N no se puede deducir: hay que anotarlo.
- **Verificación de H-1** (*corregido en `c8bbf0f`, pendiente de esta ejecución*). `test/http/intake.test.ts` usa por defecto `https://proxy:3443` (`intake.test.ts:5`). Se espera que llegue porque:
  - `app` comparte la red `proxy_app` con el proxy (`compose.yaml:52,89`);
  - `proxy` está en el SAN del certificado (`poc.sh:18`);
  - la CA llega por `NODE_EXTRA_CA_CERTS=/app/.tls/ca.crt` (`compose.yaml:50`). vitest es un proceso nuevo, así que lee la CA regenerada en D10.

  Se da por verificado si los 8 tests de `intake HTTP U5b` pasan y el log no contiene `fetch failed`, `ECONNREFUSED`, `ENOTFOUND`, `UNABLE_TO_VERIFY` ni `self-signed`.
- **Verificación de H-2** (*corregido en `c8bbf0f`, pendiente de esta ejecución*). El caso «honeypot» ya envía token y cookie válidos (`intake.test.ts:46-47`). El manejador valida el origen (`manejador.ts:85`) y el CSRF (`manejador.ts:92`) antes de la trampa (`manejador.ts:93`). Se espera que el test «rechaza tipo, origen, CSRF, trampa y mínimo sin eco» pase con 400 `envio_rechazado`. El Origin coincide porque `ORIGEN` sale de `INTAKE_ORIGEN_PUBLICO=https://127.0.0.1:3443` (`intake.test.ts:6`; `compose.yaml:47`), aunque la URL sea `proxy:3443`.
- **Precondición: proxy de pruebas** (D10). Los tests envían `x-poc-ip-sintetica` y cuentan límites por IP sintética (`intake.test.ts:23,69-89`). Con el proxy de producción, todos los envíos compartirían IP y agotarían el cupo.
- Parada: fallo registrable. Hay que anotar qué archivos y qué tests fallan, y si H-1 o H-2 siguen presentes.
- *Obsoleta:* la variante `D11-diag` del ciclo 1, con `POC_HTTP_BASE=https://proxy:3443`, ya no tiene sentido, porque ese es ahora el valor por defecto. No se ejecuta.

**D12 · `tsc` dentro de `app`** (criterio «vitest y tsc», `docs/PLAN-POC-3.md:178`)

```sh
find . -name '*.tsbuildinfo' -type f -not -path './node_modules/*' -not -path './.next*/*' -exec sha256sum {} + | sort > "$S/D12-tsbuildinfo-before.txt"
r D12 ./poc.sh exec-en poc3_intake npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo
find . -name '*.tsbuildinfo' -type f -not -path './node_modules/*' -not -path './.next*/*' -exec sha256sum {} + | sort > "$S/D12-tsbuildinfo-after.txt"
r D12b cmp -s "$S/D12-tsbuildinfo-before.txt" "$S/D12-tsbuildinfo-after.txt"
```

- Esperado: rc=0 y ninguna salida salvo `DATABASE_OK:poc3_intake` (`poc1a/README.md:14`; `poc.sh:114`). Con A4 hecho, cubre también `intake-axe.spec.ts`. `tsconfig.json` ya fija `tsBuildInfoFile` en `/tmp/tsconfig.tsbuildinfo`; el argumento explícito lo repite para que ningún `.tsbuildinfo` se escriba bajo `/app` (RO).
- **D12b:** rc=0 y sin salida. Un `.tsbuildinfo` histórico ignorado (p. ej. `tsconfig.tsbuildinfo` de las eras RW) puede existir, pero su conjunto y contenido no cambian; cualquier divergencia es parada dura.
- Parada: fallo registrable para D12; dura para D12b.

**D13 · IN-01..IN-12 con el proxy de pruebas** (U5b IN-01..IN-10, U6 IN-11, IN-12; NV-1, NV-3)

```sh
r D13 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$LIN" --alcance poc-3
```

- Esperado: rc=0 y `casos 12 · ok 12 · fail 0 · pendiente 0` (`contrato/run.mjs:95-96,101`).
- **Corrección C-2:** se usa `--solo "$LIN"` porque `--alcance poc-3` sin `--solo` ejecuta los 56 casos (`run.mjs:65-72`). En este modo `POC_FALLOS_INYECTABLES=0` (`compose.pruebas.yaml:10`), así que EV-04 fallaría (`contrato/casos/eventos.mjs:65-68`).
- Parada: fallo registrable.

## F. `app` (3443) con fallos inyectables: U7 y gate U9, parte 1

**D14 · Modo fallos**

```sh
r D14 ./poc.sh up-fallos-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:60-63`) y `TLS_OK`. Recrea `db`, `app` y `proxy`.
- Esperar a `Ready`.
- Parada: dura.

**D15 · Logs sin PII con fallos reales** (U7; IN-12, T-05 (ii)/(iii), T-06, T-09 (ii), NV-9, NV-10)

```sh
r D15 node --test test/docker/logs-intake-fallos.test.mjs
```

- Esperado: rc=0, `# pass 9`, `# fail 0`: 4 fallos inyectados con 500, JSON roto, 413, logs sin fugas, `pg_code` por correlación y error crudo saneado (`logs-intake-fallos.test.mjs:27-80`).
- Si sale «la inyección no está activa», no se levantó con `up-fallos-en`.
- Parada: dura si aparece cualquier fuga (`buscarFugas`).

**D16 · Batería de 44 en `app`** (U9; T-10 en `app`; NV-14)

```sh
r D16 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$L44"
```

- Esperado: rc=0 y `casos 44 · ok 44 · fail 0` (`README.md:103`).
- Cada caso hace un reset por `exec-en`, con un arranque de Payload adicional (ver «Duración»).
- NV-14 sólo queda cubierto si `app-prod` no se ha creado antes: las órdenes de C usan `run --rm`. Hay que anotar si existía de una sesión anterior.
- Parada: fallo registrable.

**D17 · `--alcance poc-3` en `app`** (U9; IN-11 y concurrencia de U6, 12/12 IN-*)

```sh
r D17 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-3
```

- Esperado: rc=0 y `casos 56 · ok 56 · fail 0 · pendiente 0` (`README.md:104`). Ejecuta los 56 casos, y aquí EV-04 sí tiene inyección.
- Parada: fallo registrable.

## G. U8 · E2E en `app`

**D18 · E2E contra `next dev` por el proxy** (U8; NV-2, NV-13, NV-16)

```sh
r D18 ./poc.sh e2e-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 y `TLS_OK`.
  - Con A4: `13 passed`, que son f1, f3, acciones, 7 de `intake.spec.ts` y 3 de axe.
  - Sin A4: `10 passed` y `3 skipped`.
- Recrea `app` y `proxy` **sin** el override, verifica la base y lanza Playwright (`poc.sh:89-97`).
- El log no debe contener la contraseña del admin: `E2E_RESET` viaja por entorno (`poc.sh:96-97`). Si el reset falla, el mensaje del driver puede incluir el final de stderr del reset, 400 caracteres (`contrato-driver.mjs:298`). Hay que revisarlo con K2 antes de compartirlo.
- Parada: fallo registrable.

## H. `app-prod` (3444): U7 producción, NV-8, gate U9 parte 2 y U8 en producción

**D19 · Migrar `poc_prod` de `poc3_intake`**

```sh
r D19 ./poc.sh migrate-en poc3_intake
```

- Esperado: rc=0. Es idempotente, así que se ejecuta siempre (`README.md:108` lo condiciona, pero no hay orden para consultarlo).
- El orden migrar → build → levantar es el de `poc1a/README.md:22-24`.
- Parada: dura.

**D20 · Build de producción** (U7)

```sh
r D20 ./poc.sh build-en poc3_intake
```

- Esperado: rc=0 y la línea `build_ms=<n> codigo=0` (`poc.sh:121-123`).
- Parada: dura.

**D21 · El build no contiene la inyección** (T-05 (iv), NV-11)

```sh
r D21a ./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs
r D21b setpriv --reuid=1000 --regid=1000 --clear-groups node --test test/build/comprobar-build.test.mjs
```

- **D21a:** rc=0, `# pass 1`. Corre dentro de `app-prod` (`run --rm --no-deps`) porque `.next-prod` vive en el volumen `next_prod` y deja de ser visible en el host. Exige un `.next-prod` posterior a las fuentes (`test/build/comprobar-build.mjs:40-48`).
- **D21b:** rc=0, `# pass 10`, `# fail 0` (el archivo tiene 10 tests). Es unitario con árbol temporal: no usa Docker (`README.md`), corre en el host como uid 1000 sin grupo Docker.
- Parada: dura si D21a falla por un marcador o no ve el `BUILD_ID` de `next_prod`.

**D22 · NV-8: un `INTAKE_SECRETO` débil impide servir** (`docs/POC-3-DISENO.md:175,257`)

```sh
T22="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
r D22a env INTAKE_SECRETO=abcd ./poc.sh up-prod-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
sleep 30
r D22b ./poc.sh logs-since "$T22"
grep 'app-prod' "$S/D22b.log" | grep -c 'config_intake_invalida'
```

- **D22a:** rc=0 (`poc.sh:134-138`), porque `up -d` no espera a que el contenedor salga, y `TLS_OK`.
- **D22b:** rc=0 (`poc.sh:70-72`), y el `grep` final cuenta ≥ 1 línea `{"evento":"arranque","codigo":"config_intake_invalida"}` de `app-prod`.
- **Debe ir después de D20.** Sin build, `next start` también saldría con 1 por otro motivo y la prueba sería vacua (corrección C-3).
- No hay orden de `poc.sh` que muestre el código de salida del contenedor (HUECO H-7).
- `abcd` es un valor falso deliberado: es la única excepción a la advertencia 7. Se pasa en línea y no se exporta.
- Parada: dura si no aparece la línea.

**D23 · `app-prod` con el proxy de pruebas** (U7)

```sh
r D23 ./poc.sh up-prod-pruebas-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:139-143`) y `TLS_OK`. Recrea `app-prod` con el secreto real de `.env`, porque cambia su configuración.
- `app` sigue levantado desde D18, y debe seguir así: el reset del driver se ejecuta dentro de `app` mediante `exec-en` (`contrato-driver.mjs:291`; `poc.sh:79-84`).
- Esperar a `Ready` de `app-prod` en `./poc.sh logs-since <instante>`.
- Parada: dura.

**D24 · Sonda de red con `app-prod` levantado** (T-02, NV-3)

```sh
r D24 ./poc.sh sonda-red
```

- Esperado: igual que D07.
- Parada: dura.

**D25 · Logs sin PII en producción** (U7; IN-12, T-05, T-09; no inyección con `POC_FALLOS_INYECTABLES=1`)

```sh
r D25 env POC_BASE_URL=https://127.0.0.1:3444 node --test test/docker/logs-intake.test.mjs
```

- Esperado: rc=0, `# pass 8`, `# fail 0` (`logs-intake.test.mjs:25-86`).
- Parada: dura si hay fugas o si `x-poc-fallo` inyecta algo.

**D26 · Batería de 43 en `app-prod`, sin EV-04** (U9; T-10 según P-U1-01, T-13, CO-05)

```sh
r D26 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3444 POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$L43"
```

- Esperado: rc=0 y `casos 43 · ok 43 · fail 0` (`README.md:111`).
- Hay que anotar `medida CO-05 propagacion_ms = <n> ms` y `supera_objetivo_provisional = 0|1` (`contrato/casos/contenido.mjs:69-71`). Ahora el valor incluye el proxy y TLS (`README.md:119`).
- Parada: fallo registrable.

**D27 · IN-* en `app-prod`** (U9; 12/12 IN-* en 3444)

```sh
r D27 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3444 POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$LIN" --alcance poc-3
```

- Esperado: rc=0 y `casos 12 · ok 12 · fail 0 · pendiente 0`.
- **Corrección C-2:** la orden literal de `README.md:112` no lleva `--solo`, así que ejecuta los 56 casos, entre ellos EV-04. Su resultado previsible es `casos 56 · ok 55 · fail 1 · pendiente 0` con rc=1 y EV-04 como único FAIL (P-U1-01).
- Si el humano prefiere ejecutar la literal, debe registrarla como `D27-lit` con esa interpretación.
- Parada: fallo registrable.

**D28 · E2E contra el build de producción** (U8 en producción)

```sh
r D28 ./poc.sh e2e-prod-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 y `TLS_OK`, con los mismos conteos que D18.
- **Precondición de `app`:** *corregida en `b09d7ea`, pendiente de verificación Docker.*
  - Ahora `e2e-prod-en` levanta `app` en `poc3_intake` y la verifica con `verificar-db.ts` antes del reset (`poc.sh:104-106`).
  - `exec-en` repite esa verificación (`poc.sh:83`).
  - Antes sólo levantaba `db` y `app-prod`, y el reset podía caer en otra base.
- Recrea `app-prod` y `proxy` **sin** el override (`poc.sh:102-103`). `E2E_RESET` se obtiene en `poc.sh:107`.
- Parada: fallo registrable.

## I. U9 · Medición de latencia y falsos positivos

**D29 · Volver a poner el proxy de pruebas: corrección C-1**

Tras `e2e-prod-en`, `app-prod` **no** queda con el proxy de pruebas. `README.md:114` lo afirmaba y se corrigió en `b09d7ea`.

- `e2e-prod-en` recrea el proxy con `$C`, sin `compose.pruebas.yaml` (`poc.sh:7,103`). Lo mismo hacen `up-en` y `e2e-en` (`poc.sh:54,94`).
- La medición envía `x-poc-ip-sintetica` (`medicion/intake-latencia.mjs:140`), y sólo el proxy de pruebas la respeta (`intake-latencia.mjs:2-4`).
- Con el proxy de producción, los 150 envíos saldrían de una sola IP y desde el sexto darían 429, que el script contaría como falsos positivos.

```sh
r D29 ./poc.sh up-prod-pruebas-en poc3_intake && tls_ok && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:139-143`) y `TLS_OK`.
- Esperar a `Ready` de `app-prod`.
- Parada: dura.

**D30 · Medición** (U9; IN-10 a escala, D-08, D-09)

```sh
r D30 setpriv --reuid=1000 --regid=1000 --clear-groups env POC_BASE_URL=https://127.0.0.1:3444 node medicion/intake-latencia.mjs
```

- D30 corre con `setpriv` (uid 1000, sin grupo docker) sólo mientras `medicion/intake-latencia.mjs` no invoque `poc.sh`; hereda `NODE_EXTRA_CA_CERTS` y lee `.tls/ca.crt`.

- Esperado: rc=0 y un JSON con:
  - `enviados: 150`, `creados: 150`, `falsos_positivos: 0`, `errores: 0`, `ok: true`;
  - `series[0..2]` con `mediana_ms` y `p95_ms`;
  - `mediana_de_medianas_ms` y `p95_ms` (`intake-latencia.mjs:103-110,149-150`).
- Crea 150 solicitudes en `poc_prod` (`README.md:114`).
- Parada: fallo registrable si rc=1. No se repite sin registrar el primer intento.

## J. Limpieza (sólo servicios del POC)

```sh
r J1 ./poc.sh down-prod
r J2 ./poc.sh down
r J3 ./poc.sh stats
```

- **J1:** rc=0. Para y borra `app-prod` (`poc.sh:144`).
- **J2:** rc=0. Ejecuta `docker compose -p jozeuzz-poc-a down` (`poc.sh:67`): baja contenedores y redes del proyecto y **conserva** el volumen `db` con las bases `poc3_*` y `poc1b_*`.
- **J3:** rc=1, con el mensaje `sin contenedores del proyecto jozeuzz-poc-a; nada que medir` (`poc.sh:145-148`). Ese rc=1 es el esperado.
- **No usar** `./poc.sh destroy` (`down -v`, `poc.sh:149`) ni `docker system prune`. `destroy` borra los once volúmenes (los diez de aplicación y `db`); si se usara por decisión humana, hay que repetir `init-volumes`, `deps` y `probe-mounts` antes de volver a levantar nada.
- `.tls/` se queda en el disco: está ignorada (`.gitignore:2`), su CA dura 1 día y su `ca.key` ya se borró (`poc.sh:25`).
- `.next-prod/` y `media-store-prod/` están ignorados (`poc1a/.gitignore:13-14`).

## K. Cierre de la evidencia (S6, S7)

Se hace después de J, para que los logs de limpieza también entren en `SHA256SUMS`. Todo desde `poc1a/`.

```sh
# K1 · guarda final y estado del árbol
alterado="$(g status --porcelain -- $GUARDA)" || { echo "GIT FALLÓ: parada dura" >&2; }
test -z "$alterado" && echo guarda-ok  # si no sale guarda-ok: parada dura
test -z "$(g status --short)" && echo arbol-limpio   # A1 lo exigía vacío; si no sale arbol-limpio (o git falla): parada dura
docker ps -aq | xargs -r docker inspect --format '{{.Name}}{{range .Mounts}}{{if .RW}} {{.Source}}{{end}}{{end}}' > "$S/K1-montajes-rw.txt" 2>&1 || echo "K1 FALLÓ: parada dura" >&2
awk '{for(i=2;i<=NF;i++){s=$i; if (s=="/"||s=="/home"||s=="/home/proyectos"||s=="/home/proyectos/jozeuzz"||index(s,"/home/proyectos/jozeuzz-poc-candidata-a")==1||index(s,"/home/proyectos/jozeuzz/.git")==1) print $1, s}}' "$S/K1-montajes-rw.txt" > "$S/K1-prohibidos.txt"
sha256sum "$S/K1-montajes-rw.txt" "$S/K1-prohibidos.txt" >> "$S/SHA256SUMS"
test ! -s "$S/K1-prohibidos.txt" && echo sin-montajes-rw   # mismo criterio que A3e.2
# K2 · fugas: sólo nombres de archivo, nunca líneas
P='"password"|PAYLOAD_SECRET=|INTAKE_SECRETO=|POC_DB_PASSWORD=|PRIVATE KEY|E2E_RESET=|postgres://[^:@]*:[^@]*@'
grep -lE "$P" "$S"/*.log                                       # sólo D22a.log
grep -E "$P" "$S/D22a.log" | grep -vcF 'INTAKE_SECRETO=abcd'   # 0
grep -lFf <(sed -n 's/^[A-Z_]*=\(..*\)$/\1/p' .env) "$S"/*.log  # vacío
# K3 · hashes
sha256sum -c --quiet "$S/SHA256SUMS"   # sin salida, rc=0
sha256sum "$S/SHA256SUMS"              # anotar este hash fuera del host
```

- **K1:** es parada dura si la guarda no sale vacía, porque significa que un contenedor alteró el árbol durante el último paso. `g status --short` con cualquier salida (cualquier cambio respecto a A1) es también parada dura. Si `git` falla (`GIT FALLÓ`) o si la comprobación de montajes RW imprime algo, también es parada dura.
- **K2, por patrón:** la única coincidencia admisible es `D22a.log`, por la cabecera con el valor falso `INTAKE_SECRETO=abcd`.
- **K2, por valor:** la búsqueda usa como patrones los valores de `.env`. La sustitución de procesos los pasa por un descriptor, así que no aparecen en la línea de órdenes ni en pantalla, y `-l` sólo imprime nombres de archivo.
- **Si K2 encuentra algo:** el archivo afectado se retira del material compartido, se avisa y se trata como parada dura de seguridad. No se abre el log en pantalla compartida.
- La contraseña aleatoria del admin sintético no está en `.env`. La cubre el patrón `"password"`.
- **K3:** `sha256sum -c` comprueba que ningún log cambió desde que `r()` lo registró. El hash de `SHA256SUMS` se guarda **fuera del host**, por ejemplo en otro equipo o en papel. Sólo así se puede comprobar después que la carpeta de salidas no se alteró (advertencia 9).

Las filas de evidencia se pegan en `poc1a/EVIDENCIA.md`, sección «POC-3 · Intake seguro» (`EVIDENCIA.md:170-230`).

- Hay que sustituir los `PENDIENTE` de `EVIDENCIA.md:187-211`.
- Hay que rellenar las tablas de latencia y de falsos positivos (`EVIDENCIA.md:218-228`) con los campos del JSON de D30.
- Si quien edita `EVIDENCIA.md` es un agente, el humano le pasa los logs o la copia con su `SHA256SUMS`.

### Plantilla de registro

Qué no se copia nunca:

- PII (aquí sólo hay valores `SNT-` sintéticos, que tampoco hace falta copiar);
- `.env`, `INTAKE_SECRETO`, `PAYLOAD_SECRET` ni `POC_DB_PASSWORD`;
- `E2E_RESET` ni la contraseña del admin sintético;
- claves de `.tls/` ni IPs del gateway del host.

Basta con los conteos, las líneas de resumen y la ruta y el hash del log.

```markdown
#### Gate Docker POC-3 (ejecución humana, docs/GATE-DOCKER-POC-3.md)
Ejecutado por: <responsable> · Blob del procedimiento: <BLOB> · Salidas: <ruta fuera del repo> · SHA256SUMS: <hash, copia fuera del host>

| Paso | Unidad / criterio | Fecha (UTC) | HEAD | rc | Conteo / resultado | Observación | Log (sha256) |
|---|---|---|---|---|---|---|---|
| A0 | ruta de ejecución y config Git | | | — | `bin-false-ok`, sin `GIT_*`, `g-efectiva-ok`, `atributos-ok`; `grep` de nombres vacío sí/no | explicación de lo que salga; `git --version` y `--exec-path` | A0-git-config-nombres.txt |
| A3e | contenedores de la era RW (antes de A1) | | | | `proyecto-sin-contenedores` y `sin-montajes-rw` | qué contenedores se retiraron con `docker rm -f` | A3e-antes.txt, A3e1.txt, A3e2-montajes-rw.txt, A3e2.txt |
| A1 | estado y blob | | | — | blob-ok | | — |
| A2 | revisión de seguridad | | | — | REV=<…> | sin hallazgos / hallazgos; config Compose conforme | — |
| A2 (compose) | matriz de montajes | | | — | coincide sí/no | `A2-compose-resuelto.yaml` | — |
| A2d | versión de Docker y runc | | | | runc-ok <versión> (≥ mínimo de su rama) | `A2-docker-version.txt`, `A2-runc-version.txt` | — |
| A3d | find diagnóstico no vinculante | | | | rutas listadas | no bloquea | A3d.log |
| A3f1 | `volumes-init` | | | | rc | ownership 1000:1000 | A3f1.log |
| A3f2 | `deps` (`npm ci` en el volumen) | | | | rc | node_modules en volumen nombrado | A3f2.log |
| A3f3 | `probe-mounts` | | | | `MOUNT_PROBE_OK` ×4 | denegaciones y allowlist | A3f3.log |
| A4 | P3-05 axe | | | | @axe-core/playwright <v>, axe-core <v>; A4a/A4r/A4p/A4v/A4k rc | autorizado sí/no; hash del parche aprobado y responsable (`A4-aprobacion.txt`); `A4-verificacion.txt` sin desviaciones; commit sin `gpgsig`; audit signatures | A4a.stderr.log, A4-verificacion.txt, A4-aprobacion.txt, A4b0/A4b/A4c.log |
| B1v | .env | | | — | 0 / 3 / root 600 | | — |
| D01–D03 | U4 desde cero | | | | 3 migraciones; 2.ª sin pendientes; tablas y CHECK | | |
| D05 | NV-15 | | | | digest coincide sí/no | | |
| D07 / D24 | U5a T-02 NV-3 | | | | 3 OK / 3 OK | | |
| D08 | NV-17 | | | | tablas y CHECK en public | | |
| D09 | T-01 (ii) NV-4 | | | | pass 2 / fail 0 | | |
| D11 | U2 U5b U6 vitest | | | | Tests N passed (N) | H-1 verificado sí/no; H-2 verificado sí/no | |
| D12 | tsc | | | | sin errores | D12b vacío (sin `.tsbuildinfo` nuevo en el repo) | |
| D13 | IN-* modo pruebas | | | | casos 12 · ok 12 · fail 0 · pendiente 0 | | |
| D15 | U7 fallos | | | | pass 9 / fail 0 | | |
| D16 | U9 44 en app | | | | casos 44 · ok 44 · fail 0 | NV-14: app-prod existía sí/no | |
| D17 | U9 alcance en app | | | | casos 56 · ok 56 · fail 0 · pendiente 0 | | |
| D18 | U8 E2E app | | | | N passed, M skipped | | |
| D20 | build | | | | build_ms=<n> | | |
| D21 | NV-11 | | | | D21a pass 1; D21b pass 10 | D21a dentro de `app-prod`; D21b host con setpriv | |
| D22 | NV-8 | | | | config_intake_invalida ×n | | |
| D25 | U7 producción | | | | pass 8 / fail 0 | | |
| D26 | U9 43 en app-prod (P-U1-01) | | | | casos 43 · ok 43 · fail 0 | CO-05 propagacion_ms=<n> | |
| D27 | IN-* app-prod | | | | casos 12 · ok 12 · fail 0 · pendiente 0 | | |
| D28 | U8 E2E prod | | | | N passed, M skipped | | |
| D30 | U9 medición | | | | 150/150, FP 0, errores 0 | mediana de medianas, p95 | |
| K1–K3 | integridad y fugas | | | — | guarda vacía; sólo D22a.log; valor vacío; -c ok | | SHA256SUMS |
```

## Correcciones, huecos y hallazgos detectados al redactar

**Correcciones** (este procedimiento ya las aplica; `README.md` y los arreglos de código se corrigieron en el ciclo 1, pendientes de verificación Docker):

- **C-1.** *Corregido en `b09d7ea`, pendiente de verificación Docker.* `README.md:114` decía que tras `e2e-prod-en` el proxy de pruebas sigue arriba. No es así: hay que repetir `up-prod-pruebas-en` antes de medir (D29).
- **C-2.** *Corregido en `b09d7ea`, pendiente de verificación Docker.* `README.md:112` y el diseño (`POC-3-DISENO.md:280`) usan `--alcance poc-3` sin `--solo`. Eso ejecuta los 56 casos, y EV-04 falla donde no hay inyección (D13 y D27).
- **C-3.** NV-8 sólo es significativo después de un build (D22 va detrás de D20).

**Huecos:**

- **H-1.** *Corregido en `c8bbf0f` (la base por defecto pasa a `https://proxy:3443`, `intake.test.ts:5`), pendiente de verificación Docker en D11.* El test no podía llegar al proxy desde dentro de `app`.
- **H-2.** *Corregido en `c8bbf0f` (el honeypot usa token y cookie válidos, `intake.test.ts:46-47`), pendiente de verificación Docker en D11.* El caso honeypot estaba mal construido: el CSRF se comprueba antes que la trampa (`manejador.ts:92-93`).
- **H-3.** T-08, NV-5 y NV-6 no tienen prueba Docker ni HTTP. Son el 413 chunked y el `Content-Length` falso directos a `app:3000` y `app-prod:3000` (`POC-3-DISENO.md:325`). En `test/http/` no hay `chunked` ni `app-prod:3000` para intake; sólo existe el unitario `src/lib/intake/cuerpo.test.ts`.
- **H-4.** La matriz CSRF/origen del diseño (`POC-3-DISENO.md:308`) sólo está cubierta en parte por HTTP:
  - `intake.test.ts:38-43` cubre tipo, Origin ajeno, `null`, Referer engañoso, cookie distinta y trampa;
  - faltan sin token, token alterado, caducado, sin Origin ni Referer y urlencoded con token malo;
  - ninguna prueba HTTP comprueba «sin registro», que es el criterio de `PLAN-POC-3.md:180`.
- **H-5.** No hay orden documentada para ejecutar `test/http/intake.test.ts` contra `app-prod` (T-07 en 3444). Lo cubre en parte el test de cookie de E2E en D28 (`e2e/intake.spec.ts:91`).
- **H-6.** El criterio de D-08 «confirmar cómo se comporta el límite por /64 detrás de NAT con el cliente real» (`EVIDENCIA.md:247`) no tiene procedimiento en la POC.
- **H-7.** `poc.sh` no tiene orden que muestre el código de salida de `app-prod` (D22).
- **H-8.** `poc.sh` no tiene orden de espera de disponibilidad: se usan los logs.
- **H-9.** No hay orden que libere el cupo del gateway para repetir D09: hay que esperar a la ventana siguiente.
- **H-10.** *Observación, sin verificar.* `verificar-db.ts`, que `exec-en` ejecuta antes de cada orden (`poc.sh:83`), arranca Payload con el entorno de `app`. Ese entorno no fija `POC_NO_PUSH` (`compose.yaml:42-50`), así que `push` queda habilitado (`src/payload.config.ts:47`) sobre `public`. Se deduce que no hace nada si `next dev` ya sincronizó `public`, pero comparte el riesgo de pregunta interactiva de `docs/POC-3-DISENO.md:142`. Si una batería se cuelga en el reset, hay que mirar aquí primero.

**Hallazgos de código pendientes (después del gate):**

- **S-1 (jz-security, importante).** Los servicios `app`, `app-prod`, `deps` y `e2e` montaban `./` en escritura con uid 1000. La guarda de `r()` y `tls_ok` sólo detectan alteraciones; no las impiden. **Corrección implementada estáticamente, pendiente de verificación Docker (A2, A3f):** `./` se monta en sólo lectura en los cuatro servicios, con raíz `read_only: true`, `/tmp` tmpfs y escritura sólo en volúmenes nombrados (`node_modules` RW sólo en `deps`, RO en los demás; `npm_cache` sólo en `deps`). `next-env.d.ts` se monta como bind de archivo RO desde `contenedor/`. `package.json` y `package-lock.json` no se escriben desde contenedores: A4 produce un parche.

**Riesgos residuales del aislamiento (sin cambio de código; verificar en el gate):**

- La caché de Vitest (`node_modules/.vite`) y `payload generate:types` (`src/payload-types.ts`) fallan en silencio con el sistema de archivos RO; se verificó en el código que no son fatales, pero no hay ejecución que lo confirme.
- **`node_modules/.vite-temp` sí es fatal por defecto.** Vite carga `vitest.config.ts` con el cargador bundle y escribe `node_modules/.vite-temp`; con el volumen `node_modules` RO eso da EROFS/EACCES que el fallback de Vite no cubre (`node_modules/vite/dist/node/chunks/node.js:38115-38130`; observado como EACCES en `.jz-state/runs/20261016T135909Z-661834.log`). Por eso toda invocación de vitest en contenedor lleva `--configLoader runner`, que no escribe temporales (D11, README, EVIDENCIA y diseño; una prueba estática lo vigila). Sin ese flag, un fallo de D11 es de infraestructura, no del intake.
- `importMap` de Payload sólo se regenera en HMR; con `/app` RO no se reescribe fuera de él.
- `npm ci` con `node_modules` montado se valida en A3f2 (volumen nombrado), con `HOME=/tmp` (en `deps`, `app`, `app-prod` y `e2e`; la caché npm persistente sólo existe en `deps`, en `/app/.npm-cache`; los consumidores usan `/tmp/.npm`, efímero).
- El `node_modules` del host fue poblado en la era RW (antes del aislamiento) y sólo se usa para las pruebas estáticas en sandbox de `jz-run`; nunca como prerrequisito del gate. El volumen nombrado lo enmascara en los contenedores.
  - Los tests estáticos de los agentes se ejecutan dentro de `jz-run` (sandbox con el worktree escribible) contra ese `node_modules` heredado: su verde no prueba integridad de dependencias.
  - **Recomendación humana:** antes de confiar en pruebas del host, regenerar el `node_modules` del host desde el lockfile con `--ignore-scripts`, bajo control humano y con red (`npm ci --ignore-scripts`). Sólo documentación: ningún agente lo hace.
- Next 16.4.1 reescribiría `next-env.d.ts` si su contenido difiriera (`writeAppTypeDeclarations.js`); `test/estatico/next-env-contenedor.test.ts` fija byte a byte los dos archivos de `contenedor/` contra la función real de Next. `writeConfigurationDefaults` también escribiría `tsconfig.json` si no fuera un punto fijo; `test/estatico/tsconfig-punto-fijo.test.ts` ejecuta la función real de Next sobre una copia de `tsconfig.json` en `os.tmpdir()`, para dev (`.next/dev`, `NODE_ENV=development`) y build (`.next-prod`, `NODE_ENV=production`), y comprueba que el archivo no cambia; no se verificó con `next build` real: un `EROFS` ahí es parada dura (D20).

Los arreglos de H-1 a H-5, H-10 y S-1 son trabajo de jz-implementer, y su priorización corresponde a jz-qa y jz-security en U10.

## Decisiones humanas que bloquean el cierre

| ID | Qué decide | Opción que recomienda la documentación | Cita |
|---|---|---|---|
| P-U1-01 | Si T-10 («44/44 en `app` y en `app-prod`», `TRAZABILIDAD-POC-3.md:58`) se da por cumplido con 44 en `app` y 43 en `app-prod`, sin EV-04 | Aceptar la propuesta implementada. EV-04 necesita `x-poc-fallo`, que sólo existe con `NODE_ENV!=='production'`, y habilitarlo en `app-prod` debilitaría producción. Tras la decisión, jz-architect enmienda el texto de T-10. Mientras tanto, T-10 «no se cumple literalmente» | `poc1a/README.md:92`; `poc1a/EVIDENCIA.md:179`; `docs/POC-3-DISENO.md:10` |
| D-08 | Mecanismo antiabuso del MVP | Controles propios: límites 30 intentos y 5 creaciones / 10 min por IP o /64 con clave HMAC, trampa y tiempo mínimo. El desafío externo queda como mitigación bajo demanda, con un disparador explícito. Antes de cerrar: medición de falsos positivos (D30) y comportamiento tras NAT (H-6) | `poc1a/EVIDENCIA.md:232-247`; `docs/ROADMAP-MVP.md:427` |
| D-09 | Mecanismo antiduplicados | **PENDIENTE: la documentación no registra una recomendación explícita.** El único mecanismo diseñado e implementado es la clave HMAC del nonce del formulario en `intake_envio`, con `ON CONFLICT DO NOTHING` en la misma transacción. Los criterios de `ROADMAP-MVP.md:428` se evidencian con IN-09 (D13, D17, D27), el duplicado concurrente HTTP (D11), IN-10 y la medición (D30). Hay que tener en cuenta que cada GET emite un nonce nuevo (`POC-3-DISENO.md:94`): un reintento con el mismo formulario no duplica, pero recargar la página y reenviar crea un registro nuevo | `docs/PLAN-POC-3.md:94-96`; `docs/POC-3-DISENO.md:138,153,159`; `docs/ROADMAP-MVP.md:188,428` |
| P3-05 | Autorizar ahora la instalación (A4) | La opción está aprobada (`@axe-core/playwright` 4.13.0); falta autorizar el acto de instalar. La alternativa, una lista manual con lector de pantalla, es «más débil» | `docs/PLAN-POC-3.md:186,197`; `poc1a/README.md:77-81` |
| A2 | `REV`, el último commit revisado por el humano | Lo fija el humano | — |
| A4 (aprobación) | Aprobar el parche A4 por su `sha256`, tras leerlo completo y leer `A4-verificacion.txt` | Aprobar sólo si A4r no informa desviaciones y el hash tecleado es el del parche leído. Ningún agente aprueba ni aplica | — |
| A4 | Cómo deshacer el commit local de A4 si fallan A4b o A4c | Lo decide el humano (no hay push) | — |

## Criterio de cierre de U10 (`docs/PLAN-POC-3.md:176-182`)

- [ ] **`--alcance poc-3` 12/12 IN-*:** D13, D17 y D27.
- [ ] **Regresión de 44/44 contra el intake real:** D16 (44 en `app`) y D26 (43 en `app-prod`), y además la decisión **P-U1-01**.
- [ ] **vitest y `tsc` en verde:**
  - D11 y D12;
  - la suite `jz-run` de los agentes repetida sobre el HEAD final, porque la de `EVIDENCIA.md:182` es de `95db8f4`;
  - H-1 y H-2 verificados en D11.
- [ ] **E2E en verde, con teclado y auditoría:** D18 y D28 con los 3 tests de axe ejecutados. Requiere A4 y P3-05.
- [ ] **CSRF y origen con 403 sin registro:** D11 (`intake.test.ts:35-51`) y D25 (CSRF 403 en producción). Para cumplirlo tal como está escrito hace falta cerrar H-4.
- [ ] **Mediciones registradas:**
  - D30 en las tablas de `EVIDENCIA.md:218-228`;
  - CO-05 de D26;
  - `build_ms` de D20;
  - las decisiones **D-08** y **D-09**.
- [ ] **Integridad de la evidencia:** sin `ARBOL ALTERADO` ni `TLS ALTERADO`; K1–K3 conformes; hash de `SHA256SUMS` guardado fuera del host.
- [ ] **jz-security y jz-qa sin defectos importantes abiertos:** es la propia U10, sobre los logs de este gate, H-3, H-5, H-10 y S-1.

## Historial de revisiones

| Ciclo | Revisores | Hallazgos incorporados |
|---|---|---|
| Redacción inicial | jz-architect | Procedimiento A–K a partir de la lectura del código. Correcciones C-1 a C-3. Huecos H-1 a H-9 |
| 1 | jz-qa y jz-architect | Precondiciones de proxy en D09 y D29. `--solo` en D13 y D27 (C-2). NV-8 detrás del build (C-3). Predicción de fallo de H-1/H-2 en D11. Corrección de `README.md` y de código en `b09d7ea`/`c8bbf0f`, pendientes de verificación Docker |
| 2 | jz-qa y jz-security | **QA:** D11 pasa a verificar H-1/H-2 (corregidos en `c8bbf0f`) y `D11-diag` queda obsoleta; citas de `poc.sh` actualizadas (`exec-en` 79-84, `e2e-en` 89-97, `E2E_RESET` 96 y 107, proxy de `e2e-prod-en` 102-103, `build_ms` 123, `up-prod-pruebas-en` 139-143, `down-prod` 144, `stats` 145-148, `destroy` 149); duración con el coste de `verificar-db.ts` por caso. **Seguridad:** S1, montaje escribible, con la comprobación A3f, la guarda `ARBOL ALTERADO` en `r()`, `tls_ok` y el hallazgo S-1; S2, revisión A2 obligatoria y ampliada, y blob del documento en A1; S3, A4 con `--ignore-scripts`, revisión del lockfile, versión de `axe-core` y `npm audit signatures`; S4, `config --no-interpolate` en A2c; S5, validación de `.env` en B1v; S6, búsqueda de fugas por valor y por URL de Postgres en K2; S7, carpeta 700, `SHA256SUMS` incremental y hash fuera del host; S8, comprobación de `git config` y la función `g` en A0. Regla de no pasar secretos en línea a `r()`. Añadidos propios: `.npmrc` en `GUARDA`, rechazo de identificadores repetidos en `r()`, `source:` en el `grep` de A2c, la observación H-10 y la reordenación de la limpieza (J) antes del cierre (K) |
| `69e1883` | jz-architect | El HEAD de referencia del código pasa de `c8bbf0f` a `69e1883`, que sólo cambia `poc1a/contrato-driver.mjs` (el error de reset no vuelca stdout; validación de `POC_RESET_ENV`). Cabecera y A1 actualizadas: A1 acepta commits posteriores que sólo toquen `docs/` |
| Aislamiento de escritura, ciclo de corrección 1 | jz-qa y jz-security | **QA:** `--configLoader runner` en toda invocación de vitest en contenedor (Vite escribe `node_modules/.vite-temp`); `-type f` en D12; ejecución de A4 tras A3f; tsconfig como punto fijo de `writeConfigurationDefaults` (prueba estática); órdenes contradictorias de README, EVIDENCIA y diseño. **Seguridad:** A3e, retirada de contenedores de la era RW y comprobación de montajes RW del worktree; A2d, runc ≥ 1.1.12 (CVE-2024-21626); `next-env.d.ts` creado de forma exclusiva en `init`; referencia de código vinculante `CODEREF` en A1; aclaraciones de root, Compose sin daemon, `destroy` y riesgo del `node_modules` heredado |
| Aislamiento de escritura, ciclo de corrección 2 | jz-security | **I-1R:** A3e pasa a ser el primer paso tras A0 (antes de A1, A2 y A3d) y retira los contenedores del proyecto con `docker rm -f` sin Compose (no interpola ni lee el árbol; sin `-v`); desaparecen la retirada con Compose (`down`) y la validación previa de `.env` que exigía; K1 trata cualquier salida de `g status --short` como parada dura. **M-a:** A3e.2 y K1 listan todos los montajes RW y paran si alguno es `/`, `/home`, `/home/proyectos`, `/home/proyectos/jozeuzz`, el worktree o su `.git`. **M-2:** prueba decisiva con parche tradicional (resultado en A4) y `--check`/aplicación desde la raíz con `g -C ..`. **M-3:** A4 con `set -eu`, sin reutilizar `A4-package.json` y aplicación bloqueada si `a4_rc` ≠ 0. **A2d:** formato de versión de runc y mínimo por rama (1.2.8, 1.3.3, 1.4.0). **Guarda:** `git status` que falla es parada, no falla abierta. **A0:** `filter\.` en la búsqueda de configuración Git peligrosa. Comentario de `init` en `poc.sh` ajustado |
| A4 I-1/I-2 | jz-security | **I-1:** A0 comprueba la ruta de ejecución de Git (`type -a`, `command -v`, `--exec-path`, propietario y permisos, `PATH`, `/bin/false`), las variables `GIT_*`, y lista sólo los **nombres** de la configuración efectiva (`--show-scope --show-origin --name-only`, falla cerrada) con un `grep` amplio de claves que ejecutan programas; la `g` endurecida anula firma (`gpg.program`, `gpg.ssh.program`, `gpg.x509.program`, `commit.gpgSign`, `tag.gpgSign`, `log.showSignature`), hooks, `fsmonitor`, el archivo global de atributos y el mantenimiento automático; verificación efectiva de cada clave y `check-attr -a` sobre los tres manifiestos, ambas con parada dura; lectura de blobs con `show --no-textconv` en A1. Prueba decisiva ejecutable con control en `test/estatico/gate-a4-git.test.ts`. **I-2:** A4 se separa en A4a (generación, con `tsconfig.json` dentro del parche), A4r (comprobación del lockfile **antes** de aplicar y aprobación por hash tecleado), A4p (aplicación condicionada al hash, a HEAD y al árbol limpio), A4v y A4k (commit sin hooks ni firma y sin `gpgsig`). Desaparece la edición manual de `tsconfig.json` |
