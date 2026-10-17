import type { ServicioPublico } from '@/lib/publico'

export type ErrorFormulario = { codigo: string; campos?: string[] }
export function escaparHtml(valor: string): string { return valor.replace(/[&<>"']/g, (caracter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]!) }

const campos = [['nombre', 'Nombre'], ['contacto', 'Contacto'], ['tipo_equipo', 'Tipo de equipo'], ['descripcion', 'Descripción'], ['servicio', 'Servicio']] as const
const generico = 'No fue posible enviar la solicitud. Vuelve a cargar el formulario.'
const espera = 'Demasiadas solicitudes. Espera un momento e intenta de nuevo más tarde.'
const mensajes: Record<string, string> = {
  datos_invalidos: 'Revisa los campos indicados.',
  csrf_invalido: 'El formulario caducó o se abrió en otra pestaña. Vuelve a cargar el formulario y envíalo de nuevo.',
  demasiados_intentos: espera,
  limite_creaciones: espera,
}
const mensaje = (codigo: string) => Object.hasOwn(mensajes, codigo) ? mensajes[codigo]! : generico

export function htmlFormulario({ token, servicios, error, exito = false }: { token: string; servicios: ServicioPublico[]; error?: ErrorFormulario; exito?: boolean }): string {
  const pedidos = new Set(error?.campos ?? [])
  const erroneos = campos.filter(([nombre]) => pedidos.has(nombre))
  const primero = erroneos[0]?.[0]
  const atributos = (nombre: string) => pedidos.has(nombre)
    ? ` aria-invalid="true" aria-describedby="ayuda-${nombre} error-${nombre}"${nombre === primero ? ' autofocus' : ''}`
    : ` aria-describedby="ayuda-${nombre}"`
  const aviso = (nombre: string) => pedidos.has(nombre) ? `<span id="error-${nombre}">Error: ${nombre === 'servicio' ? 'el servicio elegido no es válido.' : 'campo inválido.'}</span>` : ''
  const opciones = servicios.map((servicio) => `<option value="${escaparHtml(servicio.slug)}">${escaparHtml(servicio.titulo)}</option>`).join('')
  const controles = campos.map(([nombre, etiqueta]) => {
    const ayuda = `<span id="ayuda-${nombre}">${nombre === 'servicio' ? 'Opcional.' : 'Obligatorio.'}</span>${aviso(nombre)}`
    const control = nombre === 'servicio'
      ? `<select id="servicio" name="servicio"${atributos(nombre)}><option value="">Sin preferencia</option>${opciones}</select>`
      : nombre === 'descripcion' ? `<textarea id="${nombre}" name="${nombre}"${atributos(nombre)}></textarea>` : `<input id="${nombre}" name="${nombre}" type="text"${atributos(nombre)}>`
    return `<p><label for="${nombre}">${etiqueta}</label>${ayuda}${control}</p>`
  }).join('')
  const resumen = error ? `<div role="alert"><p>${mensaje(error.codigo)}</p>${erroneos.map(([campo, etiqueta]) => `<a href="#${campo}">${etiqueta}</a>`).join(' ')}</div>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Solicitar servicio</title></head><body><main><h1>Solicitar servicio</h1>${exito ? '<p role="status">Solicitud recibida.</p>' : ''}${resumen}<form method="post" action="/api/intake" novalidate><input type="hidden" name="token" value="${escaparHtml(token)}">${controles}<div aria-hidden="true" style="position:absolute;left:-10000px"><label for="sitio_web">Sitio web</label><input id="sitio_web" name="sitio_web" tabindex="-1" autocomplete="off"></div><button type="submit">Enviar solicitud</button></form></main></body></html>`
}
