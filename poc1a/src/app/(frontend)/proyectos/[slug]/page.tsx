import { notFound } from 'next/navigation'
import { headers } from 'next/headers'

import { obtenerProyectoPreview, obtenerProyectoPublico } from '@/lib/publico'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }

export default async function Proyecto({ params, searchParams }: Props) {
  const { slug } = await params
  const { preview } = await searchParams
  // ?preview=1 sólo sirve borradores a un administrador autenticado; para el resto es un 404 normal.
  const proyecto =
    preview === '1' ? await obtenerProyectoPreview(slug, await headers()) : await obtenerProyectoPublico(slug)
  if (!proyecto) notFound()
  return (
    <article>
      <h1>{proyecto.titulo}</h1>
      <p>{proyecto.resumen}</p>
    </article>
  )
}
