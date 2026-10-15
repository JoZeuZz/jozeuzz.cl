import type { CollectionConfig } from 'payload'

import { soloAdmin } from '../access'

// Los medios viven fuera de `public/`: sólo se sirven por /api/<colección>/file/<nombre>.
// `text/plain` existe únicamente para los medios sintéticos de la batería (decisión R-3).
const raizMedios = () => process.env.POC_MEDIA_DIR ?? '/app/media-store'
const MIME = ['image/*', 'text/plain']

export const MediosPublicos: CollectionConfig = {
  slug: 'medios-publicos',
  access: { read: () => true, create: soloAdmin, update: soloAdmin, delete: soloAdmin },
  upload: { staticDir: `${raizMedios()}/publicos`, mimeTypes: MIME },
  fields: [{ name: 'alt', type: 'text' }],
}

export const MediosPrivados: CollectionConfig = {
  slug: 'medios-privados',
  access: { read: soloAdmin, create: soloAdmin, update: soloAdmin, delete: soloAdmin },
  upload: { staticDir: `${raizMedios()}/privados`, mimeTypes: MIME },
  fields: [{ name: 'alt', type: 'text' }],
}
