import Link from 'next/link'

import { listarServiciosPublicos } from '@/lib/publico'

export const dynamic = 'force-dynamic'

export default async function Servicios() {
  const servicios = await listarServiciosPublicos()
  return (
    <>
      <h1>Servicios</h1>
      <ul>
        {servicios.map((s) => (
          <li key={s.slug}>
            <Link href={`/servicios/${s.slug}`}>{s.titulo}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}
