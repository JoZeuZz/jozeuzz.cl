# Decisiones de diseño MVP I1

## Admin singleton y colección usuarios

**Supuesto YAGNI aprobado 2026-10-27**: única colección `usuarios`; todas las cuentas son administrador. No existe distinción de roles dentro del MVP.

- `soloAdmin` verifica solo `req.user?.collection === 'usuarios'`.
- Alta concurrente, login HTTP y recuperación de contraseña son Task8.
- No añadir roles, permisos granulares ni `isAdmin: boolean` fuera del MVP.

## Identidad inmutable

Los campos `email` y `nombre` no pueden cambiarse vía HTTP ni Local API `own update`. Password/recovery queda Task8.

## Gateway catálogo

El símbolo de capability y el factory de contexto viven en `catalog/publico.ts` y nunca se exportan. Ningún código externo puede fabricar la capability salvo `listarServiciosPublicos`.
