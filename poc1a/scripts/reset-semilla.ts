// Uso (siempre dentro del contenedor): ./poc.sh exec env POC_NO_PUSH=1 npx tsx scripts/reset-semilla.ts <semilla-json-base64>
// Imprime una línea «RESULTADO:{json}» con refs, ids y la contraseña aleatoria del admin sintético.
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { reiniciarYSembrar } from '../src/lib/semilla'


const arg = process.argv[2]
if (!arg) {
  console.error('falta la semilla (JSON en base64)')
  process.exit(2)
}

const payload = await getPayload({ config })
try {
  const semilla = JSON.parse(Buffer.from(arg, 'base64').toString('utf8'))
  const r = await reiniciarYSembrar(payload, semilla)
  console.log(`RESULTADO:${JSON.stringify(r)}`)
} finally {
  await payload.destroy()
}
process.exit(0)
