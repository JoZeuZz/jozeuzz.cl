import { respuestaFormulario } from '@/lib/intake/formulario'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return respuestaFormulario(undefined, undefined, new URL(request.url).searchParams.get('estado') === 'recibida')
}
