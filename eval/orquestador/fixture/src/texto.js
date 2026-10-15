export function contarPalabras(texto) {
  const limpio = texto.trim();
  return limpio === '' ? 0 : limpio.split(/\s+/).length;
}

export function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function invertir(texto) {
  return [...texto].reverse().join('');
}

// Ayuda interna: no se exporta.
function normalizarEspacios(texto) {
  return texto.replace(/\s+/g, ' ');
}

export const SEPARADOR = ' ';
void normalizarEspacios;
