import type { CollectionConfig } from 'payload'

import { nadie, usuarioPropio } from '@/modules/identity/access'

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
  fields: [
    { name: 'nombre', type: 'text', required: true },
  ],
}
