import type { MetadataRoute } from 'next'

import { urlsSitemap } from '@/lib/publico'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.POC_SERVER_URL ?? 'http://127.0.0.1:3101').replace(/\/$/, '')
  return (await urlsSitemap()).map((ruta) => ({ url: `${base}${ruta}` }))
}
