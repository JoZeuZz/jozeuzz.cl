import type { CollectionConfig } from 'payload'

import { nadie, usuarioPropio } from '@/modules/identity/access'
import { rechazarCambioIdentidad } from '@/modules/identity/inmutables'

export const Usuarios: CollectionConfig = {
  slug: 'usuarios',
  admin: { useAsTitle: 'email' },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  access: {
    read: usuarioPropio,
    create: nadie,
    update: usuarioPropio,
    delete: nadie,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        rechazarCambioIdentidad({ data, originalDoc, operation })
        return data
      },
    ],
  },
  fields: [
    { name: 'nombre', type: 'text', required: true },
  ],
}
