import { isIP } from 'node:net'

function expandirIpv6(ip: string): string[] | null {
  const partes = ip.split('::')
  if (partes.length > 2) return null
  const izquierda = partes[0] ? partes[0].split(':') : []
  const derecha = partes[1] ? partes[1].split(':') : []
  const grupos = [...izquierda, ...Array(8 - izquierda.length - derecha.length).fill('0'), ...derecha]
  if (grupos.length !== 8) return null
  return grupos.map((grupo) => Number.parseInt(grupo, 16).toString(16))
}

export function normalizarIp(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string' || texto.includes(',') || texto.includes('%')) return null
  const tipo = isIP(texto)
  if (tipo === 4) return texto
  if (tipo !== 6) return null

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(texto)
  if (mapped && isIP(mapped[1]) === 4) return mapped[1]

  const grupos = expandirIpv6(texto)
  if (!grupos) return null
  const hexMapped = grupos.slice(0, 6).every((grupo, indice) => grupo === (indice === 5 ? 'ffff' : '0'))
  if (hexMapped) return `${Number.parseInt(grupos[6], 16) >>> 8}.${Number.parseInt(grupos[6], 16) & 255}.${Number.parseInt(grupos[7], 16) >>> 8}.${Number.parseInt(grupos[7], 16) & 255}`
  return `${grupos.slice(0, 4).join(':')}::/64`
}
