Revisé `docs/ESPEC-VM-PRUEBAS.md` sólo leyendo, sin ejecutar nada. Encontré 2 hallazgos críticos y 4 importantes. Los dos críticos permiten firmar evidencia falsa sin que nada lo detecte: la VM de la ventana de descargas tiene Internet y lleva las claves de la plantilla, y un enlace simbólico del commit puede saltarse la validación de montajes.

Todo lo que digo sobre el comportamiento de Docker, OpenSSH o Proxmox sale de lo que sé de esas herramientas y no lo he comprobado. Lo marco como supuesto.

### 1. Crítico. La VM de la ventana de descargas lleva las claves de la plantilla y tiene Internet
- **Dónde:** `docs/ESPEC-VM-PRUEBAS.md:36` (es «un clon desechable de la plantilla vigente»), junto con `:11` y `:59` (la clave de firma y la clave de host van en `base-limpia`) y `:12` (IP y claves salen de la plantilla, «sólo existe un clon a la vez»). Choca con `:10` y `:19`, que prevén que la ventana coincida con un clon.
- **Problema:** la única VM con salida a Internet tiene la clave de firma, la clave de host fijada en `known_hosts` y la misma `<IP_VM>`. El firewall de Proxmox filtra por IP (`:38`). Para llegar a Docker Hub y a npm hay que abrir rangos de CDN compartidos, que también alojan servidores de cualquiera. Cualquier proceso con root en esa VM puede saltarse el proxy y sacar las claves. Además, si la ventana está abierta, `jz-remote` puede enviar el commit a la VM con Internet (misma IP y misma clave de host).
- **Por qué importa:** quien obtenga la clave de firma puede firmar manifiestos en verde, y con la clave de host puede suplantar la VM. Ningún disparador de `:93` lo detecta, porque la firma es válida.
- **Corrección:** crear la VM de ventana desde una plantilla sin claves, con otra IP y otro VMID, y suspender `jz-remote` mientras esté abierta. Las claves de una nueva `base-limpia-vN` se generan después de importar los artefactos, en una VM que nunca ha tenido salida.

### 2. Crítico. Un enlace simbólico del commit se salta la regla de «bind fuera de la ejecución»
- **Dónde:** `docs/ESPEC-VM-PRUEBAS.md:53` (clona el árbol tal cual), `:110` (las fixtures no incluyen enlaces) y `:143` (deja abierta la opción de un `dockerd` con root). Viene de la regla de la propuesta en `docs/PROPUESTA-EJECUTOR-INTEGRACION.md:106`.
- **Problema:** un commit con `escape -> /etc` y `volumes: ["./escape:/x"]` pasa una comprobación por prefijo de ruta, porque `docker compose config` no resuelve enlaces. Supuesto: `dockerd` sí sigue el enlace del origen del bind y monta `/etc` de la VM.
  - Hay además una carrera: `app` monta `./:/app` con escritura, así que un contenedor puede crear el enlace durante la ejecución, antes de que la suite levante otro servicio (`e2e`, `app-prod`). Validar con `realpath` antes de `up` no basta.
- **Por qué importa:** con `dockerd` como root, el resultado es root en la VM. Eso permite leer la clave de firma y la de host (hallazgo 3) y falsear la evidencia.
- **Corrección:**
  - Clonar con `core.symlinks=false` o rechazar los bundles con enlaces.
  - Admitir como origen de bind sólo la raíz de la ejecución, o montarla en sólo lectura y usar volúmenes con nombre para lo escribible.
  - Añadir fixtures con enlace previo y con enlace creado durante la ejecución.
  - Aplicar la misma regla a `env_file`, `configs`/`secrets.file`, `extends` e `include`.

### 3. Importante. Clave de firma compartida, `dockerd` con root y sin forma de detectar una falsificación
- **Dónde:** `docs/ESPEC-VM-PRUEBAS.md:59`, `:100`, `:92` y `:93-99`; `:143`; y la propuesta en `docs/PROPUESTA-EJECUTOR-INTEGRACION.md:44` y `:78`.
- **Problema:**
  - La propuesta afirma que, con el envoltorio root, «aunque el código del commit lograra salir de un contenedor, no sería root en la VM». Es falso si `dockerd` corre como root: salir del contenedor ya es ser root, sea quien sea quien le da las órdenes.
  - Todos los clones comparten la clave de firma hasta la rotación (90 días). La propuesta dice que una ejecución comprometida «no puede falsear las siguientes», pero eso deja de cumplirse si la clave se filtra por los logs (`:100`).
  - Los disparadores de `:93` sólo saltan con firmas inválidas. Una falsificación con la clave real no se detecta.
  - `clon_nuevo` (`:58`) lo declara la propia VM que se está certificando.
  - La orden admite sólo `<suite> <sha>` (`:53`), así que no hay sitio para un nonce y se puede reenviar un manifiesto antiguo.
- **Corrección:** antes del primer uso, exigir `dockerd` rootless, o bien tratar como comprometida la clave de firma cada vez que haya root en la VM. Además:
  - firmar con una clave por clon cuya pública registre el orquestador del nodo, o de forma que la VM no pueda leerla;
  - que `clon_nuevo` lo certifique el orquestador, no la VM;
  - ampliar la expresión regular con un nonce generado en el CT e incluirlo en el manifiesto.

### 4. Importante. El canal de vuelta de artefactos no está especificado y puede romper el aislamiento VM→CT
- **Dónde:** `docs/ESPEC-VM-PRUEBAS.md:58` (`docker cp`) y `:60-66`.
- **Problema:**
  - En la VM, supuesto: `docker cp` copia como enlaces los enlaces que hay dentro de un directorio. Si el proceso que firma (root) calcula hashes o envía los archivos siguiendo enlaces, un `playwright-report/x -> <clave_firma>` saca la clave hacia el CT. Supuesto adicional: `docker cp` sobre un contenedor en marcha tiene precedentes de carreras con enlaces (CVE-2018-15664).
  - En el CT no se define el formato de transporte. Las comprobaciones (regular, sin `..`, tope) están escritas como propiedades del resultado, no como validación previa a escribir. `jz-remote` corre como root en el CT compartido: un `tar -x` previo permitiría a una VM comprometida escribir en cualquier ruta del CT, incluido Wealthfolio. Si se implementa así, el hallazgo pasa a crítico.
- **Corrección:**
  - En la VM: copiar sólo desde contenedores parados, a un directorio de un usuario sin privilegios, y rechazar con `lstat`/`O_NOFOLLOW` todo lo que no sea un archivo regular antes de calcular hashes. El firmador sólo lee el manifiesto.
  - En el CT: usar un formato sin tar (manifiesto firmado primero, después archivos con longitud y nombres de una lista fija), verificar la firma antes de escribir, crear con `O_EXCL|O_NOFOLLOW` en un directorio nuevo fuera del worktree y cortar la lectura al llegar al tope.

### 5. Importante. Tres comprobaciones no prueban lo que dicen
- **`docs/ESPEC-VM-PRUEBAS.md:29`:** el criterio «ningún valor 0» no detecta un `pids_limit` sin fijar. Supuesto: `HostConfig.PidsLimit` sale como `<nil>` y no como 0, y `-1` significa sin límite. Además es una comprobación posterior a `up`.
  - Corrección: rechazar en el validador, antes de `up`, cualquier servicio sin los tres límites o con valores ≤ 0, y en `inspect` exigir valores positivos y no nulos.
- **`docs/ESPEC-VM-PRUEBAS.md:74`:** filtrar por `name=jzrun-` no ve recursos con `container_name:` ni volúmenes o redes con `name:` explícito. La comprobación sale vacía aunque queden restos, y en un lote un volumen fijo puede contaminar la ejecución siguiente.
  - Corrección: añadir `container_name` y `name:` a lo que rechaza la lista blanca, y comprobar que `docker ps -aq` y `docker volume ls -q` salen vacíos del todo (o filtrar por la etiqueta `com.docker.compose.project`).
- **`docs/ESPEC-VM-PRUEBAS.md:46`:** supuesto: `sshd -T` sin `-C` ignora los bloques `Match`, así que no prueba que `ForceCommand` se aplique ni que ningún `Match` posterior reactive algo.
  - Corrección: usar `sshd -T -C user=jzrunner,addr=<IP_CT>,host=x` y comprobar también `authorizedkeysfile`.

### 6. Importante. Sin vía para instalar y actualizar la VM, un firewall que falla abierto y aprobaciones que faltan
- **Dónde:** `docs/ESPEC-VM-PRUEBAS.md:11`, `:36`, `:38`, `:99`, `:34`, `:106` y `:119-138`.
- **Problema:**
  - La ventana «no se abre nunca en `base-limpia`» y sólo apunta a Docker Hub, MCR y npm. Así no hay forma prevista de instalar Debian 13 y Docker, ni de aplicar los parches del kernel, `openssh` y `dockerd`, ni de reconstruir la VM tras un compromiso (`:99`). En la práctica, o se abre la red de forma improvisada en la plantilla con claves, o se mantiene sin parchear el kernel que es la frontera de aislamiento.
  - Supuesto: el firewall de Proxmox es la única capa entre la VM y la LAN, la API del nodo e Internet, y deja pasar todo si se desactiva el del datacenter o se para `pve-firewall`. Sólo se comprueba una vez (`:106`).
  - §12 no recoge como aprobaciones la credencial de Proxmox para crear y destruir clones (`:142`), ni el canal de actualizaciones.
- **Corrección:**
  - Definir una ventana de instalación y actualización (repositorios de Debian y Docker) sobre una VM sin claves, con aprobación y cadencia propias.
  - Que el orquestador del nodo compruebe antes de cada clon `pve-firewall status`, las opciones del `.fw` del clon y `firewall=1`, con un filtro adicional en el router o la VLAN.
  - Añadir a §12 la credencial de clonado y el canal de actualizaciones.

```
INFORME-JZ
rol: jz-security
unidad: POC-3 — revisión de seguridad de docs/ESPEC-VM-PRUEBAS.md (sin confirmar) frente a la propuesta
archivos: leídos /home/proyectos/jozeuzz-poc-candidata-a/docs/ESPEC-VM-PRUEBAS.md, /home/proyectos/jozeuzz-poc-candidata-a/docs/PROPUESTA-EJECUTOR-INTEGRACION.md (entera), /home/proyectos/jozeuzz-poc-candidata-a/docs/AUTONOMIA-JZ.md, /home/proyectos/jozeuzz-poc-candidata-a/poc1a/compose.yaml / cambiados: ninguno
evidencia: sólo lectura con Read; no ejecuté ningún comando (rol sin shell). El comportamiento de Docker (PidsLimit nulo, binds que siguen enlaces, docker cp), OpenSSH (sshd -T sin -C) y Proxmox (firewall que falla abierto) es supuesto y no está comprobado
hallazgos: 2 críticos (VM de ventana con claves de la plantilla e Internet; enlace simbólico que se salta la regla de bind y da root en la VM); 4 importantes (clave de firma compartida y falsificación no detectable, con la afirmación falsa de la propuesta §3.1 sobre el envoltorio root; canal de vuelta VM→CT sin especificar; comprobaciones de pids_limit, restos por nombre y sshd -T que no prueban lo que dicen; sin vía de instalación y parches, firewall que falla abierto y aprobaciones que faltan en §12)
estado: validado (revisión completa con estos límites: sólo lectura, sin ejecución)
siguiente: jz-architect corrige §3, §4, §5, §6, §7, §2, §11 y §12 de la especificación y la afirmación de la propuesta §3.1 (L44); después, nueva revisión de jz-security antes de pedir las aprobaciones humanas
```
