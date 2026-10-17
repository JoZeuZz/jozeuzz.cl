import { describe, expect, it } from 'vitest'

import { escaparHtml, htmlFormulario } from './html'

describe('htmlFormulario', () => {
  it('escapa todo texto dinámico', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
    expect(htmlFormulario({ token: `<token>`, servicios: [{ slug: 'x', titulo: `<Servicio>`, descripcion: `"'` }] })).not.toContain('<Servicio>')
  })

  it('entrega formulario accesible sin JavaScript', () => {
    const html = htmlFormulario({ token: 'token', servicios: [], error: { codigo: 'datos_invalidos', campos: ['nombre'] } })
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('<main>')
    expect(html).toContain('<form method="post" action="/api/intake" novalidate>')
    expect(html).toContain('<label for="nombre">')
    expect(html).toContain('aria-describedby="ayuda-nombre error-nombre"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('autofocus')
    expect(html).toContain('role="alert"')
    expect(html).toContain('name="sitio_web"')
    expect(html).toContain('tabindex="-1"')
  })
})
