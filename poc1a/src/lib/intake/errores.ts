export type CodigoIntake = 'ip_invalida' | 'tipo_no_soportado' | 'origen_invalido' | 'cuerpo_demasiado_grande' | 'cuerpo_invalido' | 'csrf_invalido' | 'envio_rechazado' | 'campos_no_permitidos' | 'datos_invalidos' | 'interno'

export class ErrorIntake extends Error {
  constructor(readonly codigo: CodigoIntake, readonly status: number, readonly campos?: string[]) {
    super(codigo)
    this.name = 'ErrorIntake'
  }
}
