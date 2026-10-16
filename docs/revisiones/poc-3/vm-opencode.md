# Evaluación independiente

## Veredicto

**No lista para aprobación.**

Dirección arquitectónica válida: KVM dedicada, sin montajes del CT, `dockerd` rootless, salida denegada, SSH forzado, clon y claves por ejecución. Pero especificación aún no demuestra aislamiento completo ni una cadena de evidencia compatible con `jz-state`.

No se creó VM, no se inició POC-3, no se modificó ningún archivo.

## Hallazgos críticos

### 1. Compose procesa entrada no confiable antes de validarla  
**Tipo:** problema demostrado  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:75-78,142`; `docs/PROPUESTA-EJECUTOR-INTEGRACION.md:38,102-111`

`docker compose config --format json` se ejecuta antes de validar JSON resuelto. Directivas como `include`, `extends`, `env_file`, `configs.file` o `secrets.file` pueden provocar lectura de archivos accesibles en VM antes del rechazo posterior. Además, lista blanca se describe mediante ejemplos, no como esquema exhaustivo.

**Corrección mínima:**

1. Prevalidar YAML crudo con límites de bytes, profundidad y número de nodos.
2. Rechazar claves desconocidas en todos los niveles.
3. Rechazar referencias externas antes de invocar Compose.
4. Permitir rutas sólo bajo checkout tras `realpath`.
5. Generar override antes de resolver.
6. Validar configuración final combinada.
7. Hashear archivo final y ejecutar exactamente ese archivo inmutable.

**Prueba:** fixtures con `include`, `extends.file`, `env_file: /etc/...`, clave Compose desconocida y ruta externa deben rechazarse, demostrando que Compose ni siquiera fue invocado.

---

### 2. Plano de aprovisionamiento del nodo sigue indefinido  
**Tipo:** riesgo plausible + decisión humana  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:16-18,177-181`

Opción automatizada combina token Proxmox, clonación/destrucción, lectura mediante guest agent y `pct push` hacia CT. Identidad del servicio, interfaz, ACL real y capacidad para limitar rutas/VMID no están definidas. Un helper excesivamente privilegiado sería puente hacia host Proxmox y CT.

**Corrección proporcional:** empezar con opción manual. No crear servicio nuevo durante primera aprobación. Si luego se automatiza, especificación separada con:

- pool, plantilla y rango VMID fijos;
- destino CT y rutas fijas;
- ninguna ruta/comando aportado por VM;
- sin interfaz accesible desde VM;
- pruebas negativas sobre otros pools, VMID, CT y rutas.

---

### 3. Firmador privilegiado no está diseñado  
**Tipo:** riesgo plausible bloqueante  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:83,180`

Clave root 0400 protege lectura, pero helper que firme manifiestos entregados por `jzrunner` podría convertirse en oráculo de firma. También existe posible carrera si firma un archivo reemplazable.

**Corrección mínima:** firmador construye manifiesto por sí mismo desde contexto root-owned, abre artefactos con `O_NOFOLLOW`, recalcula tamaños/hashes y firma bytes propios. No acepta rutas, manifiestos ni opciones libres desde `jzrunner`.

**Prueba:** solicitudes con ruta alternativa, symlink, manifiesto reemplazado y campos alterados deben rechazarse sin producir firma.

## Hallazgos importantes

### 4. `git bundle HEAD` transfiere historial, no sólo snapshot  
**Tipo:** problema de diseño  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:74-78`; `docs/PROPUESTA-EJECUTOR-INTEGRACION.md:33,76`

Afirmación “sólo viaja lo versionado” es insuficiente: bundle contiene objetos alcanzables e historial. Si `.git` queda montado, código del contenedor puede leer versiones anteriores y posibles datos retirados.

**Corrección:** transferir exportación acotada de HEAD sin `.git`, ligada al SHA y tree OID. Alternativamente, bundle sólo para verificación y exportar después a directorio separado; contenedores nunca ven repositorio Git.

**Prueba:** secreto sintético presente sólo en commit anterior no debe aparecer ni ser recuperable dentro del contenedor.

---

### 5. Evidencia remota no encaja con criterio actual de `jz-state`  
**Tipo:** problema demostrado  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:82-91,145,181`; `.jz/bin/jz-run:111-116,202-206`; `.jz/bin/jz-state:71-78`

Especificación registra `head`, pero `jz-state` decide verde mediante `tree` y `rc`. Tampoco existe formato remoto aprobado, verificación específica de firma ni canal resuelto para que QA lea logs externos.

**Corrección:**

- definir esquema remoto obligatorio: `tree`, `head`, suite/comando fijo, `rc`, manifest hash, log hash/ruta, clone ID, nonce, firma y `remote:true`;
- capturar huella antes de empaquetar;
- adaptar `jz-state` para rechazar entradas remotas incompletas;
- conservar manifiesto, firma, clave pública retirada y log en ubicación legible sólo para revisores.

**Prueba:** entrada firmada con `head` correcto pero `tree` distinto no da verde; firma o manifest ausente tampoco.

---

### 6. Compose actual no puede ejecutar E2E remoto  
**Tipo:** problema demostrado  
**Referencias:** `poc1a/compose.yaml:77-86`; `docs/ESPEC-VM-PRUEBAS.md:185`; `docs/PLAN-POC-3.md:231`

`e2e` usa `network_mode: "service:app"`, valor incompatible con lista blanca. Playwright depende además de esa topología (`poc1a/playwright.config.ts:3-20`).

**Corrección:** cambio aprobado posterior, fuera de esta revisión: red interna compartida y adaptación del origen/destino E2E.

**Prueba:** configuración real completa de HEAD debe ser aceptada y ejecutar E2E; fixture con `service:app` debe rechazarse.

---

### 7. Sin límites de tiempo y tamaños decididos  
**Tipo:** decisión pendiente con riesgo DoS  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:75,86,90,182`

Faltan topes de bundle, manifiesto, archivo y resultado. Tampoco aparece duración máxima total, timeout SSH ni límite de bytes del flujo completo.

**Corrección:** fijar valores antes de primer uso; añadir plazo total y destrucción del clon al vencer.

**Prueba:** cada límite exacto pasa; límite + 1 byte/segundo falla, no crea resultado y provoca limpieza.

---

### 8. Wrapper Docker no cubre limpieza declarada  
**Tipo:** contradicción demostrada  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:66,97-100`

Wrapper acepta `config`, `up`, `run`, `cp`, `down`; limpieza por etiquetas y auditoría global necesitan operaciones adicionales.

**Corrección:** añadir una única operación fija `cleanup-and-audit(project)`; no exponer comandos Docker genéricos. Cualquier resto bloquea siguiente ejecución.

**Prueba:** fallo inyectado en `down` deja recurso; operación debe detectarlo, eliminarlo o bloquear lote.

---

### 9. Límites rootless aún no están probados  
**Tipo:** riesgo plausible reconocido  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:37-42,183`

`docker inspect` sólo muestra límites solicitados. Falta comprobar `cpu.max`, además de `memory.max` y `pids.max`, usando cgroup real del contenedor.

**Corrección:** aceptación bloqueante antes de convertir plantilla.

**Prueba:** retirar delegación de `cpu`, `memory` o `pids` debe hacer fallar aceptación.

---

### 10. Evidencia por suite no coincide con artefactos reales  
**Tipo:** problema demostrado  
**Referencias:** `docs/ESPEC-VM-PRUEBAS.md:77,82`; `poc1a/playwright.config.ts:10-22`

Especificación propone `test-results/` y `playwright-report/`, pero Playwright usa reporter `list` y no garantiza esos artefactos.

**Corrección:** stdout/stderr capturados por runner deben ser artefactos obligatorios; declarar artefactos adicionales por suite sólo si configuración los produce.

## Red, datos y aislamiento

### Red

Diseño impide VM→CT/LAN/Proxmox **sólo si** firewall jerárquico está activo y reglas funcionan. Actualmente no existe evidencia real; rutas `pvesh` están pendientes (`ESPEC:54`).

Falta probar explícitamente IPv4, IPv6, DNS, API Proxmox, gateway, CT y otro equipo. Añadir prueba positiva CT→VM:22 para evitar falsos verdes causados por red totalmente rota.

### Eliminación de datos

Clon por ejecución y `qm destroy --purge` ofrecen eliminación lógica adecuada para datos sintéticos. No prueban borrado físico en ZFS/thin storage ni eliminación desde snapshots/backups.

Corrección proporcional:

- prohibir datos reales y secretos en VM;
- no respaldar clones de ejecución;
- mantener reutilización por lotes desactivada inicialmente;
- definir TTL para resultados, logs y discos preservados por incidente;
- destrucción garantizada mediante `finally` manual o lease del futuro provisionador.

### Ventana de descargas

Separación mediante `base-ventana` es adecuada. Antes de aprobar operación faltan proxy concreto, tratamiento de redirecciones, validación TLS y pruebas de `docker load`/npm offline (`ESPEC:59,104-105,183`). No añadir registro local salvo que experimento de digest demuestre necesidad.

## Decisiones requeridas al responsable

1. Aprobar rootless obligatorio y autorizar corrección de propuesta contradictoria (`PROPUESTA:44,72,122`; `ESPEC:3-5,173`).
2. Elegir aprovisionamiento manual inicial o especificación separada para broker del nodo.
3. Aprobar diseño exacto del firmador.
4. Fijar topes, timeouts, TTL y política de destrucción.
5. Aprobar activación del firewall de datacenter, VLAN y pruebas IPv4/IPv6.
6. Autorizar posteriormente cambio de `network_mode`, sin iniciar POC-3 ahora.
7. Mantener un clon por ejecución; no aprobar lotes en primera fase.
8. Definir formato remoto y cambio del plano de control necesario para `jz-state`.

## Recomendación final

**Solicitar cambios antes de aprobación.** Mínimo faltante:

- prevalidación Compose anterior a `docker compose config`;
- esquema allowlist exhaustivo;
- decisión de aprovisionamiento;
- diseño del firmador;
- contrato de evidencia compatible con `jz-state`;
- topes y timeouts;
- operación de limpieza fail-closed;
- pruebas positivas y negativas sobre Compose real, red y cgroups.

Tras eso: nueva revisión `jz-security` + `jz-qa`. Sólo después corresponde decidir implementación.

Intento de `git diff --no-index` fue denegado por política; no se buscó rodeo. Verificación final: rama `poc/candidata-a-1b`, HEAD `976f091`, único cambio sigue siendo `?? docs/ESPEC-VM-PRUEBAS.md`, sin escritor, sin bloqueo, árbol sin ejecución verde.

```text
INFORME-JZ
rol: jz-orchestrator
unidad: evaluación independiente de VM aislada para POC
archivos: leídos AGENTS.md, docs/AGENTES.md, docs/AUTONOMIA-JZ.md,
          docs/ESPEC-VM-PRUEBAS.md, docs/PROPUESTA-EJECUTOR-INTEGRACION.md,
          docs/PLAN-POC-3.md, docs/ARQUITECTURA.md, docs/PRODUCTO.md,
          poc1a/compose.yaml, poc1a/playwright.config.ts, poc1a/EVIDENCIA.md,
          .jz/bin/jz-run, .jz/bin/jz-state, .jz-state/LATEST.md /
          cambiados ninguno
evidencia: .jz/bin/jz-state; git branch --show-current; git rev-parse --short HEAD;
           git status --short --branch; git log -3 --oneline; .jz/bin/jz-lock status;
           revisiones independientes jz-security y jz-qa; contraste jz-explorer
hallazgos: 3 críticos, 7 importantes; aislamiento previsto pero no demostrado;
           cadena Compose, aprovisionamiento, firma y evidencia incompletas
estado: incompleto
siguiente: responsable decide bloqueantes; Claude reanuda sólo después para corregir
           documentación pendiente; nueva revisión de seguridad y QA; no implementar aún
```
