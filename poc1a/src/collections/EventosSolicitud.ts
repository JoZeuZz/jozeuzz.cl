import type { CollectionConfig } from 'payload'

import { soloAdmin } from '../access'
import { MOTIVOS_CIERRE } from '../lib/solicitudes'

export const EventosSolicitud: CollectionConfig = {
  slug: 'eventos-solicitud',
  access: { read: soloAdmin, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'solicitud', type: 'relationship', relationTo: 'solicitudes', required: true },
    { name: 'estado_anterior', type: 'select', options: ['recibida', 'en_gestion', 'cerrada'], required: true },
    { name: 'estado_nuevo', type: 'select', options: ['recibida', 'en_gestion', 'cerrada'], required: true },
    { name: 'actor', type: 'text', required: true },
    { name: 'fecha', type: 'date', required: true },
    { name: 'motivo_cierre', type: 'select', options: [...MOTIVOS_CIERRE] },
  ],
}
