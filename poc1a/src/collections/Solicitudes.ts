import type { CollectionConfig } from 'payload'

import { soloAdmin, soloAdminCampo } from '../access'
import { validarTransicion } from '../lib/solicitudes'

// POC-1a: colección mínima sólo para probar que ningún canal público la expone.
// Transiciones, eventos e intake quedan para POC-1b y POC-3.
export const Solicitudes: CollectionConfig = {
  slug: 'solicitudes',
  admin: { useAsTitle: 'nombre' },
  access: { read: soloAdmin, create: soloAdmin, update: soloAdmin, delete: soloAdmin },
  hooks: {
    beforeChange: [({ data, operation, originalDoc }) => {
      if (operation === 'create') {
        data.estado = 'recibida'
        data.motivo_cierre = null
        return data
      }
      if (data.estado !== undefined && data.estado !== originalDoc.estado) {
        data.motivo_cierre = validarTransicion(originalDoc.estado, data.estado, data.motivo_cierre).motivo_cierre
      }
      return data
    }],
    afterChange: [async ({ doc, operation, previousDoc, req }) => {
      if (operation !== 'update' || doc.estado === previousDoc.estado) return doc
      await req.payload.create({
        collection: 'eventos-solicitud',
        data: {
          solicitud: doc.id,
          estado_anterior: previousDoc.estado,
          estado_nuevo: doc.estado,
          actor: String(req.user?.id ?? 'sistema'),
          fecha: new Date().toISOString(),
          motivo_cierre: doc.motivo_cierre ?? null,
        },
        overrideAccess: true,
        req,
      })
      if (process.env.POC_FALLOS_INYECTABLES === '1' && process.env.NODE_ENV !== 'production') throw new Error('fallo inyectado tras estado')
      return doc
    }],
  },
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
