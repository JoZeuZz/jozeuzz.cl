const SHA_RE = /^[0-9a-fA-F]{7,40}$/;

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function list(items) {
  return items.length === 0 ? '- Ninguno.' : items.map((item) => `- ${item}`).join('\n');
}

function validate(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('input debe ser un objeto');
  }
  const { branch, sha, changes, tests, ci, risks, ready } = input;
  if (typeof branch !== 'string' || branch.trim() === '') {
    throw new TypeError('branch debe ser un string no vacío');
  }
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
    throw new TypeError('sha debe ser hexadecimal de 7 a 40 caracteres');
  }
  if (!isStringArray(changes)) {
    throw new TypeError('changes debe ser un array de strings');
  }
  if (
    !Array.isArray(tests) ||
    !tests.every(
      (t) =>
        t !== null &&
        typeof t === 'object' &&
        typeof t.command === 'string' &&
        typeof t.result === 'string'
    )
  ) {
    throw new TypeError('tests debe ser un array de { command: string, result: string }');
  }
  if (typeof ci !== 'string') {
    throw new TypeError('ci debe ser un string');
  }
  if (!isStringArray(risks)) {
    throw new TypeError('risks debe ser un array de strings');
  }
  if (typeof ready !== 'boolean') {
    throw new TypeError('ready debe ser booleano');
  }
}

export function buildHandoff(input) {
  validate(input);
  const { branch, sha, changes, tests, ci, risks, ready } = input;
  const testLines = tests.map((t) => `${t.command}: ${t.result}`);
  return [
    '## Entrega',
    '',
    '## Rama y SHA',
    '',
    `\`${branch}@${sha}\``,
    '',
    '## Cambios funcionales',
    '',
    list(changes),
    '',
    '## Pruebas y CI',
    '',
    list(testLines),
    '',
    `CI: ${ci}`,
    '',
    '## Riesgos bloqueantes',
    '',
    list(risks),
    '',
    '## Disponibilidad para integración',
    '',
    ready ? 'Lista para integrar' : 'No lista',
    ''
  ].join('\n');
}
