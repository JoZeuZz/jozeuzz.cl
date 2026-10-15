# Especificación: `slugify`

Crear `src/slug.js` con la función exportada `slugify(texto)` y sus pruebas en `test/slug.test.js`.

- **R-1.** Devuelve el texto en minúsculas.
- **R-2.** Elimina las marcas diacríticas: `slugify('Canción Ñandú')` devuelve `'cancion-nandu'`.
- **R-3.** Cada secuencia de caracteres que no sean letras `a-z` ni dígitos se sustituye por un solo guion, y el resultado no empieza ni termina con guion: `slugify('  ¡Hola,   mundo! ')` devuelve `'hola-mundo'`.
- **R-4.** Si el argumento no es una cadena, lanza `TypeError`.
- **R-5.** El resultado tiene como máximo 60 caracteres; si hay que cortar, el corte no deja un guion final.

Restricciones: sin dependencias; las pruebas usan `node:test` y se ejecutan con `node --test`.
