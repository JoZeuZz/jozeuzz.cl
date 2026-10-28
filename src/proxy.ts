/**
 * src/proxy.ts
 *
 * Middleware Next.js (Next 16.4.1: export 'proxy' o 'default').
 * https://nextjs.org/docs/app/building-your-application/routing/middleware
 *
 * Responsabilidades:
 * - Solo actúa en rutas de intake (/servicios/solicitar*).
 * - Primera visita: genera secreto de cookie aleatorio (32 bytes base64url),
 *   fija __Host-jozeuzz-csrf con Secure,HttpOnly,SameSite=Strict,Path=/.
 * - Visitas posteriores: reutiliza el valor existente de la cookie.
 * - Inyecta x-jozeuzz-csrf-secret en los request headers hacia el Server Component.
 * - Nunca expone el secreto a JS del cliente (HttpOnly).
 * - No fija Domain (requerido para __Host- prefix).
 *
 * API verificada 2026-10-27: NextResponse.rewrite con { request: { headers } }
 * next@16.4.1, next/dist/server/web/spec-extension/response.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

const COOKIE_NAME = '__Host-jozeuzz-csrf'
const HEADER_NAME = 'x-jozeuzz-csrf-secret'

// Rutas donde el proxy actúa
const INTAKE_PATHS = ['/servicios/solicitar']

function esRutaIntake(pathname: string): boolean {
  return INTAKE_PATHS.some(
    p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')
  )
}

function generarSecretoCookie(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Lógica central extraída para testabilidad.
 * En producción el claveServidor viene de PAYLOAD_SECRET del entorno.
 */
export async function manejarProxy(
  req: NextRequest,
  _claveServidor: string
): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  if (!esRutaIntake(pathname)) {
    return NextResponse.next()
  }

  const cookieExistente = req.cookies.get(COOKIE_NAME)?.value ?? null
  const secretoCookie = cookieExistente ?? generarSecretoCookie()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set(HEADER_NAME, secretoCookie)

  const response = NextResponse.rewrite(req.nextUrl, {
    request: { headers: requestHeaders },
  })

  if (cookieExistente === null) {
    response.cookies.set(COOKIE_NAME, secretoCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      // Sin Domain — requerido por __Host- prefix
    })
  }

  return response
}

/**
 * Export canónico para Next.js 16 proxy.
 * Nombre 'proxy' requerido por Turbopack (sucesor de 'default' middleware).
 */
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const claveServidor = process.env.PAYLOAD_SECRET ?? ''
  return manejarProxy(req, claveServidor)
}

export const config = {
  matcher: ['/servicios/solicitar', '/servicios/solicitar/:path*'],
}
