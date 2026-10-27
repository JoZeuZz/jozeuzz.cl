export function summarizeRun(result) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('result debe ser un objeto');
  }
  const { result: status, corrections, checks } = result;
  if (typeof status !== 'string') {
    throw new TypeError('result.result debe ser string');
  }
  if (!Number.isInteger(corrections) || corrections < 0) {
    throw new TypeError('result.corrections debe ser entero >= 0');
  }
  if (!Array.isArray(checks)) {
    throw new TypeError('result.checks debe ser array');
  }
  let passed = 0;
  for (const check of checks) {
    if (check === null || typeof check !== 'object' || !Number.isInteger(check.rc)) {
      throw new TypeError('cada check debe ser objeto con rc entero');
    }
    if (check.rc === 0) passed += 1;
  }
  return `result=${status} corrections=${corrections} checks=${passed}/${checks.length}`;
}
