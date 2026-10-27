#!/usr/bin/env tsx
/**
 * scripts/smoke-fixture.ts
 *
 * Crea fixture sintética en DB efímera para smoke probes HTTP.
 * Usa Payload Local API con overrideAccess:true.
 * Imprime JSON a stdout: { servicioId, solicitudId }
 *
 * Uso: npm exec --offline -- tsx scripts/smoke-fixture.ts
 * Requiere: DATABASE_URL, PAYLOAD_SECRET, NEXT_PUBLIC_SERVER_URL
 */
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

const SERVICIO_SLUG = 'smoke-centinela-xk7q'
const SOL_NOMBRE = 'Solicitud-Smoke-Centinela-XK7Q'

async function main(): Promise<void> {
  const payload = await getPayload({ config: await configPromise })

  try {
    // Servicio centinela activo
    let servicioId: number
    const existeServ = await payload.find({
      collection: 'servicios',
      where: { slug: { equals: SERVICIO_SLUG } },
      overrideAccess: true,
    })
    if (existeServ.docs.length > 0) {
      servicioId = existeServ.docs[0].id as number
    } else {
      const s = await payload.create({
        collection: 'servicios',
        data: {
          nombre: 'Servicio Smoke Centinela XK7Q',
          slug: SERVICIO_SLUG,
          descripcion: 'Servicio centinela para smoke probes XK7Q',
          activo: true,
        },
        overrideAccess: true,
      })
      servicioId = s.id as number
    }

    // Solicitud centinela
    let solicitudId: number
    const existeSol = await payload.find({
      collection: 'solicitudes',
      where: { nombre: { equals: SOL_NOMBRE } },
      overrideAccess: true,
    })
    if (existeSol.docs.length > 0) {
      solicitudId = existeSol.docs[0].id as number
    } else {
      const sol = await payload.create({
        collection: 'solicitudes',
        data: {
          nombre: SOL_NOMBRE,
          contacto: 'smoke-centinela@test.invalid',
          tipoEquipo: 'Laptop-Smoke-XK7Q',
          descripcion: 'Solicitud centinela para smoke probes — no debe ser visible anónimo',
        },
        overrideAccess: true,
      })
      solicitudId = sol.id as number
    }

    process.stdout.write(JSON.stringify({ servicioId, solicitudId }) + '\n')
  } finally {
    await (payload.db as { destroy?: () => Promise<void> }).destroy?.()
  }
}

main().catch((err: unknown) => {
  process.stderr.write(String(err instanceof Error ? err.message : err) + '\n')
  process.exit(1)
})
