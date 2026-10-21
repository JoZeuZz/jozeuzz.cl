import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  parsearColor,
  luminanciaRelativa,
  razonContraste,
  cumple,
} from './contraste.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(aqui, 'contraste.mjs');
const fx = (n) => path.join(aqui, 'fixtures', n);
const cerca = (a, b, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} no está a ±${tol} de ${b}`);
const cli = (...args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('parsearColor expande #rgb y es insensible a mayúsculas', () => {
  assert.deepEqual(parsearColor('#abc'), parsearColor('#aabbcc'));
  assert.deepEqual(parsearColor('#AABBCC'), { r: 170, g: 187, b: 204 });
});

test('parsearColor rechaza formatos no admitidos con error claro', () => {
  for (const malo of ['#abcd', 'rgb(0,0,0)', '#ggg', '#aabbccdd', 'red', '', 'abc']) {
    assert.throws(() => parsearColor(malo), /color/i, malo);
  }
  assert.throws(() => parsearColor(42), /color/i);
});

test('luminancia: negro 0 y blanco 1', () => {
  assert.equal(luminanciaRelativa(parsearColor('#000')), 0);
  cerca(luminanciaRelativa(parsearColor('#fff')), 1, 1e-12);
});

test('razón negro/blanco = 21 y blanco/blanco = 1', () => {
  cerca(razonContraste(parsearColor('#000'), parsearColor('#fff')), 21, 1e-9);
  cerca(razonContraste(parsearColor('#fff'), parsearColor('#fff')), 1, 1e-12);
});

test('#777777 sobre blanco ≈ 4.48: no cumple texto, sí texto-grande', () => {
  const r = razonContraste(parsearColor('#777777'), parsearColor('#ffffff'));
  cerca(r, 4.48);
  assert.equal(cumple(r, 'texto'), false);
  assert.equal(cumple(r, 'texto-grande'), true);
});

test('#767676 sobre blanco ≈ 4.54: cumple texto', () => {
  const r = razonContraste(parsearColor('#767676'), parsearColor('#ffffff'));
  cerca(r, 4.54);
  assert.equal(cumple(r, 'texto'), true);
});

test('la razón es simétrica', () => {
  const a = parsearColor('#0b5cad');
  const b = parsearColor('#f2e9d8');
  assert.equal(razonContraste(a, b), razonContraste(b, a));
});

test('cumple: umbrales por nivel', () => {
  const umbrales = {
    texto: 4.5,
    'texto-grande': 3,
    ui: 3,
    'texto-aaa': 7,
    'texto-grande-aaa': 4.5,
  };
  for (const [nivel, u] of Object.entries(umbrales)) {
    assert.equal(cumple(u, nivel), true, `${nivel} en ${u}`);
    assert.equal(cumple(u - 0.0001, nivel), false, `${nivel} bajo ${u}`);
  }
  assert.throws(() => cumple(5, 'enorme'), /nivel/i);
});

test('frontera: 4.4999 no cumple 4.5 aunque se muestre redondeado a 4.50', () => {
  assert.equal(cumple(4.499999, 'texto'), false);
  const r = razonContraste(parsearColor('#797951'), parsearColor('#ffffff'));
  assert.ok(r < 4.5 && r >= 4.4999, String(r));
  assert.equal(r.toFixed(2), '4.50');
  assert.equal(cumple(r, 'texto'), false);
});

test('CLI: fixture correcto sale 0 con formato y resumen', () => {
  const p = cli(fx('ok.json'));
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /ok\.json: tinta\/papel razón=\d+\.\d{2} nivel=texto OK cuerpo de texto/);
  assert.match(p.stdout, /contraste: 2 pares, 0 fallos/);
  assert.equal(p.stderr, '');
});

test('CLI: fixture con fallo sale 1 y lo marca', () => {
  const p = cli(fx('falla.json'));
  assert.equal(p.status, 1, p.stderr);
  assert.match(p.stdout, /gris\/papel razón=4\.48 nivel=texto FALLA texto secundario/);
  assert.match(p.stdout, /gris\/papel razón=4\.48 nivel=texto-grande OK titular/);
  assert.match(p.stdout, /contraste: 2 pares, 1 fallos/);
});

test('CLI: la decisión usa la razón sin redondear (4.50 mostrado, FALLA)', () => {
  const p = cli(fx('frontera.json'));
  assert.equal(p.status, 1);
  assert.match(p.stdout, /razón=4\.50 nivel=texto FALLA/);
});

test('CLI: varios archivos suman en el resumen; un fallo basta para exit 1', () => {
  const p = cli(fx('ok.json'), fx('falla.json'));
  assert.equal(p.status, 1);
  assert.match(p.stdout, /contraste: 4 pares, 1 fallos/);
});

test('CLI: token inexistente sale 2 con mensaje en stderr', () => {
  const p = cli(fx('token-inexistente.json'));
  assert.equal(p.status, 2);
  assert.match(p.stderr, /fantasma/);
  assert.equal(p.stdout, '');
});

test('CLI: nivel inválido sale 2 con mensaje en stderr', () => {
  const p = cli(fx('nivel-invalido.json'));
  assert.equal(p.status, 2);
  assert.match(p.stderr, /nivel.*enorme|enorme.*nivel/i);
});

test('CLI: color inválido sale 2 con mensaje en stderr', () => {
  const p = cli(fx('color-invalido.json'));
  assert.equal(p.status, 2);
  assert.match(p.stderr, /#abcd/);
});

test('CLI: sin argumentos o archivo inexistente sale 2 con uso/mensaje', () => {
  const sin = cli();
  assert.equal(sin.status, 2);
  assert.match(sin.stderr, /uso/i);
  const falta = cli(fx('no-existe.json'));
  assert.equal(falta.status, 2);
  assert.match(falta.stderr, /no-existe\.json/);
});

test('luminancia: coeficientes de rojo, verde y azul puros', () => {
  cerca(luminanciaRelativa(parsearColor('#ff0000')), 0.2126);
  cerca(luminanciaRelativa(parsearColor('#00ff00')), 0.7152);
  cerca(luminanciaRelativa(parsearColor('#0000ff')), 0.0722);
});

test('razón de primarios puros sobre blanco discrimina canales', () => {
  const blanco = parsearColor('#ffffff');
  cerca(razonContraste(parsearColor('#ff0000'), blanco), 3.998);
  cerca(razonContraste(parsearColor('#00ff00'), blanco), 1.372);
  cerca(razonContraste(parsearColor('#0000ff'), blanco), 8.592);
});

test('rama lineal del sRGB: #0a0a0a sobre blanco ≈ 19.80', () => {
  cerca(razonContraste(parsearColor('#0a0a0a'), parsearColor('#ffffff')), 19.8);
});

for (const [fixture, patron] of [
  ['json-invalido.json', /json/i],
  ['raiz-array.json', /objeto/],
  ['sin-colores.json', /colores/],
  ['sin-pares.json', /pares/],
  ['par-no-objeto.json', /pares\[0\].*objeto/],
  ['pares-vacio.json', /pares.*(vac|ning)/i],
]) {
  test(`CLI: ${fixture} sale 2, stdout vacío y stderr nombra el archivo`, () => {
    const p = cli(fx(fixture));
    assert.equal(p.status, 2, p.stderr);
    assert.equal(p.stdout, '');
    assert.ok(p.stderr.includes(fixture), p.stderr);
    assert.match(p.stderr, patron);
  });
}

test('CLI: con varios archivos, uno inválido da exit 2 sin salida parcial', () => {
  const p = cli(fx('ok.json'), fx('sin-pares.json'));
  assert.equal(p.status, 2);
  assert.equal(p.stdout, '');
  assert.ok(p.stderr.includes('sin-pares.json'));
});

test('CLI: la línea de resumen por archivo incluye el nombre si existe', () => {
  const p = cli(fx('ok.json'));
  assert.match(p.stdout, /^ok\.json \(paleta-ok\): 2 pares, 0 fallos$/m);
});
