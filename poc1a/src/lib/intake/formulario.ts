import { listarServiciosPublicos } from '@/lib/publico'

import { cargarConfigIntake, type ConfigIntake } from './config'
import { htmlFormulario, type ErrorFormulario } from './html'
import { emitirToken } from './token'

const csp = "default-src 'none'; style-src-attr 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
const cabeceras = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': csp }

export async function respuestaFormulario(config: ConfigIntake = cargarConfigIntake(process.env), error?: ErrorFormulario, exito = false): Promise<Response> {
  const token = emitirToken(config, Date.now())
  const servicios = await listarServiciosPublicos()
  const headers = new Headers(cabeceras)
  headers.set('set-cookie', `__Host-intake=${token}; Path=/; Max-Age=7200; Secure; HttpOnly; SameSite=Strict`)
  return new Response(htmlFormulario({ token, servicios, error, exito }), { status: 200, headers })
}
