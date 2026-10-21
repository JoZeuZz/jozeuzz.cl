import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const leer = (ruta: string) => readFile(path.join(raiz, ruta), 'utf8')

it('gate inspecciona mounts, hace A3f duro y ejecuta D12/D21 dentro del límite correcto', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('config --no-interpolate')
  expect(gate).toContain('read_only')
  expect(gate).toContain('A3f (parada dura)')
  expect(gate).not.toContain('A3f (informativo, sin parada)')
  expect(gate).toContain('./poc.sh init-volumes')
  expect(gate).toContain('./poc.sh deps')
  expect(gate).toContain('./poc.sh probe-mounts')
  expect(gate).toContain('find diagnóstico no vinculante')
  expect(gate).not.toContain('test -d node_modules && echo node_modules-ok')
  expect(gate).not.toContain('r A3d ./poc.sh deps')
  expect(gate).toContain('r A3f2 ./poc.sh deps')
  expect(gate).toContain('npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo')
  expect(gate).toContain('./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs')
  expect(gate).toContain('setpriv --reuid=1000 --regid=1000 --clear-groups node --test test/build/comprobar-build.test.mjs')
  // E4: comprobar-build.test.mjs tiene 10 tests.
  expect(gate).toMatch(/D21b[^\n]*# pass 10/)
  expect(gate).not.toMatch(/D21b[^\n]*# pass 9/)
})

it('gate exige puntos de montaje de init y trata EROFS/EACCES de next-env.d.ts como parada dura', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('`./poc.sh init` prepara los puntos de montaje')
  expect(gate).toContain('A3f depende de ello')
  expect(gate).toContain('contenedor/next-env.dev.txt')
  expect(gate).toContain('contenedor/next-env.prod.txt')
  expect(gate).toMatch(/EROFS\/EACCES[^\n]*next-env\.d\.ts[^\n]*parada dura/)
  expect(gate).toContain('prohibido resolverlo abriendo el bind')
  // A2c: volumes-init es el único servicio con network_mode none, security_opt, cap_drop y user 0:0.
  expect(gate).toContain('`volumes-init` es el único servicio con `network_mode: none`, `security_opt`, `cap_drop` y `user: 0:0`')
})

it('gate documenta el riesgo residual de escritura silenciosa y el node_modules del host', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('node_modules/.vite')
  expect(gate).toContain('src/payload-types.ts')
  expect(gate).toContain('importMap')
  expect(gate).toContain('`npm ci` con `node_modules` montado se valida en A3f2')
  expect(gate).toContain('HOME=/tmp')
  expect(gate).toContain('poblado en la era RW')
  expect(gate).toContain('nunca como prerrequisito')
})

it('A4 sólo genera parche y reserva su aplicación al humano', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('./poc.sh manifest-patch-axe > "$S/A4-manifiestos.json"')
  expect(gate).toContain('packageJson')
  expect(gate).toContain('packageLockJson')
  expect(gate).toContain('command -v diff')
  expect(gate).toContain('diff --version')
  expect(gate).toContain('g -C .. apply --check "$S/A4-manifiestos.patch"')
  expect(gate).toContain('aplicación humana revisada')
  expect(gate).not.toContain('./poc.sh deps npm install --ignore-scripts --save-dev --save-exact @axe-core/playwright@4.13.0')
})

it('documentación clasifica host sin Docker, Docker root-equivalente y root real', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('setpriv UID 1000, sin grupo docker')
  expect(gate).toContain('Docker: privilegio equivalente a root')
  expect(gate).toContain('root real: `.env`, `.tls` y salidas')
  for (const id of ['D13', 'D16', 'D17', 'D26', 'D27']) expect(gate).toContain(id)
  expect(gate).toContain('el driver llama `poc.sh exec-en`')
  expect(gate).toContain('Sólo D21b')
  expect(gate).toContain('y D30')
})

it('README y EVIDENCIA usan D21 en app-prod y no recomiendan instalación directa', async () => {
  const [readme, evidencia, build] = await Promise.all([leer('README.md'), leer('EVIDENCIA.md'), leer('test/build/sin-inyeccion.test.mjs')])
  for (const texto of [readme, evidencia, build]) expect(texto).toContain('run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs')
  expect(readme).toContain('manifest-patch-axe')
  expect(readme).not.toContain('./poc.sh deps npm install --save-dev --save-exact @axe-core/playwright@4.13.0')
  expect(readme).toContain('./poc.sh init-volumes')
  expect(readme).toContain('./poc.sh probe-mounts')
  expect(readme).toContain('npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo')
  expect(readme).toContain('setpriv --reuid=1000 --regid=1000 --clear-groups node --test test/build/comprobar-build.test.mjs')
  expect(readme).toContain('# pass 10')
  expect(readme).toContain('migrate-create deshabilitada')
  expect(readme).toContain('contenedor/next-env.dev.txt')
})

const FRASE_HISTORICA_U8_AXE = 'A4 aislado PENDIENTE: manifiestos no generados, parche no aplicado, dependencia no instalada y E2E axe no ejecutado'
const TITULO_ADENDA = '#### Adenda 2026-10-21 · HP-21: estado posterior de A4 (P3-05)'
const AVISO_ADENDA = 'la fila «U8 axe» refleja el estado a la unidad 9 (2026-10-17); ver «Adenda 2026-10-21 · HP-21»'
const FRASE_E2E_PENDIENTE = 'E2E axe: PENDIENTE (sin ejecución registrada)'
const ANCLA_MANIFIESTOS = /Estado actual de los manifiestos: `@axe-core\/playwright` (\d+\.\d+\.\d+) declarado en `package\.json` y `package-lock\.json`/
const FIN_ADENDA = 'Fin de la adenda HP-21.'
const TEMA_E2E = /e2e|axe|U8|D18|D28|intake-axe/i
// Términos de éxito. NO se usan «verde» ni «ejecutad»: la adenda dice legítimamente «su verde no prueba…» y «sin ejecución registrada».
// «pasó»/«aprobó»/«superó» van sin \b final porque la vocal acentuada es no-palabra en JS (no hay frontera tras «ó»); «paso» (sustantivo) no se incluye.
const EXITO = /\bok\b|aprobad|aprobó|aprobaron|passed|\bpass\b|pasaron|pasó|pasan\b|pasa\b|superad[ao]|superó|superaron|[eé]xito|conforme|sin fallos|\d+ de \d+|\d+\/\d+|\brc=0\b/i

// Sha256 del texto fechado e inmutable de la adenda HP-21 (ver `tramosAdenda`). La adenda es un registro fechado: cambiarla exige una unidad
// nueva que actualice estos hashes con revisión (jz-qa y jz-security). Un cambio no revisado rompe el test.
// - HASH_TRAMO_AVISO: desde el final de la línea «Rutas de log relativas…» hasta el inicio de la cabecera de la tabla (sólo el aviso, entre líneas en blanco).
// - HASH_TRAMO_ADENDA: desde el final de la línea de la última fila de la tabla («| U9 latencia y falsos positivos …») hasta el inicio de
//   «Guarda de entorno de la medición» (adenda completa con su título y su marca de fin). Cualquier texto añadido, segunda marca o segundo título en
//   ese tramo cambia el hash.
const HASH_TRAMO_AVISO = '04d2c4e8dcf5bf13e6f2e2fafac70d9431748aa7da0ff72865e9491deb75d9d9'
const HASH_TRAMO_ADENDA = 'b2fdc31a5f40b1ff2bcc1c52f30b157e9e9304c74123ef928c87c52d57f4e022'

const sha256Hex = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex')
const cuenta = (texto: string, fragmento: string) => texto.split(fragmento).length - 1

const tramosAdenda = (evidencia: string): { aviso: string; adenda: string } => {
  const parrafo = evidencia.indexOf('Rutas de log relativas a la raíz del repositorio.')
  const finParrafo = evidencia.indexOf('\n', parrafo)
  const tablaIni = evidencia.indexOf('| Unidad | Comando exacto | Resultado |')
  const ultimaFila = evidencia.indexOf('| U9 latencia y falsos positivos')
  const finFila = evidencia.indexOf('\n', ultimaFila)
  const guarda = evidencia.indexOf('Guarda de entorno de la medición')
  return { aviso: evidencia.slice(finParrafo, tablaIni), adenda: evidencia.slice(finFila, guarda) }
}

// Texto de la adenda: desde su título hasta la marca explícita «Fin de la adenda HP-21.» en su propia línea (no depende de encabezados `#`).
// null si falta el título; `cerrada` false si falta la marca (entonces el texto llega hasta el final del documento).
const seccionAdenda = (evidencia: string): { texto: string; cerrada: boolean } | null => {
  const i = evidencia.indexOf(TITULO_ADENDA)
  if (i < 0) return null
  const resto = evidencia.slice(i + TITULO_ADENDA.length)
  const marca = /\nFin de la adenda HP-21\.(?=\n|$)/.exec(resto)
  return marca === null ? { texto: resto, cerrada: false } : { texto: resto.slice(0, marca.index), cerrada: true }
}

// Afirmaciones de E2E/axe/U8 aprobada o ejecutada con éxito. Una cita de log NO las hace aceptables: `.jz-state/runs/` es zona de agentes,
// que no tienen Docker; las E2E sólo las ejecuta el humano y su log va fuera del repositorio. Un aprobado futuro exige una unidad nueva
// que cambie también este test. Heurística por oración (separada en «.», «;» y saltos de línea; «:» no separa: «E2E axe: 3 passed»).
// LÍMITE RESIDUAL: la heurística no detecta una afirmación partida en dos oraciones donde ninguna reúne tema y éxito (p. ej. «Las tres
// pruebas de la suite nueva. Pasaron.»). Eso NO lo cierra la heurística sino el hash del texto exacto de la adenda (HASH_TRAMO_ADENDA):
// la heurística es defensa adicional (casos sintéticos y `contradiccionesA4`).
const afirmacionesE2EAprobada = (adenda: string): string[] =>
  adenda.split(/(?<=[.;])\s+|\n/).filter((o) => (TEMA_E2E.test(o) && EXITO.test(o)) || /\d+ passed/.test(o))

type Manifiesto = { devDependencies?: Record<string, string>; packages?: Record<string, { version?: string; devDependencies?: Record<string, string> }> }

// Contradicciones entre el estado declarado en EVIDENCIA y los manifiestos reales (función pura; sólo recibe datos).
const contradiccionesA4 = (evidencia: string, pkg: Manifiesto, lock: Manifiesto): string[] => {
  const problemas: string[] = []
  const dep = pkg.devDependencies?.['@axe-core/playwright']
  const seccion = seccionAdenda(evidencia)
  if (seccion === null) {
    if (dep !== undefined) problemas.push('falta la adenda HP-21 aunque package.json ya declara @axe-core/playwright')
    return problemas
  }
  const adenda = seccion.texto
  if (!seccion.cerrada) problemas.push(`la adenda HP-21 no termina con la marca «${FIN_ADENDA}» en su propia línea`)
  const declarada = ANCLA_MANIFIESTOS.exec(adenda)?.[1]
  if (declarada === undefined) problemas.push('la adenda no declara la versión de @axe-core/playwright con la frase de estado de los manifiestos')
  else {
    if (dep !== declarada) problemas.push(`package.json no declara exactamente ${declarada} (declara ${String(dep)})`)
    if (lock.packages?.['']?.devDependencies?.['@axe-core/playwright'] !== declarada) problemas.push(`package-lock.json no tiene packages[""].devDependencies con ${declarada}`)
    if (lock.packages?.['node_modules/@axe-core/playwright']?.version !== declarada) problemas.push(`package-lock.json no tiene node_modules/@axe-core/playwright ${declarada}`)
  }
  const afirmaciones = afirmacionesE2EAprobada(adenda)
  for (const o of afirmaciones) problemas.push(`la adenda afirma E2E axe aprobada: ${o.trim()}`)
  if (afirmaciones.length > 0 && adenda.includes(FRASE_E2E_PENDIENTE)) problemas.push(`contradicción interna: la adenda declara «${FRASE_E2E_PENDIENTE}» y a la vez afirma un aprobado`)
  return problemas
}

it('EVIDENCIA no afirma resultados Docker del aislamiento', async () => {
  const evidencia = await leer('EVIDENCIA.md')
  // HP-21: la fila histórica de la unidad 9 se conserva intacta (una sola vez, dentro de la fila «| U8 axe |»); el estado posterior va en la adenda.
  expect(evidencia.split(FRASE_HISTORICA_U8_AXE).length - 1).toBe(1)
  const filaAxe = evidencia.split('\n').find((l) => l.startsWith('| U8 axe |')) ?? ''
  expect(filaAxe).toContain(FRASE_HISTORICA_U8_AXE)
  expect(evidencia).toContain('`volumes-init`, `deps` y `probe-mounts` siguen sin ejecutarse')
  expect(evidencia).not.toContain('./poc.sh exec-en poc3_intake npx tsc --noEmit\n')
})

it('HP-21: la adenda posterior de A4 existe, va después de la tabla y el aviso antes de ella', async () => {
  const evidencia = await leer('EVIDENCIA.md')
  const tablaIni = evidencia.indexOf('| Unidad | Comando exacto | Resultado |')
  const ultimaFila = evidencia.indexOf('| U9 latencia y falsos positivos')
  const tablaFin = evidencia.indexOf('\n', ultimaFila)
  expect(tablaIni).toBeGreaterThan(-1)
  expect(ultimaFila).toBeGreaterThan(tablaIni)
  const aviso = evidencia.indexOf(AVISO_ADENDA)
  expect(aviso, 'aviso').toBeGreaterThan(-1)
  expect(aviso).toBeLessThan(tablaIni)
  const titulo = evidencia.indexOf(TITULO_ADENDA)
  expect(titulo, 'título de la adenda').toBeGreaterThan(tablaFin)
  const guarda = evidencia.indexOf('Guarda de entorno de la medición')
  expect(titulo).toBeLessThan(guarda)
  // Límite explícito: la marca va en su propia línea, después del título y antes del párrafo histórico «Guarda de entorno…».
  expect(evidencia).toMatch(/\nFin de la adenda HP-21\.\n/)
  const fin = evidencia.indexOf(`\n${FIN_ADENDA}\n`)
  expect(fin, 'marca de fin').toBeGreaterThan(titulo)
  expect(fin).toBeLessThan(guarda)
  const seccion = seccionAdenda(evidencia)
  expect(seccion?.cerrada, 'la adenda está cerrada por su marca').toBe(true)
  const adenda = seccion?.texto ?? ''
  expect(adenda).not.toContain('Guarda de entorno')
  for (const t of ['de692a43dbc2e43b099580e101f8e6f8eb0a1d37', '0faf138', '4.13.0', 'unidad 9', FRASE_E2E_PENDIENTE, 'filas Docker en PENDIENTE', 'no reutilizable',
    'declaró que la ejecución 1', 'deducción de Git', 'Deducido de Git', 'categoría c', 'ningún agente los ha visto',
    'Verificado por lectura de los archivos y por la prueba estática `test/estatico/gate-a4-git.test.ts`',
    'lectura puntual de los `package.json` por un agente, sin log', 'dentro de `include` y fuera de `exclude`'])
    expect(adenda, t).toContain(t)
  expect(adenda).not.toContain('por lectura de Git')
  expect(adenda).toMatch(ANCLA_MANIFIESTOS)
  expect(afirmacionesE2EAprobada(adenda)).toEqual([])
})

it('HP-21: título, marca de fin y frase pendiente aparecen exactamente una vez en todo EVIDENCIA.md', async () => {
  const evidencia = await leer('EVIDENCIA.md')
  for (const fragmento of [TITULO_ADENDA, FIN_ADENDA, FRASE_E2E_PENDIENTE]) expect(cuenta(evidencia, fragmento), fragmento).toBe(1)
})

it('HP-21: el aviso previo a la tabla y el tramo de la adenda son los revisados (sha256 del texto exacto, inmutable)', async () => {
  const { aviso, adenda } = tramosAdenda(await leer('EVIDENCIA.md'))
  // Entre el párrafo «Rutas de log relativas…» y la cabecera de la tabla sólo cabe el aviso.
  expect(aviso.startsWith('\n\nAviso (HP-21): ')).toBe(true)
  expect(aviso.endsWith('\n\n')).toBe(true)
  expect(aviso.trim().split('\n').length).toBe(1)
  expect(sha256Hex(aviso), 'tramo del aviso').toBe(HASH_TRAMO_AVISO)
  // Entre la última fila de la tabla y «Guarda de entorno…» sólo cabe la adenda revisada (título, texto y marca de fin).
  expect(adenda.startsWith(`\n\n${TITULO_ADENDA}\n`)).toBe(true)
  expect(adenda.endsWith(`\n${FIN_ADENDA}\n\n`)).toBe(true)
  expect(sha256Hex(adenda), 'tramo de la adenda').toBe(HASH_TRAMO_ADENDA)
})

it('HP-21: contradiccionesA4 devuelve [] con EVIDENCIA, package.json y package-lock.json reales', async () => {
  const [evidencia, pkg, lock] = await Promise.all([leer('EVIDENCIA.md'), leer('package.json'), leer('package-lock.json')])
  expect(contradiccionesA4(evidencia, JSON.parse(pkg), JSON.parse(lock))).toEqual([])
})

describe('HP-21: contradiccionesA4 con datos sintéticos (en memoria)', () => {
  const pkgOk: Manifiesto = { devDependencies: { '@axe-core/playwright': '4.13.0' } }
  const lockOk: Manifiesto = { packages: { '': { devDependencies: { '@axe-core/playwright': '4.13.0' } }, 'node_modules/@axe-core/playwright': { version: '4.13.0' } } }
  const adendaOk = (extra = '') => `${TITULO_ADENDA}\nEstado actual de los manifiestos: \`@axe-core/playwright\` 4.13.0 declarado en \`package.json\` y \`package-lock.json\`.\n${FRASE_E2E_PENDIENTE}\n${extra}\n${FIN_ADENDA}\n\nGuarda de entorno de la medición, sin Docker.\n`
  const evOk = (extra = '') => `| U8 axe | x | ${FRASE_HISTORICA_U8_AXE} |\n\n${adendaOk(extra)}`

  it('caso positivo: estado coherente no produce problemas', () => {
    expect(contradiccionesA4(evOk(), pkgOk, lockOk)).toEqual([])
  })
  it('(a) detecta versión declarada distinta de package.json o del lock', () => {
    expect(contradiccionesA4(evOk(), { devDependencies: { '@axe-core/playwright': '^4.13.0' } }, lockOk).join('\n')).toContain('package.json no declara exactamente 4.13.0')
    expect(contradiccionesA4(evOk(), { devDependencies: {} }, lockOk).length).toBeGreaterThan(0)
    expect(contradiccionesA4(evOk(), pkgOk, { packages: { 'node_modules/@axe-core/playwright': { version: '4.13.0' } } }).join('\n')).toContain('packages[""].devDependencies')
    expect(contradiccionesA4(evOk(), pkgOk, { packages: { '': { devDependencies: { '@axe-core/playwright': '4.13.0' } } } }).join('\n')).toContain('node_modules/@axe-core/playwright 4.13.0')
    expect(contradiccionesA4(evOk().replaceAll('4.13.0', '4.12.0'), pkgOk, lockOk).length).toBeGreaterThan(0)
  })
  it('(b) detecta la adenda ausente mientras package.json ya declara la dependencia', () => {
    const sinAdenda = `| U8 axe | x | ${FRASE_HISTORICA_U8_AXE} |\n`
    expect(contradiccionesA4(sinAdenda, pkgOk, lockOk).join('\n')).toContain('falta la adenda HP-21')
    expect(contradiccionesA4(sinAdenda, { devDependencies: {} }, { packages: {} })).toEqual([])
  })
  it('(c) detecta toda afirmación de E2E/axe aprobada, con o sin cita de log (un log no la hace aceptable)', () => {
    const afirmaciones = ['E2E axe: 3 passed', 'E2E axe: aprobada', 'E2E axe ok', 'E2E axe ejecutada con éxito', '13 passed', 'E2E con axe aprobada', 'U8 axe: ok',
      'las 3 pruebas de e2e/intake-axe.spec.ts pasaron', 'axe E2E superada', 'E2E axe: 3/3', 'E2E axe rc=0',
      'D18 y D28: 3/3, rc=0', 'E2E axe: pasó', 'E2E axe aprobó', 'E2E axe superó', 'E2E axe: 3 pass', 'E2E axe sin fallos', 'E2E axe: 3 de 3']
    for (const afirmacion of afirmaciones)
      for (const texto of [afirmacion, `${afirmacion} (\`.jz-state/runs/20261021T000000Z-1.log\`)`])
        expect(contradiccionesA4(evOk(texto), pkgOk, lockOk).join('\n'), texto).toContain('la adenda afirma E2E axe aprobada')
  })
  it('(c2) no marca oraciones legítimas: pendiente, «su verde no prueba…», «sin ejecución registrada», negaciones', () => {
    for (const legitima of ['E2E axe: PENDIENTE (sin ejecución registrada).', 'El tsc compila e2e/intake-axe.spec.ts; su verde no prueba integridad de dependencias.',
      'No hay ninguna ejecución registrada de las 3 pruebas de e2e/intake-axe.spec.ts (D18 y D28).'])
      expect(contradiccionesA4(evOk(legitima), pkgOk, lockOk), legitima).toEqual([])
  })
  it('(d) contradicción interna: «E2E axe: PENDIENTE (sin ejecución registrada)» junto a una afirmación de aprobado', () => {
    const r = contradiccionesA4(evOk('Las pruebas de E2E axe pasaron.'), pkgOk, lockOk).join('\n')
    expect(r).toContain('contradicción interna')
    expect(contradiccionesA4(evOk(), pkgOk, lockOk).join('\n')).not.toContain('contradicción interna')
  })
  it('(e) el límite lo marca «Fin de la adenda HP-21.»: un subencabezado dentro de la adenda no la corta y su ausencia es un problema', () => {
    for (const afirmacion of ['U8 axe: ok', 'E2E axe: 3 passed'])
      expect(contradiccionesA4(evOk(`##### Nota\n${afirmacion}`), pkgOk, lockOk).join('\n'), afirmacion).toContain('la adenda afirma E2E axe aprobada')
    const sinMarca = evOk().replace(`\n${FIN_ADENDA}\n`, '\n')
    expect(sinMarca).not.toContain(FIN_ADENDA)
    expect(contradiccionesA4(sinMarca, pkgOk, lockOk).join('\n')).toContain('no termina con la marca')
    // La marca debe ocupar su propia línea.
    expect(contradiccionesA4(evOk().replace(`\n${FIN_ADENDA}\n`, `\nverá ${FIN_ADENDA} aquí\n`), pkgOk, lockOk).join('\n')).toContain('no termina con la marca')
    // Lo que queda tras la marca (párrafos históricos) no pertenece a la adenda.
    expect(contradiccionesA4(`${evOk()}\nSegún el histórico, E2E axe: 3 passed.\n`, pkgOk, lockOk)).toEqual([])
  })
})

// ---- Ciclo de corrección 1 (revisión jz-qa y jz-security) ----

const bloque = (texto: string, desde: string, hasta: string) => {
  const i = texto.indexOf(desde)
  const j = texto.indexOf(hasta, i + desde.length)
  expect(i, desde).toBeGreaterThan(-1)
  expect(j, hasta).toBeGreaterThan(i)
  return texto.slice(i, j)
}

it('toda invocación de vitest en contenedor lleva --configLoader runner (Q-I1)', async () => {
  const [gate, readme, evidencia, diseno] = await Promise.all([
    leer('../docs/GATE-DOCKER-POC-3.md'), leer('README.md'), leer('EVIDENCIA.md'), leer('../docs/POC-3-DISENO.md'),
  ])
  const sinFlag = (texto: string, filtro: (l: string) => boolean = () => true) =>
    texto.split('\n').filter((l) => /(npx vitest|vitest run)/.test(l) && filtro(l) && !l.includes('--configLoader runner'))
  expect(sinFlag(gate)).toEqual([])
  expect(sinFlag(readme)).toEqual([])
  // EVIDENCIA conserva filas históricas de POC-1a (`exec npx vitest run`): sólo se exige en las órdenes `exec-en`.
  expect(sinFlag(evidencia, (l) => l.includes('exec-en'))).toEqual([])
  expect(sinFlag(diseno)).toEqual([])
  expect(gate).toContain('r D11 ./poc.sh exec-en poc3_intake npx vitest run --configLoader runner')
  // El riesgo residual explica .vite-temp y la razón del flag.
  expect(gate).toContain('node_modules/.vite-temp')
  expect(gate).toMatch(/cargador bundle[^\n]*EROFS|EROFS[^\n]*cargador bundle/)
})

it('A3e retira contenedores de la era RW sin Compose, como primer paso tras A0 y antes de A1 (S-I1, I-1R)', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a3e = gate.indexOf('### A3e ·')
  expect(a3e).toBeGreaterThan(-1)
  expect(gate.indexOf('### A0 ·')).toBeLessThan(a3e)
  expect(a3e).toBeLessThan(gate.indexOf('### A1 ·'))
  expect(a3e).toBeLessThan(gate.indexOf('### A2 ·'))
  expect(a3e).toBeLessThan(gate.indexOf('### A3 ·'))
  expect(a3e).toBeLessThan(gate.indexOf('### A4 ·'))
  const seccion = bloque(gate, '### A3e ·', '### A1 ·')
  expect(seccion).toContain('docker ps -a --filter label=com.docker.compose.project=jozeuzz-poc-a')
  // Sin Compose: no interpola ni lee el árbol; conserva volúmenes (sin -v).
  expect(seccion).toContain('docker ps -aq --filter label=com.docker.compose.project=jozeuzz-poc-a | xargs -r docker rm -f')
  expect(seccion).not.toMatch(/docker rm -f[^\n]*\s-v(\s|$)|--volumes/)
  expect(gate).not.toContain('down --remove-orphans')
  expect(gate).not.toContain('A3e.0')
  expect(seccion).not.toMatch(/docker compose/)
  expect(seccion).toContain('A3e-antes.txt')
  expect(seccion).toContain('A3e1.txt')
  expect(seccion).toMatch(/parada dura/i)
  expect(seccion).toMatch(/no tocar contenedores ajenos al proyecto/i)
  expect(seccion).toContain('era RW')
  // El paso previo a A1 no puede depender de $GUARDA (se define en A3).
  expect(seccion).not.toContain('$GUARDA')
  // Clasificación: estas órdenes son Docker root-equivalente.
  const fila = gate.split('\n').find((l) => l.startsWith('| Docker: privilegio equivalente a root')) ?? ''
  expect(fila).toContain('A3e')
  expect(fila).toContain('docker rm')
})

it('el HEAD de código del gate es coherente entre cabecera y A1 y distingue citas de línea (M-1)', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const cabecera = /\*\*HEAD de referencia del código:\*\* `([0-9a-f]{7,40})`/.exec(gate)
  expect(cabecera, 'cabecera').toBeTruthy()
  const ref = cabecera![1]
  const a1 = bloque(gate, '### A1 ·', '### A2 ·')
  expect(a1).toContain(`CODEREF=${ref}`)
  expect(a1).toContain('g diff --name-only "$CODEREF"..HEAD | grep -v \'^docs/\'')
  // Todo rango de A1 usa la variable: no queda ningún hash fijo.
  expect(a1.replace(/"\$CODEREF"\.\.HEAD/g, '')).not.toContain('..HEAD')
  expect(gate).toContain('referencia vinculante de código')
  expect(gate).toContain('citas de línea no actualizadas siguen refiriéndose a `69e1883`')
})

it('A4 usa etiquetas coherentes con g apply, subshell sin exit suelto y se ejecuta tras A3f (M-2, M-3)', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a4 = bloque(gate, '### A4 ·', '### Clasificación de operaciones por privilegio')
  expect(a4).toContain('--label a/poc1a/package.json --label b/poc1a/package.json')
  expect(a4).toContain('--label a/poc1a/package-lock.json --label b/poc1a/package-lock.json')
  expect(a4).toContain('rutas del parche relativas a la raíz del repositorio')
  // M-2 (ciclo 2): --check y aplicación desde la raíz; ningún `g apply` desnudo.
  expect(a4).toContain('g -C .. apply --check "$S/A4-manifiestos.patch"')
  expect(a4).toContain('g -C .. apply "$S/A4-manifiestos.patch"')
  expect(a4.split('\n').filter((l) => /\bg apply\b/.test(l) && !l.trim().startsWith('#'))).toEqual([])
  expect(a4).toMatch(/A4 completo[^\n]*después de B1[^\n]*A3f/)
  // Cada fase de A4 (A4a, A4r, A4p, A4v, A4k) corre en su subshell `(` … `)`: ningún exit queda fuera de ellas.
  const lineas = a4.split('\n')
  let profundidad = 0
  let subshells = 0
  lineas.forEach((l) => {
    if (l === '(') { profundidad++; subshells++ }
    else if (l === ')') { profundidad-- }
    else if (/(^|[\s;&|])exit(\s|$)/.test(l) && !l.trim().startsWith('#')) expect(profundidad, `exit fuera de subshell: ${l}`).toBeGreaterThan(0)
  })
  expect(profundidad).toBe(0)
  expect(subshells).toBeGreaterThanOrEqual(5)
  // A4b0/A4b/A4c van después del commit de A4 y dependen de deps (A3f).
  expect(a4.indexOf('r A4b0')).toBeGreaterThan(a4.indexOf('commit --no-verify --no-gpg-sign'))
})

it('D12 no sigue enlaces ni FIFOs al listar .tsbuildinfo (M-5)', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const finds = gate.split('\n').filter((l) => l.startsWith("find . -name '*.tsbuildinfo'"))
  expect(finds.length).toBe(2)
  for (const l of finds) expect(l).toContain('-type f')
})

it('M-7 y M-8: texto de root y de Compose sin daemon', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('único servicio root con acceso a volúmenes de aplicación')
  expect(gate).toContain('`db` y `proxy` son root de imagen sin bind RW')
  expect(gate).not.toContain('El único servicio que corre como root es `volumes-init`')
  const fila = gate.split('\n').find((l) => l.startsWith('| Compose sin daemon')) ?? ''
  expect(fila).toContain('root humano')
  expect(fila).toContain('.env')
  expect(fila).toContain('B1v')
  expect(fila).toContain('no exige variables')
})

it('M-9: el verde estático no prueba la integridad de node_modules del host', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('su verde no prueba integridad de dependencias')
  expect(gate).toContain('regenerar el `node_modules` del host desde el lockfile con `--ignore-scripts`')
})

it('Q-M4: destroy borra los once volúmenes y obliga a repetir el bootstrap', async () => {
  const [gate, readme] = await Promise.all([leer('../docs/GATE-DOCKER-POC-3.md'), leer('README.md')])
  for (const texto of [gate, readme]) {
    expect(texto).toMatch(/destroy[^\n]*once volúmenes/)
    expect(texto).toMatch(/init-volumes[^\n]*deps[^\n]*probe-mounts/)
  }
})

it('Q-M6: la documentación no contradice el modelo RO (diseño, README, EVIDENCIA)', async () => {
  const [diseno, readme, evidencia] = await Promise.all([leer('../docs/POC-3-DISENO.md'), leer('README.md'), leer('EVIDENCIA.md')])
  expect(diseno).not.toContain('./poc.sh deps npm install')
  expect(diseno).not.toContain('jz-run node --test poc1a/test/build/')
  expect(diseno).toContain('./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs')
  expect(diseno).toContain('manifest-patch-axe')
  const ancla = 'Comandos Docker pendientes de ejecución humana, desde `poc1a/`:\n'
  const i = readme.indexOf(ancla)
  expect(i).toBeGreaterThan(-1)
  const trozo = readme.slice(i, readme.indexOf('./poc.sh up-en poc3_intake', i))
  let previo = -1
  for (const orden of ['./poc.sh init\n', './poc.sh init-volumes\n', './poc.sh deps\n', './poc.sh probe-mounts\n']) {
    const k = trozo.indexOf(orden)
    expect(k, orden).toBeGreaterThan(previo)
    previo = k
  }
  const fila = evidencia.split('\n').find((l) => l.startsWith('| U5/U5a proxy')) ?? ''
  expect(fila).toMatch(/init.*init-volumes.*deps.*probe-mounts.*up-en poc3_intake/)
})

it('S-M10: A2 registra versiones y exige runc >= 1.1.12; README escribe en $S', async () => {
  const [gate, readme] = await Promise.all([leer('../docs/GATE-DOCKER-POC-3.md'), leer('README.md')])
  const a2 = bloque(gate, '### A2 ·', '### A3 ·')
  expect(a2).toContain('docker version')
  expect(a2).toContain('runc --version')
  expect(a2).toContain('CVE-2024-21626')
  expect(a2).toContain('1.1.12')
  expect(a2).toMatch(/runc[^\n]*inferior[^\n]*parada dura|parada dura[^\n]*runc/i)
  // Ciclo 2: formato validado y mínimo por rama.
  expect(a2).toContain("printf %s \"$RUNC\" | grep -Eq '^[0-9]+\\.[0-9]+\\.[0-9]+$'")
  for (const v of ['1.2.8', '1.3.3', '1.4.0', 'CVE-2025-31133', 'CVE-2025-52565', 'CVE-2025-52881']) expect(a2, v).toContain(v)
  expect(a2).toMatch(/retroportes[^\n]*decisión humana/i)
  expect(readme).toContain('> "$S/A4-manifiestos.json"')
  expect(readme).not.toContain('/root/jz-gate-poc3/A4-manifiestos.json')
})

// ---- Ciclo de corrección 2 (re-revisión jz-security) ----

const RW_INSPECT = "docker ps -aq | xargs -r docker inspect --format '{{.Name}}{{range .Mounts}}{{if .RW}} {{.Source}}{{end}}{{end}}'"

it('M-a: A3e.2 y K1 listan todos los montajes RW y paran si alguno toca raíz, /home o el worktree', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a3e = bloque(gate, '### A3e ·', '### A1 ·')
  const k1 = bloque(gate, '# K1 ·', '# K2 ·')
  for (const t of [a3e, k1]) {
    expect(t).toContain(RW_INSPECT)
    expect(t).toContain('awk ')
    for (const ruta of ['"/"', '"/home"', '"/home/proyectos"', '"/home/proyectos/jozeuzz"', '/home/proyectos/jozeuzz-poc-candidata-a', '/home/proyectos/jozeuzz/.git']) expect(t, ruta).toContain(ruta)
    expect(t).not.toContain("grep ':true'")
  }
  expect(a3e).toContain('A3e2-montajes-rw.txt')
  expect(a3e).toMatch(/enlaces[^\n]*rutas alternativas[^\n]*revisión humana/i)
  expect(a3e).toMatch(/otros daemons/i)
})

it('K1: cualquier salida de g status --short es parada dura y la guarda falla cerrada (I-1R, ciclo 2)', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const k1 = bloque(gate, '# K1 ·', '# K2 ·')
  expect(k1).toContain('g status --short')
  expect(gate).not.toContain('Si `g status --short` muestra otros cambios, se registran')
  expect(gate).not.toContain('registrar lo que aparezca')
  expect(gate).toMatch(/K1:[^\n]*g status --short[^\n]*cualquier[^\n]*parada dura/)
  expect(k1).toContain('GIT FALLÓ')
})

it('M-3: A4 corre con set -eu en cada subshell, no reutiliza A4-package.json y no aplica sin a4a_rc/a4r_rc = 0 y hash aprobado', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a4 = bloque(gate, '### A4 ·', '### Clasificación de operaciones por privilegio')
  const lineas = a4.split('\n')
  lineas.forEach((l, i) => { if (l === '(') expect(lineas[i + 1], `subshell sin set -eu en la línea ${i}`).toBe('set -eu') })
  expect(a4).toContain('A4-package.json de un intento anterior')
  expect(a4).toContain('|| diff_rc=$?')
  expect(a4).toContain('|| rc=$?')
  expect(a4).toContain('test "$a4a_rc" -eq 0 || echo "A4a FALLÓ: parada dura, no continuar" >&2')
  // La aplicación (A4p) exige a4a_rc y a4r_rc en 0 dentro de su subshell, el hash aprobado y --check antes de apply.
  const a4p = bloque(a4, '# A4p ·', '```')
  expect(a4p).toContain('test "$a4a_rc" -eq 0')
  expect(a4p).toContain('test "$a4r_rc" -eq 0')
  expect(a4p.indexOf('g -C .. apply --check "$S/A4-manifiestos.patch"')).toBeLessThan(a4p.indexOf('g -C .. apply "$S/A4-manifiestos.patch"'))
  // La comprobación de a4a_rc va antes de cualquier aplicación.
  expect(a4.indexOf('test "$a4a_rc" -eq 0 ||')).toBeLessThan(a4.indexOf('g -C .. apply "$S'))
})

it('M-2: la justificación de las etiquetas cita la prueba con diff tradicional y el comportamiento real de git apply', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a4 = bloque(gate, '### A4 ·', '### Clasificación de operaciones por privilegio')
  expect(a4).toContain('diff -u --label a/sub/f --label b/sub/f')
  expect(a4).toContain('sólo aplica archivos bajo el directorio actual')
  expect(a4).not.toContain('Por eso `a/poc1a/…` es correcto desde `poc1a/` y desde la raíz')
})

it('guarda: git status que falla es parada (no falla abierta) en r() y en A4', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const lineas = gate.split('\n').filter((l) => l.includes('alterado="$(g status'))
  expect(lineas.length).toBeGreaterThanOrEqual(2)
  for (const l of lineas) {
    expect(l).toContain('|| {')
    expect(l).toContain('GIT FALLÓ')
  }
  const r = bloque(gate, 'r() {', 'tls_ok()')
  expect(r).toMatch(/GIT FALLÓ[^\n]*return/)
})

it('A0 incluye filter\\. en la búsqueda de nombres de configuración Git peligrosa (sin imprimir valores)', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a0 = bloque(gate, '### A0 ·', '### A3e ·')
  expect(a0).toMatch(/grep -iE '[^']*fsmonitor\|hookspath\|[^']*filter\\\.[^']*' "\$S\/A0-git-config-nombres\.txt"/)
  expect(a0).toContain('--name-only')
  expect(a0).not.toContain('git config --show-origin -l | grep')
})

it('poc.sh init: el comentario no promete más que O_EXCL y depende de A3e', async () => {
  const pocsh = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  expect(pocsh).toContain('un enlace a un archivo no regular creado a la vez se detecta después con -L')
  expect(pocsh).toContain('depende de que A3e haya retirado los escritores concurrentes')
  expect(pocsh).not.toContain('incluido un enlace colgante creado tras la comprobación -L.')
})
