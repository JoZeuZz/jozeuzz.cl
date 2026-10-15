// Mide el JS público (gzip) de una página: descarga el HTML, extrae <script src> y precarga de scripts
// (<link rel=preload as=script>), descarga cada uno y suma zlib.gzipSync. Sin dependencias.
// Uso: node scripts/medir-js.mjs <url> [<url>...]
import { gzipSync } from 'node:zlib';

async function bytes(url) {
  const res = await fetch(url, { headers: { connection: 'close' } });
  return Buffer.from(await res.arrayBuffer());
}

export async function medir(url) {
  const base = new URL(url);
  const html = (await bytes(url)).toString('utf8');
  const rutas = new Set();
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) rutas.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="preload"[^>]+as="script"[^>]+href="([^"]+)"/g)) rutas.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+\.js[^"]*)"[^>]+as="script"/g)) rutas.add(m[1]);
  let crudo = 0;
  let gzip = 0;
  const archivos = [];
  for (const r of rutas) {
    const b = await bytes(new URL(r, base));
    crudo += b.length;
    const g = gzipSync(b).length;
    gzip += g;
    archivos.push({ ruta: r, crudo: b.length, gzip: g });
  }
  return { url, scripts: archivos.length, crudoKB: +(crudo / 1024).toFixed(1), gzipKB: +(gzip / 1024).toFixed(1), archivos };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    console.error('uso: node scripts/medir-js.mjs <url>...');
    process.exit(2);
  }
  for (const u of urls) {
    const r = await medir(u);
    console.log(JSON.stringify({ url: r.url, scripts: r.scripts, crudoKB: r.crudoKB, gzipKB: r.gzipKB }));
  }
}
