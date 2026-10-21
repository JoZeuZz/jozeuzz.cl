import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { conCorreccionPushSchema } from './lib/drizzle-kit/correccion-push'
import { extenderEsquemaIntake } from './lib/intake/esquema'
import { opcionesLogger } from './lib/intake/log'
import { MediosPrivados, MediosPublicos } from './collections/Medios'
import { Proyectos } from './collections/Proyectos'
import { Servicios } from './collections/Servicios'
import { Solicitudes } from './collections/Solicitudes'
import { EventosSolicitud } from './collections/EventosSolicitud'
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
  collections: [Users, Proyectos, Servicios, Solicitudes, EventosSolicitud, MediosPublicos, MediosPrivados],
  editor: lexicalEditor(),
  // Logs sin PII (diseño §5.1): pino con serializadores/hook que nunca emiten mensajes ni valores de error.
  logger: { options: opcionesLogger() },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  upload: { limits: { fileSize: 5_000_000 } },
  db: conCorreccionPushSchema(postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    afterSchemaInit: [extenderEsquemaIntake],
    // Los scripts de reset no sincronizan el schema (lo hace el servidor de desarrollo): arranque más rápido.
    push: process.env.POC_NO_PUSH !== '1',
    // Drizzle rechaza «public» como schemaName: sólo se fija un schema propio (pruebas: poc_test).
    ...(process.env.POC_DB_SCHEMA && process.env.POC_DB_SCHEMA !== 'public'
      ? { schemaName: process.env.POC_DB_SCHEMA }
      : {}),
  })),
  sharp,
  telemetry: false,
  plugins: [],
})
