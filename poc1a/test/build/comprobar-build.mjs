// Lógica de la comprobación del build de producción (POC-3 U7, T-05 iv, NV-11). No es una prueba: la usan
// `sin-inyeccion.test.mjs` (build real) y `comprobar-build.test.mjs` (árbol ficticio).
//
// Garantías: (1) el build existe y es posterior a las fuentes de intake (si no, estaría obsoleto y la ausencia de
// marcadores no probaría nada); (2) ningún `.js` de `.next-prod/server` contiene los valores de `x-poc-fallo` exclusivos de
// `fallos.ts`; los `.map` se ignoran porque `sourcesContent` incluye el código fuente original; (3) controles positivos:
// el build contiene literales propios de `log.ts` y del manejador, y, si Next emitió mapas de servidor, alguno lista
// `src/lib/intake/fallos.ts` en `sources` (el módulo entró en el bundle y su ausencia en los `.js` es por eliminación).
// Si Next no emite mapas de servidor en producción, (3) se apoya sólo en (1) y en los literales positivos.
import fs from 'node:fs'
import path from 'node:path'

export const MARCADORES = ['intake-pg-check', 'intake-pg-tipo', 'intake-fuera', 'intake-log-crudo']
export const POSITIVOS = [
  { literal: 'mensaje omitido', origen: 'log.ts' },
  { literal: 'campos_no_permitidos', origen: 'manejador.ts' },
]
const FUENTES = ['fallos', 'log', 'manejador'].map((nombre) => `src/lib/intake/${nombre}.ts`)

function archivos(directorio) {
  return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name)
    return entrada.isDirectory() ? archivos(ruta) : [ruta]
  })
}

function listaSources(ruta) {
  try {
    const sources = JSON.parse(fs.readFileSync(ruta, 'utf8')).sources
    return Array.isArray(sources) ? sources.filter((s) => typeof s === 'string') : []
  } catch { return [] }
}

/** Problemas del build en `<raizApp>/.next-prod`; lista vacía si es correcto. */
export function comprobarBuild(raizApp) {
  const servidor = path.join(raizApp, '.next-prod/server')
  if (!fs.existsSync(servidor)) return [`falta ${servidor}: ejecuta ./poc.sh build-en poc3_intake antes`]
  const problemas = []

  const buildId = path.join(raizApp, '.next-prod/BUILD_ID')
  if (!fs.existsSync(buildId)) problemas.push('falta .next-prod/BUILD_ID: el build está incompleto')
  else {
    const construido = fs.statSync(buildId).mtimeMs
    for (const fuente of FUENTES) {
      const ruta = path.join(raizApp, fuente)
      if (fs.existsSync(ruta) && fs.statSync(ruta).mtimeMs > construido) problemas.push(`build obsoleto: ${fuente} es posterior a .next-prod/BUILD_ID; repite ./poc.sh build-en poc3_intake`)
    }
  }

  const todos = archivos(servidor)
  const js = todos.filter((ruta) => ruta.endsWith('.js'))
  const mapas = todos.filter((ruta) => ruta.endsWith('.js.map'))
  const contenidos = js.map((ruta) => ({ ruta, texto: fs.readFileSync(ruta, 'latin1') }))
  if (contenidos.length === 0) problemas.push('.next-prod/server no contiene archivos .js')

  for (const { ruta, texto } of contenidos) {
    for (const marcador of MARCADORES) if (texto.includes(marcador)) problemas.push(`marcador ${marcador} en ${path.relative(servidor, ruta)}`)
  }
  for (const { literal, origen } of POSITIVOS) {
    if (!contenidos.some(({ texto }) => texto.includes(literal))) problemas.push(`control positivo: ningún .js contiene «${literal}» (${origen}); el build no es de este código`)
  }
  if (mapas.length > 0 && !mapas.some((mapa) => listaSources(mapa).some((fuente) => fuente.endsWith('src/lib/intake/fallos.ts')))) {
    problemas.push('control positivo: ningún .js.map lista src/lib/intake/fallos.ts en sources; no se demuestra que el módulo entrara en el bundle')
  }
  return problemas
}
