import type { CollectionConfig } from 'payload'

import { activoOAdmin, soloAdmin } from '../access'

export const Servicios: CollectionConfig = {
  slug: 'servicios',
  admin: { useAsTitle: 'titulo' },
  access: {
    read: activoOAdmin,
    create: soloAdmin,
    update: soloAdmin,
    delete: soloAdmin,
  },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'titulo', type: 'text', required: true },
    { name: 'descripcion', type: 'textarea' },
    { name: 'activo', type: 'checkbox', defaultValue: false, index: true },
  ],
}
