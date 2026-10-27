function formatDetail(event, keys) {
  return keys
    .filter((key) => event[key] !== undefined)
    .map((key) => `${key}=${key === 'head' ? String(event[key]).slice(0, 7) : event[key]}`)
    .join(' ');
}

function parseTimestamp(at) {
  if (typeof at !== 'string') throw new TypeError('Event at must be an ISO timestamp');

  const match = at.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match) throw new TypeError('Event at must be an ISO timestamp');

  const local = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
  if (
    Number.isNaN(Date.parse(at)) ||
    local.getUTCFullYear() !== Number(match[1]) ||
    local.getUTCMonth() + 1 !== Number(match[2]) ||
    local.getUTCDate() !== Number(match[3]) ||
    local.getUTCHours() !== Number(match[4]) ||
    local.getUTCMinutes() !== Number(match[5]) ||
    local.getUTCSeconds() !== Number(match[6])
  ) {
    throw new TypeError('Event at must be an ISO timestamp');
  }

  return new Date(at);
}

const detailKeys = {
  agent: ['phase', 'engine', 'rc'],
  check: ['id', 'rc'],
  inspect: ['paths'],
  commit: ['head'],
  push: ['rc'],
  closed: ['reason']
};

export function formatTimeline(events) {
  if (!Array.isArray(events)) throw new TypeError('Events must be an array');

  return events.map((event) => {
    if (event === null || typeof event !== 'object' || typeof event.event !== 'string') {
      throw new TypeError('Event must include an event string');
    }

    const time = parseTimestamp(event.at).toISOString().slice(11, 19);
    const detail = formatDetail(event, detailKeys[event.event] ?? []);
    return detail ? `${time} ${event.event} ${detail}` : `${time} ${event.event}`;
  }).join('\n');
}
