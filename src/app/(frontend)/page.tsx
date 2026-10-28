import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Servicios técnicos informáticos</h1>
      <nav aria-label="Principal">
        <Link href="/servicios/solicitar">Solicitar servicio</Link>
        <Link href="/admin">Administración</Link>
      </nav>
    </main>
  )
}
