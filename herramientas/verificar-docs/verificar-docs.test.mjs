import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificarTexto } from './verificar-docs.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(AQUI, 'verificar-docs.mjs');
const RUTA = '/w/docs/h0b/doc.md';

const reglas = (hallazgos) => hallazgos.map((h) => h.regla);
const verificar = (texto, opts = {}) =>
  verificarTexto(texto, { ruta: RUTA, existe: () => true, exigirPropuesta: false, ...opts });
const capturar = (texto) => {
  const vistos = [];
  verificar(texto, { existe: (p) => (vistos.push(p), true) });
  return vistos;
};

// enlace-roto
test('enlace-roto: reporta destino relativo inexistente con linea 1-based', () => {
  const h = verificar('# T\n\n[a](falta.md)\n', { existe: () => false });
  assert.deepEqual(reglas(h), ['enlace-roto']);
  assert.equal(h[0].linea, 3);
  assert.match(h[0].detalle, /falta\.md/);
});

test('enlace-roto: resuelve respecto del directorio de ruta', () => {
  assert.deepEqual(capturar('[a](../x/y.md)'), [path.resolve('/w/docs/x/y.md')]);
});

test('enlace-roto: enlace existente no genera hallazgo', () => {
  assert.deepEqual(verificar('[a](ok.md)'), []);
});

test('enlace-roto: ancla se quita antes de comprobar existencia', () => {
  assert.deepEqual(capturar('[a](otro.md#sec)'), [path.resolve('/w/docs/h0b/otro.md')]);
});

test('enlace-roto: titulo opcional no forma parte del destino', () => {
  assert.deepEqual(capturar('[a](otro.md "Un titulo")'), [path.resolve('/w/docs/h0b/otro.md')]);
});

test('enlace-roto: %20 se decodifica a espacio', () => {
  assert.deepEqual(capturar('[a](mi%20doc.md)'), [path.resolve('/w/docs/h0b/mi doc.md')]);
});

test('enlace-roto: ignora http, https, mailto y anclas locales', () => {
  const texto = '[a](http://x.cl) [b](https://x.cl/p) [c](mailto:a@b.cl) [d](#seccion)';
  assert.deepEqual(verificar(texto, { existe: () => false }), []);
});

test('enlace-roto: ignora enlaces en bloque cercado con ``` y ~~~', () => {
  const texto = '```\n[a](falta.md)\n```\n~~~md\n[b](falta2.md)\n~~~\n';
  assert.deepEqual(verificar(texto, { existe: () => false }), []);
});

test('enlace-roto: tras cerrar el bloque cercado vuelve a verificar', () => {
  const h = verificar('```\n[a](x.md)\n```\n[b](y.md)\n', { existe: () => false });
  assert.deepEqual(h.map((x) => x.linea), [4]);
});

test('enlace-roto: ignora enlaces dentro de span de codigo en linea', () => {
  assert.deepEqual(verificar('Usa `[a](falta.md)` asi.', { existe: () => false }), []);
});

test('enlace-roto: detecta varios enlaces en una linea', () => {
  const h = verificar('[a](x.md) y [b](y.md)', { existe: () => false });
  assert.equal(h.length, 2);
});

// estado-propuesta
test('estado-propuesta: sin exigirPropuesta no se comprueba', () => {
  assert.deepEqual(verificar('# T\n'), []);
});

test('estado-propuesta: falta estado reporta en linea 1', () => {
  const h = verificar('# T\n\nTexto\n', { exigirPropuesta: true });
  assert.deepEqual(reglas(h), ['estado-propuesta']);
  assert.equal(h[0].linea, 1);
});

test('estado-propuesta: acepta markdown con negritas y cita', () => {
  assert.deepEqual(verificar('# T\n\n> **Estado:** **Propuesta**\n', { exigirPropuesta: true }), []);
});

test('estado-propuesta: acepta Propuesto y propuesta', () => {
  assert.deepEqual(verificar('Estado: Propuesto\n', { exigirPropuesta: true }), []);
  assert.deepEqual(verificar('Estado: en propuesta\n', { exigirPropuesta: true }), []);
});

test('estado-propuesta: Estado sin Propuesta en la misma linea falla', () => {
  const h = verificar('Estado: Aprobado\nPropuesta\n', { exigirPropuesta: true });
  assert.deepEqual(reglas(h), ['estado-propuesta']);
});

test('estado-propuesta: solo cuentan las primeras 12 lineas', () => {
  const fuera = `${Array(12).fill('x').join('\n')}\nEstado: Propuesta\n`;
  assert.deepEqual(reglas(verificar(fuera, { exigirPropuesta: true })), ['estado-propuesta']);
  const dentro = `${Array(11).fill('x').join('\n')}\nEstado: Propuesta\n`;
  assert.deepEqual(verificar(dentro, { exigirPropuesta: true }), []);
});

// marcador-prohibido
test('marcador-prohibido: detecta cada marcador con su linea', () => {
  for (const marca of ['TU_URL', 'Lorem Ipsum', 'USD', 'US$', '$20', 'tu_url']) {
    const h = verificar(`ok\nPrecio ${marca} aqui\n`);
    assert.deepEqual(reglas(h), ['marcador-prohibido'], marca);
    assert.equal(h[0].linea, 2, marca);
  }
});

test('marcador-prohibido: $ sin digito y CLP no generan hallazgo', () => {
  assert.deepEqual(verificar('Cuesta $ o 20.000 CLP, o $ 5'), []);
});

test('marcador-prohibido: ignorado en codigo cercado y en linea', () => {
  const texto = '```\nTU_URL USD $20\n```\nCita `US$` y `lorem ipsum`.\n';
  assert.deepEqual(verificar(texto), []);
});

test('marcador-prohibido: no confunde palabras que contienen usd', () => {
  assert.deepEqual(verificar('Texto con ausdito.'), []);
});

// CLI
const correr = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const fx = (...p) => path.join(AQUI, 'fixtures', ...p);

test('CLI: directorio limpio sale con 0 y resumen', () => {
  const r = correr('--exigir-propuesta', fx('limpio'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verificar-docs: 2 archivos, 0 hallazgos/);
});

test('CLI: hallazgos salen con 1 e imprimen ruta:linea: regla: detalle', () => {
  const r = correr(fx('con-hallazgos', 'malo.md'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /malo\.md:3: enlace-roto: /);
  assert.match(r.stdout, /malo\.md:3: marcador-prohibido: /);
  assert.match(r.stdout, /verificar-docs: 1 archivos, 2 hallazgos/);
});

test('CLI: --exigir-propuesta activa la regla de estado', () => {
  const r = correr('--exigir-propuesta', fx('con-hallazgos', 'malo.md'));
  assert.match(r.stdout, /malo\.md:1: estado-propuesta: /);
});

test('CLI: uso invalido sale con 2 y explica por stderr', () => {
  const sinArgs = correr();
  assert.equal(sinArgs.status, 2);
  assert.match(sinArgs.stderr, /uso: verificar-docs/);
  const noExiste = correr(fx('no-existe.md'));
  assert.equal(noExiste.status, 2);
  assert.match(noExiste.stderr, /ruta inexistente/);
  const rara = correr('--rara', fx('limpio'));
  assert.equal(rara.status, 2);
  assert.match(rara.stderr, /opcion desconocida: --rara/);
});

// CLI con arbol temporal
function conArbol(fn) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verificar-docs-')));
  const externo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verificar-docs-ext-')));
  try {
    return fn(dir, externo);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(externo, { recursive: true, force: true });
  }
}
const correrEn = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });

test('CLI: recorre a.md y sub/b.md en orden alfabetico', () => {
  conArbol((dir) => {
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'b.md'), '[x](falta-b.md)\n');
    fs.writeFileSync(path.join(dir, 'a.md'), '[x](falta-a.md)\n');
    const r = correrEn(dir, '.');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const lineas = r.stdout.trim().split('\n');
    assert.match(lineas[0], /a\.md:1: enlace-roto/);
    assert.match(lineas[1], /b\.md:1: enlace-roto/);
    assert.match(lineas[2], /2 archivos, 2 hallazgos/);
  });
});

test('CLI: symlink a directorio externo no se sigue', () => {
  conArbol((dir, externo) => {
    fs.writeFileSync(path.join(externo, 'malo.md'), '[x](falta.md)\n');
    fs.writeFileSync(path.join(dir, 'ok.md'), '# ok\n');
    fs.symlinkSync(externo, path.join(dir, 'enlace'));
    const r = correrEn(dir, '.');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /malo\.md/);
    assert.match(r.stdout, /1 archivos, 0 hallazgos/);
  });
});

test('CLI: archivos .txt se ignoran', () => {
  conArbol((dir) => {
    fs.writeFileSync(path.join(dir, 'ok.md'), '# ok\n');
    fs.writeFileSync(path.join(dir, 'nota.txt'), '[x](falta.md) USD\n');
    const r = correrEn(dir, '.');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 archivos, 0 hallazgos/);
  });
});

test('CLI: invocar solo con archivo no .md sale con 2 y avisa', () => {
  conArbol((dir) => {
    fs.writeFileSync(path.join(dir, 'nota.txt'), 'x\n');
    const r = correrEn(dir, 'nota.txt');
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stderr, /nota\.txt/);
  });
});

test('CLI: directorio vacio sale con 2 y avisa', () => {
  conArbol((dir) => {
    fs.mkdirSync(path.join(dir, 'vacio'));
    const r = correrEn(dir, 'vacio');
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stderr, /vacio/);
  });
});

test('CLI: entrada explicita symlink o fuera del cwd sale con 2 y avisa', () => {
  conArbol((dir, externo) => {
    fs.writeFileSync(path.join(externo, 'e.md'), '# e\n');
    fs.writeFileSync(path.join(dir, 'ok.md'), '# ok\n');
    fs.symlinkSync(path.join(externo, 'e.md'), path.join(dir, 'link.md'));
    const enlace = correrEn(dir, 'ok.md', 'link.md');
    assert.equal(enlace.status, 2, enlace.stdout);
    assert.match(enlace.stderr, /link\.md/);
    const fuera = correrEn(dir, path.join(externo, 'e.md'));
    assert.equal(fuera.status, 2, fuera.stdout);
    assert.match(fuera.stderr, /e\.md/);
  });
});

test('CLI: archivo ilegible informa por stderr y sale con 2', { skip: process.getuid?.() === 0 }, () => {
  conArbol((dir) => {
    const f = path.join(dir, 'a.md');
    fs.writeFileSync(f, '# a\n');
    fs.chmodSync(f, 0o000);
    const r = correrEn(dir, 'a.md');
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stderr, /a\.md/);
    assert.doesNotMatch(r.stderr, /at .*node:/);
  });
});

test('CLI: directorio llamado x.md sin contenido sale con 2 sin traza', () => {
  conArbol((dir) => {
    fs.mkdirSync(path.join(dir, 'x.md'));
    fs.writeFileSync(path.join(dir, 'ok.md'), '# ok\n');
    const r = correrEn(dir, 'ok.md', 'x.md');
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stderr, /x\.md/);
    assert.doesNotMatch(r.stderr, /at .*node:/);
  });
});

test('CLI: ciclos de directorios y entradas duplicadas no repiten archivos', () => {
  conArbol((dir) => {
    fs.writeFileSync(path.join(dir, 'a.md'), '# a\n');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.symlinkSync(dir, path.join(dir, 'sub', 'ciclo'));
    const r = correrEn(dir, '.', 'a.md', '.');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 archivos, 0 hallazgos/);
  });
});

// Cercas, spans y marcadores (casos adicionales)
test('cercas: dentro de cita y de lista sangrada se ignoran', () => {
  const texto = '> ```\n> [a](falta.md)\n> ```\n- item\n    ```\n    [b](falta.md)\n    ```\n';
  assert.deepEqual(verificar(texto, { existe: () => false }), []);
});

test('cercas: cierre exige al menos la longitud de la apertura', () => {
  const texto = '````\n```\n[a](falta.md)\n```\n````\n[b](falta2.md)\n';
  const h = verificar(texto, { existe: () => false });
  assert.deepEqual(h.map((x) => x.linea), [6]);
});

test('spans: doble backtick que contiene un backtick oculta el enlace', () => {
  assert.deepEqual(verificar('Usa ``a ` [x](falta.md)`` asi.', { existe: () => false }), []);
});

test('spans: racha exacta, una racha de 3 sin cierre no se parte en una de 2', () => {
  // La racha de 3 no tiene cierre: es literal. La de 2 abre y cierra en los extremos del enlace.
  assert.deepEqual(verificar('a ```x`` [x](falta.md) ``', { existe: () => false }), []);
});

test('spans: un backtick no cierra con una racha de dos', () => {
  const h = verificar('`a``b [x](falta.md)', { existe: () => false });
  assert.deepEqual(reglas(h), ['enlace-roto']);
});

test('marcador-prohibido: US$20 produce un solo hallazgo', () => {
  assert.equal(verificar('Vale US$20 hoy').length, 1);
});

test('enlace-roto: imagenes se verifican como enlaces', () => {
  const h = verificar('![alt](x.png)', { existe: () => false });
  assert.deepEqual(reglas(h), ['enlace-roto']);
  assert.match(h[0].detalle, /x\.png/);
});
