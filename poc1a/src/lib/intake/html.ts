import type { ServicioPublico } from '@/lib/publico'

export type ErrorFormulario = { codigo: string; campos?: string[] }
export function escaparHtml(valor: string): string { return valor.replace(/[&<>"']/g, (caracter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]!) }

const campos = [['nombre', 'Nombre'], ['contacto', 'Contacto'], ['tipo_equipo', 'Tipo de equipo'], ['descripcion', 'Descripción']] as const
const mensaje = (codigo: string) => codigo === 'datos_invalidos' ? 'Revisa los campos indicados.' : 'No fue posible enviar la solicitud. Vuelve a cargar el formulario.'

export function htmlFormulario({ token, servicios, error, exito = false }: { token: string; servicios: ServicioPublico[]; error?: ErrorFormulario; exito?: boolean }): string {
  const erroneos = new Set(error?.campos ?? [])
  const controles = campos.map(([nombre, etiqueta]) => {
    const idError = `error-${nombre}`
    const descripcion = erroneos.has(nombre) ? `ayuda-${nombre} ${idError}` : `ayuda-${nombre}`
    const extra = erroneos.has(nombre) ? ` aria-invalid="true" aria-describedby="${descripcion}" autofocus` : ` aria-describedby="${descripcion}"`
    const control = nombre === 'descripcion' ? `<textarea id="${nombre}" name="${nombre}"${extra}></textarea>` : `<input id="${nombre}" name="${nombre}" type="text"${extra}>`
    return `<p><label for="${nombre}">${etiqueta}</label><span id="ayuda-${nombre}">Obligatorio.</span>${erroneos.has(nombre) ? `<span id="${idError}">Campo inválido.</span>` : ''}${control}</p>`
  }).join('')
  const opciones = servicios.map((servicio) => `<option value="${escaparHtml(servicio.slug)}">${escaparHtml(servicio.titulo)}</option>`).join('')
  const resumen = error ? `<div role="alert"><p>${mensaje(error.codigo)}</p>${[...erroneos].map((campo) => `<a href="#${campo}">${escaparHtml(campo)}</a>`).join(' ')}</div>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Solicitar servicio</title></head><body><main><h1>Solicitar servicio</h1>${exito ? '<p role="status">Solicitud recibida.</p>' : ''}${resumen}<form method="post" action="/api/intake" novalidate><input type="hidden" name="token" value="${escaparHtml(token)}">${controles}<p><label for="servicio">Servicio</label><select id="servicio" name="servicio" aria-describedby="ayuda-servicio"><option value="">Sin preferencia</option>${opciones}</select><span id="ayuda-servicio">Opcional.</span></p><div aria-hidden="true" style="position:absolute;left:-10000px"><label for="sitio_web">Sitio web</label><input id="sitio_web" name="sitio_web" tabindex="-1" autocomplete="off"></div><button type="submit">Enviar solicitud</button></form></main></body></html>`
}
