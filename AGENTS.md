# AGENTS.md — jozeuzz.cl

Fuente de verdad para agentes que trabajen en este repositorio.

## Estado actual
Fase 0: definición. **No generar scaffold ni iniciar el producto hasta aprobar el stack mediante prueba de concepto y registrar ADR.** Leer `docs/PRODUCTO.md`, `docs/ARQUITECTURA.md` y `docs/AGENTES.md` antes de proponer cambios.

## Objetivo
Una web de portafolio profesional y servicios técnicos, con datos privados y backoffice protegido. No confundir portfolio público con operaciones de negocio.

## Disciplina obligatoria
- Cambios mínimos y comprobables, nunca inventar resultados de herramientas.
- Antes de editar: inspeccionar rama, `git status`, archivos y decisiones.
- Para implementación: feature branch o worktree aislado, issue/alcance y PR.
- No mover ni borrar trabajo ajeno, ni sobrescribir archivos modificados sin acuerdo.
- Mantener privacidad, autorización server-side y registros sin datos personales.
- No añadir datos reales de clientes, tokens o contraseñas al repositorio.
- Ejecutar los checks relevantes; detallar los que no pudieron ejecutarse.
- No cambiar producción, DNS, infraestructura o políticas de acceso sin permiso humano.
- En fallos/cuotas: generar handoff explícito y verificar el estado real al reanudar.
- Documentar decisiones importantes mediante ADR.
- No asumir versiones actuales de frameworks o modelos: verificar documentación al ejecutar.

## Fase 0
Permiso de lectura y escritura de documentación; la implementación requiere decisión de arquitectura aprobada por el responsable del proyecto.
