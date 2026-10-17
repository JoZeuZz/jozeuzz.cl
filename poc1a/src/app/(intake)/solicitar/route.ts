import { manejarFormularioIntake } from '@/lib/intake/manejador'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return manejarFormularioIntake(request)
}
