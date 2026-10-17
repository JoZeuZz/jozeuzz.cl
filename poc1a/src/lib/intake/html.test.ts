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

  const servicios = [{ slug: 'x', titulo: 'X', descripcion: 'x' }]
  const orden = (html: string, marcas: string[]) => marcas.map((marca) => html.indexOf(marca))

  it('pone autofocus sólo en el primer campo con error, en orden del DOM', () => {
    const html = htmlFormulario({ token: 't', servicios, error: { codigo: 'datos_invalidos', campos: ['descripcion', 'contacto'] } })
    expect(html.match(/autofocus/g)).toHaveLength(1)
    expect(html).toMatch(/<input id="contacto"[^>]*autofocus/)
    expect(html).not.toMatch(/<textarea id="descripcion"[^>]*autofocus/)
  })

  it('marca servicio inválido con aria-invalid, mensaje y enlace', () => {
    const html = htmlFormulario({ token: 't', servicios, error: { codigo: 'datos_invalidos', campos: ['servicio'] } })
    expect(html).toMatch(/<select id="servicio"[^>]*aria-invalid="true"/)
    expect(html).toMatch(/<select id="servicio"[^>]*aria-describedby="ayuda-servicio error-servicio"/)
    expect(html).toMatch(/<select id="servicio"[^>]*autofocus/)
    expect(html).toContain('id="error-servicio"')
    expect(html).toContain('<a href="#servicio">')
  })

  it('el resumen enlaza sólo campos conocidos con su etiqueta legible', () => {
    const html = htmlFormulario({ token: 't', servicios, error: { codigo: 'datos_invalidos', campos: ['tipo_equipo', '"><script>'] } })
    expect(html).toContain('<a href="#tipo_equipo">Tipo de equipo</a>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="#&quot;')
  })

  it('sin errores no hay aria-invalid, alert ni autofocus; el éxito usa role=status', () => {
    const vacio = htmlFormulario({ token: 't', servicios })
    expect(vacio).not.toMatch(/aria-invalid|role="alert"|autofocus|role="status"/)
    expect(htmlFormulario({ token: 't', servicios, exito: true })).toContain('<p role="status">')
  })

  it('mantiene el orden de foco y deja la trampa fuera de pantalla y del foco', () => {
    const html = htmlFormulario({ token: 't', servicios })
    const pos = orden(html, ['id="nombre"', 'id="contacto"', 'id="tipo_equipo"', 'id="descripcion"', 'id="servicio"', 'id="sitio_web"', '<button'])
    expect(pos.every((p) => p > 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(html).toMatch(/<div aria-hidden="true" style="[^"]*left:-10000px[^"]*">[^]*<input id="sitio_web" name="sitio_web" tabindex="-1" autocomplete="off">/)
    expect(html).not.toMatch(/<script|<style|\son[a-z]+=/)
  })

  it('csrf_invalido pide recargar el formulario (dos pestañas)', () => {
    const html = htmlFormulario({ token: 't', servicios, error: { codigo: 'csrf_invalido' } })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Vuelve a cargar el formulario')
    expect(html).toMatch(/otra pestaña|otra ventana/)
  })

  it.each(['demasiados_intentos', 'limite_creaciones'])('%s da un mensaje de espera sin revelar límites ni datos', (codigo) => {
    const html = htmlFormulario({ token: 't', servicios, error: { codigo } })
    expect(html).toContain('Demasiadas solicitudes')
    expect(html).toContain('intenta de nuevo más tarde')
    expect(html).not.toMatch(/\d+ (solicitudes|intentos)|IP|minutos/)
  })

  it('un código desconocido no se refleja en la página', () => {
    const html = htmlFormulario({ token: 't', servicios, error: { codigo: '<b>SNT-X</b>' } })
    expect(html).not.toContain('SNT-X')
    expect(html).toContain('No fue posible enviar la solicitud')
  })
})
