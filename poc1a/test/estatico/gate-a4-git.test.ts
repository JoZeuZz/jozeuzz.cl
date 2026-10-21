import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// I-1 (ejecución de programas por Git como root) e I-2 (A4 en fases con aprobación por hash) del gate de POC-3.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const leer = (ruta: string) => readFile(path.join(raiz, ruta), 'utf8')
const RUTA_GATE = '../docs/GATE-DOCKER-POC-3.md'
const COMMIT_A4 = 'chore(poc-3): add @axe-core/playwright 4.13.0 (P3-05)' // mensaje literal del commit de A4k

const bloque = (texto: string, desde: string, hasta: string) => {
  const i = texto.indexOf(desde)
  const j = texto.indexOf(hasta, i + desde.length)
  expect(i, desde).toBeGreaterThan(-1)
  expect(j, hasta).toBeGreaterThan(i)
  return texto.slice(i, j)
}
const bloquesSh = (texto: string) => [...texto.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1])
const comentario = (l: string) => l.trim().startsWith('#')

const tmpRaiz = mkdtempSync(path.join(os.tmpdir(), 'gate-a4-git-'))
afterAll(() => rmSync(tmpRaiz, { recursive: true, force: true }))

// ---------------------------------------------------------------------------------------------
// Estado de partida (pre-A4) fijado como fixture y huellas de los archivos reales (sólo lectura)
// ---------------------------------------------------------------------------------------------

// Procedencia del fixture: `git show 0faf138:poc1a/tsconfig.json` (0faf138 es el padre de de692a4, el commit de A4), blob Git
// 8d0831bd131e2da1581c6f54c20cb04269947c33. Extensión .txt deliberada: un tsconfig*.json bajo test/ podría ser descubierto por
// vite-tsconfig-paths o tsc y alterar la resolución. Los archivos reales (package.json, package-lock.json, tsconfig.json) ya son
// post-A4 y NUNCA se usan como estado de partida de A4 ni se escriben desde las pruebas (en D11 /app es de sólo lectura).
const RUTA_FIXTURE_PRE_A4 = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tsconfig-pre-a4.json.txt')
const BLOB_PRE_A4 = '8d0831bd131e2da1581c6f54c20cb04269947c33' // 0faf138:poc1a/tsconfig.json
const BLOB_POST_A4 = '441ecc3e7976c60bf541d2a64f7e8e49acfc3c85' // de692a4:poc1a/tsconfig.json
const blobGit = (contenido: Buffer) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${contenido.length}\0`), contenido])).digest('hex')
const sha256 = (contenido: Buffer) => createHash('sha256').update(contenido).digest('hex')
const ARCHIVOS_REALES = ['package.json', 'package-lock.json', 'tsconfig.json']
const huellasRealesAlCargar = Object.fromEntries(ARCHIVOS_REALES.map((f) => [f, sha256(readFileSync(path.join(raiz, f)))]))

/** `viejo` y `nuevo` de A4a, tomados literalmente del gate (una sola fuente de verdad). */
function sustitucionDeA4a(gate: string) {
  const a4a = bloquesSh(bloque(gate, '### A4 ·', '### Clasificación de operaciones por privilegio')).find((b) => b.includes('# A4a ·'))!
  const literal = (nombre: string) => {
    const m = new RegExp(`^const ${nombre} = '((?:[^'\\\\]|\\\\.)*)'$`, 'm').exec(a4a)
    expect(m, `const ${nombre} en A4a`).toBeTruthy()
    expect(m![1].replace(/\\n/g, ''), `${nombre}: sólo se admite \\n como escape`).not.toContain('\\')
    return m![1].replace(/\\n/g, '\n')
  }
  return { viejo: literal('viejo'), nuevo: literal('nuevo') }
}

// ---------------------------------------------------------------------------------------------
// a. Sintaxis de todos los bloques sh
// ---------------------------------------------------------------------------------------------

it('todos los bloques sh del gate pasan bash -n (marcadores =<…> sustituidos)', async () => {
  const gate = await leer(RUTA_GATE)
  const bloques = bloquesSh(gate)
  expect(bloques.length).toBeGreaterThan(30)
  const fallos: string[] = []
  bloques.forEach((b, i) => {
    const limpio = b.replace(/=<[^>\n]*>/g, '=ficticio')
    const r = spawnSync('bash', ['-n'], { input: limpio, encoding: 'utf8' })
    if (r.status !== 0) fallos.push(`bloque ${i} (${b.split('\n').find((l) => l.trim()) ?? ''}): ${r.stderr}`)
  })
  expect(fallos).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// b. Prueba decisiva I-1: la función g de A0 neutraliza los ejecutores de Git
// ---------------------------------------------------------------------------------------------

type Caso = 'openpgp' | 'hooks-por-defecto' | 'ssh' | 'x509' | 'atributos-globales' | 'fsmonitor'

async function extraerDeA0() {
  const gate = await leer(RUTA_GATE)
  const a0 = bloque(gate, '### A0 ·', '### A3e ·')
  const def = /^g\(\) \{.*\}$/m.exec(a0)
  expect(def, 'definición de g en A0').toBeTruthy()
  const verif = /^g_efectiva\(\) \{[\s\S]*?g_efectiva && echo g-efectiva-ok[^\n]*$/m.exec(a0)
  expect(verif, 'verificación de la configuración efectiva en A0').toBeTruthy()
  const atributos = /^atributos_limpios\(\) \{[\s\S]*?^}/m.exec(a0)
  expect(atributos, 'validador de atributos en A0').toBeTruthy()
  return { definicion: def![0], verificacion: verif![0], validadores: `${verif![0].slice(0, verif![0].lastIndexOf('g_efectiva &&'))}\n${atributos![0]}` }
}

function entornoBase(home: string) {
  return { NODE_ENV: 'test' as const, PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' }
}

function sh(script: string, cwd: string, home: string) {
  return spawnSync('bash', ['-c', script], { cwd, env: entornoBase(home), encoding: 'utf8' })
}

/** Crea un repositorio con un commit inicial limpio y después instala las trampas del caso. */
let contador = 0
function repositorioConTrampas(caso: Caso) {
  const dir = path.join(tmpRaiz, `${caso}-${++contador}`)
  const repo = path.join(dir, 'repo')
  const home = path.join(dir, 'home')
  const marcas = path.join(dir, 'marcas')
  mkdirSync(repo, { recursive: true })
  mkdirSync(home, { recursive: true })
  const trampa = (nombre: string, cuerpo = 'exit 0') => {
    const ruta = path.join(dir, `trampa-${nombre}`)
    writeFileSync(ruta, `#!/bin/sh\necho "${nombre}" >> "${marcas}"\n${cuerpo}\n`)
    chmodSync(ruta, 0o755)
    return ruta
  }
  const g0 = (args: string) => {
    const r = sh(`git ${args}`, repo, home)
    expect(r.status, `git ${args}: ${r.stderr}`).toBe(0)
  }
  g0('init -q')
  g0('config user.email prueba@example.invalid')
  g0('config user.name Prueba')
  writeFileSync(path.join(repo, 'f'), 'uno\n')
  g0('add f')
  g0('commit -q -m inicial')
  // A partir de aquí, trampas.
  if (caso === 'openpgp') {
    const hooks = path.join(dir, 'hooks')
    mkdirSync(hooks)
    for (const h of ['pre-commit', 'commit-msg', 'post-commit']) {
      writeFileSync(path.join(hooks, h), `#!/bin/sh\necho "hook-${h}" >> "${marcas}"\nexit 0\n`)
      chmodSync(path.join(hooks, h), 0o755)
    }
    g0('config commit.gpgSign true')
    g0('config tag.gpgSign true')
    g0('config log.showSignature true')
    g0(`config gpg.program ${trampa('gpg', 'exit 1')}`)
    g0(`config core.hooksPath ${hooks}`)
  }
  if (caso === 'hooks-por-defecto') {
    for (const h of ['pre-commit', 'commit-msg', 'post-commit']) {
      const ruta = path.join(repo, '.git', 'hooks', h)
      writeFileSync(ruta, `#!/bin/sh\necho "hook-${h}" >> "${marcas}"\nexit 0\n`)
      chmodSync(ruta, 0o755)
    }
  }
  if (caso === 'ssh') {
    g0('config gpg.format ssh')
    g0('config commit.gpgSign true')
    g0('config tag.gpgSign true')
    g0('config user.signingkey /nonexistent/clave.pub')
    g0(`config gpg.ssh.program ${trampa('ssh-keygen', 'exit 1')}`)
  }
  if (caso === 'x509') {
    g0('config gpg.format x509')
    g0('config commit.gpgSign true')
    g0('config tag.gpgSign true')
    g0(`config gpg.x509.program ${trampa('gpgsm', 'exit 1')}`)
  }
  if (caso === 'atributos-globales') {
    const attrs = path.join(dir, 'atributos')
    writeFileSync(attrs, 'f filter=trampa\n')
    g0(`config core.attributesFile ${attrs}`)
    g0(`config filter.trampa.clean "${trampa('filtro-clean', 'cat')}"`)
    g0(`config filter.trampa.smudge "${trampa('filtro-smudge', 'cat')}"`)
  }
  if (caso === 'fsmonitor') {
    g0(`config core.fsmonitor ${trampa('fsmonitor', 'exit 1')}`)
  }
  return { dir, repo, home, marcas, trampa }
}

const leerMarcas = (marcas: string) => (existsSync(marcas) ? readFileSync(marcas, 'utf8').split('\n').filter(Boolean) : [])

/** Secuencia de A4 y del gate: status, add, commit, log, show, tag y apply de un parche. */
function secuencia(inv: string, commit: string, repo: string, dir: string) {
  writeFileSync(path.join(repo, 'f'), 'dos\n')
  writeFileSync(path.join(dir, 'f.nuevo'), 'tres\n')
  // El parche parte de la versión confirmada por la secuencia (dos) hacia la nueva (tres).
  const p = path.join(dir, 'p.patch')
  writeFileSync(p, '--- a/f\n+++ b/f\n@@ -1 +1 @@\n-dos\n+tres\n')
  return [
    `${inv} status --porcelain`,
    `${inv} add -- f`,
    `${inv} commit ${commit} -m dos`,
    `${inv} log -1`,
    `${inv} show --no-textconv HEAD:f`,
    `${inv} tag -a v1 -m t`,
    `${inv} apply --check "${p}"`,
    `${inv} apply "${p}"`,
    `${inv} status --porcelain`,
  ].join('\n')
}

const cabeceraSinGpgsig = (repo: string, home: string) =>
  sh("git cat-file commit HEAD | sed -n '/^$/q;p' | grep -c '^gpgsig'", repo, home).stdout.trim()

describe('I-1: g de A0 anula los programas que Git ejecutaría como root (con control)', () => {
  const casos: Array<[Caso, string[]]> = [
    ['openpgp', ['gpg', 'hook-pre-commit', 'hook-commit-msg']],
    ['hooks-por-defecto', ['hook-pre-commit', 'hook-commit-msg', 'hook-post-commit']],
    ['ssh', ['ssh-keygen']],
    ['x509', ['gpgsm']],
    ['atributos-globales', ['filtro-clean']],
  ]
  for (const [caso, marcadores] of casos) {
    it(`caso ${caso}: con g no se dispara ninguna trampa; sin g sí dispara ${marcadores.join(', ')}`, async () => {
      const { definicion } = await extraerDeA0()
      // Con g, con las banderas de A4k y también sin ellas (el endurecimiento por sí solo basta).
      for (const [etiqueta, commit] of [['con banderas', '--no-verify --no-gpg-sign'], ['sin banderas', '']] as const) {
        const t = repositorioConTrampas(caso)
        const salida = sh(`${definicion}\nset -e\n${secuencia('g', commit, t.repo, t.dir)}`, t.repo, t.home)
        expect(salida.status, `g ${etiqueta}: ${salida.stderr}`).toBe(0)
        expect(leerMarcas(t.marcas), `trampas disparadas con g ${etiqueta}`).toEqual([])
        expect(cabeceraSinGpgsig(t.repo, t.home), 'gpgsig').toBe('0')
      }
      // CONTROL: la misma secuencia con git sin g (sin las banderas de A4k) dispara la trampa.
      const c = repositorioConTrampas(caso)
      sh(secuencia('git', '', c.repo, c.dir).split('\n').map((l) => `${l} || true`).join('\n'), c.repo, c.home)
      for (const m of marcadores) expect(leerMarcas(c.marcas), `el control no disparó ${m}: la trampa no funciona`).toContain(m)
    })
  }

  it('control combinado: sin g se disparan a la vez la trampa de gpg y las de hooks', () => {
    const c = repositorioConTrampas('openpgp')
    sh(secuencia('git', '', c.repo, c.dir).split('\n').map((l) => `${l} || true`).join('\n'), c.repo, c.home)
    const marcas = leerMarcas(c.marcas)
    expect(marcas).toContain('gpg')
    expect(marcas).toContain('hook-pre-commit')
    expect(marcas).toContain('hook-commit-msg')
  })

  it('core.fsmonitor trampa: observación del control y de g', async () => {
    const { definicion } = await extraerDeA0()
    const c = repositorioConTrampas('fsmonitor')
    sh('git status --porcelain || true', c.repo, c.home)
    const marcasControl = leerMarcas(c.marcas)
    const t = repositorioConTrampas('fsmonitor')
    const salida = sh(`${definicion}\nset -e\ng status --porcelain\ng add -- f\ng diff --no-ext-diff --no-textconv`, t.repo, t.home)
    expect(salida.status, salida.stderr).toBe(0)
    expect(leerMarcas(t.marcas)).toEqual([])
    // Control: la trampa debe funcionar sin g; si no, esta prueba no demostraría nada.
    expect(marcasControl).toContain('fsmonitor')
  })

  it('g config --get devuelve los valores anulados y la verificación de A0 sale conforme', async () => {
    const { definicion, verificacion } = await extraerDeA0()
    const t = repositorioConTrampas('openpgp')
    const esperado: Record<string, string> = {
      'core.fsmonitor': 'false',
      'core.hooksPath': '/dev/null',
      'core.attributesFile': '/dev/null',
      'commit.gpgSign': 'false',
      'tag.gpgSign': 'false',
      'log.showSignature': 'false',
      'gpg.program': '/bin/false',
      'gpg.ssh.program': '/bin/false',
      'gpg.x509.program': '/bin/false',
      'gc.auto': '0',
      'maintenance.auto': 'false',
    }
    for (const [clave, valor] of Object.entries(esperado)) {
      const r = sh(`${definicion}\ng config --get ${clave}`, t.repo, t.home)
      expect(r.stdout.trim(), clave).toBe(valor)
    }
    // Sin g, el repositorio trampa sí declara lo contrario (la anulación es real).
    expect(sh('git config --get gpg.program', t.repo, t.home).stdout.trim()).toContain('trampa-gpg')
    const ok = sh(`${definicion}\n${verificacion}`, t.repo, t.home)
    expect(ok.stdout).toContain('g-efectiva-ok')
    expect(ok.stderr).not.toContain('A0 FALLÓ')
    for (const [clave, valor] of Object.entries(esperado)) expect(ok.stdout, clave).toContain(`${clave}=${valor}`)
    // Falla cerrada: una g debilitada (sin anular gpg.program) hace que la verificación pare.
    const debil = definicion.replace('-c gpg.program=/bin/false ', '')
    expect(debil).not.toBe(definicion)
    const mal = sh(`${debil}\n${verificacion}`, t.repo, t.home)
    expect(mal.stderr).toContain('A0 FALLÓ')
    expect(mal.stdout).not.toContain('g-efectiva-ok')
  })

  it('los atributos (filtros) en el árbol o en info/attributes se detectan con check-attr -a y g anula el archivo global', async () => {
    const { definicion } = await extraerDeA0()
    // Filtro declarado en el árbol: g no puede anularlo; lo detiene la comprobación de atributos de A0.
    const t = repositorioConTrampas('atributos-globales')
    const vacio = sh(`${definicion}\ng check-attr -a -- f`, t.repo, t.home)
    expect(vacio.stdout.trim(), 'el archivo global de atributos queda anulado por g').toBe('')
    expect(sh('git check-attr -a -- f', t.repo, t.home).stdout).toContain('filter: trampa')
    writeFileSync(path.join(t.repo, '.gitattributes'), 'f filter=trampa\n')
    expect(sh(`${definicion}\ng check-attr -a -- f`, t.repo, t.home).stdout).toContain('filter: trampa')
    rmSync(path.join(t.repo, '.gitattributes'))
    writeFileSync(path.join(t.repo, '.git', 'info', 'attributes'), 'f filter=trampa\n')
    expect(sh(`${definicion}\ng check-attr -a -- f`, t.repo, t.home).stdout).toContain('filter: trampa')
  })

  it('git config --show-scope --show-origin --name-only -l funciona con el git del host y no imprime valores', () => {
    const t = repositorioConTrampas('openpgp')
    const r = sh('git config --show-scope --show-origin --name-only -l', t.repo, t.home)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('gpg.program')
    expect(r.stdout).not.toContain('trampa-gpg')
    expect(r.stdout).not.toContain('prueba@example.invalid')
  })
})

// ---------------------------------------------------------------------------------------------
// c. Estructura de A4
// ---------------------------------------------------------------------------------------------

describe('I-2: A4 en fases con aprobación por hash', () => {
  const fases = ['# A4a ·', '# A4r ·', '# A4p ·', '# A4v ·', '# A4k ·']
  const a4De = (gate: string) => bloque(gate, '### A4 ·', '### Clasificación de operaciones por privilegio')
  const faseDe = (a4: string, marca: string) => {
    const b = bloquesSh(a4).find((x) => x.includes(marca))
    expect(b, marca).toBeTruthy()
    return b!
  }

  it('las fases A4a, A4r, A4p, A4v y A4k están en ese orden y A4r precede a toda aplicación', async () => {
    const a4 = a4De(await leer(RUTA_GATE))
    const pos = fases.map((f) => a4.indexOf(f))
    pos.forEach((p, i) => expect(p, fases[i]).toBeGreaterThan(-1))
    expect([...pos].sort((x, y) => x - y)).toEqual(pos)
    expect(a4.indexOf('# A4r ·')).toBeLessThan(a4.indexOf('g -C .. apply "$S'))
    expect(a4.indexOf('# A4p ·')).toBeLessThan(a4.indexOf('g -C .. apply "$S'))
    expect(a4).toContain('PARADA: no continuar a A4p sin aprobación')
    expect(a4.indexOf('r A4b0')).toBeGreaterThan(a4.indexOf('# A4k ·'))
    expect(a4).not.toContain('Editar tsconfig.json')
    for (const rc of ['a4a_rc', 'a4r_rc', 'a4p_rc', 'a4v_rc', 'a4k_rc']) expect(a4, rc).toContain(`${rc}=$?`)
    // Cada fase termina con su «Esperado / Si no: parada dura».
    expect((a4.match(/Esperado[^\n]*Si no[^\n]*parada dura/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('A4a y A4r no aplican nada: todo apply fuera de comentarios lleva --check', async () => {
    const a4 = a4De(await leer(RUTA_GATE))
    for (const marca of ['# A4a ·', '# A4r ·']) {
      const lineas = faseDe(a4, marca).split('\n').filter((l) => !comentario(l) && /\bapply\b/.test(l))
      for (const l of lineas) expect(l, marca).toContain('--check')
    }
    // A4a conserva sus comprobaciones y añade base, tsconfig y rc propio.
    const a4a = faseDe(a4, '# A4a ·')
    for (const t of ['"$S/A4-base.txt"', "g rev-parse HEAD > \"$S/A4-base.txt\"", '"$S/A4-tsconfig.json"', "flag: 'wx'", 'mode: 0o600',
      "--label a/poc1a/tsconfig.json --label b/poc1a/tsconfig.json", 'command -v diff', 'GNU diffutils', "grep -c '^ignore-scripts=true$' .npmrc",
      'canónico', 'g -C .. apply --check "$S/A4-manifiestos.patch"']) expect(a4a, t).toContain(t)
    expect(a4a).toContain('"node_modules",\\n    "e2e/intake-axe.spec.ts"\\n')
    expect(a4a).toMatch(/exactamente una|!== 1/)
  })

  it('A4r compara los archivos de $S con el árbol, escribe A4-verificacion.txt y mantiene las URL', async () => {
    const a4r = faseDe(a4De(await leer(RUTA_GATE)), '# A4r ·')
    for (const t of ['$S/A4-package.json', '$S/A4-package-lock.json', 'devDependencies', '@axe-core/playwright', '4.13.0', 'node_modules/axe-core',
      'https://registry.npmjs.org/', 'sha512-', 'lockfileVersion', 'A4-verificacion.txt', 'SHA256SUMS', 'git\\+|file:|http:']) expect(a4r, t).toContain(t)
  })

  it('A4p exige A4_APROBADO, compara sha256, HEAD y árbol limpio; A4v y A4k usan g endurecida', async () => {
    const a4 = a4De(await leer(RUTA_GATE))
    const a4p = faseDe(a4, '# A4p ·')
    for (const t of ['A4_APROBADO', 'sha256sum "$S/A4-manifiestos.patch"', 'A4-aprobacion.txt', '$S/A4-base.txt', 'g rev-parse HEAD',
      'g -C .. status --porcelain', 'g -C .. apply --check "$S/A4-manifiestos.patch"', 'g -C .. apply "$S/A4-manifiestos.patch"', 'a4a_rc', 'a4r_rc', 'set -eu']) expect(a4p, t).toContain(t)
    expect(a4p.indexOf('A4_APROBADO')).toBeLessThan(a4p.indexOf('g -C .. apply "$S'))
    // El marcador lo teclea el humano: no se calcula por script en ninguna fase.
    expect(a4).toContain('A4_APROBADO=<sha256 del parche leído, tecleado por el humano>')
    expect(bloquesSh(a4).join('\n').split('\n').filter((l) => /^A4_APROBADO=/.test(l) && !l.includes('=<'))).toEqual([])
    const a4v = faseDe(a4, '# A4v ·')
    for (const t of ['g -C .. status --porcelain', 'cmp ', '"$S/A4-tsconfig.json"', 'poc1a/package.json', 'poc1a/package-lock.json', 'poc1a/tsconfig.json', '--no-ext-diff --no-textconv']) expect(a4v, t).toContain(t)
    const a4k = faseDe(a4, '# A4k ·')
    for (const t of ['cmp ', 'g -C .. add -- ', 'g -C .. diff --cached --no-ext-diff --name-only', `g -C .. commit --no-verify --no-gpg-sign -m "${COMMIT_A4}"`,
      "g cat-file commit HEAD | sed -n '/^$/q;p' | grep -c '^gpgsig'", 'g diff-tree --no-commit-id --name-only -r HEAD', 'HEAD~1', '$S/A4-base.txt', 'g rev-parse --short HEAD']) expect(a4k, t).toContain(t)
    // Ninguna orden Git de A4 omite g.
    for (const b of bloquesSh(a4)) for (const l of b.split('\n')) if (!comentario(l)) expect(l, l).not.toMatch(/(^|[\s(;&|])git /)
  })

  it('el README no pide editar tsconfig.json a mano ni aplicar sin la revisión por hash de A4', async () => {
    const readme = await leer('README.md')
    expect(readme).not.toContain('quitar "e2e/intake-axe.spec.ts" de "exclude" en tsconfig.json')
    expect(readme).toContain('A4_APROBADO')
    expect(readme).toContain('tsconfig.json')
  })

  it('el parche incluye los tres archivos con etiquetas a/poc1a y b/poc1a', async () => {
    const a4 = a4De(await leer(RUTA_GATE))
    for (const f of ['package.json', 'package-lock.json', 'tsconfig.json']) expect(a4).toContain(`--label a/poc1a/${f} --label b/poc1a/${f}`)
  })
})

// ---------------------------------------------------------------------------------------------
// c2. Ejecución de las fases A4a-A4k del gate, literalmente, en un repositorio temporal con trampas
// ---------------------------------------------------------------------------------------------

describe('I-2: las fases del gate se ejecutan de punta a punta (docker simulado) y la aplicación exige la aprobación', () => {
  type Desviacion = 'ninguna' | 'cambia-entrada' | 'paquete-extra' | 'url-git' | 'resolved-externo' | 'resolved-file' | 'resolved-http'
  const RESOLVED_EXTERNO = 'https://registry.example.invalid/axe-core/-/axe-core-4.10.2.tgz'
  const b64 = (o: unknown) => Buffer.from(`${JSON.stringify(o, null, 2)}\n`).toString('base64')

  // Estado de partida del repositorio temporal. Por defecto es el estado PRE-A4 (fixture de tsconfig y manifiestos sintéticos);
  // los archivos reales (post-A4) sólo se usan cuando una prueba pide expresamente 'real' / 'post' y siempre en sólo lectura.
  type Variante = { tsconfig?: 'pre-a4' | 'real'; manifiestos?: 'pre' | 'post' | 'ya-declara' }

  async function ejecutarA4(desviacion: Desviacion, mutador = '', mutadorAntesDeK = '', mutadorAntesDeA4a = '', aprobacionInvalida = false, mutadorAntesDeV = '', variante: Variante = {}) {
    const { tsconfig: variantTsconfig = 'pre-a4', manifiestos = 'pre' } = variante
    const gate = await leer(RUTA_GATE)
    const a4 = bloque(gate, '### A4 ·', '### Clasificación de operaciones por privilegio')
    const bs = bloquesSh(a4)
    const fase = (marca: string) => bs.find((b) => b.includes(marca))!
    const { definicion, validadores } = await extraerDeA0()
    const dir = path.join(tmpRaiz, `a4-${++contador}`)
    const repo = path.join(dir, 'repo')
    const sub = path.join(repo, 'poc1a')
    const home = path.join(dir, 'home')
    const marcas = path.join(dir, 'marcas')
    mkdirSync(sub, { recursive: true })
    mkdirSync(home, { recursive: true })
    // Manifiestos de partida y propuestos (lo que devolvería manifest-patch-axe).
    const reg = 'https://registry.npmjs.org/'
    const ts = { version: '5.0.0', resolved: `${reg}typescript/-/typescript-5.0.0.tgz`, integrity: 'sha512-AAAA', dev: true }
    const pkg0 = { name: 'x', version: '1.0.0', devDependencies: { typescript: '5.0.0' } }
    const lock0 = { name: 'x', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'x', version: '1.0.0', devDependencies: { typescript: '5.0.0' } }, 'node_modules/typescript': ts } }
    const pkg1 = { ...pkg0, devDependencies: { '@axe-core/playwright': '4.13.0', typescript: '5.0.0' } }
    const lock1 = JSON.parse(JSON.stringify(lock0))
    lock1.packages[''].devDependencies = pkg1.devDependencies
    lock1.packages['node_modules/@axe-core/playwright'] = { version: '4.13.0', resolved: `${reg}@axe-core/playwright/-/playwright-4.13.0.tgz`, integrity: 'sha512-BBBB', dev: true }
    lock1.packages['node_modules/axe-core'] = { version: '4.10.2', resolved: `${reg}axe-core/-/axe-core-4.10.2.tgz`, integrity: 'sha512-CCCC', dev: true }
    if (desviacion === 'cambia-entrada') lock1.packages['node_modules/typescript'].integrity = 'sha512-ZZZZ'
    if (desviacion === 'paquete-extra') lock1.packages['node_modules/otro'] = { version: '1.0.0', resolved: `${reg}otro/-/otro-1.0.0.tgz`, integrity: 'sha512-DDDD' }
    if (desviacion === 'url-git') lock1.packages['node_modules/axe-core'].resolved = 'git+https://example.invalid/axe-core.git'
    if (desviacion === 'resolved-externo') lock1.packages['node_modules/axe-core'].resolved = RESOLVED_EXTERNO
    if (desviacion === 'resolved-file') lock1.packages['node_modules/axe-core'].resolved = 'file:../axe-core'
    if (desviacion === 'resolved-http') lock1.packages['node_modules/axe-core'].resolved = 'http://registry.npmjs.org/axe-core/-/axe-core-4.10.2.tgz'
    // Los manifiestos sintéticos de partida no declaran la dependencia que A4 añade.
    expect(JSON.stringify(pkg0)).not.toContain('@axe-core/playwright')
    expect(JSON.stringify(lock0)).not.toContain('@axe-core/playwright')
    const json = path.join(dir, 'stub.json')
    const aBase64 = (ruta: string) => readFileSync(path.join(raiz, ruta)).toString('base64')
    writeFileSync(json, JSON.stringify(manifiestos === 'post'
      ? { packageJson: aBase64('package.json'), packageLockJson: aBase64('package-lock.json') }
      : { packageJson: b64(pkg1), packageLockJson: b64(lock1) }))
    if (manifiestos === 'post') {
      writeFileSync(path.join(sub, 'package.json'), readFileSync(path.join(raiz, 'package.json')))
      writeFileSync(path.join(sub, 'package-lock.json'), readFileSync(path.join(raiz, 'package-lock.json')))
    } else {
      const pkgArbol = manifiestos === 'ya-declara' ? { ...pkg0, devDependencies: { '@axe-core/playwright': '4.12.0', typescript: '5.0.0' } } : pkg0
      writeFileSync(path.join(sub, 'package.json'), `${JSON.stringify(pkgArbol, null, 2)}\n`)
      writeFileSync(path.join(sub, 'package-lock.json'), `${JSON.stringify(lock0, null, 2)}\n`)
    }
    writeFileSync(path.join(sub, 'tsconfig.json'), readFileSync(variantTsconfig === 'real' ? path.join(raiz, 'tsconfig.json') : RUTA_FIXTURE_PRE_A4))
    writeFileSync(path.join(sub, '.npmrc'), 'ignore-scripts=true\n')
    writeFileSync(path.join(sub, 'poc.sh'), `#!/bin/sh\ncase "$1" in manifest-patch-axe) cat "${json}" ;; *) exit 2 ;; esac\n`)
    chmodSync(path.join(sub, 'poc.sh'), 0o755)
    const g0 = (args: string) => { const r = sh(`git ${args}`, repo, home); expect(r.status, `git ${args}: ${r.stderr}`).toBe(0) }
    g0('init -q'); g0('config user.email prueba@example.invalid'); g0('config user.name Prueba')
    g0('add -A'); g0('commit -q -m base')
    // Trampas de firma y de hooks activas en el repositorio: las fases del gate no deben dispararlas.
    const trampa = (nombre: string, cuerpo: string) => {
      const ruta = path.join(dir, `trampa-${nombre}`)
      writeFileSync(ruta, `#!/bin/sh\necho "${nombre}" >> "${marcas}"\n${cuerpo}\n`)
      chmodSync(ruta, 0o755)
      return ruta
    }
    const hooks = path.join(dir, 'hooks')
    mkdirSync(hooks)
    for (const h of ['pre-commit', 'commit-msg', 'post-commit']) { writeFileSync(path.join(hooks, h), `#!/bin/sh\necho "hook-${h}" >> "${marcas}"\nexit 0\n`); chmodSync(path.join(hooks, h), 0o755) }
    g0('config commit.gpgSign true'); g0(`config gpg.program ${trampa('gpg', 'exit 1')}`); g0(`config core.hooksPath ${hooks}`)
    const aprobacion = fase('# A4r (aprobación humana)')
      .replace(/^A4_APROBADO=.*$/m, aprobacionInvalida ? 'A4_APROBADO=no-es-un-hash' : 'A4_APROBADO="$(sha256sum "$S/A4-manifiestos.patch" | cut -d\' \' -f1)"')
      .replace(/^APROBADOR=.*$/m, 'APROBADOR=prueba')
    const cd = (b: string) => {
      const sustituido = b.replace('/home/proyectos/jozeuzz-poc-candidata-a/poc1a', sub)
      // Si el gate cambiara la ruta de su `cd`, la simulación podría entrar en un worktree real: se exige que no quede ninguna ruta real.
      expect(sustituido, 'tras cd() ningún bloque de fase conserva una ruta /home/proyectos/').not.toContain('/home/proyectos/')
      return sustituido
    }
    const script = [
      'set -o pipefail', 'umask 077', `S="${dir}/salidas"`, 'install -d -m 700 "$S"',
      "GUARDA='poc.sh package.json package-lock.json tsconfig.json .npmrc'", definicion, validadores,
      mutadorAntesDeA4a, cd(fase('# A4a ·')), cd(fase('# A4r ·')), aprobacion, mutador, cd(fase('# A4p ·')), mutadorAntesDeV, cd(fase('# A4v ·')), mutadorAntesDeK, cd(fase('# A4k ·')),
      'echo "RC a4a=$a4a_rc a4r=$a4r_rc a4p=$a4p_rc a4v=$a4v_rc a4k=$a4k_rc"',
    ].join('\n')
    const guion = path.join(dir, 'a4.sh')
    writeFileSync(guion, script)
    const r = spawnSync('bash', [guion], { cwd: sub, env: entornoBase(home), encoding: 'utf8' })
    const rc = /RC a4a=(\d+) a4r=(\d+) a4p=(\d+) a4v=(\d+) a4k=(\d+)/.exec(r.stdout)
    expect(rc, `salida: ${r.stdout}\n${r.stderr}`).toBeTruthy()
    const [a4a, a4r, a4p, a4v, a4k] = rc!.slice(1).map(Number)
    const git = (args: string) => sh(`git ${args}`, repo, home).stdout.trim()
    return { a4a, a4r, a4p, a4v, a4k, repo, sub, home, marcas, stdout: r.stdout, stderr: r.stderr, git, salidas: path.join(dir, 'salidas') }
  }

  it('camino feliz: tsconfig dentro del parche, commit sin gpgsig y sin disparar trampas', async () => {
    const e = await ejecutarA4('ninguna')
    expect([e.a4a, e.a4r, e.a4p, e.a4v, e.a4k], `${e.stdout}\n${e.stderr}`).toEqual([0, 0, 0, 0, 0])
    expect(leerMarcas(e.marcas)).toEqual([])
    expect(e.git('log -1 --format=%s')).toBe(COMMIT_A4)
    expect(e.git('diff-tree --no-commit-id --name-only -r HEAD').split('\n').sort()).toEqual(['poc1a/package-lock.json', 'poc1a/package.json', 'poc1a/tsconfig.json'])
    expect(cabeceraSinGpgsig(e.repo, e.home)).toBe('0')
    expect(readFileSync(path.join(e.sub, 'tsconfig.json'), 'utf8')).not.toContain('intake-axe')
    // A4 reproducido sobre el fixture pre-A4 = estado real post-A4 (byte a byte, también en el commit).
    expect(readFileSync(path.join(e.sub, 'tsconfig.json')).equals(readFileSync(path.join(raiz, 'tsconfig.json')))).toBe(true)
    expect(e.git('show HEAD:poc1a/tsconfig.json')).toBe(readFileSync(path.join(raiz, 'tsconfig.json'), 'utf8').trim())
    expect(readFileSync(path.join(e.sub, 'package.json'), 'utf8')).toContain('"@axe-core/playwright": "4.13.0"')
    expect(readFileSync(path.join(e.salidas, 'A4-verificacion.txt'), 'utf8')).toContain('versión de axe-core (transitiva): 4.10.2')
    expect(readFileSync(path.join(e.salidas, 'A4-aprobacion.txt'), 'utf8')).toMatch(/^sha256=[0-9a-f]{64}\nresponsable=prueba\nfecha_utc=/)
    expect(e.git('status --porcelain')).toBe('')
  })

  // `verificacion`: texto esperado en A4-verificacion.txt (la desviación llega al script Node de A4r); `stderr`: mensaje del grep previo de A4r.
  const rechazos: Array<[string, Desviacion, string, { a4r?: number; verificacion?: string; stderr?: string }]> = [
    ['una entrada preexistente del lockfile cambia', 'cambia-entrada', '', { a4r: 1, verificacion: 'DESVIACIÓN: lockfile: 1 entradas preexistentes profundamente iguales (cambiadas: node_modules/typescript)' }],
    ['aparece un paquete nuevo distinto de los dos esperados', 'paquete-extra', '', { a4r: 1, verificacion: 'DESVIACIÓN: lockfile: claves nuevas = node_modules/@axe-core/playwright, node_modules/axe-core, node_modules/otro' }],
    ['un resolved apunta fuera del registro (git+)', 'url-git', '', { a4r: 1, stderr: 'A4r: URL git+, file: o http: en el lockfile propuesto' }],
    ['un resolved https apunta a otro registro (llega al script Node de A4r)', 'resolved-externo', '', { a4r: 1, verificacion: 'DESVIACIÓN: node_modules/axe-core: resolved empieza por https://registry.npmjs.org/' }],
    ['un resolved es file: (lo para el grep previo de A4r)', 'resolved-file', '', { a4r: 1, stderr: 'A4r: URL git+, file: o http: en el lockfile propuesto' }],
    ['un resolved es http: (lo para el grep previo de A4r)', 'resolved-http', '', { a4r: 1, stderr: 'A4r: URL git+, file: o http: en el lockfile propuesto' }],
    ['el parche se altera después de la aprobación', 'ninguna', 'echo "# alterado" >> "$S/A4-manifiestos.patch"', {}],
    ['A4_APROBADO no se definió', 'ninguna', 'unset A4_APROBADO', {}],
    ['A4_APROBADO es otro hash', 'ninguna', 'A4_APROBADO=0000000000000000000000000000000000000000000000000000000000000000', {}],
    ['HEAD se movió', 'ninguna', 'g commit -q --allow-empty --no-verify --no-gpg-sign -m mover', {}],
    ['el árbol está sucio', 'ninguna', 'echo x > ../intruso.txt', {}],
  ]
  for (const [nombre, desviacion, mutador, esperado] of rechazos) {
    it(`no se aplica nada si ${nombre}`, async () => {
      const e = await ejecutarA4(desviacion, mutador)
      expect(e.a4a, `${e.stdout}\n${e.stderr}`).toBe(0)
      // La fase que rechaza es la esperada: A4r sólo falla en las desviaciones del lockfile; en el resto A4r pasa y rechaza A4p.
      if (esperado.a4r !== undefined) expect(e.a4r).not.toBe(0)
      else expect(e.a4r, `${e.stdout}\n${e.stderr}`).toBe(0)
      expect(e.a4p, e.stderr).not.toBe(0)
      expect(e.a4v, e.stderr).not.toBe(0)
      expect(e.a4k).not.toBe(0)
      expect(readFileSync(path.join(e.sub, 'package.json'), 'utf8')).not.toContain('axe-core')
      expect(readFileSync(path.join(e.sub, 'tsconfig.json'), 'utf8')).toContain('intake-axe')
      expect(e.git('log --format=%s').split('\n')).not.toContain(COMMIT_A4)
      expect(leerMarcas(e.marcas)).toEqual([])
      if (esperado.verificacion !== undefined) expect(readFileSync(path.join(e.salidas, 'A4-verificacion.txt'), 'utf8')).toContain(esperado.verificacion)
      if (esperado.stderr !== undefined) expect(e.stderr).toContain(esperado.stderr)
    })
  }

  it('falla de A4a/A4r/A4p/A4v bloquea todas las fases posteriores', async () => {
    const casos: Array<[string, Desviacion, string, string, string, string]> = [
      ['A4a', 'ninguna', '', '', 'echo ocupado > "$S/A4-package.json"', ''],
      ['A4r', 'cambia-entrada', '', '', '', ''],
      ['A4p', 'ninguna', 'A4_APROBADO=0000000000000000000000000000000000000000000000000000000000000000', '', '', ''],
      ['A4v', 'ninguna', '', '', '', 'echo alterado > package.json'],
    ]
    for (const [nombre, desviacion, antesDeP, antesDeK, antesDeA4a, antesDeV] of casos) {
      const e = await ejecutarA4(desviacion, antesDeP, antesDeK, antesDeA4a, false, antesDeV)
      const rcs = [e.a4a, e.a4r, e.a4p, e.a4v, e.a4k]
      const i = ['A4a', 'A4r', 'A4p', 'A4v'].indexOf(nombre)
      // Todas las fases anteriores a la que falla pasan: la falla se debe a la fase indicada y no a otra causa.
      for (const rc of rcs.slice(0, i)) expect(rc, `${nombre}: fase anterior debe ser 0: ${e.stderr}`).toBe(0)
      expect(rcs[i], `${nombre}: ${e.stderr}`).not.toBe(0)
      for (const rc of rcs.slice(i + 1)) expect(rc, `${nombre}: ${e.stderr}`).not.toBe(0)
      expect(e.git('log --format=%s').split('\n')).not.toContain(COMMIT_A4)
    }
  })

  it('reconfiguración o atributos antes de A4p y A4k bloquean apply/add/commit', async () => {
    const casos: Array<[string, string, string, 'p' | 'k']> = [
      ['g antes de A4p', 'g() { git "$@"; }', '', 'p'],
      ['atributos antes de A4p', 'printf "package.json guardado\\n" > ../.git/info/attributes', '', 'p'],
      ['g antes de A4k', '', 'g() { git "$@"; }', 'k'],
      ['atributos antes de A4k', '', 'printf "package.json guardado\\n" > ../.git/info/attributes', 'k'],
    ]
    for (const [nombre, antesDeP, antesDeK, fase] of casos) {
      const e = await ejecutarA4('ninguna', antesDeP, antesDeK)
      expect([e.a4a, e.a4r], `${nombre}: A4a y A4r deben pasar antes de la reconfiguración: ${e.stderr}`).toEqual([0, 0])
      if (fase === 'p') expect(e.a4p, `${nombre}: ${e.stderr}`).not.toBe(0)
      else {
        expect(e.a4p, `${nombre}: ${e.stderr}`).toBe(0)
        expect(e.a4v, `${nombre}: ${e.stderr}`).toBe(0)
        expect(e.a4k, `${nombre}: ${e.stderr}`).not.toBe(0)
      }
      expect(e.git('log --format=%s').split('\n')).not.toContain(COMMIT_A4)
    }
  })

  it('aprobación humana simulada inválida no crea registro ni aplica parche', async () => {
    const e = await ejecutarA4('ninguna', '', '', '', true)
    expect([e.a4a, e.a4r], `A4a y A4r pasan; lo que falla es la aprobación: ${e.stderr}`).toEqual([0, 0])
    expect(existsSync(path.join(e.salidas, 'A4-aprobacion.txt'))).toBe(false)
    expect([e.a4p, e.a4v, e.a4k]).not.toContain(0)
    expect(readFileSync(path.join(e.sub, 'package.json'), 'utf8')).not.toContain('axe-core')
  })

  it('A4 no se repite sobre el estado post-A4: con los tres archivos reales las fases se detienen y no cambia nada', async () => {
    const e = await ejecutarA4('ninguna', '', '', '', false, '', { tsconfig: 'real', manifiestos: 'post' })
    expect(e.a4a, e.stderr).not.toBe(0)
    expect(e.stderr, 'A4a falla por el bloque exclude, no por otra causa').toContain('tsconfig.json: el bloque exclude no aparece exactamente una vez')
    for (const rc of [e.a4r, e.a4p, e.a4v, e.a4k]) expect(rc, e.stderr).not.toBe(0)
    expect(e.git('log --format=%s').split('\n')).toEqual(['base'])
    expect(leerMarcas(e.marcas)).toEqual([])
    expect(e.git('status --porcelain')).toBe('')
    for (const f of ARCHIVOS_REALES) expect(readFileSync(path.join(e.sub, f)).equals(readFileSync(path.join(raiz, f))), `${f} del repo temporal idéntico al real`).toBe(true)
    expect(existsSync(path.join(e.salidas, 'A4-aprobacion.txt'))).toBe(false)
  })

  it('A4 no se repite si package.json ya declara la dependencia: A4a pasa, A4r señala la desviación y nada se aplica', async () => {
    const e = await ejecutarA4('ninguna', '', '', '', false, '', { tsconfig: 'pre-a4', manifiestos: 'ya-declara' })
    expect(e.a4a, `${e.stdout}\n${e.stderr}`).toBe(0)
    expect(e.a4r, e.stderr).not.toBe(0)
    expect(readFileSync(path.join(e.salidas, 'A4-verificacion.txt'), 'utf8')).toContain('DESVIACIÓN: package.json del árbol no declaraba ya la dependencia')
    for (const rc of [e.a4p, e.a4v, e.a4k]) expect(rc, e.stderr).not.toBe(0)
    expect(e.git('log --format=%s').split('\n')).toEqual(['base'])
    expect(leerMarcas(e.marcas)).toEqual([])
    expect(readFileSync(path.join(e.sub, 'tsconfig.json'), 'utf8')).toContain('intake-axe')
    expect(readFileSync(path.join(e.sub, 'package.json'), 'utf8')).toContain('"@axe-core/playwright": "4.12.0"')
    expect(e.git('status --porcelain')).toBe('')
  })

  it('A4 no se repite si el parche de manifiestos es nulo (manifest-patch-axe devuelve los manifiestos reales del árbol): A4a se detiene sin diff válido', async () => {
    const e = await ejecutarA4('ninguna', '', '', '', false, '', { tsconfig: 'pre-a4', manifiestos: 'post' })
    expect(e.a4a, `${e.stdout}\n${e.stderr}`).not.toBe(0)
    expect(e.stderr, 'A4a falla por el diff de package.json, no por otra causa').toContain('A4 package.json sin diff válido: rc=0')
    for (const rc of [e.a4r, e.a4p, e.a4v, e.a4k]) expect(rc, e.stderr).not.toBe(0)
    expect(e.git('log --format=%s').split('\n')).toEqual(['base'])
    expect(leerMarcas(e.marcas)).toEqual([])
    expect(e.git('status --porcelain')).toBe('')
    // Archivos del repositorio temporal idénticos al estado de partida: manifiestos reales (copiados) y tsconfig pre-A4 (fixture).
    for (const f of ['package.json', 'package-lock.json']) expect(readFileSync(path.join(e.sub, f)).equals(readFileSync(path.join(raiz, f))), `${f} sin cambios`).toBe(true)
    expect(readFileSync(path.join(e.sub, 'tsconfig.json')).equals(readFileSync(RUTA_FIXTURE_PRE_A4)), 'tsconfig.json sin cambios').toBe(true)
    expect(existsSync(path.join(e.salidas, 'A4-aprobacion.txt'))).toBe(false)
  })

  it('el fixture pre-A4 es el blob Git de 0faf138:poc1a/tsconfig.json (8d0831b…)', () => {
    expect(blobGit(readFileSync(RUTA_FIXTURE_PRE_A4))).toBe(BLOB_PRE_A4)
  })

  it('el fixture pre-A4 contiene exactamente una vez el bloque que A4a sustituye y excluye node_modules y e2e/intake-axe.spec.ts', async () => {
    const { viejo, nuevo } = sustitucionDeA4a(await leer(RUTA_GATE))
    expect(viejo).toBe('    "node_modules",\n    "e2e/intake-axe.spec.ts"\n')
    expect(nuevo).toBe('    "node_modules"\n')
    const fixture = readFileSync(RUTA_FIXTURE_PRE_A4, 'utf8')
    expect(fixture.split(viejo).length - 1).toBe(1)
    expect(JSON.parse(fixture).exclude).toEqual(['node_modules', 'e2e/intake-axe.spec.ts'])
  })

  it('la sustitución de A4a aplicada al fixture produce el blob 441ecc3… y los bytes del tsconfig.json real', async () => {
    const { viejo, nuevo } = sustitucionDeA4a(await leer(RUTA_GATE))
    const resultado = Buffer.from(readFileSync(RUTA_FIXTURE_PRE_A4, 'utf8').replace(viejo, () => nuevo), 'utf8')
    expect(blobGit(resultado)).toBe(BLOB_POST_A4)
    expect(resultado.equals(readFileSync(path.join(raiz, 'tsconfig.json')))).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
// d. A0
// ---------------------------------------------------------------------------------------------

describe('I-1: A0 detecta sin imprimir valores y falla cerrado', () => {
  it('A0 usa --name-only, falla cerrado, mira GIT_* y los atributos, y el grep amplio', async () => {
    const gate = await leer(RUTA_GATE)
    const a0 = bloque(gate, '### A0 ·', '### A3e ·')
    expect(a0).not.toMatch(/git config --show-origin -l \| grep/)
    expect(a0).toContain('git config --show-scope --show-origin --name-only -l > "$S/A0-git-config-nombres.txt" || echo "A0 FALLÓ')
    expect(a0).toContain('sha256sum "$S/A0-git-config-nombres.txt" >> "$S/SHA256SUMS"')
    expect(a0).toContain("env | cut -d= -f1 | grep '^GIT_'")
    expect(a0).toContain('g check-attr -a -- poc1a/package.json poc1a/package-lock.json poc1a/tsconfig.json')
    expect(a0).toContain('type -a git')
    expect(a0).toContain('readlink -f --')
    expect(a0).toContain('"$GIT_BIN" --exec-path')
    expect(a0).toContain('test -x /bin/false')
    const grep = /grep -iE '([^']+)' "\$S\/A0-git-config-nombres\.txt"/.exec(a0)
    expect(grep, 'grep sobre los nombres').toBeTruthy()
    for (const clave of ['fsmonitor', 'hookspath', 'pager', 'editor', 'sshcommand', 'askpass', 'attributesfile', 'gitproxy', 'textconv', '\\.command', 'driver',
      'process', 'clean', 'smudge', 'program', 'helper', 'external', 'gpg', 'gpgsign', 'signingkey', 'showsignature', 'alias', 'filter\\.', 'include', 'includeif',
      'credential', 'sequence\\.editor', 'difffilter', 'uploadpack', 'receivepack', 'maintenance', 'gc\\.auto', 'submodule', 'url\\.', 'protocol']) expect(grep![1], clave).toContain(clave)
    // La g endurecida lleva todas las anulaciones.
    const def = /^g\(\) \{.*\}$/m.exec(a0)![0]
    for (const c of ['core.fsmonitor=false', 'core.hooksPath=/dev/null', 'core.attributesFile=/dev/null', 'commit.gpgSign=false', 'tag.gpgSign=false',
      'log.showSignature=false', 'gpg.program=/bin/false', 'gpg.ssh.program=/bin/false', 'gpg.x509.program=/bin/false', 'gc.auto=0', 'maintenance.auto=false', '--no-pager']) expect(def, c).toContain(c)
    // La definición de g va antes de su verificación y de check-attr.
    expect(a0.indexOf('g() {')).toBeLessThan(a0.indexOf('a0_fallos=0'))
    expect(a0.indexOf('a0_fallos=0')).toBeLessThan(a0.indexOf('g check-attr -a'))
    expect(a0).toMatch(/agentes root|advertencia 9/)
  })

  it('los g show del gate llevan --no-textconv', async () => {
    const gate = await leer(RUTA_GATE)
    const lineas = gate.split('\n').filter((l) => /\bg show\b/.test(l))
    expect(lineas.length).toBeGreaterThan(0)
    for (const l of lineas) for (const m of l.matchAll(/`g show[^`]*`/g)) expect(m[0], l).toContain('--no-textconv')
  })

  it('A0.1 acepta rutas usr-merge del mismo ejecutable y rechaza alias, función y ejecutables canónicos distintos', async () => {
    const a0 = bloque(await leer(RUTA_GATE), '### A0 ·', '### A3e ·')
    const a01 = bloque(a0, '# A0.1 ·', '# A0.2 ·')
    const ejecutar = (salidaType: string) => sh(`type() { if test "$1 $2" = '-a git'; then printf '%s\\n' '${salidaType}'; else builtin type "$@"; fi; }\n${a01}\necho FIN`, tmpRaiz, path.join(tmpRaiz, 'home-a01'))
    const mismo = ejecutar('git is /usr/bin/git\ngit is /bin/git')
    expect(mismo.stderr).not.toContain('A0 FALLÓ')
    expect(mismo.stdout).toContain('ruta-git-ok')
    for (const salida of ['git is aliased to `git --no-pager`', 'git is a function\ngit ()\n{\n  command git "$@"\n}', 'git is /usr/bin/git\ngit is /bin/sh']) {
      const r = ejecutar(salida)
      expect(r.stderr, salida).toContain('A0 FALLÓ: git sombreado')
      expect(r.stdout, salida).not.toContain('ruta-git-ok')
    }
  })

  it('A0.6 falla cerrado si check-attr devuelve rc no cero aunque stdout esté vacío', async () => {
    const a0 = bloque(await leer(RUTA_GATE), '### A0 ·', '### A3e ·')
    const a06 = bloque(a0, '# A0.6 ·', 'ls -l')
    const r = sh(`g() { return 17; }\n${a06}`, tmpRaiz, path.join(tmpRaiz, 'home-a06'))
    expect(r.stdout).not.toContain('atributos-ok')
    expect(r.stderr).toContain('A0 FALLÓ: atributos')
  })
})

describe('I-2: A4 vuelve a validar guardas y encadena cada fase', () => {
  const a4De = async () => bloque(await leer(RUTA_GATE), '### A4 ·', '### Clasificación de operaciones por privilegio')
  const fase = (a4: string, marca: string) => bloquesSh(a4).find((b) => b.includes(marca))!

  it('A4p y A4k revalidan g y atributos inmediatamente antes de apply/add', async () => {
    const a4 = await a4De()
    for (const [marca, mutacion] of [['# A4p ·', 'g -C .. apply --check'], ['# A4k ·', 'g -C .. add --']] as const) {
      const b = fase(a4, marca)
      const i = b.indexOf(mutacion)
      expect(b.slice(0, i)).toContain('g_efectiva')
      expect(b.slice(0, i)).toContain('atributos_limpios')
    }
  })

  it('A4r, A4p, A4v y A4k exigen el éxito inmediato de la fase anterior dentro de su subshell', async () => {
    const a4 = await a4De()
    for (const [marca, rc] of [['# A4r ·', 'a4a_rc'], ['# A4p ·', 'a4r_rc'], ['# A4v ·', 'a4p_rc'], ['# A4k ·', 'a4v_rc']] as const) {
      expect(fase(a4, marca), marca).toContain(`test "$${rc}" -eq 0`)
    }
  })

  it('aprobación inválida no crea A4-aprobacion.txt', async () => {
    const a4 = await a4De()
    const aprobacion = fase(a4, '# A4r (aprobación humana)')
    for (const requisito of ['test "$a4a_rc" -eq 0', 'test "$a4r_rc" -eq 0', "grep -Eq '^[0-9a-f]{64}$'", 'test -n "$APROBADOR"', 'A4r: el parche actual no es el aprobado']) expect(aprobacion, requisito).toContain(requisito)
    expect(aprobacion.indexOf('test -n "$APROBADOR"')).toBeLessThan(aprobacion.indexOf('A4-aprobacion.txt'))
  })
})

// ---------------------------------------------------------------------------------------------
// e. Estado post-A4 de los archivos reales (sólo lectura)
// ---------------------------------------------------------------------------------------------

describe('I-A4T: los manifiestos reales ya están en estado post-A4', () => {
  const REGISTRO = 'https://registry.npmjs.org/'
  const real = (f: string) => JSON.parse(readFileSync(path.join(raiz, f), 'utf8'))

  it('package.json declara @axe-core/playwright exactamente en 4.13.0', () => {
    expect(real('package.json').devDependencies['@axe-core/playwright']).toBe('4.13.0')
  })

  it('package-lock.json fija @axe-core/playwright 4.13.0 y axe-core con registro e integrity, y todo resolved está en el registro', () => {
    const lock = real('package-lock.json')
    expect(lock.packages[''].devDependencies['@axe-core/playwright']).toBe('4.13.0')
    const axe = lock.packages['node_modules/@axe-core/playwright']
    expect(axe.version).toBe('4.13.0')
    expect(axe.resolved).toBe(`${REGISTRO}@axe-core/playwright/-/playwright-4.13.0.tgz`)
    expect(axe.integrity).toBe('sha512-6YLx+kxXu5GJceG4ozFg+33a2EMTdjYwWGloJ3sb9Kta5pp+ZNS53uxGVog5JetIY8s++P5UrtX+cri+u0VAVg==')
    const core = lock.packages['node_modules/axe-core']
    expect(core, 'node_modules/axe-core').toBeTruthy()
    expect(core.resolved.startsWith(REGISTRO)).toBe(true)
    expect(core.integrity.startsWith('sha512-')).toBe(true)
    const fuera = Object.entries(lock.packages as Record<string, { resolved?: string }>).filter(([, e]) => e.resolved !== undefined && !e.resolved.startsWith(REGISTRO)).map(([k]) => k)
    expect(fuera).toEqual([])
  })

  it('tsconfig.json real ya no excluye e2e/intake-axe.spec.ts y el bloque de A4a aparece 0 veces', async () => {
    const texto = readFileSync(path.join(raiz, 'tsconfig.json'), 'utf8')
    expect(JSON.parse(texto).exclude).toEqual(['node_modules'])
    expect(texto).not.toContain('intake-axe')
    const { viejo } = sustitucionDeA4a(await leer(RUTA_GATE))
    expect(texto.split(viejo).length - 1).toBe(0)
  })
})

it('las pruebas no modificaron package.json, package-lock.json ni tsconfig.json reales (huellas sha256 al cargar el módulo)', () => {
  const ahora = Object.fromEntries(ARCHIVOS_REALES.map((f) => [f, sha256(readFileSync(path.join(raiz, f)))]))
  expect(ahora).toEqual(huellasRealesAlCargar)
})
