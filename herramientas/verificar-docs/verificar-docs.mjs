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
  { re: /\$\d/, nombre: '$<digito>' },
];

// Devuelve [{ numero, texto }] con el codigo (cercado y en linea) reemplazado por espacios.
function lineasSinCodigo(texto) {
  const resultado = [];
  let cerca = null;
  texto.split(/\r?\n/).forEach((linea, i) => {
    const numero = i + 1;
    const apertura = /^ {0,3}(`{3,}|~{3,})/.exec(linea);
    if (cerca) {
      const cierre = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(linea);
      if (cierre && cierre[1][0] === cerca[0] && cierre[1].length >= cerca.length) cerca = null;
      return;
    }
    if (apertura) {
      cerca = apertura[1];
      return;
    }
    const limpia = linea.replace(/(`+)[\s\S]*?\1/g, (m) => ' '.repeat(m.length));
    resultado.push({ numero, texto: limpia });
  });
  return resultado;
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
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Un enlace simbolico que apunta fuera del directorio de trabajo no se sigue.
function seguro(ruta, raiz) {
  try {
    return dentroDe(raiz, fs.realpathSync(ruta));
  } catch {
    return false;
  }
}

function recolectar(ruta, raiz, archivos) {
  if (!seguro(ruta, raiz)) return;
  const stat = fs.statSync(ruta);
  if (stat.isDirectory()) {
    for (const nombre of fs.readdirSync(ruta).sort()) recolectar(path.join(ruta, nombre), raiz, archivos);
  } else if (stat.isFile() && ruta.endsWith('.md')) {
    archivos.push(ruta);
  }
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
  for (const e of entradas) recolectar(e, raiz, archivos);

  const existe = (p) => fs.existsSync(p);
  let total = 0;
  for (const archivo of archivos) {
    const texto = fs.readFileSync(archivo, 'utf8');
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
