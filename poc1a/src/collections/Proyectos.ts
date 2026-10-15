import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { publicadoOAdmin, soloAdmin, soloAdminCampo } from '../access'

/**
 * «Retirado» = publicado que vuelve a borrador. Se registra con `retiradoEn` en el documento
 * principal (el borrador sobre un publicado sólo crea una versión y no toca la tabla principal).
 */
export const marcarRetirada: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data._status === 'published') {
    data.retiradoEn = null
  } else if (data._status === 'draft' && originalDoc?._status === 'published') {
    data.retiradoEn = new Date().toISOString()
  }
  return data
}

export const Proyectos: CollectionConfig = {
  slug: 'proyectos',
  admin: {
    useAsTitle: 'titulo',
    preview: (doc) => `/proyectos/${String(doc.slug)}?preview=1`,
  },
  versions: { drafts: true, maxPerDoc: 20 },
  access: {
    read: publicadoOAdmin,
    readVersions: soloAdmin,
    create: soloAdmin,
    update: soloAdmin,
    delete: soloAdmin,
  },
  hooks: { beforeChange: [marcarRetirada] },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'titulo', type: 'text', required: true },
    { name: 'resumen', type: 'textarea' },
    { name: 'medios', type: 'relationship', relationTo: ['medios-publicos', 'medios-privados'], hasMany: true },
    {
      name: 'notas_internas',
      type: 'textarea',
      access: { read: soloAdminCampo, create: soloAdminCampo, update: soloAdminCampo },
    },
    { name: 'retiradoEn', type: 'date', admin: { readOnly: true } },
  ],
}
