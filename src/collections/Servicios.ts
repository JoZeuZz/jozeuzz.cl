import type { CollectionConfig } from 'payload'

import { servicioActivoPorGateway } from '@/modules/catalog/publico'
import { soloAdmin } from '@/modules/identity/access'

export const Servicios: CollectionConfig = {
  slug: 'servicios',
  admin: { useAsTitle: 'nombre' },
  access: {
    read: servicioActivoPorGateway,
    create: soloAdmin,
    update: soloAdmin,
    delete: soloAdmin,
  },
  fields: [
    { name: 'nombre', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'descripcion', type: 'textarea', required: true },
    { name: 'activo', type: 'checkbox', defaultValue: false, index: true },
  ],
}
