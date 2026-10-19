// Reset + semilla para las E2E (Node del host, sin dependencias). Imprime el JSON del reset por stdout;
// poc.sh e2e-en / e2e-prod-en lo pasan al contenedor por entorno. La contraseña del admin es aleatoria y no se escribe en disco.
import { SEMILLA } from '../../contrato/fixture.mjs';
import crearDriver from '../contrato-driver.mjs';

const driver = await crearDriver();
await driver.reset(SEMILLA);
const e = driver.__estado();
console.log(JSON.stringify({ refs: e.refs, ids: e.ids, password: e.password, email: e.email }));
