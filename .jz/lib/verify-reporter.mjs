// Reporter del Node Test Runner para la verificación reconocida (jz-verify, I2).
//
// Transcribe los eventos estructurados del runner, una línea «JZV1 <json>» por evento, entre un evento «start»
// y otro «end». Todo lo que imprimen las pruebas (stdout, stderr, mensajes de error) viaja dentro de una cadena
// JSON, así que no puede formar una línea propia ni imitar un evento. El reporter no decide nada: el oráculo
// (.jz/lib/verify.mjs) cuenta los eventos y los contrasta con el resumen del runner. Si el runner muere antes de
// terminar, falta «end» y la salida es incompleta.
// Uso (desde un perfil de .jz/profiles): node --test --test-reporter=./.jz/lib/verify-reporter.mjs <archivos>
const MAX_TEXT = 4000;
const cut = (s) => (typeof s === 'string' && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);
const line = (event) => `JZV1 ${JSON.stringify(event)}\n`;

function errorText(err) {
  const cause = err?.cause;
  const msg = cause instanceof Error ? (cause.stack ?? cause.message) : (cause !== undefined ? String(cause) : err?.message);
  return cut(String(msg ?? ''));
}

export default async function* jzVerifyReporter(source) {
  yield line({ t: 'start', v: 1, node: process.version, execPath: process.execPath });
  for await (const { type, data: d = {} } of source) {
    switch (type) {
      case 'test:pass':
      case 'test:fail':
        yield line({
          t: type === 'test:pass' ? 'pass' : 'fail', nesting: d.nesting, file: d.file ?? null, name: cut(String(d.name)),
          suite: d.details?.type === 'suite', skip: d.skip !== undefined && d.skip !== false,
          todo: d.todo !== undefined && d.todo !== false,
          ...(type === 'test:fail' ? { failureType: d.details?.error?.failureType ?? null, message: errorText(d.details?.error) } : {}),
        });
        break;
      case 'test:plan':
        yield line({ t: 'plan', nesting: d.nesting, file: d.file ?? null, count: d.count });
        break;
      case 'test:diagnostic':
        yield line({ t: 'diag', nesting: d.nesting, file: d.file ?? null, message: cut(String(d.message)) });
        break;
      case 'test:stdout':
      case 'test:stderr':
        yield line({ t: type === 'test:stdout' ? 'out' : 'err', file: d.file ?? null, message: cut(String(d.message)) });
        break;
      default:
    }
  }
  yield line({ t: 'end' });
}
