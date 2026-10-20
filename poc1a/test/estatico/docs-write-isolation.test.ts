import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

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

it('EVIDENCIA no afirma resultados Docker del aislamiento', async () => {
  const evidencia = await leer('EVIDENCIA.md')
  expect(evidencia).toContain('A4 aislado PENDIENTE: manifiestos no generados, parche no aplicado, dependencia no instalada y E2E axe no ejecutado')
  expect(evidencia).toContain('`volumes-init`, `deps` y `probe-mounts` siguen sin ejecutarse')
  expect(evidencia).not.toContain('./poc.sh exec-en poc3_intake npx tsc --noEmit\n')
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
  const lineas = a4.split('\n')
  const abre = lineas.indexOf('(')
  const cierra = lineas.indexOf(')')
  expect(abre, 'subshell abre').toBeGreaterThan(-1)
  expect(cierra, 'subshell cierra').toBeGreaterThan(abre)
  lineas.forEach((l, i) => {
    if (/(^|[\s;&|])exit(\s|$)/.test(l) && !l.trim().startsWith('#')) expect(i > abre && i < cierra, `exit fuera de subshell: ${l}`).toBe(true)
  })
  // A4b0/A4b/A4c van después del commit de A4 y dependen de deps (A3f).
  expect(a4.indexOf('r A4b0')).toBeGreaterThan(a4.indexOf('g commit'))
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

it('M-3: A4 corre con set -eu, no reutiliza A4-package.json y bloquea la aplicación si a4_rc != 0', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a4 = bloque(gate, '### A4 ·', '### Clasificación de operaciones por privilegio')
  const lineas = a4.split('\n')
  const abre = lineas.indexOf('(')
  expect(lineas[abre + 1]).toBe('set -eu')
  expect(a4).toContain('A4-package.json de un intento anterior')
  expect(a4).toContain('|| diff_rc=$?')
  expect(a4).toContain('|| rc=$?')
  expect(a4).toContain('test "$a4_rc" -eq 0 || { echo "A4 falló: no aplicar"; }')
  expect(a4).toContain('test "$a4_rc" -eq 0 && g -C .. apply --check "$S/A4-manifiestos.patch" && g -C .. apply "$S/A4-manifiestos.patch"')
  // La comprobación de a4_rc va antes de cualquier aplicación.
  expect(a4.indexOf('test "$a4_rc" -eq 0 ||')).toBeLessThan(a4.indexOf('g -C .. apply "$S'))
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

it('A0 incluye filter\\. en la búsqueda de configuración Git peligrosa', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  const a0 = bloque(gate, '### A0 ·', '### A3e ·')
  expect(a0).toContain("grep -iE 'fsmonitor|hookspath|textconv|external|pager|sshcommand|alias|filter\\.'")
})

it('poc.sh init: el comentario no promete más que O_EXCL y depende de A3e', async () => {
  const pocsh = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  expect(pocsh).toContain('un enlace a un archivo no regular creado a la vez se detecta después con -L')
  expect(pocsh).toContain('depende de que A3e haya retirado los escritores concurrentes')
  expect(pocsh).not.toContain('incluido un enlace colgante creado tras la comprobación -L.')
})
