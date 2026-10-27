import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Servicios } from '@/collections/Servicios'
import { Solicitudes } from '@/collections/Solicitudes'
import { Usuarios } from '@/collections/Usuarios'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:3000'

export default buildConfig({
  admin: {
    importMap: { baseDir: path.resolve(dirname) },
    user: Usuarios.slug,
  },
  collections: [Usuarios, Servicios, Solicitudes],
  csrf: [serverURL],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL ?? '' },
    push: false,
  }),
  editor: lexicalEditor(),
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET ?? '',
  serverURL,
  sharp,
  telemetry: false,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
