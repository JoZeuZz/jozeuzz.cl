export function compareText(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
}

export function compareBy(...keys) {
  return (x, y) => {
    for (const key of keys) {
      const result = compareText(key(x), key(y));
      if (result !== 0) return result;
    }
    return 0;
  };
}
