import { createHash } from 'node:crypto'

const MIN_OTRO = 0x80000000
const MAX_EXCLUSIVO = 0xffff0000

function indice(origen) {
  const coincidencia = /^origen-sintetico-([0-9]+)$/.exec(origen)
  if (coincidencia) {
    const numero = Number(coincidencia[1])
    if (!Number.isSafeInteger(numero) || numero < 1 || numero >= MAX_EXCLUSIVO) throw new Error('índice sintético fuera de rango')
    return numero
  }
  const rango = MAX_EXCLUSIVO - MIN_OTRO
  const hash = createHash('sha256').update(origen).digest().readUInt32BE(0)
  return MIN_OTRO + (hash % rango)
}

export function ipSintetica(origen) {
  if (typeof origen !== 'string') throw new Error('origen sintético inválido')
  const numero = indice(origen)
  return `2001:db8:${(numero >>> 16).toString(16)}:${(numero & 0xffff).toString(16)}::1`
}
