import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILES = [
  ...readdirSync(join(ROOT, 'src')).filter((name) => name.endsWith('.js')).map((name) => join('src', name)),
  join('bin', 'jz-ai.js'),
];
const source = (file) => readFileSync(join(ROOT, file), 'utf8');
const importsOf = (text) => [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
const FORBIDDEN = ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dns', 'node:dgram', 'node:vm', 'node:worker_threads', 'node:inspector', 'node:module'];

test('sin módulos de red ni evaluación', () => {
  for (const file of FILES) for (const spec of importsOf(source(file))) assert.ok(!FORBIDDEN.includes(spec), `${file} importa ${spec}`);
});

test('child_process sólo en exec.js y node:fs sólo en fs-read.js', () => {
  for (const file of FILES) {
    const specs = importsOf(source(file));
    if (specs.some((s) => s === 'node:child_process' || s === 'child_process')) assert.equal(file, join('src', 'exec.js'));
    if (specs.some((s) => s === 'node:fs' || s === 'node:fs/promises' || s === 'fs')) assert.equal(file, join('src', 'fs-read.js'));
  }
});

test('sin eval, new Function, import dinámico ni require', () => {
  for (const file of FILES) assert.doesNotMatch(source(file), /\beval\s*\(|new\s+Function\b|\bimport\s*\(|\brequire\s*\(|\bcreateRequire\b|process\.binding/, file);
});

test('sin APIs de red globales', () => {
  for (const file of FILES) assert.doesNotMatch(source(file), /\bfetch\s*\(|\bWebSocket\b|\bEventSource\b|\bXMLHttpRequest\b/, file);
});

test('fs-read.js no contiene APIs de escritura y abre sólo con READ_FLAGS', () => {
  const text = source(join('src', 'fs-read.js'));
  assert.doesNotMatch(text, /\b(writeFile|appendFile|mkdir|rmdir|rm|unlink|rename|copyFile|cp|symlink|link|chmod|chown|utimes|truncate|write|createWriteStream)\s*\(/);
  const opens = text.match(/\bopen\s*\(/g) ?? [];
  const readOnlyOpens = text.match(/\bopen\(\s*path\s*,\s*READ_FLAGS\s*\)/g) ?? [];
  assert.equal(opens.length, readOnlyOpens.length);
});
