type Entorno = Readonly<Record<string, string | undefined>>

export function configuracionPayload(entorno: Entorno): Readonly<{ databaseURL: string; payloadSecret: string }> {
  const payloadSecret = entorno.PAYLOAD_SECRET
  if (typeof payloadSecret !== 'string' || payloadSecret.length === 0) throw new Error('PAYLOAD_SECRET requerido')
  const databaseURL = entorno.DATABASE_URL
  if (typeof databaseURL !== 'string' || databaseURL.length === 0) throw new Error('DATABASE_URL requerida')
  return { databaseURL, payloadSecret }
}
