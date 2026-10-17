import { manejarIntake } from '@/lib/intake/manejador'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return manejarIntake(request)
}
