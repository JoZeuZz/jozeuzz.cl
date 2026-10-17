const internos = ['http://app:3000/', 'http://app-prod:3000/']
let fallo = false

for (const destino of internos) {
  try {
    await fetch(destino)
    console.error(`FALLO: accesible ${destino}`)
    fallo = true
  } catch {
    console.log(`OK: inaccesible ${destino}`)
  }
}

try {
  const respuesta = await fetch('https://proxy:3443/solicitar')
  if (respuesta.status !== 200) throw new Error(`HTTP ${respuesta.status}`)
  console.log('OK: proxy TLS /solicitar 200')
} catch (error) {
  console.error(`FALLO: proxy TLS: ${error.message}`)
  fallo = true
}

if (fallo) process.exit(1)
