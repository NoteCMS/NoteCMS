/** Deep-sort object keys so stringify is stable for dirty comparisons. */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const o = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    sorted[k] = sortKeysDeep(o[k]);
  }
  return sorted;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}
