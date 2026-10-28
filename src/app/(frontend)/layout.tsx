import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'jozeuzz.cl',
  description: 'Servicios técnicos informáticos.',
}

export default function FrontendLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>
}
