// Cuenta las dependencias instaladas (todas las transitivas) y agrupa licencias leyendo node_modules/*/package.json.
// Sin dependencias; se ejecuta con el Node del host: node scripts/licencias.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', 'node_modules');
const lic = new Map();
let total = 0;
function paquete(dir) {
  const f = path.join(dir, 'package.json');
  if (!existsSync(f)) return;
  const p = JSON.parse(readFileSync(f, 'utf8'));
  if (!p.name) return;
  total++;
  const l = typeof p.license === 'string' ? p.license : p.license?.type ?? (p.licenses ? p.licenses.map((x) => x.type).join(' OR ') : 'SIN-LICENCIA');
  lic.set(l, (lic.get(l) ?? 0) + 1);
}
function recorrer(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    if (e.name === '.bin' || e.name === '.cache' || e.name.startsWith('.')) continue;
    const d = path.join(dir, e.name);
    if (e.name.startsWith('@')) { recorrer(d); continue; }
    paquete(d);
    const anidado = path.join(d, 'node_modules');
    if (existsSync(anidado)) recorrer(anidado);
  }
}
recorrer(raiz);
const pkg = JSON.parse(readFileSync(path.join(raiz, '..', 'package.json'), 'utf8'));
console.log(JSON.stringify({ directas: Object.keys(pkg.dependencies).length, directasDev: Object.keys(pkg.devDependencies).length, instaladasTotal: total, licencias: Object.fromEntries([...lic].sort((a, b) => b[1] - a[1])) }, null, 1));
