# Release de JZ-AI con `jz-coord`: instalación, comprobación y rollback

Este procedimiento instala la release que incluye `jz-coord` endurecido (`feat/jz-interop`). La activación
cambia `~/.local/share/jz-ai/current`, que usan el supervisor y `jz-git` de todas las sesiones. Por eso
**la activación necesita la aprobación explícita de una persona**. Todo lo anterior a la activación se
puede hacer sin ella, porque no toca `current`.

## Cómo está organizada una release

- `jz-install` copia `tools/jz-autonomy` y `tools/jz-gitops` de un commit revisado (`git archive`) en
  `~/.local/share/jz-ai/releases/<sha>`, sin permisos de escritura, con un archivo `REVISION`.
- `current` es un enlace simbólico relativo a `releases/<sha>`. Activar o volver atrás sólo cambia el
  enlace: las releases anteriores se conservan intactas, así que el rollback es inmediato.
- `JZ_AI_HOME` cambia la base (por defecto `~/.local/share/jz-ai`). Con una base distinta se instala y se
  comprueba una release sin activar nada.

## 1. Condiciones previas

1. El SHA candidato es el HEAD de `integ/mvp-v0.1` (o de `feat/jz-interop`) con la CI en verde para ese
   SHA, y sus pruebas locales están en verde (ver la evidencia en `evidencia/jz-coord/`).
2. No hay ningún controlador en marcha:

   ```sh
   pgrep -af 'jz-autonomy.js|jz-coord.js' || echo "sin controladores"
   ```

3. Ningún state-dir de `jz-coord` o `jz-autonomy` está a medias con un titular vivo. La release activa
   hasta ahora (`4602cdf`) no trae `jz-coord`, así que `status` se ejecuta desde la copia de staging del
   paso 2. Para cada `.jz-state/coord/<nombre>` que no esté `completed`:

   ```sh
   node "$stage/current/tools/jz-autonomy/bin/jz-coord.js" status --root <worktree> --state-dir <nombre>
   ```

   Si aparece una línea `lease ...`, hay que esperar a que termine o cerrar esa ejecución antes de seguir.

4. Anotar la release activa, para el rollback:

   ```sh
   prev=$(readlink ~/.local/share/jz-ai/current)   # p. ej. releases/4602cdf8c9e4b805ea14eca3d323f45509740c61
   echo "$prev" > ~/.local/share/jz-ai/previous-release.txt
   ```

## 2. Instalar en staging y comprobar (sin activar)

Este paso puede ir antes que el 1.3, que usa la copia de staging.

`jz-install` se ejecuta siempre desde el commit revisado, nunca desde el árbol de trabajo. En zsh, la
variable va entre llaves (`${sha}`), porque `$sha:t` es un modificador.

```sh
wt=/home/proyectos/jozeuzz/worktrees/integracion
sha=$(git -C "$wt" rev-parse HEAD)          # SHA completo de 40 caracteres
stage=/var/tmp/jz-ai-staging
git -C "$wt" show "${sha}:tools/jz-autonomy/bin/jz-install" | JZ_AI_HOME="$stage" bash -s -- "$wt" "$sha"
```

Comprobaciones sobre la copia instalada:

```sh
r="$stage/current"
test "$(cat "$r/REVISION")" = "$sha"                       # la copia es la del SHA
node --test "$r"/tools/jz-autonomy/test/*.test.js "$r"/tools/jz-gitops/test/*.test.mjs   # todo en verde
node "$r/tools/jz-autonomy/bin/jz-coord.js" --help         # rc 0
node "$r/tools/jz-gitops/jz-git.mjs"; echo "rc=$?"         # JSON de uso y rc 2 (no un no-op silencioso)
node "$r/tools/jz-autonomy/demo/interop-demo.mjs" --source "$wt" --mode synthetic   # 7 escenarios OK
```

La demo crea repositorios desechables en `/var/tmp/jz-coord-demo/` y no toca el worktree.

## 3. Activar (requiere aprobación)

```sh
git -C "$wt" show "${sha}:tools/jz-autonomy/bin/jz-install" | bash -s -- "$wt" "$sha"
```

Después de activar:

```sh
readlink ~/.local/share/jz-ai/current                      # releases/<sha>
test "$(cat ~/.local/share/jz-ai/current/REVISION)" = "$sha"
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-coord.js --help
node ~/.local/share/jz-ai/current/tools/jz-gitops/jz-git.mjs; echo "rc=$?"   # rc 2
```

La primera meta real con la release nueva debería ser pequeña, con `push: false`, y revisarse con
`jz-coord status` antes de habilitar el push.

## 4. Rollback

Con los controladores parados (paso 1.2), se vuelve a apuntar `current` a la release anterior. Para que el
cambio sea atómico, se crea el enlace nuevo y se renombra encima del actual:

```sh
prev=$(cat ~/.local/share/jz-ai/previous-release.txt)
test -d ~/.local/share/jz-ai/"$prev"
ln -s "$prev" ~/.local/share/jz-ai/current.new && mv -T ~/.local/share/jz-ai/current.new ~/.local/share/jz-ai/current
readlink ~/.local/share/jz-ai/current && cat ~/.local/share/jz-ai/current/REVISION
node ~/.local/share/jz-ai/current/tools/jz-gitops/jz-git.mjs; echo "rc=$?"   # rc 2
```

Volver a `4602cdf` (la release activa al preparar este incremento) deja **sin `jz-coord`**: no existe
en esa release. Las metas de `jz-coord` a medias no se pueden reanudar hasta reinstalar la release nueva;
`jz-autonomy` y `jz-git` siguen funcionando.

Compatibilidad de los state-dirs entre releases:

- Una release anterior lee el estado de la nueva (los campos `lease.token`, `lease.identity` y
  `committing` le sobran), pero no respeta `controller.lock`: tras un rollback no hay exclusión entre
  controladores, como antes.
- La release nueva lee el estado de la anterior. Un lease antiguo no tiene token ni identidad: si su
  titular sigue vivo y vence, la release nueva no lo mata, porque no puede demostrar su identidad, y la
  meta queda en `blocked` hasta que una persona lo revise.
- `jz-git` no cambia en este incremento.

## Limitaciones conocidas

- `jz-install` usa `ln -sfn`, que no es atómico (hay un instante sin `current`). Por eso la activación se
  hace con los controladores parados. Cambiarlo a `mv -T` queda en el backlog.
- La comprobación en staging no ejecuta motores reales. La validación con motores reales está en la
  evidencia del incremento.
