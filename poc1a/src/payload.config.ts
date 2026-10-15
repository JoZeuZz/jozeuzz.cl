import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { MediosPrivados, MediosPublicos } from './collections/Medios'
import { Proyectos } from './collections/Proyectos'
import { Servicios } from './collections/Servicios'
import { Solicitudes } from './collections/Solicitudes'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = process.env.POC_SERVER_URL ?? 'http://127.0.0.1:3101'

export default buildConfig({
  serverURL,
  csrf: [serverURL],
  cors: [],
  // El front usa la Local API: GraphQL sobra y se cierra (el playground se borró del árbol de rutas).
  graphQL: { disable: true },
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Proyectos, Servicios, Solicitudes, MediosPublicos, MediosPrivados],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  upload: { limits: { fileSize: 5_000_000 } },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    // Drizzle rechaza «public» como schemaName: sólo se fija un schema propio (pruebas: poc_test).
    ...(process.env.POC_DB_SCHEMA && process.env.POC_DB_SCHEMA !== 'public'
      ? { schemaName: process.env.POC_DB_SCHEMA }
      : {}),
  }),
  sharp,
  telemetry: false,
  plugins: [],
})
