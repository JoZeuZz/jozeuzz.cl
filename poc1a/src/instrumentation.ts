export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { cargarConfigIntake } = await import('./lib/intake/config')
    cargarConfigIntake(process.env)
  } catch {
    process.stdout.write('{"evento":"arranque","codigo":"config_intake_invalida"}\n')
    process.exit(1)
  }
}
