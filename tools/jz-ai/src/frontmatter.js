export const MAX_FRONTMATTER_BYTES = 8 * 1024;
export const FRONTMATTER_HEAD_BYTES = MAX_FRONTMATTER_BYTES + 1;
const WANTED = new Set(['name', 'description']);
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const NEWLINE = 0x0a;
const CR = 0x0d;

export function parseFrontmatter(bytes) {
  // `whole`: el archivo entero cabe en el límite, así que una línea sin \n termina en el fin del archivo.
  const whole = bytes.length <= MAX_FRONTMATTER_BYTES;
  const head = bytes.subarray(0, MAX_FRONTMATTER_BYTES);
  const start = head.subarray(0, 3).equals(BOM) ? 3 : 0;
  const opening = nextLine(head, start, whole);
  if (!opening || !isDelimiter(head, opening)) return failure('missing-opening-delimiter');
  for (let line = nextLine(head, opening.next, whole); line; line = nextLine(head, line.next, whole)) {
    if (!isDelimiter(head, line)) continue;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(opening.next, line.start));
    } catch {
      return failure('invalid-utf8');
    }
    return { ok: true, fields: extractFields(text), problem: null };
  }
  return failure('missing-closing-delimiter');
}

function failure(problem) {
  return { ok: false, fields: {}, problem };
}

// Línea [start, end) sin \r\n final; null si no queda una línea completa dentro del límite.
function nextLine(buffer, start, whole) {
  if (start >= buffer.length) return null;
  const newline = buffer.indexOf(NEWLINE, start);
  if (newline === -1 && !whole) return null;
  const stop = newline === -1 ? buffer.length : newline;
  const end = stop > start && buffer[stop - 1] === CR ? stop - 1 : stop;
  return { start, end, next: newline === -1 ? buffer.length : newline + 1 };
}

function isDelimiter(buffer, line) {
  return line.end - line.start === 3 && buffer.toString('latin1', line.start, line.end) === '---';
}

function extractFields(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line);
    if (!match || !WANTED.has(match[1]) || Object.hasOwn(fields, match[1])) continue;
    const value = parseScalar(match[2]);
    if (value !== null) fields[match[1]] = value;
  }
  return fields;
}

function parseScalar(raw) {
  const text = raw.trim();
  if (text === '' || /^[|>][+-]?\d*$/.test(text)) return null;
  if (text.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(text);
    return match ? match[1].replace(/\\(.)/g, '$1') : null;
  }
  if (text.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(text);
    return match ? match[1].replace(/''/g, "'") : null;
  }
  if (/^[&*!\[{]/.test(text)) return null;
  return text.replace(/\s+#.*$/, '');
}
