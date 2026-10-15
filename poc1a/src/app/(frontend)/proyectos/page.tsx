import Link from 'next/link'

import { listarProyectosPublicos } from '@/lib/publico'

export const dynamic = 'force-dynamic'

export default async function Proyectos() {
  const proyectos = await listarProyectosPublicos()
  return (
    <>
      <h1>Proyectos</h1>
      <ul>
        {proyectos.map((p) => (
          <li key={p.slug}>
            <Link href={`/proyectos/${p.slug}`}>{p.titulo}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}
