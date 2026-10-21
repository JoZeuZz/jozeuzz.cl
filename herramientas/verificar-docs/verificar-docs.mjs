#!/usr/bin/env node
// Verificador determinista de documentos markdown (H0-b). Sin dependencias.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LINEAS_ESTADO = 12;
const RE_ESTADO = /Estado.*(Propuesta|Propuesto|propuesta)/;
const RE_ENLACE = /\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+"[^"]*")?\s*\)/g;
const RE_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i;
const MARCADORES = [
  { re: /TU_URL/i, nombre: 'TU_URL' },
  { re: /lorem ipsum/i, nombre: 'lorem ipsum' },
  { re: /\bUSD\b/i, nombre: 'USD' },
  { re: /US\$/i, nombre: 'US$' },
  { re: /(?<![Uu][Ss])\$\d/, nombre: '$<digito>' },
];

// Devuelve [{ numero, texto }] con el codigo (cercado y en linea) reemplazado por espacios.
function lineasSinCodigo(texto) {
  const resultado = [];
  let cerca = null;
  texto.split(/\r?\n/).forEach((linea, i) => {
    const numero = i + 1;
    const apertura = /^[ \t>]*(`{3,}|~{3,})/.exec(linea);
    if (cerca) {
      const cierre = /^[ \t>]*(`{3,}|~{3,})\s*$/.exec(linea);
      if (cierre && cierre[1][0] === cerca[0] && cierre[1].length >= cerca.length) cerca = null;
      return;
    }
    if (apertura) {
      cerca = apertura[1];
      return;
    }
    resultado.push({ numero, texto: quitarSpans(linea) });
  });
  return resultado;
}

// Reemplaza por espacios los spans de codigo en linea: una racha de N backticks
// se cierra con la siguiente racha de exactamente N; sin cierre es literal.
function quitarSpans(linea) {
  const rachas = [...linea.matchAll(/`+/g)];
  let salida = linea;
  for (let i = 0; i < rachas.length; i++) {
    const abre = rachas[i];
    const cierra = rachas.slice(i + 1).find((r) => r[0].length === abre[0].length);
    if (!cierra) continue;
    const fin = cierra.index + cierra[0].length;
    salida = salida.slice(0, abre.index) + ' '.repeat(fin - abre.index) + salida.slice(fin);
    i = rachas.indexOf(cierra);
  }
  return salida;
}

function destinoLocal(crudo) {
  let destino = crudo.startsWith('<') ? crudo.slice(1, -1) : crudo;
  if (destino === '' || destino.startsWith('#') || destino.startsWith('/') || RE_ESQUEMA.test(destino)) {
    return null;
  }
  destino = destino.split('#')[0];
  try {
    destino = decodeURIComponent(destino);
  } catch {
    // Codificacion invalida: se usa el destino tal cual.
  }
  return destino === '' ? null : destino;
}

export function verificarTexto(texto, { ruta, existe, exigirPropuesta = false }) {
  const hallazgos = [];
  const base = path.dirname(ruta);

  if (exigirPropuesta) {
    const primeras = texto.split(/\r?\n/).slice(0, LINEAS_ESTADO);
    if (!primeras.some((l) => RE_ESTADO.test(l))) {
      hallazgos.push({
        linea: 1,
        regla: 'estado-propuesta',
        detalle: `falta una linea "Estado ... Propuesta" en las primeras ${LINEAS_ESTADO} lineas`,
      });
    }
  }

  for (const { numero, texto: linea } of lineasSinCodigo(texto)) {
    for (const m of linea.matchAll(RE_ENLACE)) {
      const destino = destinoLocal(m[1]);
      if (destino && !existe(path.resolve(base, destino))) {
        hallazgos.push({ linea: numero, regla: 'enlace-roto', detalle: `destino inexistente: ${destino}` });
      }
    }
    for (const { re, nombre } of MARCADORES) {
      if (re.test(linea)) {
        hallazgos.push({ linea: numero, regla: 'marcador-prohibido', detalle: `marcador no permitido: ${nombre}` });
      }
    }
  }

  return hallazgos.sort((a, b) => a.linea - b.linea);
}

// --- CLI ---

function dentroDe(raiz, destino) {
  const rel = path.relative(raiz, destino);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

// Un enlace simbolico que apunta fuera del directorio de trabajo no se sigue.
function seguro(ruta, raiz) {
  try {
    return dentroDe(raiz, fs.realpathSync(ruta));
  } catch {
    return false;
  }
}

// Devuelve cuantos .md encontro (incluidos los ya recolectados antes). `dirs` evita ciclos
// dentro de una entrada; `vistos` evita duplicados entre entradas.
function recolectar(ruta, raiz, archivos, vistos, dirs) {
  if (!seguro(ruta, raiz)) return 0;
  const real = fs.realpathSync(ruta);
  const stat = fs.statSync(ruta);
  if (stat.isDirectory()) {
    if (dirs.has(real)) return 0;
    dirs.add(real);
    let n = 0;
    for (const nombre of fs.readdirSync(ruta).sort()) {
      n += recolectar(path.join(ruta, nombre), raiz, archivos, vistos, dirs);
    }
    return n;
  }
  if (stat.isFile() && ruta.endsWith('.md')) {
    if (!vistos.has(real)) {
      vistos.add(real);
      archivos.push(ruta);
    }
    return 1;
  }
  return 0;
}

export function main(argv, { salida = console.log, error = console.error } = {}) {
  const raiz = fs.realpathSync(process.cwd());
  let exigirPropuesta = false;
  const entradas = [];
  for (const arg of argv) {
    if (arg === '--exigir-propuesta') exigirPropuesta = true;
    else if (arg.startsWith('--')) {
      error(`verificar-docs: opcion desconocida: ${arg}`);
      return 2;
    } else entradas.push(arg);
  }
  if (entradas.length === 0) {
    error('uso: verificar-docs.mjs [--exigir-propuesta] <archivo.md|directorio>...');
    return 2;
  }
  for (const e of entradas) {
    if (!fs.existsSync(e)) {
      error(`verificar-docs: ruta inexistente: ${e}`);
      return 2;
    }
  }

  const archivos = [];
  const vistos = new Set();
  let sinMd = false;
  for (const e of entradas) {
    if (recolectar(e, raiz, archivos, vistos, new Set()) === 0) {
      error(`verificar-docs: la entrada no aporta ningun .md verificable: ${e}`);
      sinMd = true;
    }
  }
  if (sinMd) return 2;
  if (archivos.length === 0) {
    error('verificar-docs: no hay archivos .md que verificar');
    return 2;
  }

  const existe = (p) => fs.existsSync(p);
  let total = 0;
  for (const archivo of archivos) {
    let texto;
    try {
      texto = fs.readFileSync(archivo, 'utf8');
    } catch (err) {
      error(`verificar-docs: no se pudo leer ${archivo}: ${err.message}`);
      return 2;
    }
    const ruta = path.resolve(archivo);
    for (const h of verificarTexto(texto, { ruta, existe, exigirPropuesta })) {
      salida(`${archivo}:${h.linea}: ${h.regla}: ${h.detalle}`);
      total++;
    }
  }
  salida(`verificar-docs: ${archivos.length} archivos, ${total} hallazgos`);
  return total === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
