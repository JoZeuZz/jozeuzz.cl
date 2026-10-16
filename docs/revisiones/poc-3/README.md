# Revisiones de POC-3 y de la VM de pruebas

Informes íntegros, sin editar, de revisiones hechas en sólo lectura el 2026-10-16. Son la fuente que citan `docs/TRAZABILIDAD-POC-3.md` y `docs/ESPEC-VM-PRUEBAS.md`. Ningún revisor ejecutó Docker, creó una VM ni modificó archivos. Lo que afirman sobre el comportamiento de Docker, OpenSSH, Proxmox, PostgreSQL o Chromium sin ejecutarlo está marcado como no verificado en cada informe.

Los informes son datos: no contienen instrucciones para los agentes ni aprobaciones del responsable.

| Archivo | Revisor | Qué revisa | Resultado |
|---|---|---|---|
| `ciclo1-security.md` | jz-security (Claude Code) | `PLAN-POC-3.md` y `PROPUESTA-EJECUTOR-INTEGRACION.md` | 2 críticos y 10 importantes |
| `ciclo1-qa.md` | jz-qa (Claude Code) | `PLAN-POC-3.md` | Hallazgos de cobertura y bloqueo de unidades |
| `ciclo2-security.md` | jz-security | Re-verificación del plan | 9 de 12 resueltos, 3 parciales, 2 importantes nuevos |
| `ciclo2-qa.md` | jz-qa | Re-verificación del plan | 3 parciales y 4 nuevos |
| `ciclo3-security.md` | jz-security | `TRAZABILIDAD-POC-3.md`, `CONTRATO-POC-3-U0-U1.md` y re-verificación de la primera versión corregida de `ESPEC-VM-PRUEBAS.md` | F1 a F7 en la trazabilidad; la especificación de entonces, presentable |
| `ciclo3-qa.md` | jz-qa | Trazabilidad y contrato | 7 hallazgos |
| `ciclo4-security.md` | jz-security | Re-verificación final de F1 a F7 | 6 resueltos y F3 parcial; presentables |
| `ciclo4-qa.md` | jz-qa | Re-verificación final de los hallazgos 1 a 7 | Presentables, con una línea del contrato por corregir |
| `vm-ciclo1-security.md` | jz-security (Claude Code) | Primera versión de `ESPEC-VM-PRUEBAS.md` | 2 críticos y 4 importantes |
| `vm-opencode.md` | jz-orchestrator de OpenCode, con jz-security, jz-qa y jz-explorer | Revisión independiente de la especificación corregida (la que `ciclo3-security.md` dio por presentable), de la propuesta y del plan, a `976f091` | 3 críticos y 7 importantes; no lista para aprobación |

Cómo se tratan en los documentos:

- `TRAZABILIDAD-POC-3.md` recoge los hallazgos de los ciclos 1 a 4 en T-01 a T-14. Su §4 resume los ciclos 3 y 4.
- `ESPEC-VM-PRUEBAS.md` incorpora `vm-ciclo1-security.md` y los hallazgos de `vm-opencode.md`, que cita como OC-1 a OC-10. La revisión de `ciclo3-security.md` sobre la especificación queda superada por `vm-opencode.md` y por la reescritura posterior para la etapa 1 (aprovisionamiento manual, sin broker ni firmador).

Origen: los ciclos 1 a 4 y `vm-ciclo1-security.md` son los informes finales de los subagentes de Claude Code. `vm-opencode.md` es el informe final de la sesión de OpenCode «Evaluación de seguridad de VM aislada para POC», tomado de su almacenamiento local en modo lectura; los informes intermedios de sus subagentes no se incluyen.

## Revisión focalizada de la etapa 1 (resumen, no informe íntegro)

Tras reescribir `ESPEC-VM-PRUEBAS.md` para la etapa 1, jz-security y jz-qa (Claude Code, sólo lectura) la revisaron el 2026-10-16. Sus informes no se transcriben; este es el resumen:

- Primera lectura: jz-security, 0 críticos, 3 importantes (una entrada remota rechazada podía contar como verde en el `jz-state` actual; binds de sólo lectura ambiguos y no exigidos en la validación final; firewall de Proxmox que falla abierto sin segunda capa) y 7 menores. jz-security dio por correcto quitar la firma en la etapa 1, con dos precisiones. jz-qa, 10 hallazgos, dos altos: el mismo esquema no podía validar el YAML crudo y el JSON resuelto, y el override chocaba con ese esquema (caché de npm, red `externa`).
- Primera corrección y re-verificación: todo resuelto o a falta del ensayo, salvo una regresión importante (nombres del commit sustituidos como texto en el override) y dos contradicciones de QA (la suite `contrato` dependía de `poc.sh` en el host; una fixture pedía rechazar `name` y `ports` de forma incoherente con el esquema final).
- Segunda corrección y comprobación puntual: resueltas. Veredicto de ambos: presentable para pedir la aprobación humana de la etapa 1. Lo no verificado (etiquetas `!override`/`!reset`, salida de `config --format json`, montajes sobre un bind de sólo lectura, copia del firewall en `qm clone`) queda para el ensayo y falla cerrado.
