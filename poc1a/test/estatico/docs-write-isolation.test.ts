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
  expect(gate).toContain('g apply --check "$S/A4-manifiestos.patch"')
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
