export type DatosSolicitudValidada = Readonly<{
  nombre: string
  contacto: string
  tipoEquipo: string
  descripcion: string
  servicio?: string
}>

export type ResultadoValidacion =
  | Readonly<{ ok: true; datos: DatosSolicitudValidada; token: string }>
  | Readonly<{ ok: false; campos: Readonly<Record<string, string>> }>
