#!/usr/bin/env node
// Verificador de contraste WCAG 2.x para tokens de color. Sin dependencias.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const UMBRALES = Object.freeze({
  texto: 4.5,
  'texto-grande': 3,
  ui: 3,
  'texto-aaa': 7,
  'texto-grande-aaa': 4.5,
});

export function parsearColor(str) {
  const m = typeof str === 'string' ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str) : null;
  if (!m) {
    throw new Error(
      `color inválido: ${JSON.stringify(str)} (se admite #rgb o #rrggbb, sin alfa)`,
    );
  }
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const linealizar = (v8) => {
  const v = v8 / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function luminanciaRelativa({ r, g, b }) {
  return 0.2126 * linealizar(r) + 0.7152 * linealizar(g) + 0.0722 * linealizar(b);
}

export function razonContraste(a, b) {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function cumple(razon, nivel) {
  if (!Object.hasOwn(UMBRALES, nivel)) {
    throw new Error(`nivel inválido: ${JSON.stringify(nivel)} (válidos: ${Object.keys(UMBRALES).join(', ')})`);
  }
  return razon >= UMBRALES[nivel];
}

// Valida la estructura y devuelve los pares evaluados. Lanza Error si es inválida.
export function evaluar(datos) {
  const esObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  if (!esObj(datos)) throw new Error('el JSON debe ser un objeto');
  if (!esObj(datos.colores)) throw new Error('falta "colores" (objeto token -> #hex)');
  if (!Array.isArray(datos.pares)) throw new Error('falta "pares" (lista)');
  if (datos.pares.length === 0) throw new Error('"pares" está vacío: ningún par que verificar');
  const rgb = {};
  for (const [token, valor] of Object.entries(datos.colores)) {
    try {
      rgb[token] = parsearColor(valor);
    } catch (e) {
      throw new Error(`token "${token}": ${e.message}`);
    }
  }
  return datos.pares.map((par, i) => {
    if (!esObj(par)) throw new Error(`pares[${i}] debe ser un objeto`);
    for (const campo of ['primero', 'fondo']) {
      if (!Object.hasOwn(rgb, par[campo])) {
        throw new Error(`pares[${i}]: token inexistente "${par[campo]}" en "${campo}"`);
      }
    }
    if (!Object.hasOwn(UMBRALES, par.nivel)) {
      throw new Error(
        `pares[${i}]: nivel inválido ${JSON.stringify(par.nivel)} (válidos: ${Object.keys(UMBRALES).join(', ')})`,
      );
    }
    const razon = razonContraste(rgb[par.primero], rgb[par.fondo]);
    return {
      primero: par.primero,
      fondo: par.fondo,
      nivel: par.nivel,
      uso: par.uso ?? '',
      razon,
      ok: cumple(razon, par.nivel),
    };
  });
}

export function main(argv, salida = process.stdout, errores = process.stderr) {
  if (argv.length === 0) {
    errores.write('uso: node herramientas/contraste/contraste.mjs <archivo.json>...\n');
    return 2;
  }
  const lineas = [];
  let total = 0;
  let fallos = 0;
  for (const archivo of argv) {
    let resultados;
    let titulo;
    try {
      const datos = JSON.parse(readFileSync(archivo, 'utf8'));
      resultados = evaluar(datos);
      titulo = typeof datos.nombre === 'string' && datos.nombre ? ` (${datos.nombre})` : '';
    } catch (e) {
      errores.write(`contraste: ${archivo}: ${e.message}\n`);
      return 2;
    }
    const nombre = path.basename(archivo);
    let falloArchivo = 0;
    for (const r of resultados) {
      if (!r.ok) falloArchivo++;
      lineas.push(
        `${nombre}: ${r.primero}/${r.fondo} razón=${r.razon.toFixed(2)} nivel=${r.nivel} ${r.ok ? 'OK' : 'FALLA'} ${r.uso}`.trimEnd(),
      );
    }
    lineas.push(`${nombre}${titulo}: ${resultados.length} pares, ${falloArchivo} fallos`);
    total += resultados.length;
    fallos += falloArchivo;
  }
  lineas.push(`contraste: ${total} pares, ${fallos} fallos`);
  salida.write(lineas.join('\n') + '\n');
  return fallos > 0 ? 1 : 0;
}

const esPrincipal =
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (esPrincipal) process.exitCode = main(process.argv.slice(2));
