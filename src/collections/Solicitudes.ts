import type { CollectionConfig } from 'payload'

import { nadie, soloAdmin } from '@/modules/identity/access'

const nadieCampo = () => false

export const Solicitudes: CollectionConfig = {
  slug: 'solicitudes',
  admin: { useAsTitle: 'nombre' },
  access: {
    read: soloAdmin,
    create: nadie,
    update: nadie,
    delete: nadie,
  },
  fields: [
    { name: 'nombre', type: 'text', required: true },
    { name: 'contacto', type: 'text', required: true },
    { name: 'tipoEquipo', type: 'text', required: true },
    { name: 'descripcion', type: 'textarea', required: true },
    { name: 'servicio', type: 'relationship', relationTo: 'servicios' },
    {
      name: 'estado',
      type: 'select',
      defaultValue: 'recibida',
      required: true,
      options: ['recibida'],
      access: { create: nadieCampo, update: nadieCampo },
    },
    {
      name: 'motivoCierre',
      type: 'text',
      access: { create: nadieCampo, update: nadieCampo },
    },
    {
      name: 'observacionesInternas',
      type: 'textarea',
      access: { create: nadieCampo, update: nadieCampo },
    },
  ],
}
