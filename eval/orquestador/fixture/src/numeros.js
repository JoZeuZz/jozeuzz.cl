export function sumar(valores) {
  return valores.reduce((a, b) => a + b, 0);
}

export function promedio(valores) {
  return valores.length === 0 ? 0 : sumar(valores) / valores.length;
}
