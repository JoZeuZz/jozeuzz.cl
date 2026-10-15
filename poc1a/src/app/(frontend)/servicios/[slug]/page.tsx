import { notFound } from 'next/navigation'

import { obtenerServicioPublico } from '@/lib/publico'

export const dynamic = 'force-dynamic'

export default async function Servicio({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const servicio = await obtenerServicioPublico(slug)
  if (!servicio) notFound()
  return (
    <article>
      <h1>{servicio.titulo}</h1>
      <p>{servicio.descripcion}</p>
    </article>
  )
}
