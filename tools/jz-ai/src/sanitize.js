const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]/g;
// C0, DEL, C1 y controles bidireccionales (spec §9).
const CONTROL = /[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function cleanText(value) {
  return String(value).replace(ANSI, '').replace(CONTROL, '');
}

export function cleanDeep(value) {
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) return value.map(cleanDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanDeep(item)]));
  }
  return value;
}

export function cell(value) {
  if (value === null || value === undefined) return '-';
  return String(value)
    .replace(ANSI, '')
    .replace(/\t/g, '\\t')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(CONTROL, '');
}

export function redactUrl(url) {
  const text = String(url);
  const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/is.exec(text);
  if (!match) return text;
  const [, scheme, authority, rest] = match;
  const at = authority.lastIndexOf('@');
  const host = at === -1 ? authority : `[redacted]@${authority.slice(at + 1)}`;
  return `${scheme}${host}${rest.replace(/\?[^#]*/, '?[redacted]')}`;
}

export function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === 'string' && /^E[A-Z0-9_]{1,31}$/.test(code) ? code : null;
}

export function tildify(path, home) {
  if (!home) return path;
  if (path === home) return '~';
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}
