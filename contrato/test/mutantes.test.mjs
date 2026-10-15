import assert from 'node:assert/strict';
import test from 'node:test';
import { CASOS } from '../casos/index.mjs';
import crearDriver from '../referencia/driver.mjs';
import { MUTANTES } from '../referencia/mutantes.mjs';
import { runCases } from '../runner.mjs';

test('hay 23 mutantes (22 originales + graphqlAbierto) con ids únicos y casos existentes', () => {
  assert.equal(MUTANTES.length, 23);
  assert.equal(new Set(MUTANTES.map((m) => m.id)).size, 23);
  const ids = new Set(CASOS.map((c) => c.id));
  for (const m of MUTANTES) for (const c of m.detectadoPor) assert.ok(ids.has(c), `${m.id}: caso inexistente ${c}`);
});

for (const mutante of MUTANTES) {
  test(`${mutante.id} ${mutante.descripcion}: detectado por ${mutante.detectadoPor.join(', ')}`, async () => {
    const control = await runCases(crearDriver, CASOS, { filtro: mutante.detectadoPor });
    assert.ok(control.every((r) => r.ok), `control: el oráculo debe pasar ${mutante.detectadoPor.join(', ')}`);
    const resultados = await runCases(mutante.crearDriver, CASOS, { filtro: mutante.detectadoPor });
    assert.ok(
      resultados.some((r) => !r.ok),
      `el mutante ${mutante.id} sobrevivió: ${mutante.detectadoPor.join(', ')} pasaron`,
    );
  });
}
