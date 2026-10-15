import type { CollectionConfig } from 'payload'

import { soloAdmin, soloAdminCampo } from '../access'

// POC-1a: colección mínima sólo para probar que ningún canal público la expone.
// Transiciones, eventos e intake quedan para POC-1b y POC-3.
export const Solicitudes: CollectionConfig = {
  slug: 'solicitudes',
  admin: { useAsTitle: 'nombre' },
  access: { read: soloAdmin, create: soloAdmin, update: soloAdmin, delete: soloAdmin },
  fields: [
    { name: 'nombre', type: 'text', required: true },
    { name: 'contacto', type: 'text', required: true },
    { name: 'tipo_equipo', type: 'text', required: true },
    { name: 'descripcion', type: 'textarea', required: true },
    { name: 'servicio', type: 'relationship', relationTo: 'servicios' },
    {
      name: 'estado',
      type: 'select',
      defaultValue: 'recibida',
      options: ['recibida', 'en_gestion', 'cerrada'],
      required: true,
    },
    { name: 'motivo_cierre', type: 'select', options: ['atendida', 'descartada', 'duplicada', 'spam'] },
    {
      name: 'observaciones_internas',
      type: 'textarea',
      access: { read: soloAdminCampo, create: soloAdminCampo, update: soloAdminCampo },
    },
  ],
}
